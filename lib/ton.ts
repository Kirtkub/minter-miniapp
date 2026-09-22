import { TonClient, Address } from "@ton/ton";
import { TON_ENDPOINTS } from "../config";

let clientSingleton: TonClient | null = null;

/** Lazily-constructed, reused TonClient pointed at the configured chain. */
export function getTonClient(): TonClient {
  if (!clientSingleton) {
    clientSingleton = new TonClient({
      endpoint: TON_ENDPOINTS.toncenterRpc
    });
  }
  return clientSingleton;
}

/**
 * Standard TON NFT collections expose `get_nft_address_by_index(index)`,
 * deterministically deriving the child NFT item's address without any
 * on-chain lookup of state. We then check whether that address has been
 * deployed (i.e. minted) by querying its contract state.
 */
export async function getNftAddressByIndex(
  collectionAddress: string,
  index: number
): Promise<Address> {
  const client = getTonClient();
  const result = await client.runMethod(
    Address.parse(collectionAddress),
    "get_nft_address_by_index",
    [{ type: "int", value: BigInt(index) }]
  );
  return result.stack.readAddress();
}

/** An NFT item contract only exists on-chain once it has been minted. */
export async function isNftIndexMinted(
  collectionAddress: string,
  index: number
): Promise<boolean> {
  try {
    const nftAddress = await getNftAddressByIndex(collectionAddress, index);
    const client = getTonClient();
    const state = await client.getContractState(nftAddress);
    return state.state === "active";
  } catch (err) {
    // If the get-method reverts (e.g. index never configured) treat as unminted.
    console.error(`isNftIndexMinted(${index}) failed:`, err);
    return false;
  }
}

/**
 * Resolves minted status for many indexes in parallel with a concurrency
 * cap, to avoid hammering the public TonCenter RPC.
 */
export async function getMintedStatusForIndexes(
  collectionAddress: string,
  indexes: number[],
  concurrency = 5
): Promise<Map<number, boolean>> {
  const results = new Map<number, boolean>();
  const queue = [...indexes];

  async function worker() {
    while (queue.length > 0) {
      const next = queue.shift();
      if (next === undefined) break;
      const minted = await isNftIndexMinted(collectionAddress, next);
      results.set(next, minted);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, indexes.length) }, worker)
  );

  return results;
}

interface TonApiNftItem {
  address: string;
  index: number;
  collection?: { address: string };
  metadata?: Record<string, unknown>;
  content?: { uri?: string };
}

/**
 * Fetches all NFT items of `collectionAddress` owned by `walletAddress`
 * using the public TonAPI indexer (avoids scanning the whole collection
 * on-chain, which is impractical for large collections).
 */
export async function getOwnedNftsFromTonApi(
  walletAddress: string,
  collectionAddress: string
): Promise<{ address: string; index: number; metadataUrl: string | null }[]> {
  const url = `${TON_ENDPOINTS.tonApiBase}/v2/accounts/${encodeURIComponent(
    walletAddress
  )}/nfts?collection=${encodeURIComponent(
    collectionAddress
  )}&limit=1000&indirect_ownership=false`;

  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`TonAPI request failed: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as { nft_items?: TonApiNftItem[] };

  return (data.nft_items ?? []).map((item) => ({
    address: item.address,
    index: item.index,
    metadataUrl: item.content?.uri ?? null
  }));
}
