export type TonChain = "Testnet" | "Mainnet";

export const APP_CONFIG = {
  collectionAddress: "kQDeZQGgQXsn6UK785TT9LVe2MTLZGHEx5jLqE8oOrKMEBHA",
  collectionMetadata:
    "https://astounding-flan-ffc457.netlify.app/collectionMetadata.json",
  nftsMetadataIndex:
    "https://astounding-flan-ffc457.netlify.app/metadataIndex.json",
  tonChain: "Testnet" as TonChain,
};

/** Runtime constants used by minting, proxy allowlists, and TonConnect. */
export const APP_RUNTIME = {
  appName: "Spicy Pic",
  defaultMintingPriceTon: "1",
  mintGasTon: "0.08",
  itemForwardTon: "0.05",
  signatureTtlSeconds: 10 * 60,
  metadataHostAllowlist: ["astounding-flan-ffc457.netlify.app"] as const,
  signedMintOpCode: 25,
} as const;
