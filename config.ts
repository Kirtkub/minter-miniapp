export type TonChain = "Testnet" | "Mainnet";

export interface AppConfig {
  collectionAddress: string;
  collectionMetadata: string;
  nftsMetadataIndex: string;
  tonChain: TonChain;
}

export const APP_CONFIG: AppConfig = {
  collectionAddress: "kQDeZQGgQXsn6UK785TT9LVe2MTLZGHEx5jLqE8oOrKMEBHA",
  collectionMetadata:
    "https://astounding-flan-ffc457.netlify.app/collectionMetadata.json",
  nftsMetadataIndex:
    "https://astounding-flan-ffc457.netlify.app/metadataIndex.json",
  tonChain: "Testnet" // 'Testnet' | 'Mainnet'
};

/** Derived TON API / TonCenter endpoints based on the configured chain. */
export const TON_ENDPOINTS = {
  toncenterRpc:
    APP_CONFIG.tonChain === "Mainnet"
      ? "https://toncenter.com/api/v2/jsonRPC"
      : "https://testnet.toncenter.com/api/v2/jsonRPC",
  tonApiBase:
    APP_CONFIG.tonChain === "Mainnet"
      ? "https://tonapi.io"
      : "https://testnet.tonapi.io",
  tonConnectNetwork: APP_CONFIG.tonChain === "Mainnet" ? "-239" : "-3" // CHAIN.MAINNET / CHAIN.TESTNET
};

/** Only allow proxying images from this host — prevents the private-image
 *  proxy from being used as an open SSRF relay. */
export const ALLOWED_PRIVATE_IMAGE_HOST = "astounding-flan-ffc457.netlify.app";

/** Gas reserved on top of mintingPrice for the mint transaction, in TON. */
export const MINT_GAS_RESERVE_TON = 0.05;

/** How long a generated mint signature stays valid for, in seconds. */
export const SIGNATURE_TTL_SECONDS = 5 * 60;
