import { collectionAddress, nftsMetadataIndex, tonChain } from "../src/config.js";

const TON_CENTER_BASE =
  tonChain === "Testnet" ? "https://testnet.toncenter.com" : "https://toncenter.com";
const GETTER_RETRY_DELAYS = [500, 1200, 2500];
let catalogCache = { expiresAt: 0, items: null };

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

async function runGetMethod(method, stack = []) {
  for (let attempt = 0; attempt <= GETTER_RETRY_DELAYS.length; attempt += 1) {
    const response = await fetch(`${TON_CENTER_BASE}/api/v2/runGetMethod`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ address: collectionAddress, method, stack }),
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

function stackNumber(stack, position = 0) {
  const item = stack?.[position];
  if (!item || item[0] !== "num") throw new Error("Unexpected TON getter response");
  return BigInt(item[1]);
}

export async function getNextItemIndex() {
  return stackNumber(await runGetMethod("get_collection_data"));
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

export { fetchJson, jsonResponse, runGetMethod, stackNumber };