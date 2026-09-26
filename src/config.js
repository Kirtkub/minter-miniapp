export const collectionAddress = "kQBUFysKjAy9FFKcp4Zw3BKVKovN3mwaoFdjYT92hFX50AsG";
// Must match the `owner` set at deploy time (see deployment-info.json from
// /deploycollection). Only this wallet's Withdraw messages are accepted by
// the contract, and only this wallet sees the "Withdraw" button in the UI.
export const ownerAddress = "kQBI3zZTgWxuJwG96FxptKWGzH1uXw0wHddsCWWqbzUOa9uX";
export const collectionMetadata = "https://astounding-flan-ffc457.netlify.app/collectionMetadata.json";
export const nftsMetadataIndex = "https://astounding-flan-ffc457.netlify.app/metadataIndex.json";
export const tonChain = "Testnet";
// Telegram access gate (only applied when the app is opened as a Telegram
// miniapp): users must be adults and members of this channel.
export const channelChatId = "-1001898840240";
export const channelInviteLink = "https://t.me/+EToBLGdMi5c2ZjY0";

// Public URL of the deployed miniapp (used e.g. by the "Open Miniapp" button
// of the welcome message the bot sends in private chat).
export const appUrl = "https://minter-miniapp.vercel.app/";

// Telegram chat id of the project admin. Used by api/deploy-notify.js (after
// every collection deploy) and api/mint-notify.js (after every successful
// mint) to send a backup .zip with everything needed to submit the source
// for verification on verifier.ton.org — see api/_verification-bundle.js.
export const adminChatId = "6227453725";
