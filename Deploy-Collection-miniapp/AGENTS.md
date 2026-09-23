# AGENTS.md

## What this project is

A TON smart contract (NFT collection, TEP-62 + TEP-66) plus a static webapp that
deploys it. Minting UI is explicitly out of scope by request — only the contract
and the deploy tool exist here.

## Architecture

- `contracts/messages.tact` — shared message/struct definitions (Mint, Initialize,
  standard TEP-62 Transfer/GetStaticData/royalty messages).
- `contracts/nft_collection.tact` — the collection contract. Stores owner,
  `collectionContentUrl`, `metadataIndexUrl`, royalty destination, and
  `authPublicKey` (the Ed25519 public key used to gate minting). Royalty is a
  fixed constant (200/1000), not configurable at deploy time, per the request.
- `contracts/nft_item.tact` — a standard TEP-62 NFT item. Its address depends
  only on `(index, collectionAddress)`; owner/content are set by a follow-up
  `Initialize` message from the collection, since Tact's `initOf` state-init
  can't itself carry the final owner/content data.
- `contracts/output/` — compiled by `npm run compile` (Tact -> FunC -> BoC),
  committed so the webapp can compute deploy data without running the Tact
  compiler at runtime. `NftCollection_NftCollection.ts` is the piece the webapp
  actually imports (`NftCollection.fromInit(...)` builds the code+data cells and
  the deterministic address entirely in JS, no compiler needed).
- `web/src/app.ts` — browser logic: Ed25519 key generation (`@ton/crypto`),
  address computation (`@ton/core` + the generated wrapper above), and the
  TonConnect deploy flow. Bundled by `scripts/build-web.mjs` (esbuild) into
  `public/app.js`, which is what actually ships.
- `public/` — the whole deployed site. Plain static files, no framework, no
  Netlify Functions, no database — this tool has no server-side state to
  persist.

## Non-obvious decisions

- **Minting authorization is off-chain-aware but on-chain-enforced.** The
  contract doesn't and can't fetch `metadataIndex.json`. Enforcing "max copies
  per NFT design" is the job of whatever off-chain service holds
  `AUTHENTICATION_SIGNATURE_PRIVATE_KEY` — it reads `metadataIndex.json`,
  decides a mint request is allowed, and signs it. The contract only verifies
  the Ed25519 signature against the stored public key and an expiry
  (`validUntil`); it does not know or care what "collection rules" a valid
  signature represents. Building that off-chain signer + a minting UI is future
  work, not part of this deploy tool.
- **`receive() {}` empty handler on the collection contract** exists specifically
  so a bare deploy transaction (no message body) succeeds. Without it, the
  first message after deploy — which triggers Tact's lazy `init()` — would hit
  no matching receiver and the deploy would revert. Do not remove it.
- **The webapp has no backend.** `NftCollection.fromInit(...)` (Tact-generated)
  only does local cell/BOC math — no FunC compiler, no emulator — so it runs
  fine in a browser bundle. That's why there's no Netlify Function here: adding
  one would just be a network hop for a computation that's already free
  client-side.
- **Buffer polyfill.** `@ton/core` / `@ton/crypto` assume Node's global
  `Buffer`. `scripts/build-web.mjs` injects `web/src/shims/buffer-shim.js` via
  esbuild's `inject` option so the bundle works in a plain browser with no
  other polyfills.
- **TonConnect loaded via CDN `<script>`, not bundled.** `@tonconnect/ui` ships
  its own UI/CSS injection; bundling it with esbuild would need extra plugin
  work for no real benefit, and the CDN `<script>` approach is the officially
  documented no-bundler integration path.

## Regenerating build artifacts

`contracts/output/*` and `public/app.js` are committed outputs, not sources.
After editing a `.tact` file or `web/src/app.ts`, run `npm run compile` and/or
`npm run build:web` and commit the results.
