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

## Badge di autorizzazione nella pagina principale

Al caricamento di `/`, la mint app chiama `GET /api/auth-status`, che
lato server:

1. controlla che il contratto della collezione (`collectionAddress`, sulla
   rete `tonChain` definiti in `src/config.js`) risulti **deployato e
   attivo** sulla blockchain TON (tramite TON Center);
2. legge la variabile d'ambiente **`AUTHENTICATION_SIGNATURE_PRIVATE_KEY`**
   configurata su Vercel, ne deriva la chiave pubblica Ed25519 e la
   confronta con `AUTHENTICATION_SIGNATURE_PUBLIC_KEY` salvata on-chain nel
   contratto (getter `get_auth_public_key`).

Il risultato viene mostrato con un bottoncino in alto a sinistra:

- **grigio ("Verifica...")** mentre il controllo è in corso;
- **verde ("Autorizzato")** se il contratto è deployato e la chiave privata
  configurata corrisponde a quella pubblica nel contratto — la mint app può
  quindi firmare correttamente le richieste di minting;
- **rosso ("Non autorizzato")** altrimenti, con un tooltip (`title`) che
  spiega il motivo: contratto non deployato, variabile d'ambiente mancante,
  chiave non corrispondente, o blockchain non raggiungibile.

Cliccando sul bottoncino il controllo viene ripetuto. L'endpoint non espone
mai la chiave privata né quella pubblica: restituisce solo booleani
(`deployed`, `keyConfigured`, `keyMatches`, `authorized`) e un codice di
errore generico.

La logica di derivazione della chiave (già usata da `api/sign-mint.js` per
firmare i mint) è condivisa tramite `api/_auth.js`.

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
