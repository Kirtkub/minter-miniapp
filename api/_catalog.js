import { Address, Cell } from "@ton/core";
import { collectionAddress, nftsMetadataIndex, tonChain } from "../src/config.js";

const TON_CENTER_BASE =
  tonChain === "Testnet" ? "https://testnet.toncenter.com" : "https://toncenter.com";
const GETTER_RETRY_DELAYS = [500, 1200, 2500];
let catalogCache = { expiresAt: 0, items: null };

// Small in-memory cache for per-item metadata JSON fetched while building
// "My Collection" (many owned items usually share the same contentUrl,
// since they were minted from the same catalog entry). Like catalogCache,
// this only lives for the lifetime of a warm serverless instance — that's
// fine, it's a latency optimization, not a correctness requirement.
const metadataJsonCache = new Map(); // url -> { expiresAt, data }

function jsonResponse(res, status, body) {
  res.status(status).json(body);
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Metadata request failed with ${response.status}`);
  return response.json();
}

// Same as fetchJson, but memoized for a short time. Used when the same
// metadata URL is likely to be requested repeatedly in a short window
// (e.g. several owned NFTs of the same type in "My Collection").
async function fetchJsonCached(url, ttlMs = 15000) {
  const cached = metadataJsonCache.get(url);
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  const data = await fetchJson(url);
  metadataJsonCache.set(url, { data, expiresAt: Date.now() + ttlMs });
  return data;
}

async function runGetMethodAt(address, method, stack = []) {
  for (let attempt = 0; attempt <= GETTER_RETRY_DELAYS.length; attempt += 1) {
    const response = await fetch(`${TON_CENTER_BASE}/api/v2/runGetMethod`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ address, method, stack }),
      signal: AbortSignal.timeout(10000),
    });
    if (response.ok) {
      const payload = await response.json();
      if (!payload.ok || payload.result?.exit_code !== 0) {
        throw new Error(`TON getter ${method} failed`);
      }
      return payload.result.stack;
    }
    if (response.status !== 429 || attempt === GETTER_RETRY_DELAYS.length) {
      throw new Error(`TON Center request failed with ${response.status}`);
    }
    await new Promise((resolve) => setTimeout(resolve, GETTER_RETRY_DELAYS[attempt]));
  }
}

async function runGetMethod(method, stack = []) {
  return runGetMethodAt(collectionAddress, method, stack);
}

// TON Center's v2 runGetMethod represents negative TVM integers as e.g.
// "-0x1" (leading '-' in front of the 0x-prefixed magnitude). BigInt()
// does not accept a sign together with a "0x" prefix, so it has to be
// stripped and re-applied manually.
function parseTvmInt(value) {
  const str = String(value);
  return str.startsWith("-") ? -BigInt(str.slice(1)) : BigInt(str);
}

function stackNumber(stack, position = 0) {
  const item = stack?.[position];
  if (!item || item[0] !== "num") throw new Error("Unexpected TON getter response");
  return parseTvmInt(item[1]);
}

function stackBool(stack, position = 0) {
  return stackNumber(stack, position) !== 0n;
}

function stackCell(stack, position = 0) {
  const item = stack?.[position];
  if (!item || item[0] !== "cell" || !item[1]?.bytes) {
    throw new Error("Unexpected TON getter response (expected cell)");
  }
  return Cell.fromBoc(Buffer.from(item[1].bytes, "base64"))[0];
}

function stackAddress(stack, position = 0) {
  return stackCell(stack, position).beginParse().loadAddress();
}

// Concatenates the raw bytes of a "snake format" cell chain (each cell's
// bits, followed by its single ref's bits, and so on) — the encoding Tact's
// storeStringTail / @stdlib/content's createOffchainContent produce.
function snakeBytes(cell) {
  const chunks = [];
  let current = cell;
  while (current) {
    const slice = current.beginParse();
    const byteLength = Math.floor(slice.remainingBits / 8);
    chunks.push(slice.loadBuffer(byteLength));
    current = slice.remainingRefs > 0 ? slice.loadRef() : null;
  }
  return Buffer.concat(chunks);
}

// Decodes a TEP-64 offchain NFT content cell (tag byte 0x01 followed by a
// snake-encoded ASCII URL) into the plain URL string.
function decodeOffchainContentUrl(cell) {
  const bytes = snakeBytes(cell);
  if (bytes.length === 0 || bytes[0] !== 0x01) {
    throw new Error("NFT content is not an offchain link");
  }
  return bytes.subarray(1).toString("utf8");
}

// Reads an NFT item's on-chain data directly from the item contract
// (see nft_item.tact's get_nft_data): whether it's initialized, its index,
// its collection and owner addresses, and its individual content decoded
// into the metadata URL used at mint time.
export async function getItemNftData(itemAddress) {
  const stack = await runGetMethodAt(itemAddress, "get_nft_data");
  const inited = stackBool(stack, 0);
  const index = stackNumber(stack, 1);
  const collection = stackAddress(stack, 2);
  const owner = stackAddress(stack, 3);
  const contentUrl = inited ? decodeOffchainContentUrl(stackCell(stack, 4)) : null;
  return { inited, index, collection, owner, contentUrl };
}

// Lists the NFT items of this collection currently owned by `ownerAddress`,
// via TON Center's v3 indexer (owner_address + collection_address filter).
// Paginated defensively up to a generous cap; items only get treated as
// actually-owned once their on-chain get_nft_data() is checked individually
// (see getItemNftData / api/private-image.js), so this listing itself does
// not need to be trusted for anything security-sensitive.
export async function listOwnedItemAddresses(ownerAddress, { maxItems = 500 } = {}) {
  const owner = Address.parse(ownerAddress).toString();
  const collection = Address.parse(collectionAddress).toString();
  const limit = 200;
  let offset = 0;
  const items = [];

  while (items.length < maxItems) {
    const url =
      `${TON_CENTER_BASE}/api/v3/nft/items?owner_address=${encodeURIComponent(owner)}` +
      `&collection_address=${encodeURIComponent(collection)}&limit=${limit}&offset=${offset}`;
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`TON Center v3 request failed with ${response.status}`);
    const payload = await response.json();
    const batch = Array.isArray(payload?.nft_items) ? payload.nft_items : [];
    for (const raw of batch) {
      if (typeof raw?.address === "string") items.push(raw.address);
    }
    if (batch.length < limit) break;
    offset += limit;
  }

  return items.slice(0, maxItems);
}

export async function getNextItemIndex() {
  return stackNumber(await runGetMethod("get_collection_data"));
}

// Computes an item's address deterministically from its index, straight from
// the collection contract's own get_nft_address_by_index() getter. Unlike
// listOwnedItemAddresses() (backed by TON Center's v3 indexer, which can lag
// well behind the real chain state), this needs no indexing at all — the
// collection contract can answer it as soon as the mint index is known, even
// before the item contract itself has been deployed.
export async function getNftAddressByIndex(index) {
  const stack = await runGetMethod("get_nft_address_by_index", [
    ["num", `0x${BigInt(index).toString(16)}`],
  ]);
  return stackAddress(stack, 0);
}

export async function getAuthPublicKey() {
  return stackNumber(await runGetMethod("get_auth_public_key"));
}

export async function getMintedCount(metadataIndex) {
  const stack = await runGetMethod("get_minted_count", [
    ["num", `0x${BigInt(metadataIndex).toString(16)}`],
  ]);
  return stackNumber(stack);
}

function parseItem(raw, metadataIndex, contentUrl) {
  const mintingPrice = Number(raw?.mintingPrice);

  // maxSupply, mintStartDate and mintEndDate are all optional in the NFT's
  // metadata JSON. Missing (or an empty value) means, respectively:
  // unlimited supply, no start gate (mintable right away), no end date
  // (mintable forever).
  const hasMaxSupply = raw?.maxSupply !== undefined && raw?.maxSupply !== null && raw?.maxSupply !== "";
  const maxSupply = hasMaxSupply ? Number(raw.maxSupply) : null;

  const hasStart = typeof raw?.mintStartDate === "string" && raw.mintStartDate.trim() !== "";
  const start = hasStart ? Date.parse(raw.mintStartDate) : null;

  const hasEnd = typeof raw?.mintEndDate === "string" && raw.mintEndDate.trim() !== "";
  const end = hasEnd ? Date.parse(raw.mintEndDate) : null;

  if (
    !raw ||
    typeof raw.name !== "string" ||
    !Number.isFinite(mintingPrice) ||
    mintingPrice <= 0 ||
    (hasMaxSupply && (!Number.isSafeInteger(maxSupply) || maxSupply <= 0)) ||
    (hasStart && !Number.isFinite(start)) ||
    (hasEnd && !Number.isFinite(end)) ||
    (hasStart && hasEnd && start > end)
  ) {
    return null;
  }

  return {
    metadataIndex,
    contentUrl,
    name: raw.name,
    image: typeof raw.image === "string" ? raw.image : null,
    mintingPrice,
    maxSupply,
    mintStartDate: hasStart ? new Date(start).toISOString() : null,
    mintEndDate: hasEnd ? new Date(end).toISOString() : null,
  };
}

export async function loadCatalog() {
  if (catalogCache.items && catalogCache.expiresAt > Date.now()) return catalogCache.items;

  const index = await fetchJson(nftsMetadataIndex);
  if (!Array.isArray(index)) throw new Error("Metadata index must be an array");

  const items = [];
  for (let metadataIndex = 0; metadataIndex < index.length; metadataIndex += 1) {
    const contentUrl = index[metadataIndex];
    if (typeof contentUrl !== "string" || !URL.canParse(contentUrl)) continue;
    const item = parseItem(await fetchJson(contentUrl), metadataIndex, contentUrl);
    if (!item) continue;
    const minted = Number(await getMintedCount(metadataIndex));
    // No maxSupply in the metadata => unlimited mint, remaining stays null
    // (the frontend hides the "... remaining" line whenever it's null).
    const remaining = item.maxSupply != null ? Math.max(0, item.maxSupply - minted) : null;
    const now = Date.now();
    const afterStart = item.mintStartDate == null || now >= Date.parse(item.mintStartDate);
    const beforeEnd = item.mintEndDate == null || now <= Date.parse(item.mintEndDate);
    const hasSupplyLeft = remaining == null || remaining > 0;
    if (afterStart && beforeEnd && hasSupplyLeft) {
      items.push({ ...item, minted, remaining });
    }
  }

  catalogCache = { items, expiresAt: Date.now() + 15000 };
  return items;
}

export async function isContractActive() {
  const response = await fetch(
    `${TON_CENTER_BASE}/api/v2/getAddressInformation?address=${encodeURIComponent(collectionAddress)}`,
    { headers: { accept: "application/json" }, signal: AbortSignal.timeout(10000) },
  );
  if (!response.ok) throw new Error(`TON Center request failed with ${response.status}`);
  const payload = await response.json();
  return payload?.result?.state === "active";
}

export {
  fetchJson,
  fetchJsonCached,
  jsonResponse,
  runGetMethod,
  runGetMethodAt,
  stackNumber,
};