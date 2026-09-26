import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";

// Everything below is read once, at cold start, straight from the same
// contracts/ tree that deploy-collection/web/src/app.ts embeds into its own
// browser bundle (see the esbuild "text"/"binary" loaders in
// scripts/build-web.mjs) — so the zip sent to the admin always matches
// exactly what was compiled and deployed, with zero extra network requests.
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, "..");
const CONTRACTS_DIR = join(ROOT_DIR, "deploy-collection", "contracts");
const OUTPUT_DIR = join(CONTRACTS_DIR, "output");

const nftCollectionTact = readFileSync(join(CONTRACTS_DIR, "nft_collection.tact"), "utf8");
const nftItemTact = readFileSync(join(CONTRACTS_DIR, "nft_item.tact"), "utf8");
const messagesTact = readFileSync(join(CONTRACTS_DIR, "messages.tact"), "utf8");
const collectionAbi = readFileSync(join(OUTPUT_DIR, "NftCollection_NftCollection.abi"), "utf8");
const itemAbi = readFileSync(join(OUTPUT_DIR, "NftCollection_NftItem.abi"), "utf8");
const collectionBoc = readFileSync(join(OUTPUT_DIR, "NftCollection_NftCollection.code.boc"));
const itemBoc = readFileSync(join(OUTPUT_DIR, "NftCollection_NftItem.code.boc"));
const collectionWrapperTs = readFileSync(join(OUTPUT_DIR, "NftCollection_NftCollection.ts"), "utf8");
const itemWrapperTs = readFileSync(join(OUTPUT_DIR, "NftCollection_NftItem.ts"), "utf8");
const tactConfigRaw = readFileSync(join(ROOT_DIR, "deploy-collection", "tact.config.json"), "utf8");
const rootPackageJson = JSON.parse(readFileSync(join(ROOT_DIR, "package.json"), "utf8"));

const tactConfig = JSON.parse(tactConfigRaw);
const tactProjectName = tactConfig?.projects?.[0]?.name || "NftCollection";
const tactCompilerVersion = rootPackageJson?.devDependencies?.["@tact-lang/compiler"] || null;

// A trimmed package.json with just what's needed to reproduce this specific
// build (the pinned Tact compiler version), instead of handing the admin the
// whole monorepo's package.json (unrelated deps like esbuild/jszip/@ton/*
// would only be noise on verifier.ton.org).
function contractsPackageJson() {
  return JSON.stringify(
    {
      name: "nft-collection-contracts",
      private: true,
      type: "module",
      scripts: {
        "compile:contracts": "tact --config tact.config.json",
      },
      devDependencies: tactCompilerVersion ? { "@tact-lang/compiler": tactCompilerVersion } : {},
    },
    null,
    2,
  );
}

function readmeText({ kind, network, collectionAddress, itemAddress }) {
  const compilerLine = tactCompilerVersion
    ? `@tact-lang/compiler ${tactCompilerVersion}`
    : "la versione indicata in package.json";

  const targetLines =
    kind === "mint"
      ? [
          `- Indirizzo dell'NFT item appena mintato: ${itemAddress}`,
          `- Indirizzo della collection (stesso progetto Tact, stesso codice): ${collectionAddress}`,
        ]
      : [`- Indirizzo del contratto della collection appena deployato: ${collectionAddress}`];

  return `Verifica del sorgente su verifier.ton.org
============================================

Rete: ${network}
${targetLines.join("\n")}

Questo archivio è stato generato automaticamente dal backend della miniapp
subito dopo ${kind === "mint" ? "un mint andato a buon fine" : "il deploy della collezione"},
usando esattamente i file sorgente/compilati attualmente in produzione.
Contiene tutto il necessario per sottomettere e verificare il sorgente su
https://verifier.ton.org/:

- contracts/nft_collection.tact, nft_item.tact, messages.tact
    Sorgente Tact completo del progetto (collection + item + messaggi).
- contracts/output/NftCollection_NftCollection.abi / .code.boc
    ABI e bytecode compilato del contratto collection.
- contracts/output/NftCollection_NftItem.abi / .code.boc
    ABI e bytecode compilato del contratto item (lo stesso codice viene
    deployato dalla collection per ogni singolo NFT mintato).
- contracts/output/NftCollection_NftCollection.ts / NftCollection_NftItem.ts
    Wrapper TypeScript generati automaticamente dal compilatore Tact.
- tact.config.json
    Configurazione del progetto Tact: nome progetto "${tactProjectName}",
    entrypoint contracts/nft_collection.tact.
- package.json
    Contiene la versione ESATTA del compilatore Tact usata per generare
    questo bytecode: ${compilerLine}. Deve combaciare esattamente con la
    versione scelta su verifier.ton.org, altrimenti l'hash ricompilato non
    corrisponderà a quello on-chain e la verifica fallirà.

Come sottomettere la verifica
------------------------------
1. Vai su https://verifier.ton.org/ e incolla l'indirizzo del contratto da
   verificare (vedi sopra — di solito conviene partire dalla collection).
2. Scegli "Tact" come linguaggio del sorgente.
3. Seleziona ${compilerLine} come versione del compilatore.
4. Carica i tre file .tact dentro contracts/ (nft_collection.tact,
   nft_item.tact, messages.tact), mantenendo la stessa struttura di cartelle.
5. Indica nft_collection.tact come file "root"/entrypoint e, se richiesto,
   il nome progetto "${tactProjectName}" (preso da tact.config.json).
6. Il backend di verifier.ton.org ricompila il sorgente e confronta l'hash
   ottenuto con il code_hash on-chain. Se combaciano, ti chiederà di
   collegare il wallet owner del contratto e firmare una piccola transazione
   di prova (pochi centesimi di TON) verso il verifier registry, per
   pubblicarla on-chain.
7. Dopo la conferma può volerci qualche minuto (a volte anche ore) prima
   che tonviewer/tonscan mostrino "Verified" invece di "Unverified" — ogni
   explorer ha una cache propria.

Nota: la collection e l'item vengono compilati insieme, nello stesso
progetto Tact ("${tactProjectName}"): sottomettendo questi stessi file una
sola volta, il verifier riconosce sia il code hash della collection sia
quello di ogni item della collezione (tutti condividono lo stesso codice
item).
${
  kind === "collection_deploy"
    ? `
⚠️ deployment-info.json in questo archivio contiene authPrivateKeyHex: è la
chiave privata Ed25519 usata dal backend per autorizzare il minting. Non è
necessaria per la verifica del sorgente — tienila al sicuro e non
condividerla con nessuno al di fuori di chi gestisce il backend.
`
    : ""
}`;
}

// Builds the .zip sent to the admin. `kind` is "collection_deploy" (right
// after a collection deploy, from api/deploy-notify.js) or "mint" (right
// after a verified successful mint, from api/mint-notify.js).
export async function buildVerificationZip({
  kind,
  network,
  collectionAddress,
  itemAddress = null,
  ownerAddress = null,
  authPublicKeyHex = null,
  authPrivateKeyHex = null,
  collectionMetadataUrl = null,
  metadataIndexUrl = null,
  itemIndex = null,
  itemName = null,
  timestamp = new Date().toISOString(),
}) {
  const zip = new JSZip();

  const contracts = zip.folder("contracts");
  contracts.file("nft_collection.tact", nftCollectionTact);
  contracts.file("nft_item.tact", nftItemTact);
  contracts.file("messages.tact", messagesTact);

  const output = contracts.folder("output");
  output.file("NftCollection_NftCollection.abi", collectionAbi);
  output.file("NftCollection_NftItem.abi", itemAbi);
  output.file("NftCollection_NftCollection.code.boc", collectionBoc);
  output.file("NftCollection_NftItem.code.boc", itemBoc);
  output.file("NftCollection_NftCollection.ts", collectionWrapperTs);
  output.file("NftCollection_NftItem.ts", itemWrapperTs);

  zip.file("tact.config.json", tactConfigRaw);
  zip.file("package.json", contractsPackageJson());

  if (kind === "mint") {
    zip.file(
      "mint-info.json",
      JSON.stringify(
        { mintedAt: timestamp, network, collectionAddress, itemAddress, itemIndex, itemName, owner: ownerAddress },
        null,
        2,
      ),
    );
  } else {
    zip.file(
      "deployment-info.json",
      JSON.stringify(
        {
          deployedAt: timestamp,
          network,
          collectionAddress,
          owner: ownerAddress,
          authPublicKeyHex,
          authPrivateKeyHex,
          collectionMetadataUrl,
          metadataIndexUrl,
        },
        null,
        2,
      ),
    );
  }

  zip.file("README.txt", readmeText({ kind, network, collectionAddress, itemAddress }));

  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  const label = (kind === "mint" ? itemAddress : collectionAddress) || "contract";
  const prefix = kind === "mint" ? "nft-item" : "nft-collection";
  const filename = `${prefix}-${String(label).slice(0, 10)}-verify.zip`;
  return { buffer, filename };
}

export const verificationBundleInfo = { tactProjectName, tactCompilerVersion };
