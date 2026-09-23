# TON Minting Mini App

A minimalist Telegram Mini App with TON wallet connection and a metadata-driven
TON NFT minting page.

## What it does

- Renders a dark, minimalist minting page.
- Preserves TON Connect wallet connection, disconnect, and session restoration.
- Loads the configured off-chain metadata index and shows only NFTs inside their
  mint window with remaining supply.
- Authorizes minting server-side with `AUTHENTICATION_SIGNATURE_PRIVATE_KEY`
  before the connected wallet signs the collection transaction.

## Technology

- Plain HTML/CSS/JS with a small esbuild bundle.
- [TON Connect UI SDK](https://github.com/ton-connect/sdk), loaded via CDN.
- [Telegram Web App SDK](https://core.telegram.org/bots/webapps).
- `@ton/core` for the contract-compatible mint message.

## Running locally

Set `AUTHENTICATION_SIGNATURE_PRIVATE_KEY` in the environment, then run:

```bash
npm install
npm run build
npm run dev
```

Open `http://localhost:5000`.

## Files

- `public/index.html` — minimalist minting page markup and styles.
- `src/app.js` — wallet, catalog, and mint transaction logic.
- `src/config.js` — collection configuration.
- `api/catalog.js` — live metadata and supply catalog endpoint.
- `api/sign-mint.js` — server-side mint authorization endpoint.
- `public/tonconnect-manifest.json` — TON Connect manifest.
- `vercel.json` — static output and serverless API configuration.

## Deploying as a Telegram Mini App

Deploy with Vercel, set `AUTHENTICATION_SIGNATURE_PRIVATE_KEY` in the deployment
environment, and register the deployed URL as a Web App with your Telegram bot
(via `@BotFather` → Bot Settings → Menu Button, or `web_app` buttons/inline
keyboards).