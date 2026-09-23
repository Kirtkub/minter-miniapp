# AGENTS.md

## What this project is

A minimalist Telegram Mini App with TON Connect wallet sessions and a minting
page backed by the deployed NFT collection contract in `Deploy-Collection-Miniapp`.

## Architecture

The static page is served from `public/`, while `src/` contains browser source
and `api/` contains Vercel-compatible server functions:

- `public/index.html` — minimalist page markup and styles. Loads Telegram Web App
  and TON Connect UI from CDN scripts.
- `src/app.js` — browser wallet/catalog/mint logic, bundled into `public/app.js`.
- `src/config.js` — collection address, metadata URLs, and Testnet/Mainnet choice.
- `api/catalog.js` — fetches and filters off-chain metadata and on-chain supply.
- `api/sign-mint.js` — validates and signs the deployed contract's `Mint` payload.
- `public/tonconnect-manifest.json` — required by TON Connect; update its absolute
  URL if the site moves to a custom domain.

## Conventions

- Keep the app small: plain HTML/CSS/JS plus esbuild, no framework.
- Use hand-styled flat controls rather than TON Connect's default UI button widget.
- Never expose `AUTHENTICATION_SIGNATURE_PRIVATE_KEY` to browser code.
- Rebuild `public/app.js` with `npm run build:web` after changing `src/app.js`.

## Non-obvious decisions

- `@tonconnect/ui` is pinned to major version `2` via the unpkg CDN URL.
- The metadata host does not provide browser CORS headers, so the API fetches
  and validates the metadata index.
- Minting rules are checked off-chain before signing. The deployed collection
  contract stores the signer public key and minted count but cannot fetch metadata.
  The API checks dates and max supply and binds each signature to the next item index.

See `replit.md` for local run and deployment instructions.