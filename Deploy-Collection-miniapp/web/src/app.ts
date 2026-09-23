// Client-side logic for the NFT collection deploy tool.
// Runs entirely in the browser: generates the Ed25519 auth key pair, computes the
// deterministic collection contract address, and drives the deploy transaction via
// TonConnect. Nothing here is sent to any backend.

import { Buffer } from "buffer";
import {
  Address,
  beginCell,
  storeStateInit,
  type Cell,
} from "@ton/core";
import { getSecureRandomBytes, keyPairFromSeed } from "@ton/crypto";
import { NftCollection } from "../../contracts/output/NftCollection_NftCollection";

declare global {
  interface Window {
    TON_CONNECT_UI: any;
  }
}

const DEPLOY_VALUE_NANOTON = 50_000_000n; // 0.05 TON, covers storage + gas

type NetworkId = "testnet" | "mainnet";

interface AppState {
  publicKeyHex: string | null;
  secretKeyHex: string | null;
  connectedAddress: string | null;
  network: NetworkId;
  prepared: {
    address: Address;
    code: Cell;
    data: Cell;
  } | null;
}

const state: AppState = {
  publicKeyHex: null,
  secretKeyHex: null,
  connectedAddress: null,
  network: "testnet",
  prepared: null,
};

function el<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing element #${id}`);
  return found as T;
}

function setText(id: string, text: string) {
  el(id).textContent = text;
}

function show(id: string) {
  el(id).classList.remove("hidden");
}

function hide(id: string) {
  el(id).classList.add("hidden");
}

function bytesToHex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("hex");
}

function hexToBigInt(hex: string): bigint {
  return BigInt("0x" + hex);
}

async function copy(text: string, feedbackId: string) {
  await navigator.clipboard.writeText(text);
  const node = el(feedbackId);
  node.textContent = "Copiato!";
  setTimeout(() => (node.textContent = ""), 1500);
}

// --- Step 1: key generation -------------------------------------------------

async function generateKeyPair() {
  const seed = await getSecureRandomBytes(32);
  const keyPair = keyPairFromSeed(seed);
  state.publicKeyHex = bytesToHex(keyPair.publicKey);
  state.secretKeyHex = bytesToHex(keyPair.secretKey);

  setText("public-key-value", state.publicKeyHex);
  setText("private-key-value", state.secretKeyHex);
  show("key-output");
  updateReadiness();
}

// --- Step 3: TonConnect wallet connection -----------------------------------

let tonConnectUI: any = null;

function initTonConnect() {
  const manifestUrl = new URL("/tonconnect-manifest.json", window.location.href).toString();
  tonConnectUI = new window.TON_CONNECT_UI.TonConnectUI({
    manifestUrl,
    buttonRootId: "ton-connect-button",
  });

  tonConnectUI.onStatusChange((wallet: any) => {
    if (wallet) {
      state.connectedAddress = wallet.account.address;
      state.network = wallet.account.chain === "-3" ? "testnet" : "mainnet";
      setText("connected-address-value", formatAddressPreview(wallet.account.address));
      el("network-select") && ((el("network-select") as HTMLSelectElement).value = state.network);
      show("wallet-connected");
    } else {
      state.connectedAddress = null;
      hide("wallet-connected");
    }
    updateReadiness();
  });
}

function formatAddressPreview(raw: string): string {
  try {
    return Address.parse(raw).toString({ testOnly: state.network === "testnet" });
  } catch {
    return raw;
  }
}

// --- Step 4: prepare deploy ---------------------------------------------------

function readNetwork(): NetworkId {
  return (el("network-select") as HTMLSelectElement).value as NetworkId;
}

function updateReadiness() {
  const ready = Boolean(state.publicKeyHex && state.connectedAddress);
  (el("prepare-button") as HTMLButtonElement).disabled = !ready;
}

async function prepareDeploy() {
  const collectionMetadataUrl = (el("collection-metadata-url") as HTMLInputElement).value.trim();
  const metadataIndexUrl = (el("metadata-index-url") as HTMLInputElement).value.trim();
  const royaltyInput = (el("royalty-address") as HTMLInputElement).value.trim();
  state.network = readNetwork();

  if (!state.publicKeyHex) {
    alert("Genera prima la coppia di chiavi Ed25519.");
    return;
  }
  if (!state.connectedAddress) {
    alert("Collega prima il tuo wallet TON.");
    return;
  }
  if (!collectionMetadataUrl || !metadataIndexUrl) {
    alert("Inserisci entrambi gli URL dei metadati.");
    return;
  }

  const owner = Address.parse(state.connectedAddress);
  const royaltyDestination = royaltyInput ? Address.parse(royaltyInput) : owner;
  const authPublicKey = hexToBigInt(state.publicKeyHex);

  const init = await NftCollection.fromInit(
    owner,
    royaltyDestination,
    authPublicKey,
    collectionMetadataUrl,
    metadataIndexUrl,
  );

  state.prepared = {
    address: init.address,
    code: init.init!.code,
    data: init.init!.data,
  };

  const friendlyAddress = init.address.toString({ testOnly: state.network === "testnet" });
  setText("preview-address", friendlyAddress);
  setText("preview-owner", owner.toString({ testOnly: state.network === "testnet" }));
  setText("preview-royalty", royaltyDestination.toString({ testOnly: state.network === "testnet" }) + " (20%, 200/1000)");
  setText("preview-collection-url", collectionMetadataUrl);
  setText("preview-index-url", metadataIndexUrl);
  setText("preview-pubkey", state.publicKeyHex);
  show("deploy-preview");
  (el("deploy-button") as HTMLButtonElement).disabled = false;
}

// --- Step 5: deploy -------------------------------------------------------

async function deploy() {
  if (!state.prepared || !tonConnectUI) return;

  const stateInitCell = beginCell()
    .store(storeStateInit({ code: state.prepared.code, data: state.prepared.data }))
    .endCell();
  const stateInitBase64 = stateInitCell.toBoc().toString("base64");
  const friendlyAddress = state.prepared.address.toString({
    testOnly: state.network === "testnet",
    bounceable: true,
  });

  setText("deploy-status", "In attesa della firma nel tuo wallet...");
  show("deploy-status-box");

  try {
    await tonConnectUI.sendTransaction({
      validUntil: Math.floor(Date.now() / 1000) + 300,
      messages: [
        {
          address: friendlyAddress,
          amount: DEPLOY_VALUE_NANOTON.toString(),
          stateInit: stateInitBase64,
        },
      ],
    });
  } catch (err: any) {
    setText("deploy-status", "Deploy annullato o non riuscito: " + (err?.message ?? String(err)));
    return;
  }

  setText("deploy-status", "Transazione inviata. In attesa della conferma on-chain...");
  await pollForActivation(friendlyAddress);
}

async function pollForActivation(friendlyAddress: string) {
  const base =
    state.network === "testnet"
      ? "https://testnet.toncenter.com"
      : "https://toncenter.com";
  const explorerBase =
    state.network === "testnet" ? "https://testnet.tonviewer.com" : "https://tonviewer.com";

  for (let attempt = 0; attempt < 30; attempt++) {
    await new Promise((r) => setTimeout(r, 3000));
    try {
      const res = await fetch(
        `${base}/api/v2/getAddressInformation?address=${encodeURIComponent(friendlyAddress)}`,
      );
      const json = await res.json();
      if (json?.result?.state === "active") {
        setText("deploy-status", "Collezione deployata con successo!");
        setText("final-address", friendlyAddress);
        (el("final-explorer-link") as HTMLAnchorElement).href = `${explorerBase}/${friendlyAddress}`;
        show("deploy-success");
        return;
      }
      setText(
        "deploy-status",
        `In attesa della conferma on-chain... (tentativo ${attempt + 1}/30)`,
      );
    } catch {
      // transient network error while polling; keep trying
    }
  }
  setText(
    "deploy-status",
    "Non è stato possibile confermare automaticamente il deploy. Verifica l'indirizzo sull'explorer.",
  );
  setText("final-address", friendlyAddress);
  (el("final-explorer-link") as HTMLAnchorElement).href = `${explorerBase}/${friendlyAddress}`;
  show("deploy-success");
}

// --- Wire up -----------------------------------------------------------------

window.addEventListener("DOMContentLoaded", () => {
  initTonConnect();

  el("generate-keys-button").addEventListener("click", () => {
    generateKeyPair().catch((err) => alert("Errore nella generazione delle chiavi: " + err.message));
  });
  el("copy-public-key").addEventListener("click", () => copy(state.publicKeyHex ?? "", "copy-public-feedback"));
  el("copy-private-key").addEventListener("click", () => copy(state.secretKeyHex ?? "", "copy-private-feedback"));
  el("prepare-button").addEventListener("click", () => {
    prepareDeploy().catch((err) => alert("Errore nella preparazione del deploy: " + err.message));
  });
  el("deploy-button").addEventListener("click", () => {
    deploy().catch((err) => alert("Errore durante il deploy: " + err.message));
  });
  el("copy-final-address").addEventListener("click", () =>
    copy(el("final-address").textContent ?? "", "copy-final-feedback"),
  );
});
