// ⚠️ MAINNET SWITCH — questi 4 valori sono ancora quelli della collezione di
// TEST su Testnet. Un indirizzo deployato su Testnet NON esiste come
// contratto reale su Mainnet (sono due blockchain/stati separati): se lasci
// questo collectionAddress con tonChain="Mainnet" l'app interrogherà il
// Mainnet per un contratto che lì non è mai stato deployato (badge "Non
// autorizzato", catalogo vuoto/errore, mint impossibile).
//
// Prima di andare in produzione:
//   1. Apri /deploycollection, seleziona rete "Mainnet", connetti il wallet
//      che vuoi come owner e completa il deploy pagando con TON reali.
//   2. Al termine del deploy copia collectionAddress / collectionMetadata /
//      nftsMetadataIndex dal riepilogo a schermo (o dal deployment-info.json
//      nello zip scaricato) e incollali qui sotto al posto dei placeholder.
//   3. Aggiorna anche la variabile d'ambiente Vercel
//      AUTHENTICATION_SIGNATURE_PRIVATE_KEY con la chiave privata generata
//      per QUESTO nuovo deploy (deployment-info.json la contiene): è diversa
//      per ogni collezione deployata, quella vecchia della collezione di test
//      non corrisponde alla chiave pubblica salvata nel nuovo contratto.
export const collectionAddress = "REPLACE_WITH_MAINNET_COLLECTION_ADDRESS";
// Must match the `owner` set at deploy time (see deployment-info.json from
// /deploycollection). Only this wallet's Withdraw messages are accepted by
// the contract, and only this wallet sees the "Withdraw" button in the UI.
export const ownerAddress = "REPLACE_WITH_MAINNET_OWNER_ADDRESS";
export const collectionMetadata = "REPLACE_WITH_MAINNET_COLLECTION_METADATA_URL";
export const nftsMetadataIndex = "REPLACE_WITH_MAINNET_METADATA_INDEX_URL";
export const tonChain = "Mainnet";
// Telegram access gate (only applied when the app is opened as a Telegram
// miniapp): users must be adults and members of this channel.
export const channelChatId = "-1001898840240";
export const channelInviteLink = "https://t.me/+EToBLGdMi5c2ZjY0";

// Public URL of the deployed miniapp (used e.g. by the "Open Miniapp" button
// of the welcome message the bot sends in private chat).
export const appUrl = "https://minter-miniapp.vercel.app/";
