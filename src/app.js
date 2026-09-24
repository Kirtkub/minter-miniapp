import { Address, beginCell, toNano } from "@ton/core";
import { collectionAddress, nftsMetadataIndex, ownerAddress, tonChain } from "./config.js";

const state = {
  connected: false,
  walletAddress: null,
  items: [],
  loading: false,
  tonUsd: null,
};

// Official Gram Diamond Mark. Fixed markup, no dynamic data inside, so
// building it via innerHTML is safe.
const GRAM_ICON_HTML =
  '<svg width="18" height="18" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
  '<path d="M66.523 11.333H33.477c-4.401 0-6.601 0-8.592.616a13.792 13.792 0 0 0-4.808 2.625c-1.594 1.341-2.784 3.192-5.164 6.894L4.408 37.81c-1.572 2.446-2.358 3.67-2.572 4.956a6.322 6.322 0 0 0 .362 3.37c.482 1.212 1.51 2.24 3.567 4.296l39.033 39.034c1.821 1.82 2.731 2.731 3.781 3.072.924.3 1.918.3 2.842 0 1.05-.34 1.96-1.251 3.78-3.072l39.035-39.034c2.056-2.056 3.084-3.084 3.566-4.296a6.32 6.32 0 0 0 .362-3.37c-.214-1.287-1-2.51-2.572-4.956L85.087 21.47c-2.38-3.703-3.57-5.554-5.164-6.895a13.792 13.792 0 0 0-4.808-2.625c-1.99-.616-4.191-.616-8.592-.616z" fill="#30A1F5"/>' +
  '<path d="M60.268 24.224c.537-1.45 2.59-1.45 3.126 0l3.71 10.027a2.2 2.2 0 0 0 1.3 1.3l10.027 3.71c1.451.537 1.451 2.59 0 3.126l-10.027 3.71a2.2 2.2 0 0 0-1.3 1.3l-3.71 10.027c-.537 1.451-2.59 1.451-3.126 0l-3.71-10.027a2.2 2.2 0 0 0-1.3-1.3l-10.027-3.71c-1.451-.537-1.451-2.589 0-3.126l10.027-3.71a2.2 2.2 0 0 0 1.3-1.3l3.71-10.027z" fill="#fff"/>' +
  "</svg>";

// Set when the user clicks "Mint" while no wallet is connected: remembers
// which item to mint automatically once a wallet connects, so the click
// isn't just discarded. Expires after a few minutes so that connecting a
// wallet much later (after giving up / closing the connect modal) doesn't
// unexpectedly trigger an old mint attempt.
let pendingMint = null;
let countdownTimer = null;

let tonConnectUI;
const walletButton = document.querySelector("#wallet-btn");
const walletButtonLabel = document.querySelector("#wallet-btn-label");
const navButtons = document.querySelectorAll(".nav-btn");
const bottomNav = document.querySelector("#bottom-nav");
const pages = {
  mint: document.querySelector("#page-mint"),
  collection: document.querySelector("#page-collection"),
};
const authStatusButton = document.querySelector("#auth-status-btn");
const authStatusLabel = document.querySelector("#auth-status-label");
const statusNode = document.querySelector("#status");
const catalogNode = document.querySelector("#catalog");
const debugSection = document.querySelector("#debug-report");
const debugContent = document.querySelector("#debug-report-content");
const debugCopyButton = document.querySelector("#debug-report-copy");
const debugCloseButton = document.querySelector("#debug-report-close");
const withdrawButton = document.querySelector("#withdraw-btn");

function setStatus(message = "") {
  statusNode.textContent = message;
  statusNode.hidden = !message;
}

// --- Bottom nav: switch between "Mint and Reveal" and "My Collection" ---
function showPage(name) {
  Object.entries(pages).forEach(([key, node]) => {
    if (!node) return;
    node.hidden = key !== name;
  });
  navButtons.forEach((button) => {
    const isActive = button.dataset.page === name;
    button.classList.toggle("active", isActive);
    if (isActive) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
}

function initNav() {
  navButtons.forEach((button) => {
    button.addEventListener("click", () => showPage(button.dataset.page));
  });
  showPage("mint");
  initNavLabelReveal();
}

// --- Bottom nav labels: hidden by default (icons only, compact bar).
// Revealed while the user scrolls down, then hidden again ~2s after
// scrolling stops. Scrolling up (or being at the very top) keeps them
// hidden so the bar never fights for attention.
function initNavLabelReveal() {
  if (!bottomNav) return;
  let lastScrollY = window.scrollY;
  let hideTimer = null;

  const showLabels = () => {
    bottomNav.classList.add("show-labels");
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      bottomNav.classList.remove("show-labels");
      hideTimer = null;
    }, 2000);
  };

  window.addEventListener(
    "scroll",
    () => {
      const currentScrollY = window.scrollY;
      if (currentScrollY > lastScrollY) showLabels();
      lastScrollY = currentScrollY;
    },
    { passive: true },
  );
}

function isOwnerWallet() {
  if (!state.walletAddress) return false;
  try {
    return Address.parse(state.walletAddress).equals(Address.parse(ownerAddress));
  } catch {
    return false;
  }
}

function updateWithdrawVisibility() {
  if (!withdrawButton) return;
  withdrawButton.hidden = !isOwnerWallet();
}

function setWalletState(wallet) {
  state.connected = Boolean(wallet);
  state.walletAddress = wallet?.account?.address || null;
  walletButtonLabel.textContent = state.connected ? "Disconnect" : "Connect Wallet";
  walletButton.classList.toggle("connected", state.connected);
  updateWithdrawVisibility();
  renderCatalog();

  // If the wallet just connected because the user clicked "Mint" while
  // disconnected, pick up where they left off.
  if (state.connected && pendingMint && pendingMint.expiresAt > Date.now()) {
    const item = state.items.find((candidate) => candidate.metadataIndex === pendingMint.metadataIndex);
    pendingMint = null;
    if (item) {
      const button = catalogNode.querySelector(`[data-metadata-index="${item.metadataIndex}"]`);
      if (button) mint(item, button);
    }
  } else {
    pendingMint = null;
  }
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

function formatCountdown(msRemaining) {
  if (msRemaining <= 0) return "Minting closed";
  const totalSeconds = Math.floor(msRemaining / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${days}d ${hours}h ${minutes}m ${seconds}s left`;
}

function createGramIcon() {
  const span = document.createElement("span");
  span.className = "gram-icon";
  span.innerHTML = GRAM_ICON_HTML;
  return span;
}

function formatUsd(value) {
  if (!Number.isFinite(value) || value <= 0) return null;
  if (value < 0.01) return "< $0.01";
  return `$${value.toFixed(2)}`;
}

function buildPriceLine(item) {
  const p = document.createElement("p");
  p.className = "nft-price";
  p.append(createGramIcon(), createText("span", String(item.mintingPrice), "price-amount"));
  const usdText = state.tonUsd ? formatUsd(item.mintingPrice * state.tonUsd) : null;
  if (usdText) p.append(createText("span", `≈ ${usdText}`, "price-usd"));
  return p;
}

async function loadTonPrice() {
  try {
    const response = await fetch("/api/ton-price", { cache: "no-store" });
    if (!response.ok) return;
    const payload = await response.json();
    if (Number.isFinite(payload.usd) && payload.usd > 0) {
      state.tonUsd = payload.usd;
      renderCatalog();
    }
  } catch {
    // USD conversion is a nice-to-have; silently skip it if unavailable.
  }
}

function tickCountdowns() {
  const now = Date.now();
  catalogNode.querySelectorAll("[data-countdown-end]").forEach((node) => {
    const end = Number(node.dataset.countdownEnd);
    node.textContent = formatCountdown(end - now);
  });
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

    if (item.image) {
      const image = document.createElement("img");
      image.className = "nft-image";
      image.src = item.image;
      image.alt = item.name;
      image.loading = "lazy";
      card.append(image);
    }

    // Mint amount can be unlimited (no maxSupply in the item's metadata):
    // in that case item.remaining is null and no "... remaining" line is
    // shown at all.
    const remainingLine =
      item.remaining != null ? createText("p", `${item.remaining} remaining`, "nft-remaining") : null;

    // Mint end date is optional too (no mintEndDate in the item's metadata):
    // in that case there's no deadline, so no countdown is shown.
    const countdown = item.mintEndDate ? createText("p", "", "nft-countdown") : null;
    if (countdown) countdown.dataset.countdownEnd = String(Date.parse(item.mintEndDate));

    // Visual order, top to bottom: image, name, price, remaining, countdown,
    // mint button.
    card.append(createText("h2", item.name, "nft-name"), buildPriceLine(item));
    if (remainingLine) card.append(remainingLine);
    if (countdown) card.append(countdown);

    // Mint buttons are never disabled for being logged out — clicking one
    // while disconnected opens the wallet connect modal instead, and the
    // mint resumes automatically once the wallet connects (see setWalletState).
    const button = document.createElement("button");
    button.type = "button";
    button.className = "mint-button";
    button.textContent = "Mint and Reveal";
    button.dataset.metadataIndex = String(item.metadataIndex);
    button.addEventListener("click", () => requestMint(item, button));
    card.append(button);
    catalogNode.append(card);
  }

  tickCountdowns();
  if (!countdownTimer) countdownTimer = setInterval(tickCountdowns, 1000);
}

function requestMint(item, button) {
  if (!state.connected) {
    pendingMint = { metadataIndex: item.metadataIndex, expiresAt: Date.now() + 2 * 60 * 1000 };
    setStatus(`Connect your wallet to mint "${item.name}".`);
    tonConnectUI.openModal();
    return;
  }
  mint(item, button);
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

function buildWithdrawBody() {
  const queryId = BigInt(Date.now());
  return beginCell()
    .storeUint(0x77697468, 32) // "with" — matches Withdraw in messages.tact
    .storeUint(queryId, 64)
    .endCell()
    .toBoc()
    .toString("base64");
}

// Sends the owner-only Withdraw message to the collection contract. The
// contract itself checks `sender() == self.owner` — if the connected wallet
// isn't the collection owner, the message just gets rejected/bounced (the
// attached TON comes back, minus a small network fee). The 0.05 TON attached
// here only covers gas; it's included in what comes back from the contract.
async function withdrawFunds() {
  if (!state.walletAddress || !tonConnectUI) {
    setStatus("Connect a wallet first.");
    return;
  }
  if (!window.confirm("Send the Withdraw message to the collection contract? This only works if the connected wallet is the collection owner.")) {
    return;
  }
  try {
    await tonConnectUI.sendTransaction({
      validUntil: Math.floor(Date.now() / 1000) + 300,
      messages: [
        {
          address: collectionAddress,
          amount: toNano("0.05").toString(),
          payload: buildWithdrawBody(),
        },
      ],
    });
    setStatus("Withdraw message sent — check the collection balance on an explorer in a minute.");
  } catch (error) {
    setStatus(`Withdraw failed: ${error instanceof Error ? error.message : String(error)}`);
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
    lines.push(`Remaining (last known): ${item.remaining != null ? item.remaining : "unlimited"}`);
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
  initNav();
  initWallet();
  loadCatalog();
  loadTonPrice();
  authStatusButton.addEventListener("click", () => checkAuthStatus());
  checkAuthStatus();
  debugCopyButton?.addEventListener("click", () => copyMintReport());
  debugCloseButton?.addEventListener("click", () => {
    debugSection.hidden = true;
  });
  withdrawButton?.addEventListener("click", () => withdrawFunds());
});