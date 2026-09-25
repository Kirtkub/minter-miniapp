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
import JSZip from "jszip";

// Raw source/build artifacts of the deployed contract, embedded into the
// bundle at build time (see esbuild "loader" config in scripts/build-web.mjs)
// so the "download deployed code" feature works with zero extra network
// requests and always matches exactly what was compiled into this build.
import nftCollectionTactSource from "../../contracts/nft_collection.tact";
import nftItemTactSource from "../../contracts/nft_item.tact";
import messagesTactSource from "../../contracts/messages.tact";
import collectionAbiJson from "../../contracts/output/NftCollection_NftCollection.abi";
import itemAbiJson from "../../contracts/output/NftCollection_NftItem.abi";
import collectionCodeBoc from "../../contracts/output/NftCollection_NftCollection.code.boc";
import itemCodeBoc from "../../contracts/output/NftCollection_NftItem.code.boc";

declare global {
  interface Window {
    TON_CONNECT_UI: any;
  }
}

const DEPLOY_VALUE_NANOTON = 50_000_000n; // 0.05 TON, covers storage + gas

// Must match the "@tact-lang/compiler" devDependency in package.json: the
// verifier backend recompiles the source and compares the resulting code
// hash, so a mismatched compiler version makes verification fail even
// though the source is otherwise identical.
const TACT_COMPILER_VERSION = "1.6.13";
// Name of wrappers/NftCollection.compile.ts, i.e. the <CONTRACT> argument
// "npx blueprint verify" expects.
const BLUEPRINT_CONTRACT_NAME = "NftCollection";
// Name of wrappers/NftItem.compile.ts. Every NFT minted from this collection
// shares this same compiled code, so this only needs to be verified once,
// against the address of any single minted item.
const BLUEPRINT_ITEM_CONTRACT_NAME = "NftItem";

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
  node.textContent = "Copied!";
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
  const manifestUrl = new URL("/deploycollection/tonconnect-manifest.json", window.location.href).toString();
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
    alert("Generate the Ed25519 key pair first.");
    return;
  }
  if (!state.connectedAddress) {
    alert("Connect your TON wallet first.");
    return;
  }
  if (!collectionMetadataUrl || !metadataIndexUrl) {
    alert("Enter both metadata URLs.");
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

  setText("deploy-status", "Waiting for the signature in your wallet...");
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
    setText("deploy-status", "Deploy cancelled or failed: " + (err?.message ?? String(err)));
    return;
  }

  setText("deploy-status", "Transaction sent. Waiting for on-chain confirmation...");
  await pollForActivation(friendlyAddress);
}

// --- Step 5: verify & publish the source code ------------------------------
// Verification is not a plain fetch() from the browser: verifier.ton.org
// recompiles the source and then requires an on-chain transaction (signed
// by a wallet) to publish the proof to the TON Sources Registry. That part
// runs through the Blueprint CLI (see wrappers/NftCollection.compile.ts),
// so here we just prepare the exact command to run, pre-filled with the
// network this collection was deployed to.
function showVerifyCommand() {
  const command = `npx blueprint verify ${BLUEPRINT_CONTRACT_NAME} --network ${state.network} --compiler-version ${TACT_COMPILER_VERSION}`;
  setText("verify-command-value", command);
  const itemCommand = `npx blueprint verify ${BLUEPRINT_ITEM_CONTRACT_NAME} --network ${state.network} --compiler-version ${TACT_COMPILER_VERSION}`;
  setText("verify-item-command-value", itemCommand);
  show("verify-section");
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
        setText("deploy-status", "Collection deployed successfully!");
        setText("final-address", friendlyAddress);
        (el("final-explorer-link") as HTMLAnchorElement).href = `${explorerBase}/${friendlyAddress}`;
        show("deploy-success");
        showVerifyCommand();
        downloadDeployedCode().catch((err) => console.error("code_download_failed", err));
        return;
      }
      setText(
        "deploy-status",
        `Waiting for on-chain confirmation... (attempt ${attempt + 1}/30)`,
      );
    } catch {
      // transient network error while polling; keep trying
    }
  }
  setText(
    "deploy-status",
    "Could not automatically confirm the deploy. Check the address on the explorer.",
  );
  setText("final-address", friendlyAddress);
  (el("final-explorer-link") as HTMLAnchorElement).href = `${explorerBase}/${friendlyAddress}`;
  show("deploy-success");
  showVerifyCommand();
  downloadDeployedCode().catch((err) => console.error("code_download_failed", err));
}

// --- Step 6: download the deployed code -------------------------------------
// Bundles the Tact source, the compiled contract output and the exact
// deploy parameters into a single .zip and triggers a browser download.
// Everything needed is already embedded in this bundle at build time, so no
// network request is made and the archive always matches what was deployed.

async function downloadDeployedCode() {
  if (!state.prepared) return;

  const friendlyAddress = state.prepared.address.toString({ testOnly: state.network === "testnet" });
  const zip = new JSZip();

  const contracts = zip.folder("contracts")!;
  contracts.file("nft_collection.tact", nftCollectionTactSource as string);
  contracts.file("nft_item.tact", nftItemTactSource as string);
  contracts.file("messages.tact", messagesTactSource as string);

  const output = contracts.folder("output")!;
  output.file("NftCollection_NftCollection.abi", collectionAbiJson as string);
  output.file("NftCollection_NftItem.abi", itemAbiJson as string);
  output.file("NftCollection_NftCollection.code.boc", collectionCodeBoc as Uint8Array);
  output.file("NftCollection_NftItem.code.boc", itemCodeBoc as Uint8Array);

  const verifyCommand = `npx blueprint verify ${BLUEPRINT_CONTRACT_NAME} --network ${state.network} --compiler-version ${TACT_COMPILER_VERSION}`;
  const verifyItemCommand = `npx blueprint verify ${BLUEPRINT_ITEM_CONTRACT_NAME} --network ${state.network} --compiler-version ${TACT_COMPILER_VERSION}`;
  const deploymentInfo = {
    deployedAt: new Date().toISOString(),
    network: state.network,
    collectionAddress: friendlyAddress,
    owner: state.connectedAddress ? formatAddressPreview(state.connectedAddress) : null,
    authPublicKeyHex: state.publicKeyHex,
    authPrivateKeyHex: state.secretKeyHex,
    collectionMetadataUrl: el<HTMLInputElement>("collection-metadata-url").value.trim(),
    metadataIndexUrl: el<HTMLInputElement>("metadata-index-url").value.trim(),
    verifyCollectionCommand: verifyCommand,
    verifyItemCommand,
  };
  zip.file("deployment-info.json", JSON.stringify(deploymentInfo, null, 2));
  zip.file(
    "README.txt",
    "This archive contains the Tact source code and the compiled packages\n" +
      "of the NFT collection smart contract you just deployed on TON, along\n" +
      "with the parameters used for the deploy (deployment-info.json).\n\n" +
      "WARNING: deployment-info.json also contains the Ed25519 private key\n" +
      "(authPrivateKeyHex) used by the backend to authorize minting.\n" +
      "Keep it somewhere safe and never share it with anyone.\n\n" +
      "VERIFYING THE SOURCE ON verifier.ton.org\n" +
      "-----------------------------------------\n" +
      "The collection and every minted NFT are two DIFFERENT contracts with\n" +
      "different compiled code, so each needs to be verified once. From the\n" +
      "project repository (not from this archive), run:\n\n" +
      "1) Collection (this address, right away):\n\n" +
      `     ${verifyCommand}\n\n` +
      "2) NFT item (once, after minting at least one NFT - use the address of\n" +
      "   any single minted item, not the collection address). Every item this\n" +
      "   collection mints, now or later, shares the exact same code, so this\n" +
      "   one verification covers all of them automatically - it does not need\n" +
      "   to be repeated per NFT:\n\n" +
      `     ${verifyItemCommand}\n\n` +
      "Each command recompiles the matching Tact source, sends it to the\n" +
      "verifier backend, and - once you confirm with a wallet - publishes the\n" +
      "signed proof on-chain to the TON Sources Registry. Explorers such as\n" +
      "tonviewer.com read that registry directly, so contracts show up as\n" +
      "verified there automatically; there is no separate step to 'publish'\n" +
      "to Tonviewer.\n",
  );

  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `nft-collection-${friendlyAddress.slice(0, 10)}.zip`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// --- Wire up -----------------------------------------------------------------

window.addEventListener("DOMContentLoaded", () => {
  initTonConnect();

  el("generate-keys-button").addEventListener("click", () => {
    generateKeyPair().catch((err) => alert("Error generating the keys: " + err.message));
  });
  el("copy-public-key").addEventListener("click", () => copy(state.publicKeyHex ?? "", "copy-public-feedback"));
  el("copy-private-key").addEventListener("click", () => copy(state.secretKeyHex ?? "", "copy-private-feedback"));
  el("prepare-button").addEventListener("click", () => {
    prepareDeploy().catch((err) => alert("Error preparing the deploy: " + err.message));
  });
  el("deploy-button").addEventListener("click", () => {
    deploy().catch((err) => alert("Error during deploy: " + err.message));
  });
  el("copy-final-address").addEventListener("click", () =>
    copy(el("final-address").textContent ?? "", "copy-final-feedback"),
  );
  el("download-code-button").addEventListener("click", () => {
    downloadDeployedCode().catch((err) => alert("Error creating the archive: " + err.message));
  });
  el("copy-verify-command").addEventListener("click", () =>
    copy(el("verify-command-value").textContent ?? "", "copy-verify-feedback"),
  );
  el("copy-verify-item-command").addEventListener("click", () =>
    copy(el("verify-item-command-value").textContent ?? "", "copy-verify-item-feedback"),
  );
});
