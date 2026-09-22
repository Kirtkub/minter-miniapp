import { APP_CONFIG } from "@/config";
import { loadMetadataIndex, metadataUriFromItem } from "./metadata";
import { toRawAddress, tonApiFetch } from "./ton";

type TonApiNftItem = {
  address: string;
  index: number;
  owner?: { address?: string };
  metadata?: { metadata_url?: string };
  metadata_url?: string;
  content?: { uri?: string };
};

type TonApiNftList = {
  nft_items?: TonApiNftItem[];
};

function collectionPathId(): string {
  return encodeURIComponent(APP_CONFIG.collectionAddress);
}

async function paginateCollectionItems(): Promise<TonApiNftItem[]> {
  const items: TonApiNftItem[] = [];
  const limit = 1000;
  let offset = 0;

  while (true) {
    const page = await tonApiFetch<TonApiNftList>(
      `/v2/nfts/collections/${collectionPathId()}/items?limit=${limit}&offset=${offset}`,
    );
    const batch = page.nft_items ?? [];
    items.push(...batch);
    if (batch.length < limit) break;
    offset += limit;
  }

  return items;
}

export async function mintedCountByMetadataUrl(): Promise<Record<string, number>> {
  const [index, items] = await Promise.all([
    loadMetadataIndex(),
    paginateCollectionItems(),
  ]);

  const counts: Record<string, number> = {};
  for (const url of index) counts[url] = 0;

  for (const item of items) {
    const uri = metadataUriFromItem(item);
    if (uri && counts[uri] !== undefined) {
      counts[uri] += 1;
      continue;
    }
    if (typeof item.index === "number" && index[item.index]) {
      counts[index[item.index]] += 1;
    }
  }

  return counts;
}

export async function ownedCollectionItems(ownerAddress: string): Promise<TonApiNftItem[]> {
  const owner = encodeURIComponent(toRawAddress(ownerAddress));
  const collection = encodeURIComponent(
    toRawAddress(APP_CONFIG.collectionAddress),
  );
  const items: TonApiNftItem[] = [];
  const limit = 1000;
  let offset = 0;

  while (true) {
    const page = await tonApiFetch<TonApiNftList>(
      `/v2/accounts/${owner}/nfts?collection=${collection}&limit=${limit}&offset=${offset}&indirect_ownership=false`,
    );
    const batch = page.nft_items ?? [];
    items.push(...batch);
    if (batch.length < limit) break;
    offset += limit;
  }

  return items;
}
