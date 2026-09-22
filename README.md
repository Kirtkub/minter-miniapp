# Spicy Pic TMA

Production Telegram Mini App for minting and viewing the **Sexy Pics** NFT collection on TON. The UI is a static Next.js client. Mint signatures and private images go through Vercel Serverless Functions — no long polling.

## Stack

- Next.js (App Router) + TypeScript
- `@tonconnect/ui-react` for wallet connect
- `@ton/core`, `@ton/crypto`, `@ton/ton` for cells and Ed25519 mint signatures
- TonAPI for collection / ownership queries
- `@twa-dev/sdk` for Telegram WebApp theme and viewport

## Configure

Local contract and metadata endpoints live in [`config.ts`](./config.ts):

```ts
export const APP_CONFIG = {
  collectionAddress: "kQDeZQGgQXsn6UK785TT9LVe2MTLZGHEx5jLqE8oOrKMEBHA",
  collectionMetadata: "https://astounding-flan-ffc457.netlify.app/collectionMetadata.json",
  nftsMetadataIndex: "https://astounding-flan-ffc457.netlify.app/metadataIndex.json",
  tonChain: "Testnet", // 'Testnet' | 'Mainnet'
};
```

Set these **Vercel environment variables** (Production + Preview):

| Variable | Purpose |
| --- | --- |
| `NETLIFY_PRIVATE_SECRET` | Bearer token for private Netlify image assets |
| `AUTHENTICATION_SIGNATURE_PRIVATE_KEY` | Ed25519 secret used to sign mint authorizations |
| `NEXT_PUBLIC_APP_URL` | Public HTTPS origin, e.g. `https://your-app.vercel.app` |
| `TONAPI_KEY` | Optional TonAPI token for higher rate limits |

`AUTHENTICATION_SIGNATURE_PRIVATE_KEY` accepts:

- 32-byte seed (hex or base64)
- 64-byte NaCl secret key (hex or base64)
- 24-word TON mnemonic

The matching **public key** must already be stored in the collection contract.

## Mint signature payload

`POST /api/generate-mint-signature`

```json
{
  "metadataUrl": "https://astounding-flan-ffc457.netlify.app/nft/001/metadata.json",
  "walletAddress": "EQ...",
  "itemIndex": 0
}
```

Unsigned cell (Ed25519 over `cell.hash()`):

- `valid_until:uint64`
- `item_index:uint64` (index in `nftsMetadataIndex`)
- `item_value:coins`
- `nft_message:^(owner content:^offchain_uri)`
- `forward_amount:coins`

Message body sent to `APP_CONFIG.collectionAddress`:

- `op:uint32 = 25`
- `query_id:uint64`
- `signature:bits512`
- unsigned payload

If your on-chain opcode/layout differs, update `src/lib/mint-payload.ts` to match the contract. NFT metadata stays off-chain; the item content points at the JSON URL.

Value attached to the transaction is `mintingPrice + 0.08 TON` gas. If metadata omits `mintingPrice`, the app uses `1 TON`. Window fields: `mintStartDate` / `mintEndDate`, or `mintDeadline` as the end time.

## Private images

Owned items load `privateImage` through:

`/api/private-image-proxy?url=...`

The function allowlists the Netlify host, adds `Authorization: Bearer NETLIFY_PRIVATE_SECRET`, and streams the bytes back. **Save Image** draws the result to a canvas and triggers a JPEG download (or the Web Share sheet on supported devices).

## Local run

```bash
cp .env.example .env.local
npm install
npm run dev
```

Open `http://localhost:3000`. Wallet connect in Telegram requires the deployed HTTPS URL.

## Deploy on Vercel

1. Import this repo in Vercel.
2. Add the environment variables above.
3. Deploy (framework: Next.js).
4. In [@BotFather](https://t.me/BotFather), set the Mini App URL to your Vercel domain.

There is no `output: export` because `/api/*` must stay as serverless functions. The home page is still a client-rendered Mini App with no websocket / long-poll workers.
