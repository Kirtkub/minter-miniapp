# NFT Miniapp (progetto unico)

Un solo progetto Vercel che contiene due miniapp TON separate:

- **`/`** — miniapp di **minting**: mostra il catalogo NFT e permette di
  mintare collegando un wallet TON (`src/app.js` → build in `public/app.js`).
- **`/deploycollection`** — miniapp per **deployare** lo smart contract
  della collezione NFT (Tact) su TON
  (`deploy-collection/web/src/app.ts` → build in
  `public/deploycollection/app.js`).

## Struttura

```
api/                        Serverless functions Vercel (catalogo + firma mint)
src/                        Sorgente della miniapp di minting ("/")
deploy-collection/
  contracts/                 Sorgente Tact (nft_collection, nft_item, messages)
  contracts/output/          Contratto già compilato (.abi, .code.boc, .ts, ...)
  web/src/app.ts             Sorgente della miniapp di deploy ("/deploycollection")
public/                      Output statico servito da Vercel (outputDirectory)
  index.html, icon.svg, ...  Shell della miniapp di minting
  app.js                     GENERATO dalla build (non modificare a mano)
  deploycollection/
    index.html, styles.css   Shell della miniapp di deploy
    app.js                   GENERATO dalla build (non modificare a mano)
scripts/build-web.mjs        Compila ENTRAMBI i bundle con esbuild
scripts/dev-server.mjs       Server locale che serve entrambe le miniapp + api
vercel.json                  buildCommand + rewrite per /deploycollection
```

## Build & deploy

Vercel esegue `npm run build` (definito in `vercel.json`) che compila
entrambi i bundle in `public/`. `outputDirectory` è `public`; le funzioni in
`api/` vengono rilevate automaticamente da Vercel indipendentemente
dall'outputDirectory.

Il rewrite in `vercel.json` fa sì che l'URL `/deploycollection` (senza
slash finale) serva `public/deploycollection/index.html`; tutti gli asset
(`/deploycollection/app.js`, `/deploycollection/styles.css`, ecc.) sono
file statici reali e vengono serviti direttamente.

In locale:

```bash
npm install
npm run build   # genera public/app.js e public/deploycollection/app.js
npm run dev      # http://localhost:5000/  e  http://localhost:5000/deploycollection
```

## Download del codice deployato

Nella miniapp `/deploycollection`, non appena il deploy della collezione
viene confermato on-chain (o, in caso di timeout della conferma automatica,
subito dopo l'invio della transazione), parte automaticamente il download
di un file `.zip` che contiene:

- il codice sorgente Tact (`nft_collection.tact`, `nft_item.tact`,
  `messages.tact`);
- gli artefatti compilati (`.abi`, `.code.boc`) del collection e dell'item
  contract;
- `deployment-info.json` con indirizzo del contratto, owner, chiave
  pubblica/privata Ed25519 usata per autorizzare il minting e gli URL dei
  metadati usati per il deploy;
- un `LEGGIMI.txt` con un avviso sulla chiave privata contenuta nell'archivio.

È disponibile anche un pulsante "Scarica il codice deployato (.zip)" per
riscaricare l'archivio in qualsiasi momento dopo il deploy, senza dover
rifare il deploy.

Tutto l'archivio viene generato lato client con JSZip: il codice sorgente e
i file compilati sono già inclusi nel bundle a tempo di build (tramite i
loader `text`/`binary` di esbuild), quindi non serve alcuna richiesta di
rete per costruirlo.

## Dominio configurato

I manifest TonConnect sono già impostati sul dominio di produzione
`https://minter-miniapp.vercel.app`:

- `public/tonconnect-manifest.json` → `url`/`iconUrl` sul dominio root.
- `public/deploycollection/tonconnect-manifest.json` → `url`/`iconUrl` su
  `https://minter-miniapp.vercel.app/deploycollection`.

Se in futuro cambi dominio Vercel, aggiorna questi due file di conseguenza.

## Da aggiornare dopo il deploy della collezione

`src/config.js` (usato dalla miniapp di minting in `/`) punta ancora a un
sito Netlify di test per l'indirizzo della collezione e i metadati:

```js
export const collectionAddress = "kQB2njpo7QGmTd0RmjeAwtRsKgjARp7XYeagI2MXfjVwdty9";
export const collectionMetadata = "https://astounding-flan-ffc457.netlify.app/collectionMetadata.json";
export const nftsMetadataIndex = "https://astounding-flan-ffc457.netlify.app/metadataIndex.json";
export const tonChain = "Testnet";
```

Dopo aver deployato la collezione reale da `/deploycollection` (i valori
`collectionAddress`, `collectionMetadata` e `nftsMetadataIndex` sono
disponibili nel riepilogo a schermo e nello `.zip` scaricato), aggiorna
questi tre valori con quelli della tua collezione effettiva e imposta
`tonChain` su `"Mainnet"` quando passi in produzione.
