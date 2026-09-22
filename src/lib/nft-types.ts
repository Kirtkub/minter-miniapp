export type NftAttribute = {
  trait_type: string;
  value: string | number;
};

export type NftMetadata = {
  name: string;
  description?: string;
  image: string;
  privateImage?: string;
  mintingPrice?: string | number;
  maxSupply: number;
  mintStartDate?: number | string;
  mintEndDate?: number | string;
  mintDeadline?: number | string;
  attributes?: NftAttribute[];
};

export type MintableNft = {
  index: number;
  metadataUrl: string;
  metadata: NftMetadata;
  mintedCount: number;
  mintingPriceNano: string;
  mintStartMs: number;
  mintEndMs: number;
  isAvailable: boolean;
};

export type OwnedNft = {
  address: string;
  index: number;
  metadataUrl?: string;
  name: string;
  description?: string;
  publicImage?: string;
  privateImage?: string;
  attributes?: NftAttribute[];
};
