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
  const maxSupply = Number(raw?.maxSupply);
  const start = Date.parse(raw?.mintStartDate);
  const end = Date.parse(raw?.mintEndDate);

  if (
    !raw ||
    typeof raw.name !== "string" ||
    !Number.isFinite(mintingPrice) ||
    mintingPrice <= 0 ||
    !Number.isSafeInteger(maxSupply) ||
    maxSupply <= 0 ||
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start > end
  ) {
    return null;
  }

  return {
    metadataIndex,
    contentUrl,
    name: raw.name,
    mintingPrice,
    maxSupply,
    mintStartDate: new Date(start).toISOString(),
    mintEndDate: new Date(end).toISOString(),
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
    const remaining = Math.max(0, item.maxSupply - minted);
    const now = Date.now();
    if (now >= Date.parse(item.mintStartDate) && now <= Date.parse(item.mintEndDate) && remaining > 0) {
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