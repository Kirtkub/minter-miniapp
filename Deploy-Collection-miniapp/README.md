# TON NFT Collection Deployer

A ready-to-deploy TON smart contract for an NFT collection, paired with a small
browser-only webapp to deploy it.

## What this is

- **Smart contract** (`contracts/*.tact`, written in [Tact](https://tact-lang.org)): a
  TEP-62 NFT collection contract with TEP-66 royalties (20%, 200/1000) and
  Ed25519-signature-gated minting. Collection metadata and the per-item metadata
  index live off-chain (on Netlify) and can be edited after deploy without
  touching the contract; the contract itself never fetches them.
- **Deploy webapp** (`public/`): a static page that generates the Ed25519 key
  pair used to authorize minting, computes the collection's deterministic
  address, and deploys it via [TonConnect](https://docs.ton.org/develop/dapps/ton-connect/overview)
  — scan a QR with any TON wallet to connect, then approve the deploy
  transaction. Everything runs client-side; nothing is sent to a backend.

Minting itself (turning a signed request into an actual NFT) is intentionally
out of scope here — this project only covers the contract and its deploy tool.

## Key technologies

- [Tact](https://tact-lang.org) — compiles to the FunC/TVM bytecode in `contracts/output/`
- [@ton/core](https://github.com/ton-org/ton) / [@ton/crypto](https://github.com/ton-org/ton) — address, cell and Ed25519 key handling
- [@tonconnect/ui](https://github.com/ton-connect/sdk) (loaded from a CDN `<script>` tag) — wallet connection, QR code, transaction signing
- [esbuild](https://esbuild.github.io) — bundles `web/src/app.ts` into the static `public/app.js` shipped to the browser

## Running locally

```bash
npm install
netlify dev --port 8889
```

Open `http://localhost:8889`. Everything (key generation, address computation,
wallet connection, deploy) works from a plain static server — no functions, no
database.

## Changing the contract or the webapp logic

The compiled artifacts in `contracts/output/` and `public/app.js` are committed
build outputs, not sources — regenerate them after editing `contracts/*.tact`
or `web/src/app.ts`:

```bash
npm run compile    # contracts/*.tact -> contracts/output/*
npm run build:web  # web/src/app.ts -> public/app.js
```

## Project layout

```
contracts/            Tact source for the collection + item contracts
contracts/output/      Compiled bytecode + generated TypeScript wrapper (committed)
web/src/app.ts          Browser app logic (key gen, address calc, TonConnect deploy)
public/                 Static site actually deployed (index.html, app.js, manifest, icon)
scripts/build-web.mjs   esbuild bundling script
```

See `AGENTS.md` for architecture notes and design decisions.
