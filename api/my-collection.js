import { Address } from "@ton/core";
import { collectionAddress, tonChain } from "../src/config.js";
import { fetchJsonCached, getItemNftData, jsonResponse, listOwnedItemAddresses } from "./_catalog.js";

// How many items to inspect on-chain per request. Generous for a personal
// collection; keeps worst-case latency/RPC load bounded.
const MAX_ITEMS = 200;
// How many get_nft_data() calls can be "in flight" (awaiting their turn)
// at once. Actual pacing against TON Center happens centrally in
// _catalog.js (shared across every caller, this one included), so this
// just bounds how many worker promises stay alive at a time — it no
// longer needs to be small to avoid 429s.
const CONCURRENCY = 6;

// Only the extension of the private image is exposed (never its URL), so the
// download gets a correctly named file.
function fileExtension(url) {
  try {
    const match = new URL(url).pathname.match(/\.(jpe?g|png|webp|gif)$/i);
    return match ? match[1].toLowerCase() : "jpg";
  } catch {
    return "jpg";
  }
}

function getgemsBase() {
  return tonChain === "Testnet" ? "https://testnet.getgems.io" : "https://getgems.io";
}

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return jsonResponse(res, 405, { error: "Method not allowed" });
  }

  let owner;
  try {
    const raw = new URL(req.url || "/", "http://localhost").searchParams.get("owner");
    owner = Address.parse(String(raw)).toString();
  } catch {
    return jsonResponse(res, 400, { error: "Invalid or missing owner address" });
  }

  try {
    const addresses = (await listOwnedItemAddresses(owner, { maxItems: MAX_ITEMS })).slice(0, MAX_ITEMS);

    const perItem = await mapWithConcurrency(addresses, CONCURRENCY, async (itemAddress) => {
      try {
        const data = await getItemNftData(itemAddress);
        // Defensive re-checks even though the listing was already filtered
        // by owner/collection: the item must genuinely be initialized,
        // belong to this collection, and currently be owned by `owner`.
        if (
          !data.inited ||
          !data.contentUrl ||
          !data.collection.equals(Address.parse(collectionAddress)) ||
          !data.owner.equals(Address.parse(owner))
        ) {
          return null;
        }
        return { itemAddress, index: data.index.toString(), contentUrl: data.contentUrl };
      } catch (error) {
        console.error("my_collection_item_error", itemAddress, error);
        return null;
      }
    });

    const ownedItems = perItem.filter(Boolean);

    // Many owned items usually share the same contentUrl (same minted
    // "type"): fetch each distinct metadata JSON once.
    const uniqueUrls = [...new Set(ownedItems.map((item) => item.contentUrl))];
    const metadataByUrl = new Map();
    await mapWithConcurrency(uniqueUrls, CONCURRENCY, async (url) => {
      try {
        metadataByUrl.set(url, await fetchJsonCached(url));
      } catch (error) {
        console.error("my_collection_metadata_error", url, error);
        metadataByUrl.set(url, null);
      }
    });

    const items = ownedItems.map((item) => {
      const metadata = metadataByUrl.get(item.contentUrl);
      const friendlyAddress = Address.parse(item.itemAddress).toString({
        testOnly: tonChain === "Testnet",
      });
      const privateImageRaw =
        metadata && typeof metadata.privateImage === "string" ? metadata.privateImage : "";
      return {
        itemAddress: friendlyAddress,
        index: item.index,
        // Public metadata URL (the same one listed in the mint catalog): lets
        // the frontend match owned copies to catalog entries.
        contentUrl: item.contentUrl,
        privateImageExt: fileExtension(privateImageRaw),
        name: (metadata && typeof metadata.name === "string" && metadata.name) || `NFT #${item.index}`,
        hasPrivateImage: Boolean(metadata && typeof metadata.privateImage === "string" && metadata.privateImage),
        privateImageUrl: `/api/private-image?item=${encodeURIComponent(friendlyAddress)}&owner=${encodeURIComponent(owner)}`,
        getgemsUrl: `${getgemsBase()}/nft/${friendlyAddress}`,
      };
    });

    return jsonResponse(res, 200, { network: tonChain, items });
  } catch (error) {
    console.error("my_collection_error", error);
    return jsonResponse(res, 502, { error: "Unable to load your collection" });
  }
}
