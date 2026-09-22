import type { NextApiRequest, NextApiResponse } from "next";
import { Address } from "@ton/core";
import { APP_CONFIG, ALLOWED_PRIVATE_IMAGE_HOST } from "../../config";
import { signMintAuthorization } from "../../lib/signature";
import type {
  ApiErrorResponse,
  GenerateMintSignatureRequest,
  GenerateMintSignatureResponse
} from "../../types";

function isValidMetadataUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" && parsed.hostname === ALLOWED_PRIVATE_IMAGE_HOST
    );
  } catch {
    return false;
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GenerateMintSignatureResponse | ApiErrorResponse>
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  const { metadataUrl, walletAddress, itemIndex } =
    (req.body ?? {}) as Partial<GenerateMintSignatureRequest>;

  if (!metadataUrl || typeof metadataUrl !== "string") {
    return res.status(400).json({ error: "metadataUrl is required." });
  }
  if (!isValidMetadataUrl(metadataUrl)) {
    return res.status(400).json({ error: "metadataUrl is not an allowed host." });
  }
  if (!walletAddress || typeof walletAddress !== "string") {
    return res.status(400).json({ error: "walletAddress is required." });
  }
  try {
    Address.parse(walletAddress);
  } catch {
    return res.status(400).json({ error: "walletAddress is not a valid TON address." });
  }
  if (
    itemIndex === undefined ||
    typeof itemIndex !== "number" ||
    !Number.isInteger(itemIndex) ||
    itemIndex < 0
  ) {
    return res.status(400).json({ error: "itemIndex must be a non-negative integer." });
  }

  try {
    // Re-fetch the metadata server-side to independently verify price/window/
    // supply before signing — never trust client-supplied price/eligibility.
    const metadataRes = await fetch(metadataUrl, { cache: "no-store" });
    if (!metadataRes.ok) {
      return res.status(502).json({ error: "Could not fetch NFT metadata." });
    }
    const metadata = await metadataRes.json();

    const now = new Date();
    const start = new Date(metadata.mintStartDate);
    const end = new Date(metadata.mintEndDate);
    if (now < start || now > end) {
      return res.status(403).json({ error: "Minting window is closed for this item." });
    }

    const authorization = signMintAuthorization(
      APP_CONFIG.collectionAddress,
      itemIndex,
      walletAddress,
      metadataUrl
    );

    return res.status(200).json({
      ...authorization,
      itemIndex,
      walletAddress,
      metadataUrl
    });
  } catch (err) {
    console.error("generate-mint-signature failed:", err);
    return res.status(500).json({ error: "Failed to generate mint signature." });
  }
}
