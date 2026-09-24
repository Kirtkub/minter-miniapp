import { Address, beginCell, toNano } from "@ton/core";
import { collectionAddress, nftsMetadataIndex, tonChain } from "./config.js";

const state = {
  connected: false,
  walletAddress: null,
  items: [],
  loading: false,
};

let tonConnectUI;
const walletButton = document.querySelector("#wallet-btn");
const authStatusButton = document.querySelector("#auth-status-btn");
const authStatusLabel = document.querySelector("#auth-status-label");
const statusNode = document.querySelector("#status");
const catalogNode = document.querySelector("#catalog");
const debugSection = document.querySelector("#debug-report");
const debugContent = document.querySelector("#debug-report-content");
const debugCopyButton = document.querySelector("#debug-report-copy");
const debugCloseButton = document.querySelector("#debug-report-close");

function setStatus(message = "") {
  statusNode.textContent = message;
  statusNode.hidden = !message;
}

function setWalletState(wallet) {
  state.connected = Boolean(wallet);
  state.walletAddress = wallet?.account?.address || null;
  walletButton.textContent = state.connected ? "Disconnect Wallet" : "Connect Wallet";
  walletButton.classList.toggle("connected", state.connected);
  renderCatalog();
}

function formatAddress(address) {
  try {
    return Address.parse(address).toString({ testOnly: tonChain === "Testnet" });
  } catch {
    return address;
  }
}

function createText(tag, text, className) {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
}

function renderCatalog() {
  catalogNode.replaceChildren();
  if (state.loading) {
    catalogNode.append(createText("p", "Loading.", "catalog-message"));
    return;
  }
  if (state.items.length === 0) {
    catalogNode.append(createText("p", "Nothing available.", "catalog-message"));
    return;
  }

  for (const item of state.items) {
    const card = document.createElement("article");
    card.className = "nft-card";
    const details = document.createElement("div");
    details.append(
      createText("h2", item.name, "nft-name"),
      createText("p", `${item.mintingPrice} GRAM`, "nft-price"),
      createText("p", `${item.remaining} remaining`, "nft-remaining"),
    );
    const button = document.createElement("button");
    button.type = "button";
    button.className = "mint-button";
    button.textContent = "Mint";
    button.disabled = !state.connected;
    button.addEventListener("click", () => mint(item, button));
    card.append(details, button);
    catalogNode.append(card);
  }
}

async function loadCatalog() {
  state.loading = true;
  renderCatalog();
  try {
    // Pass the configured source to the same-origin API. The server fetches it
    // because the metadata host does not expose browser CORS headers.
    const response = await fetch(
      `/api/catalog?metadataIndex=${encodeURIComponent(nftsMetadataIndex)}`,
      { cache: "no-store" },
    );
    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw new Error(error?.error || "Minting availability unavailable");
    }
    const payload = await response.json();
    state.items = Array.isArray(payload.items) ? payload.items : [];
    setStatus("");
  } catch (error) {
    state.items = [];
    setStatus(error instanceof Error ? error.message : "Unable to load minting availability.");
  } finally {
    state.loading = false;
    renderCatalog();
  }
}

function buildMintBody(mint) {
  const signature = beginCell().storeBuffer(Buffer.from(mint.signature, "hex")).endCell();
  return beginCell()
    .storeUint(0x6d696e74, 32)
    .storeUint(BigInt(mint.queryId), 64)
    .storeUint(BigInt(mint.metadataIndex), 32)
    .storeStringRefTail(mint.contentUrl)
    .storeAddress(Address.parse(mint.newOwner))
    .storeUint(BigInt(mint.validUntil), 32)
    .storeRef(signature)
    .endCell()
    .toBoc()
    .toString("base64");
}

// --- Debug report -----------------------------------------------------
//
// Builds a full, copy-pastable text report for a single mint attempt, and
// shows it in the #debug-report panel. Called once per attempt, in a
// `finally` block, so it always renders regardless of whether the attempt
// succeeded, was rejected in the wallet, or failed on-chain.

function explorerBase() {
  return tonChain === "Testnet" ? "https://testnet.tonviewer.com" : "https://tonviewer.com";
}

function safeJson(value) {
  try {
    return JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? v.toString() : v), 2);
  } catch (error) {
    return `<unserializable: ${error instanceof Error ? error.message : String(error)}>`;
  }
}

function buildMintReport(ctx) {
  const {
    stage,
    outcome, // "success" | "error"
    item,
    authorization,
    amountNanoTon,
    payloadBase64,
    walletTxResult,
    error,
    startedAt,
    finishedAt,
  } = ctx;

  const lines = [];
  lines.push("=== Mint debug report ===");
  lines.push(`Generated: ${finishedAt}`);
  lines.push(`Attempt started: ${startedAt}`);
  lines.push(`Outcome: ${outcome}${outcome === "error" ? ` (failed during: ${stage})` : ""}`);
  lines.push("");

  lines.push("--- Environment ---");
  lines.push(`Network: ${tonChain}`);
  lines.push(`Collection address: ${collectionAddress}`);
  lines.push(`Collection on explorer: ${explorerBase()}/${collectionAddress}`);
  lines.push(`Wallet address (raw, as given by TonConnect): ${state.walletAddress || "-"}`);
  lines.push(`Wallet address (friendly): ${state.walletAddress ? formatAddress(state.walletAddress) : "-"}`);
  lines.push(`Wallet app: ${tonConnectUI?.wallet?.device?.appName || "-"} ${tonConnectUI?.wallet?.device?.appVersion || ""}`.trim());
  lines.push(`Page: ${window.location.href}`);
  lines.push(`User agent: ${navigator.userAgent}`);
  lines.push("");

  lines.push("--- Item being minted ---");
  if (item) {
    lines.push(`Name: ${item.name}`);
    lines.push(`metadataIndex: ${item.metadataIndex}`);
    lines.push(`Catalog contentUrl: ${item.contentUrl || "-"}`);
    lines.push(`Listed price: ${item.mintingPrice} TON`);
    lines.push(`Remaining (last known): ${item.remaining}`);
  } else {
    lines.push("(not available)");
  }
  lines.push("");

  lines.push("--- /api/sign-mint response ---");
  if (authorization) {
    lines.push(`queryId: ${authorization.queryId}`);
    lines.push(`metadataIndex: ${authorization.metadataIndex}`);
    lines.push(`contentUrl: ${authorization.contentUrl}`);
    lines.push(`mintingPrice: ${authorization.mintingPrice}`);
    lines.push(
      `validUntil: ${authorization.validUntil} (${new Date(authorization.validUntil * 1000).toISOString()})`,
    );
    lines.push(`signature (hex): ${authorization.signature}`);
  } else {
    lines.push("(request never completed — see error below)");
  }
  lines.push("");

  lines.push("--- Outgoing transaction ---");
  lines.push(`to: ${collectionAddress}`);
  lines.push(`amount: ${amountNanoTon ? `${amountNanoTon} nanoTON` : "-"}`);
  lines.push(`payload (base64 BOC): ${payloadBase64 || "-"}`);
  lines.push("");

  lines.push("--- TonConnect wallet response ---");
  lines.push(walletTxResult ? safeJson(walletTxResult) : "(none)");
  lines.push("");

  if (error) {
    lines.push("--- Error ---");
    lines.push(`message: ${error instanceof Error ? error.message : String(error)}`);
    if (error instanceof Error && error.stack) lines.push(`stack:\n${error.stack}`);
    lines.push("");
  }

  return lines.join("\n");
}

function showMintReport(text) {
  if (!debugSection || !debugContent) return;
  debugContent.textContent = text;
  debugSection.hidden = false;
  debugSection.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

async function copyMintReport() {
  const text = debugContent?.textContent || "";
  try {
    await navigator.clipboard.writeText(text);
    debugCopyButton.textContent = "Copied!";
  } catch {
    // Clipboard API unavailable (e.g. insecure context inside some
    // Telegram webviews) — fall back to select-all so the user can
    // copy manually with their device's copy shortcut.
    const range = document.createRange();
    range.selectNodeContents(debugContent);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    debugCopyButton.textContent = "Select & copy manually";
  }
  setTimeout(() => {
    debugCopyButton.textContent = "Copy report";
  }, 2000);
}

// --- Mint ---------------------------------------------------------------

async function mint(item, button) {
  if (!state.walletAddress || !tonConnectUI) {
    setStatus("Connect a wallet first.");
    return;
  }
  button.disabled = true;
  setStatus("Preparing transaction.");

  const startedAt = new Date().toISOString();
  let stage = "authorization";
  let authorization = null;
  let amountNanoTon = null;
  let payloadBase64 = null;
  let walletTxResult = null;
  let outcome = "error";
  let caughtError = null;

  try {
    const authorizationResponse = await fetch("/api/sign-mint", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        metadataIndex: item.metadataIndex,
        newOwner: state.walletAddress,
      }),
    });
    authorization = await authorizationResponse.json();
    if (!authorizationResponse.ok) throw new Error(authorization.error || "Mint authorization failed");

    stage = "wallet transaction";
    amountNanoTon = toNano(String(authorization.mintingPrice)).toString();
    payloadBase64 = buildMintBody({ ...authorization, newOwner: state.walletAddress });
    walletTxResult = await tonConnectUI.sendTransaction({
      validUntil: authorization.validUntil,
      messages: [
        {
          address: collectionAddress,
          amount: amountNanoTon,
          payload: payloadBase64,
        },
      ],
    });

    outcome = "success";
    setStatus("Transaction sent.");
    await loadCatalog();
  } catch (error) {
    caughtError = error;
    const message = error instanceof Error ? error.message : String(error);
    const debugMessage = `Mint failed during ${stage}.\n\n${message}`;
    setStatus(debugMessage);
    window.alert(debugMessage);
  } finally {
    const report = buildMintReport({
      stage,
      outcome,
      item,
      authorization,
      amountNanoTon,
      payloadBase64,
      walletTxResult,
      error: caughtError,
      startedAt,
      finishedAt: new Date().toISOString(),
    });
    showMintReport(report);
    button.disabled = false;
  }
}

const AUTH_STATUS_ERROR_MESSAGES = {
  collection_not_deployed: "The collection contract is not deployed on the TON blockchain yet.",
  key_not_configured: "The AUTHENTICATION_SIGNATURE_PRIVATE_KEY environment variable is not configured on Vercel.",
  key_mismatch:
    "The private key in AUTHENTICATION_SIGNATURE_PRIVATE_KEY does not match the public key stored in the smart contract.",
  chain_unreachable: "Unable to reach the TON blockchain to check the contract status.",
};

function setAuthStatus(state, label, title) {
  authStatusButton.dataset.state = state;
  authStatusButton.title = title;
  authStatusLabel.textContent = label;
}

async function checkAuthStatus() {
  setAuthStatus("checking", "Checking...", "Checking...");
  try {
    const response = await fetch("/api/auth-status", { cache: "no-store" });
    const payload = await response.json().catch(() => null);
    if (!payload) throw new Error("Invalid response from server");

    if (payload.authorized) {
      setAuthStatus(
        "ok",
        "Authorized",
        `Contract deployed on ${payload.network} and AUTHENTICATION_SIGNATURE_PRIVATE_KEY is correct.`,
      );
      return;
    }

    const detail = AUTH_STATUS_ERROR_MESSAGES[payload.error] || "Invalid configuration.";
    setAuthStatus("error", "Not authorized", detail);
  } catch (error) {
    setAuthStatus(
      "error",
      "Not authorized",
      error instanceof Error ? error.message : "Unable to check the app status.",
    );
  }
}

function initTelegram() {
  const tg = window.Telegram?.WebApp;
  if (!tg) return;
  tg.ready();
  tg.expand();
}

function initWallet() {
  tonConnectUI = new window.TON_CONNECT_UI.TonConnectUI({
    manifestUrl: new URL("/tonconnect-manifest.json", window.location.href).toString(),
  });
  tonConnectUI.onStatusChange((wallet) => setWalletState(wallet));
  tonConnectUI.connectionRestored.then(() => setWalletState(tonConnectUI.wallet));
  walletButton.addEventListener("click", () => {
    if (tonConnectUI.connected) tonConnectUI.disconnect();
    else tonConnectUI.openModal();
  });
}

window.addEventListener("DOMContentLoaded", () => {
  initTelegram();
  initWallet();
  loadCatalog();
  authStatusButton.addEventListener("click", () => checkAuthStatus());
  checkAuthStatus();
  debugCopyButton?.addEventListener("click", () => copyMintReport());
  debugCloseButton?.addEventListener("click", () => {
    debugSection.hidden = true;
  });
});