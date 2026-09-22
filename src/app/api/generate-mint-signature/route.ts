import { NextRequest, NextResponse } from "next/server";
import { toNano } from "@ton/core";
import { APP_CONFIG, APP_RUNTIME } from "@/config";
import { mintedCountByMetadataUrl } from "@/lib/collection";
import { loadMetadataIndex, loadNftMetadata, isMintWindowOpen } from "@/lib/metadata";
import { buildSignedMintBody, cellToBase64, loadMintKeyPair } from "@/lib/mint-payload";
import { parseFriendlyAddress, parsePriceToNano } from "@/lib/ton";
import { isAllowedAssetUrl } from "@/lib/urls";
import { COPY } from "@/lib/copy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  metadataUrl?: string;
  walletAddress?: string;
  itemIndex?: number;
};

export async function POST(request: NextRequest) {
  try {
    const privateKey = process.env.AUTHENTICATION_SIGNATURE_PRIVATE_KEY;
    if (!privateKey) {
      return NextResponse.json({ error: COPY.errors.unauthorized }, { status: 500 });
    }

    const body = (await request.json()) as Body;
    const metadataUrl = body.metadataUrl?.trim();
    const walletAddress = body.walletAddress?.trim();
    const itemIndex = Number(body.itemIndex);

    if (!metadataUrl || !isAllowedAssetUrl(metadataUrl)) {
      return NextResponse.json({ error: COPY.errors.invalidUrl }, { status: 400 });
    }
    if (!Number.isInteger(itemIndex) || itemIndex < 0) {
      return NextResponse.json({ error: COPY.errors.invalidIndex }, { status: 400 });
    }

    let owner;
    try {
      owner = parseFriendlyAddress(walletAddress ?? "");
    } catch {
      return NextResponse.json({ error: COPY.errors.invalidAddress }, { status: 400 });
    }

    const index = await loadMetadataIndex();
    if (index[itemIndex] !== metadataUrl) {
      return NextResponse.json({ error: COPY.errors.invalidIndex }, { status: 400 });
    }

    const metadata = await loadNftMetadata(metadataUrl);
    if (!isMintWindowOpen(metadata)) {
      return NextResponse.json({ error: COPY.mint.unavailable }, { status: 409 });
    }

    const counts = await mintedCountByMetadataUrl();
    const mintedCount = counts[metadataUrl] ?? 0;
    if (mintedCount >= metadata.maxSupply) {
      return NextResponse.json({ error: COPY.mint.soldOut }, { status: 409 });
    }

    const keyPair = await loadMintKeyPair(privateKey);
    const itemValue = parsePriceToNano(metadata.mintingPrice);
    const signed = buildSignedMintBody({
      secretKey: keyPair.secretKey,
      owner,
      itemIndex,
      metadataUrl,
      itemValue,
      forwardAmount: toNano(APP_RUNTIME.itemForwardTon),
    });

    return NextResponse.json({
      collectionAddress: APP_CONFIG.collectionAddress,
      itemIndex,
      metadataUrl,
      queryId: signed.queryId.toString(),
      validUntil: signed.validUntil,
      signature: signed.signature.toString("base64"),
      payloadBoc: cellToBase64(signed.unsigned),
      bodyBoc: cellToBase64(signed.body),
      amountNano: (itemValue + toNano(APP_RUNTIME.mintGasTon)).toString(),
      mintingPriceNano: itemValue.toString(),
    });
  } catch (error) {
    console.error("generate-mint-signature", error);
    return NextResponse.json({ error: COPY.errors.signature }, { status: 500 });
  }
}
