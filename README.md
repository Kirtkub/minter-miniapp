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

## Da aggiornare prima del deploy in produzione

- `public/tonconnect-manifest.json` e
  `public/deploycollection/tonconnect-manifest.json`: il campo `url` /
  `iconUrl` deve puntare al dominio Vercel reale del progetto (es.
  `https://<il-tuo-progetto>.vercel.app` e
  `https://<il-tuo-progetto>.vercel.app/deploycollection`).
- `src/config.js`: indirizzo della collezione e URL dei metadati usati
  dalla miniapp di minting, da aggiornare con quelli della collezione
  effettivamente deployata tramite `/deploycollection`.
