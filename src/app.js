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

async function mint(item, button) {
  if (!state.walletAddress || !tonConnectUI) {
    setStatus("Connect a wallet first.");
    return;
  }
  button.disabled = true;
  setStatus("Preparing transaction.");
  let stage = "authorization";
  try {
    const authorizationResponse = await fetch("/api/sign-mint", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        metadataIndex: item.metadataIndex,
        newOwner: state.walletAddress,
      }),
    });
    const authorization = await authorizationResponse.json();
    if (!authorizationResponse.ok) throw new Error(authorization.error || "Mint authorization failed");
    stage = "wallet transaction";
    await tonConnectUI.sendTransaction({
      validUntil: authorization.validUntil,
      messages: [
        {
          address: collectionAddress,
          amount: toNano(String(authorization.mintingPrice)).toString(),
          payload: buildMintBody({ ...authorization, newOwner: state.walletAddress }),
        },
      ],
    });
    setStatus("Transaction sent.");
    await loadCatalog();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const debugMessage = `Mint failed during ${stage}.\n\n${message}`;
    setStatus(debugMessage);
    window.alert(debugMessage);
  } finally {
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
});