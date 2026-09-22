import { APP_CONFIG } from "../config";
import { getMintedStatusForIndexes } from "./ton";
import type { MintableNft, NftMetadata, OwnedNft } from "../types";

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export function isWithinMintWindow(
  metadata: NftMetadata,
  now: Date = new Date()
): boolean {
  const start = new Date(metadata.mintStartDate).getTime();
  const end = new Date(metadata.mintEndDate).getTime();
  const t = now.getTime();
  return t >= start && t <= end;
}

/**
 * Fetches the metadata index (array of per-item JSON URLs), resolves every
 * item's metadata, cross-checks minted counts on-chain, and returns only
 * NFTs that satisfy the availability rule:
 *   mintedCount < maxSupply AND now is within [mintStartDate, mintEndDate]
 *
 * Non-available items are still returned (with isAvailable=false) so the UI
 * can optionally show "sold out" / "not yet open" / "ended" states.
 */
export async function fetchMintFeed(): Promise<MintableNft[]> {
  const metadataUrls = await fetchJson<string[]>(APP_CONFIG.nftsMetadataIndex);

  const metadataList = await Promise.all(
    metadataUrls.map(async (url, position) => {
      const metadata = await fetchJson<NftMetadata>(url);
      const index = metadata.index ?? position;
      return { index, metadataUrl: url, metadata };
    })
  );

  const mintedStatus = await getMintedStatusForIndexes(
    APP_CONFIG.collectionAddress,
    metadataList.map((m) => m.index)
  );

  // We only get a boolean "minted or not" per deterministic index from the
  // cheap on-chain check (mintedCount is effectively 1 or 0 per index for
  // 1-of-1 items). For items where maxSupply > 1 sharing one metadata index,
  // adapt this to your actual per-index supply model.
  const now = new Date();

  return metadataList.map(({ index, metadataUrl, metadata }) => {
    const minted = mintedStatus.get(index) ?? false;
    const mintedCount = minted ? 1 : 0;
    const isSoldOut = mintedCount >= metadata.maxSupply;
    const withinWindow = isWithinMintWindow(metadata, now);

    return {
      index,
      metadataUrl,
      metadata,
      mintedCount,
      isSoldOut,
      isWithinMintWindow: withinWindow,
      isAvailable: !isSoldOut && withinWindow
    };
  });
}

/** Resolves owned-item metadata for display in "My Collection". */
export async function resolveOwnedNftMetadata(
  items: { address: string; index: number; metadataUrl: string | null }[]
): Promise<OwnedNft[]> {
  return Promise.all(
    items.map(async (item) => {
      if (!item.metadataUrl) {
        return {
          address: item.address,
          index: item.index,
          metadataUrl: "",
          metadata: null
        };
      }
      try {
        const metadata = await fetchJson<NftMetadata>(item.metadataUrl);
        return {
          address: item.address,
          index: item.index,
          metadataUrl: item.metadataUrl,
          metadata
        };
      } catch (err) {
        console.error("Failed to resolve owned NFT metadata:", err);
        return {
          address: item.address,
          index: item.index,
          metadataUrl: item.metadataUrl,
          metadata: null
        };
      }
    })
  );
}

/** Builds the proxied URL used to render a gated privateImage. */
export function proxiedPrivateImageUrl(privateImageUrl: string): string {
  return `/api/private-image-proxy?url=${encodeURIComponent(privateImageUrl)}`;
}
