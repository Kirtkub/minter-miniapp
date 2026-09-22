export interface NftAttribute {
  trait_type: string;
  value: string | number;
}

/** Off-chain metadata JSON shape for a single mintable NFT item. */
export interface NftMetadata {
  /** Optional explicit collection item index. Falls back to array position
   *  in metadataIndex.json when absent. */
  index?: number;
  name: string;
  description: string;
  /** Public preview image, shown pre-mint and in the mint feed. */
  image: string;
  /** Gated image, only ever fetched through /api/private-image-proxy. */
  privateImage: string;
  /** Price in TON (not nanoTON). */
  mintingPrice: number;
  maxSupply: number;
  /** ISO-8601 UTC timestamps. */
  mintStartDate: string;
  mintEndDate: string;
  attributes: NftAttribute[];
}

/** An NFT enriched with data derived from the metadataIndex + on-chain state. */
export interface MintableNft {
  index: number;
  metadataUrl: string;
  metadata: NftMetadata;
  mintedCount: number;
  isSoldOut: boolean;
  isWithinMintWindow: boolean;
  isAvailable: boolean;
}

/** An NFT owned by the connected wallet, resolved via TonAPI. */
export interface OwnedNft {
  address: string;
  index: number;
  metadataUrl: string;
  metadata: NftMetadata | null;
}

export interface GenerateMintSignatureRequest {
  metadataUrl: string;
  walletAddress: string;
  itemIndex: number;
}

export interface GenerateMintSignatureResponse {
  signatureBase64: string;
  payloadBase64: string;
  itemIndex: number;
  walletAddress: string;
  metadataUrl: string;
  expiresAt: number; // unix seconds
  publicKeyHex: string;
}

export interface ApiErrorResponse {
  error: string;
}
