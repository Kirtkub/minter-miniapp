# Spicy Pic Mint — Telegram Mini App (TON)

A static Telegram Mini App (Next.js pages router) for minting an NFT collection on TON,
with two Vercel Serverless Functions for the parts that must stay server-side. No long
polling anywhere — all on-chain reads are on-demand REST calls (TonCenter / TonAPI), and
the mint transaction itself is broadcast by the user's wallet via TON Connect.

## Structure

```
config.ts                          # APP_CONFIG (collection address, metadata URLs, chain)
types/index.ts                     # Shared TS types
lib/ton.ts                         # On-chain reads: minted-count per index, owned NFTs (TonAPI)
lib/nft.ts                         # Client-side: fetch metadata index + per-item JSON, availability
lib/signature.ts                   # Server-only: Ed25519 mint-authorization signing
lib/mintTransaction.ts             # Client-side: builds the TonConnect SendTransactionRequest
pages/index.tsx                    # App shell: header, TonConnect button, tab switch
pages/_app.tsx                     # Telegram WebApp SDK init + theme variable bridge
pages/api/generate-mint-signature.ts  # POST: signs a mint authorization
pages/api/private-image-proxy.ts      # GET: streams gated Netlify images with Bearer auth
components/*                       # BottomNav, MintFeed, NftCard, CountdownTimer,
                                    # MyCollection, OwnedNftCard, TonConnectProvider
public/tonconnect-manifest.json    # TON Connect manifest (update `url` before shipping)
```

## Environment variables (Vercel → Project → Settings → Environment Variables)

| Name | Purpose |
|---|---|
| `NETLIFY_PRIVATE_SECRET` | Bearer token sent to Netlify when fetching `privateImage` assets. |
| `AUTHENTICATION_SIGNATURE_PRIVATE_KEY` | Ed25519 signing key (32-byte seed or 64-byte secret key, hex or base64) used to sign mint authorizations. **Server-only — never prefix with `NEXT_PUBLIC_`.** |

Copy `.env.example` → `.env.local` for local development.

## Important: align the signature/transaction format with your deployed contract

`lib/signature.ts` (server) and `lib/mintTransaction.ts` (client) define a **reference**
cell layout for the mint-authorization message:

```
collection_address : MsgAddress
item_index          : uint64
recipient_address   : MsgAddress
sha256(metadata_url) : 32 bytes
expires_at           : uint32
```

signed as the cell's standard hash with Ed25519, and forwarded on-chain as:

```
op::authorized_mint (uint32) | query_id (uint64) | item_index (uint64)
| recipient_address | expires_at (uint32) | signature (64 bytes)
```

**This must match the actual FunC/Tact contract's expected message body and signed
payload exactly**, or the contract will reject the signature. Update both files together
if your contract's ABI differs (field order, types, op-code, or whether the full signed
cell is forwarded vs. just its hash).

The public key corresponding to `AUTHENTICATION_SIGNATURE_PRIVATE_KEY` must be the one
hard-coded/configured in the collection contract as the authorized minting signer.

## Minted-count / availability model

`lib/ton.ts` derives each item's deterministic address via the collection's
`get_nft_address_by_index` get-method and treats "contract deployed" as "minted". This
matches the common 1-of-1-per-index NFT collection pattern. If your collection allows
`maxSupply > 1` per metadata index, replace `getMintedStatusForIndexes` with a call into
your contract's actual per-index supply counter (or an indexer) instead.

## Local development

```bash
npm install
npm run dev
```

Open the app outside Telegram to develop against the CSS fallback theme; the
`@twa-dev/sdk` calls in `pages/_app.tsx` no-op gracefully when not running inside Telegram.

## Deploying to Vercel

1. Push this repo to GitHub/GitLab/Bitbucket and import it in Vercel, or run `vercel`.
2. Set the two environment variables above in the Vercel dashboard.
3. After the first deploy, update `public/tonconnect-manifest.json`'s `url` (and
   `iconUrl`) to your real `https://<project>.vercel.app` domain, then redeploy.
4. Register the deployed URL as your Telegram Bot's Mini App URL via @BotFather
   (`/newapp` or `/editapp`).

## Switching networks

Flip `APP_CONFIG.tonChain` in `config.ts` between `"Testnet"` and `"Mainnet"`. This
automatically repoints TonCenter RPC and TonAPI endpoints (`TON_ENDPOINTS` in the same
file) and the TON Connect network used for transactions.
