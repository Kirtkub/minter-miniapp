# AGENTS.md

## What this project is

A deliberately minimal Telegram Mini App. The only requirement is a dark full-viewport page with a single wallet connect/disconnect button, using TON Connect. There is no other UI, no routing, no backend, and no persistence beyond what TON Connect itself stores in the browser.

## Architecture

Everything lives in `public/`, served as a static site (see `netlify.toml`, `publish = "public"`):

- `public/index.html` — the whole app: markup, inline `<style>`, inline `<script>`. Loads two external SDKs via CDN `<script>` tags (no bundler, no npm dependencies):
  - `telegram-web-app.js` for Telegram Mini App integration (`Telegram.WebApp.ready()`, `expand()`, header/background color).
  - `@tonconnect/ui` (global `TON_CONNECT_UI`) for the TON wallet connection flow (`TonConnectUI` instance, `openModal()`, `disconnect()`, `onStatusChange()`, `connectionRestored`).
- `public/tonconnect-manifest.json` — required by the TON Connect protocol; wallets fetch this to show the app name/icon during connection. `url`/`iconUrl` are hardcoded to the current Netlify domain — update them if the site moves to a custom domain.
- `public/icon.svg` — icon referenced by the manifest above. It's shown inside wallet apps, not in this app's own UI, so it doesn't need to match the app's minimalism.

## Conventions

- No framework, no build step, no `package.json`. Keep it that way unless the app's scope grows — the whole point of this project is staying small.
- The button is styled by hand (flat colors, no shadows/gradients/animations) rather than using TON Connect's default UI button widget, to match the "empty dark canvas" design requirement.
- Connection state is not tracked in application code beyond reading `tonConnectUI.connected` — TON Connect's SDK owns persistence and session restoration.

## Non-obvious decisions

- `@tonconnect/ui` is pinned to major version `2` via the unpkg CDN URL (not `@latest`) to avoid unannounced breaking changes affecting a page with no build/test step to catch them.
- The manifest's `url`/`iconUrl` must be absolute and are baked into a static JSON file, so they can't be derived from `window.location` the way the manifest *fetch URL* in `index.html` is.

There is no PLAN.md — this project is complete as scoped; there are no deferred milestones.
