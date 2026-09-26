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
- un `README.txt` con un avviso sulla chiave privata contenuta nell'archivio.

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

## "My Collection" (immagini private/rivelate)

La pagina `/` → tab "My Collection" mostra il feed degli NFT posseduti dal
wallet collegato, ciascuno con la sua **immagine privata** (il campo
`privateImage` nel JSON dei metadata del suo `contentUrl`, invece del
campo pubblico `image` usato nel catalogo di mint).

Flusso:

1. Il frontend chiama `GET /api/my-collection?owner=<wallet>`.
2. Il server elenca gli item della collezione posseduti da quel wallet
   tramite l'indexer v3 di TON Center (`owner_address` + `collection_address`),
   poi per ciascun item legge **direttamente on-chain** (`get_nft_data()`
   sul contratto dell'item) l'owner effettivo, la collezione e il content
   URL, scartando qualsiasi item che non risulti davvero inizializzato,
   appartenente a questa collezione e posseduto da quel wallet in questo
   preciso momento. Nessun dato di questa fase è considerato "fidato" ai
   fini di sicurezza: serve solo a costruire la lista da mostrare.
3. Ogni voce della risposta contiene solo un link **proxy** —
   `/api/private-image?item=<indirizzo>&owner=<wallet>` — mai l'URL
   privato reale né tantomeno `NETLIFY_PRIVATE_SECRET`.
4. `GET /api/private-image` rifà la stessa verifica on-chain (in modo
   indipendente, ad ogni richiesta) prima di scaricare `privateImage` dal
   metadata host con l'header `Authorization: Bearer NETLIFY_PRIVATE_SECRET`
   e restituirne i byte al browser. Se la verifica fallisce risponde `403`.

Va configurata su Vercel la variabile d'ambiente **`NETLIFY_PRIVATE_SECRET`**
(il bearer token che il metadata host richiede per servire le immagini
private) — senza questa variabile `/api/private-image` risponde `500`.

**Limite di sicurezza noto:** l'indirizzo `owner` è quello riportato dal
wallet collegato via TonConnect, esattamente come già avviene altrove in
questa app (es. `newOwner` nel mint). Non c'è una sessione basata su firma
del wallet (`ton_proof`), quindi l'accesso è correttamente ristretto a chi
possiede realmente l'NFT on-chain in quel momento, ma non è legato
crittograficamente a una firma provata. Aggiungere il flusso `ton_proof` di
TonConnect chiuderebbe anche questo ultimo margine, se mai necessario.

**Pulsante "Sell":** mettere in vendita un NFT richiede deployare il
contratto di vendita del marketplace, che è un flusso proprietario di
Getgems (non esiste un'API pubblica per un miniapp di terze parti che lo
faccia senza replicarne esattamente la spec del contratto). Il pulsante
"Sell" apre quindi la pagina Getgems dell'item sul dominio corretto
(`getgems.io` su Mainnet, `testnet.getgems.io` su Testnet), dove Getgems
riconosce da sé il wallet collegato e mostra la propria azione "vendi".

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

## Accesso da Telegram (età + canale)

Solo quando la mint app è aperta come miniapp da un bot Telegram
(`Telegram.WebApp.initData` non vuoto) parte un controllo di accesso; da
browser normale l'app si apre direttamente.

1. Il frontend chiama `GET /api/channel-access` con `Authorization: tma <initData>`.
2. Il server valida la firma di `initData` con il token del bot e chiede a
   Telegram (`getChatMember`) se l'utente è iscritto al canale
   (`channelChatId` in `src/config.js`).
3. Iscritto → entra subito. Non iscritto → conferma maggiore età (ricordata
   in `localStorage`), poi bottone "REQUEST ACCESS TO CONTINUE" che apre
   `channelInviteLink`; dopo 2 secondi l'iscrizione viene ricontrollata.
   Se non ancora accettato: "Wait to be accepted and come back later."
4. Se dopo i 2 secondi l'utente risulta iscritto, il frontend chiama
   `POST /api/welcome-message`: il server (dopo aver riverificato firma e
   iscrizione) fa inviare al bot un messaggio in chat privata con il
   bottone "Open Miniapp" che apre `appUrl` (`src/config.js`). L'utente deve
   aver avviato il bot, cosa già vera se ha aperto la miniapp da lì.

Da configurare su Vercel: **`TELEGRAM_BOT_TOKEN`** (token del bot che lancia
la miniapp). Quel bot deve essere **amministratore del canale**, altrimenti
`getChatMember` non funziona e l'app resta bloccata con "Impossibile
verificare l'accesso".

Nota: il controllo è lato interfaccia; le API (catalogo, mint, immagini
private) restano raggiungibili anche senza passare dal gate.

## Notifica di mint su Telegram

Solo dentro Telegram (`initData` non vuoto): niente più debug report dopo il
mint, ma un popup "NFT minted successfully!" / "Error during minting,
please try again."; il bottone "authorized/unauthorized" in alto a destra è
nascosto.

Subito dopo l'invio della transazione di mint (non appena TonConnect
conferma l'invio, senza aspettare l'indexer), il frontend chiama
`POST /api/mint-notify` con `itemIndex` (l'indice restituito da
`/api/sign-mint`, cioè `nextItemIndex` al momento della firma) e
`ownerAddress` (più `Authorization: tma <initData>`). Il server risolve
`itemIndex` nell'indirizzo dell'item chiamando direttamente il getter
`get_nft_address_by_index` del contratto collection (istantaneo, nessun
indexer coinvolto), poi riverifica su chain che `ownerAddress` possieda
davvero quell'item in questa collezione (stesso controllo di
`private-image.js`). Se l'item non risulta ancora deployato/posseduto
(risposta `403 not_owner` — normale nei primi secondi dopo il mint), il
client riprova con backoff fino a un paio di minuti. Una volta confermato,
il server scarica l'immagine privata con `NETLIFY_PRIVATE_SECRET` e la
invia con `sendPhoto` in chat privata con l'utente, con didascalia "You've
got a new Spicy Pic added to your collection!" + nome dell'NFT, e il
bottone "Open Miniapp" (`appUrl`). Se l'NFT non ha un'immagine privata
configurata, invia solo il messaggio di testo. Fallisce in silenzio
(loggato, non mostrato all'utente): il mint è già andato a buon fine
comunque.

Nota: in precedenza questa chiamata partiva solo quando `refreshCollectionAfterMint`
rilevava la nuova copia tramite l'indexer v3 di TON Center (polling di
"My Collection", max ~90s) — quell'indexer può restare indietro molto più a
lungo del previsto (specie su Testnet), ed era la causa del mancato invio
della notifica. `refreshCollectionAfterMint` continua a girare com'era, ma
solo per aggiornare la UI di "My Collection" (immagine rivelata, bottone
"Sell"); non è più da cui dipende l'invio del messaggio Telegram.

## Rate limit di TON Center (429)

Tutte le chiamate a TON Center (`get_nft_data`, `getAddressInformation`,
l'indexer v3 usato da "My Collection") sono centralizzate in
`api/_catalog.js`, che le distanzia nel tempo (anche quando il chiamante ne
fa partire diverse in parallelo, es. `my-collection.js` per più NFT
posseduti) e riprova automaticamente sui `429`. Il tier anonimo di TON
Center ha un limite molto basso; se vedi ancora `429` nei log di Vercel,
imposta la variabile d'ambiente opzionale **`TONCENTER_API_KEY`** (gratuita,
vedi https://docs.toncenter.com) per alzare drasticamente il limite —
viene raccolta automaticamente e inviata come header `x-api-key`.

## Verifica automatica del codice sorgente (TON Sources Registry)

Dopo un **deploy riuscito della Collection** (`/deploycollection`) e dopo il
**mint del primo NFT** (item index `0`, e solo quello) della miniapp `/`,
l'app apre automaticamente un modal "Verify Collection" / "Verify NFT Item
Contract" che pubblica il codice sorgente nella TON Sources Registry
on-chain, così il contratto risulta verificato su **verifier.ton.org** e
visibile come tale su **tonviewer.com**.

Come funziona (reale, non simulato):

1. Il client (`shared/verifier-client.js`) calcola l'hash reale del code
   cell del contratto compilato e chiede a `@ton-community/contract-verifier-sdk`
   — la stessa libreria usata da verifier.ton.org — se quell'hash risulta
   **già** verificato nel registro. Questo stato viene sempre letto dal
   registro on-chain/IPFS, mai da un flag locale: per questo il modal della
   Collection, se ripubblichi lo stesso identico codice su un nuovo
   indirizzo, mostra subito "già verificato" invece di rifare tutto da capo.
2. Se non è ancora verificato, il client chiama `POST /api/verify-source`
   (`{ role: "collection" | "item" }`). Il server:
   - per `"collection"` usa l'indirizzo statico configurato in `src/config.js`;
   - per `"item"` risolve **da solo, on-chain**, l'indirizzo dell'item #0
     tramite il getter `get_nft_address_by_index(0)` della Collection — non
     si fida mai di un indirizzo passato dal client, così il flusso non è
     mai basato su un semplice contatore locale ma sullo stato reale della
     Collection;
   - invia al backend pubblico del verifier (`verifier-backend.ton.org` /
     `verifier-testnet.ton.org`) l'esatto file FunC generato da Tact e
     realmente deployato (`deploy-collection/contracts/output/*.fc`, con la
     versione del compilatore FunC che vi è stampata come `#pragma version`),
     chiedendogli di **ricompilarlo in autonomia** e confrontare l'hash
     risultante con quello del contratto deployato;
   - solo se la ricompilazione indipendente combacia, il backend restituisce
     un messaggio firmato dal verificatore, che il server rigira al client
     senza modificarlo (il server **non** possiede né genera mai la firma:
     quella resta sempre del verificatore).
3. Il client fa firmare quel messaggio al wallet TonConnect connesso
   (paga solo il gas) e lo invia on-chain.
4. Il client fa polling reale sul registro (di nuovo via
   `@ton-community/contract-verifier-sdk`) finché non vede l'hash comparire,
   poi mostra "✓ Source Code Verified" — mai prima che il registro lo
   confermi davvero.

**Nota per chi effettua il deploy**: la forma esatta della risposta JSON del
backend pubblico del verifier non è documentata in dettaglio da ton-community;
`api/verify-source.js` la implementa secondo il protocollo pubblico noto
(TEP-91 + `contract-verifier-backend`). Se il servizio dovesse rifiutare la
richiesta con un formato diverso da quello atteso, l'app mostra un errore
esplicito (mai un falso "Verified") e rimanda alla verifica manuale su
https://verifier.ton.org usando i file in `deploy-collection/contracts/`.
Le variabili d'ambiente opzionali `VERIFIER_BACKEND_URL_MAINNET` /
`VERIFIER_BACKEND_URL_TESTNET` / `VERIFIER_ID` permettono di puntare a un
altro endpoint senza toccare il codice.
