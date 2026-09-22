import { NextResponse } from "next/server";
import { APP_CONFIG, APP_RUNTIME } from "@/config";
import { mintedCountByMetadataUrl } from "@/lib/collection";
import { COPY } from "@/lib/copy";
import { loadMetadataIndex, loadNftMetadata, mintWindow, isMintWindowOpen } from "@/lib/metadata";
import type { MintableNft } from "@/lib/nft-types";
import { parsePriceToNano } from "@/lib/ton";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [urls, counts] = await Promise.all([
      loadMetadataIndex(),
      mintedCountByMetadataUrl().catch(() => ({}) as Record<string, number>),
    ]);

    const now = Date.now();
    const items: MintableNft[] = [];

    for (const [index, metadataUrl] of urls.entries()) {
      const metadata = await loadNftMetadata(metadataUrl);
      const mintedCount = counts[metadataUrl] ?? 0;
      const { startMs, endMs } = mintWindow(metadata);
      const mintingPriceNano = parsePriceToNano(metadata.mintingPrice).toString();
      const isAvailable =
        mintedCount < metadata.maxSupply && isMintWindowOpen(metadata, now);

      items.push({
        index,
        metadataUrl,
        metadata,
        mintedCount,
        mintingPriceNano,
        mintStartMs: startMs,
        mintEndMs: endMs,
        isAvailable,
      });
    }

    return NextResponse.json({
      collectionAddress: APP_CONFIG.collectionAddress,
      chain: APP_CONFIG.tonChain,
      defaultMintingPriceTon: APP_RUNTIME.defaultMintingPriceTon,
      items: items.filter((item) => item.isAvailable),
    });
  } catch (error) {
    console.error("nft-feed", error);
    return NextResponse.json({ error: COPY.errors.metadata }, { status: 500 });
  }
}
