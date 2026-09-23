# TON Wallet Mini App

A minimal Telegram Mini App with TON wallet connect/disconnect. The entire visible interface is a dark full-screen canvas with one small button in the top-right corner.

## What it does

- Renders an almost-black, full-viewport page with no other UI.
- Shows a compact "Connect Wallet" button when no TON wallet is connected.
- Opens the standard TON Connect wallet-selection flow on tap.
- Switches the button to "Disconnect Wallet" immediately after a successful connection.
- Disconnects and reverts the button to "Connect Wallet" on tap.
- Restores an existing TON Connect session automatically when the Mini App is reopened.
- Adapts to the Telegram Mini App viewport (safe-area aware, expands to full height, matches header/background color).

## Technology

- Plain static HTML/CSS/JS — no framework, no build step.
- [TON Connect UI SDK](https://github.com/ton-connect/sdk) (`@tonconnect/ui`, loaded via CDN) for wallet connection.
- [Telegram Web App SDK](https://core.telegram.org/bots/webapps) (`telegram-web-app.js`) for Mini App integration.

## Running locally

No build step is required. Serve the `public/` directory with any static file server, e.g.:

```bash
npx serve public
```

Or with the Netlify CLI:

```bash
netlify dev
```

## Files

- `public/index.html` — the entire app (markup, styles, and wallet logic).
- `public/tonconnect-manifest.json` — the TON Connect manifest describing this app to wallets.
- `public/icon.svg` — the icon referenced by the TON Connect manifest (shown inside wallet apps during connection, not in the app itself).
- `netlify.toml` — publishes the `public/` directory as-is, no build command needed.

## Deploying as a Telegram Mini App

Register the deployed URL as a Web App with your Telegram bot (via `@BotFather` → Bot Settings → Menu Button, or `web_app` buttons/inline keyboards) so Telegram opens it inside its in-app browser.
