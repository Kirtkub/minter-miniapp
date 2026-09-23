# TON minting Mini App

## Run locally

```bash
npm install
npm run build
npm run dev
```

The Replit preview runs on port 5000 through the `Start application` workflow.

## Environment

The mint authorization endpoint requires `AUTHENTICATION_SIGNATURE_PRIVATE_KEY`.
It must contain the Ed25519 private key whose public key was stored in the deployed
collection contract. The value may be a PEM key, a 32-byte seed, or the 64-byte
seed-plus-public-key format produced by `@ton/crypto`. Never put it in source
control or expose it to the browser.

## Architecture

- `src/config.js` contains the collection address, off-chain metadata URLs, and
  `tonChain` (`Testnet` or `Mainnet`).
- `src/app.js` is bundled into `public/app.js` and preserves TON Connect wallet
  connection/session restoration while rendering the minting page.
- `api/catalog.js` fetches the configured metadata index and item JSON files,
  checks each mint window, and reads the on-chain minted count.
- `api/sign-mint.js` revalidates the item, max supply, and date window, reads the
  current collection item index, and signs the exact message expected by the
  collection contract. The browser then submits that message via TON Connect.
- `api/` is deployed as Vercel Node functions. `vercel.json` configures the static
  output and the API runtime.

The current collection contract enforces the Ed25519 authorization and binds each
signature to the next collection item index. The off-chain endpoint enforces the
metadata rules and max supply before signing.