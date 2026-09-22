import { NextRequest, NextResponse } from "next/server";
import { ownedCollectionItems } from "@/lib/collection";
import { COPY } from "@/lib/copy";
import { loadNftMetadata, metadataUriFromItem } from "@/lib/metadata";
import type { OwnedNft } from "@/lib/nft-types";
import { parseFriendlyAddress } from "@/lib/ton";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get("wallet");
  if (!wallet) {
    return NextResponse.json({ error: COPY.errors.invalidAddress }, { status: 400 });
  }

  try {
    parseFriendlyAddress(wallet);
    const items = await ownedCollectionItems(wallet);
    const owned: OwnedNft[] = [];

    for (const item of items) {
      const metadataUrl = metadataUriFromItem(item);
      let metadata = null;
      if (metadataUrl) {
        try {
          metadata = await loadNftMetadata(metadataUrl);
        } catch {
          metadata = null;
        }
      }

      owned.push({
        address: item.address,
        index: item.index,
        metadataUrl,
        name: metadata?.name ?? `NFT #${item.index}`,
        description: metadata?.description,
        publicImage: metadata?.image,
        privateImage: metadata?.privateImage,
        attributes: metadata?.attributes,
      });
    }

    return NextResponse.json({ items: owned });
  } catch (error) {
    console.error("my-nfts", error);
    return NextResponse.json({ error: COPY.errors.chain }, { status: 500 });
  }
}
