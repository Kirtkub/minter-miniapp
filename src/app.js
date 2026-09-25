import { Address, beginCell, toNano } from "@ton/core";
import { channelInviteLink, collectionAddress, nftsMetadataIndex, ownerAddress, tonChain } from "./config.js";

const state = {
  connected: false,
  walletAddress: null,
  items: [],
  loading: false,
  tonUsd: null,
  // "My Collection" (revealed/private images of owned NFTs).
  myItems: [],
  myCollectionLoading: false,
  myCollectionError: null,
  // Wallet address the current myItems/myCollectionError were loaded for —
  // lets loadMyCollection() know it needs to refetch after a wallet switch.
  myCollectionLoadedFor: null,
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
// Set once by initTelegram(): true only when launched as a Telegram
// miniapp (non-empty initData), not when the SDK merely loaded in a
// regular browser.
let insideTelegram = false;

let tonConnectUI;
const walletButton = document.querySelector("#wallet-btn");
const walletButtonLabel = document.querySelector("#wallet-btn-label");
const accountModal = document.querySelector("#account-modal");
const accountClose = document.querySelector("#account-close");
const accountAddress = document.querySelector("#account-address");
const accountCopy = document.querySelector("#account-copy");
const accountGetgemsLink = document.querySelector("#account-getgems-link");
const accountNftCount = document.querySelector("#account-nft-count");
const accountDisconnect = document.querySelector("#account-disconnect");
const mintResultModal = document.querySelector("#mint-result-modal");
const mintResultBox = document.querySelector("#mint-result-box");
const mintResultText = document.querySelector("#mint-result-text");
const mintResultClose = document.querySelector("#mint-result-close");
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
const collectionStatusNode = document.querySelector("#collection-status");
const myCollectionNode = document.querySelector("#my-collection");
const lightbox = document.querySelector("#lightbox");
const lightboxImage = document.querySelector("#lightbox-image");
const lightboxClose = document.querySelector("#lightbox-close");
const debugSection = document.querySelector("#debug-report");
const debugContent = document.querySelector("#debug-report-content");
const debugCopyButton = document.querySelector("#debug-report-copy");
const debugCloseButton = document.querySelector("#debug-report-close");
const withdrawButton = document.querySelector("#withdraw-btn");
const gateNode = document.querySelector("#gate");
const gateText = document.querySelector("#gate-text");
const gatePrimary = document.querySelector("#gate-primary");
const gateSecondary = document.querySelector("#gate-secondary");
const gateNote = document.querySelector("#gate-note");
const collectionNameNodes = document.querySelectorAll(".collection-name");
const introContinueButton = document.querySelector("#intro-continue");
const introMoreNodes = document.querySelectorAll(".intro-more");
const emptyInfoNode = document.querySelector("#empty-info");
const getgemsCollectionLinks = document.querySelectorAll(".getgems-collection-link");

// --- Collection name (from the collection metadata, via the API) ---------
function setCollectionName(name) {
  collectionNameNodes.forEach((node) => {
    node.textContent = name;
  });
}

async function loadCollectionInfo() {
  try {
    const response = await fetch("/api/collection-info");
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.name) throw new Error("no name");
    setCollectionName(payload.name);
  } catch {
    setCollectionName("Collection");
  }
}

function getgemsCollectionUrl() {
  const base = tonChain === "Testnet" ? "https://testnet.getgems.io" : "https://getgems.io";
  return `${base}/collection/${collectionAddress}`;
}

// "...more" in the Mint and Reveal intro reveals the remaining bullets.
function initIntro() {
  getgemsCollectionLinks.forEach((link) => {
    link.href = getgemsCollectionUrl();
  });
  introContinueButton?.addEventListener("click", () => {
    introMoreNodes.forEach((node) => {
      node.hidden = false;
    });
    introContinueButton.hidden = true;
  });
}

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
  if (name === "collection") loadMyCollection();
}

function initNav() {
  navButtons.forEach((button) => {
    button.addEventListener("click", () => showPage(button.dataset.page));
  });
  showPage("mint");
  initNavLabelReveal();
  initWalletButtonReveal();
}

// While disconnected, the wallet button is icon-only by default. Scrolling
// up expands it to icon + "Connect Wallet", then the label hides again ~2s
// after the user stops scrolling up (mirrors initNavLabelReveal, but on the
// opposite scroll direction, and only while disconnected).
function initWalletButtonReveal() {
  let lastScrollY = window.scrollY;
  let hideTimer = null;

  const showLabel = () => {
    if (state.connected) return;
    walletButton.classList.add("expanded");
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      walletButton.classList.remove("expanded");
      hideTimer = null;
    }, 2000);
  };

  window.addEventListener(
    "scroll",
    () => {
      const currentScrollY = window.scrollY;
      if (currentScrollY < lastScrollY) showLabel();
      lastScrollY = currentScrollY;
    },
    { passive: true },
  );
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

// navigator.clipboard.writeText needs a secure context and, inside an
// embedded webview like Telegram's, is sometimes blocked outright even on
// https. Fall back to the old execCommand("copy") trick (works in more
// webviews) so the button does something instead of silently failing.
async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    throw new Error("clipboard API unavailable");
  } catch {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.append(textarea);
      textarea.focus();
      textarea.select();
      const ok = document.execCommand("copy");
      textarea.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

function getgemsUserUrl(address) {
  const base = tonChain === "Testnet" ? "https://testnet.getgems.io" : "https://getgems.io";
  return `${base}/user/${address}`;
}

function renderAccountPanel() {
  if (!state.walletAddress) return;
  accountAddress.textContent = formatAddress(state.walletAddress);
  accountGetgemsLink.href = getgemsUserUrl(state.walletAddress);
  accountNftCount.textContent = String(state.myItems.length);
}

function setWalletState(wallet) {
  const previousAddress = state.walletAddress;
  state.connected = Boolean(wallet);
  state.walletAddress = wallet?.account?.address || null;
  // Connected: icon-only button that opens the account panel. Disconnected:
  // "Connect Wallet" (icon + label, expanded on scroll-up).
  walletButtonLabel.textContent = "Connect Wallet";
  walletButton.classList.toggle("connected", state.connected);
  walletButton.classList.remove("expanded");
  const walletIcon = walletButton.querySelector(".icon-wallet, .icon-user");
  if (walletIcon) {
    walletIcon.classList.toggle("icon-wallet", !state.connected);
    walletIcon.classList.toggle("icon-user", state.connected);
  }
  if (!state.connected) accountModal.hidden = true;
  updateWithdrawVisibility();
  renderCatalog();

  if (state.walletAddress !== previousAddress) {
    state.myItems = [];
    state.myCollectionError = null;
    state.myCollectionLoadedFor = null;
    // Owned NFTs are needed on the "Mint and Reveal" page too (revealed
    // image, "Mint another copy"), so load them whatever page is open.
    loadMyCollection();
  }

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

// Copies of a catalog entry the connected wallet already owns. Owned NFTs
// are matched to catalog entries through their metadata URL (contentUrl).
function ownedCopies(item) {
  return state.myItems.filter((owned) => owned.contentUrl && owned.contentUrl === item.contentUrl);
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

    // If the user owns at least one copy, show the revealed (private) image
    // instead of the public one.
    const owned = ownedCopies(item);
    const revealed = owned.find((copy) => copy.hasPrivateImage);
    const imageSrc = revealed ? revealed.privateImageUrl : item.image;

    if (imageSrc) {
      const image = document.createElement("img");
      image.className = "nft-image";
      image.src = imageSrc;
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
    button.className = owned.length > 0 ? "mint-button owned" : "mint-button";
    button.textContent = owned.length > 0 ? "Mint another copy" : "Mint and Reveal";
    button.dataset.metadataIndex = String(item.metadataIndex);
    button.addEventListener("click", () => requestMint(item, button));
    card.append(button);

    if (owned.length > 0) {
      const linkLine = document.createElement("p");
      linkLine.className = "open-in-collection";
      const link = document.createElement("a");
      link.href = "#page-collection";
      link.textContent = "Open NFT in my collection";
      link.addEventListener("click", (event) => {
        event.preventDefault();
        showPage("collection");
        window.scrollTo({ top: 0 });
      });
      linkLine.append(link);
      card.append(linkLine);
    }
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

// --- My Collection (revealed/private images) -----------------------------

function setCollectionStatus(message = "") {
  collectionStatusNode.textContent = message;
  collectionStatusNode.hidden = !message;
}

async function loadMyCollection() {
  if (!state.walletAddress) {
    state.myItems = [];
    state.myCollectionError = null;
    state.myCollectionLoadedFor = null;
    renderMyCollection();
    return;
  }
  // Already loaded (or currently loading) for this exact wallet — nav
  // switches and reconnect-to-same-wallet events shouldn't refetch.
  if (state.myCollectionLoadedFor === state.walletAddress || state.myCollectionLoading) {
    renderMyCollection();
    return;
  }

  const ownedSignature = () => state.myItems.map((entry) => entry.itemAddress).join(",");
  const signatureBefore = ownedSignature();

  state.myCollectionLoading = true;
  renderMyCollection();
  try {
    const response = await fetch(`/api/my-collection?owner=${encodeURIComponent(state.walletAddress)}`, {
      cache: "no-store",
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error || "Unable to load your collection");
    state.myItems = Array.isArray(payload.items) ? payload.items : [];
    state.myCollectionError = null;
  } catch (error) {
    state.myItems = [];
    state.myCollectionError = error instanceof Error ? error.message : "Unable to load your collection.";
  } finally {
    state.myCollectionLoading = false;
    state.myCollectionLoadedFor = state.walletAddress;
    renderMyCollection();
    // Owned copies change the "Mint and Reveal" cards (image, button).
    if (ownedSignature() !== signatureBefore) renderCatalog();
  }
}

// After a mint the new NFT appears on-chain (and in the indexer) after a
// little while: re-check "My Collection" every few seconds until the number
// of owned copies grows, or give up after ~90 seconds. Purely a UI refresh
// (reveals the private image / "Sell" button for the new copy) — the
// Telegram notification no longer waits on this, see notifyMintTelegram().
function refreshCollectionAfterMint(item) {
  const beforeAddresses = new Set(ownedCopies(item).map((copy) => copy.itemAddress));
  let attempts = 0;
  const tick = async () => {
    attempts += 1;
    state.myCollectionLoadedFor = null;
    await loadMyCollection();
    const newCopy = ownedCopies(item).find((copy) => !beforeAddresses.has(copy.itemAddress));
    if (newCopy) return;
    if (attempts >= 9) return;
    setTimeout(tick, 10000);
  };
  setTimeout(tick, 10000);
}

function openLightbox(imageUrl) {
  lightboxImage.src = imageUrl;
  lightbox.hidden = false;
}

function closeLightbox() {
  lightbox.hidden = true;
  lightboxImage.src = "";
}

// Downloads the revealed image to the device.
//
// Telegram's native `downloadFile` only exists from Bot API 8.0: on older
// clients (and on some platforms) calling it fails with
// "WebAppMethodUnsupported". So it is used only when supported, and every
// other environment gets a fallback, in this order:
//   1. Telegram downloadFile (Bot API >= 8.0, needs an absolute https URL)
//   2. Web Share sheet with the image file (lets the user "Save Image")
//   3. Inside Telegram: open the image URL in the external browser, where it
//      can be saved (Telegram's webview ignores <a download>)
//   4. Regular browsers: same-origin blob download
function isTelegramDownloadSupported(tg) {
  return (
    typeof tg?.downloadFile === "function" &&
    typeof tg.isVersionAtLeast === "function" &&
    tg.isVersionAtLeast("8.0")
  );
}

function telegramDownloadFile(tg, url, fileName) {
  return new Promise((resolve, reject) => {
    try {
      tg.downloadFile({ url, file_name: fileName }, (accepted) => {
        if (accepted) resolve();
        else reject(new Error("cancelled"));
      });
    } catch (error) {
      reject(error);
    }
  });
}

async function downloadRevealedImage(item, button) {
  const originalLabel = button.textContent;
  button.disabled = true;
  button.textContent = "Downloading...";
  try {
    const tg = window.Telegram?.WebApp;
    const insideTelegram = Boolean(tg?.initData);
    const baseName = item.name.replace(/[^a-z0-9-_]+/gi, "_") || "nft";
    const absoluteUrl = new URL(item.privateImageUrl, window.location.origin).href;

    // 1) Telegram native download.
    if (isTelegramDownloadSupported(tg)) {
      try {
        await telegramDownloadFile(tg, absoluteUrl, `${baseName}.${item.privateImageExt || "jpg"}`);
        return;
      } catch (error) {
        if (error instanceof Error && error.message === "cancelled") return;
        // Any other failure: fall through to the other strategies.
      }
    }

    // The remaining strategies need the actual bytes.
    const response = await fetch(item.privateImageUrl, { cache: "no-store" });
    if (!response.ok) throw new Error("Download failed");
    const blob = await response.blob();
    const extension = (blob.type.split("/")[1] || item.privateImageExt || "jpg").replace("jpeg", "jpg");
    const fileName = `${baseName}.${extension}`;

    // 2) Share sheet with the file (mobile webviews: "Save Image", Files...).
    try {
      const file = new File([blob], fileName, { type: blob.type || "image/jpeg" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: item.name });
        return;
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return; // user closed the share sheet
      // Share unavailable/failed: fall through.
    }

    // 3) Telegram without a working native download: open in the browser.
    if (insideTelegram && typeof tg.openLink === "function") {
      tg.openLink(absoluteUrl);
      return;
    }

    // 4) Regular browser download.
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = fileName;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
  } catch (error) {
    window.alert(`Unable to download the image: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    button.disabled = false;
    button.textContent = originalLabel;
  }
}

// Opens the NFT's Getgems page so the user can list it for sale there.
// Note: putting an item up for sale requires deploying a marketplace sale
// contract, which is Getgems' own flow (there is no public API for a
// third-party miniapp to do this without replicating their sale-contract
// spec). This opens the correct network's Getgems item page — Getgems
// detects the connected wallet's ownership itself and surfaces its own
// "Sell" action there.
function sellOnGetgems(item) {
  window.open(item.getgemsUrl, "_blank", "noopener");
}

function renderMyCollection() {
  myCollectionNode.replaceChildren();

  // Extra info (download / resell) is shown to users who don't own any NFT
  // yet, including when no wallet is connected.
  emptyInfoNode.hidden = !(
    !state.walletAddress ||
    (!state.myCollectionLoading && !state.myCollectionError && state.myItems.length === 0)
  );

  if (!state.walletAddress) {
    setCollectionStatus("");
    const connectButton = createText("button", "CONNECT WALLET TO START", "connect-cta");
    connectButton.type = "button";
    connectButton.addEventListener("click", () => tonConnectUI?.openModal());
    myCollectionNode.append(connectButton);
    return;
  }
  if (state.myCollectionLoading && state.myItems.length === 0) {
    setCollectionStatus("");
    myCollectionNode.append(createText("p", "Loading your collection.", "catalog-message"));
    return;
  }
  if (state.myCollectionError) {
    setCollectionStatus("");
    myCollectionNode.append(createText("p", state.myCollectionError, "catalog-message"));
    return;
  }
  if (state.myItems.length === 0) {
    setCollectionStatus("");
    myCollectionNode.append(createText("p", "You don't own any NFTs from this collection yet.", "catalog-message"));
    return;
  }

  setCollectionStatus("");
  for (const item of state.myItems) {
    const card = document.createElement("article");
    card.className = "my-card";

    const imageButton = document.createElement("button");
    imageButton.type = "button";
    imageButton.className = "my-image-btn";
    imageButton.setAttribute("aria-label", `View ${item.name} fullscreen`);
    const image = document.createElement("img");
    image.className = "my-image";
    image.alt = item.name;
    image.loading = "lazy";
    image.src = item.hasPrivateImage ? item.privateImageUrl : "";
    imageButton.append(image);
    imageButton.addEventListener("click", () => openLightbox(item.privateImageUrl));
    card.append(imageButton, createText("h2", item.name, "my-name"));

    const actions = document.createElement("div");
    actions.className = "my-actions";

    const openButton = document.createElement("button");
    openButton.type = "button";
    openButton.className = "btn-getgems";
    openButton.textContent = "Open on Getgems";
    openButton.addEventListener("click", () => window.open(item.getgemsUrl, "_blank", "noopener"));

    const sellButton = document.createElement("button");
    sellButton.type = "button";
    sellButton.className = "btn-sell";
    sellButton.textContent = "Sell";
    sellButton.addEventListener("click", () => sellOnGetgems(item));

    actions.append(openButton, sellButton);

    const downloadButton = document.createElement("button");
    downloadButton.type = "button";
    downloadButton.className = "btn-download";
    downloadButton.textContent = "Download Revealed Image";
    downloadButton.disabled = !item.hasPrivateImage;
    downloadButton.addEventListener("click", () => downloadRevealedImage(item, downloadButton));
    actions.append(downloadButton);

    card.append(actions);
    myCollectionNode.append(card);
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

function showMintResult(success) {
  mintResultBox.classList.toggle("error", !success);
  mintResultText.textContent = success
    ? "NFT minted successfully!"
    : "Error during minting, please try again.";
  mintResultModal.hidden = false;
}

// Tells the server to send the "new Spicy Pic" Telegram message for the
// newly minted item, identified by `itemIndex` (from /api/sign-mint) rather
// than waiting to see it through the collection indexer — the collection
// contract can resolve that index to an address instantly, but the item
// itself can take a few seconds to be deployed and owned on-chain, so a
// "not ready yet" response is retried with backoff instead of given up on
// immediately. Best effort throughout: failures are logged only, never
// shown to the user — the mint itself already succeeded.
const MINT_NOTIFY_MAX_ATTEMPTS = 20;
const MINT_NOTIFY_RETRY_DELAY_MS = 6000;

function notifyMintTelegram(itemIndex, attempt = 1) {
  if (!insideTelegram || !state.walletAddress) return;
  const tg = window.Telegram?.WebApp;

  const retry = () => {
    if (attempt >= MINT_NOTIFY_MAX_ATTEMPTS) return;
    setTimeout(() => notifyMintTelegram(itemIndex, attempt + 1), MINT_NOTIFY_RETRY_DELAY_MS);
  };

  fetch("/api/mint-notify", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `tma ${tg.initData}` },
    body: JSON.stringify({ itemIndex, ownerAddress: state.walletAddress }),
  })
    .then(async (response) => {
      if (response.ok) return; // sent
      const payload = await response.json().catch(() => null);
      if (payload?.error === "not_owner") {
        // Item not deployed/owned yet on-chain: normal right after a mint.
        retry();
        return;
      }
      console.error("mint_notify_failed", payload);
    })
    .catch((error) => {
      console.error("mint_notify_request_error", error);
      retry();
    });
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
    if (authorization?.itemIndex != null) notifyMintTelegram(authorization.itemIndex);
    refreshCollectionAfterMint(item);
    await loadCatalog();
  } catch (error) {
    caughtError = error;
    const message = error instanceof Error ? error.message : String(error);
    const debugMessage = `Mint failed during ${stage}.\n\n${message}`;
    setStatus(debugMessage);
    if (!insideTelegram) window.alert(debugMessage);
  } finally {
    if (insideTelegram) {
      showMintResult(outcome === "success");
    } else {
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
    }
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

// --- Access gate (Telegram miniapp only) ---------------------------------
//
// When the app is launched as a miniapp from a Telegram bot (initData is
// non-empty), the user must be a member of the official channel. Members
// enter directly. Everyone else first confirms being an adult, then asks to
// join the channel; 2 seconds after pressing the button the membership is
// checked again. Outside Telegram (plain browser) nothing of this applies.

const GATE_RECHECK_DELAY_MS = 10000;

function setGate({ text, primary, secondary, note, primaryDisabled = false, onPrimary, onSecondary }) {
  gateNode.hidden = false;
  gateText.textContent = text || "";
  gatePrimary.hidden = !primary;
  gatePrimary.textContent = primary || "";
  gatePrimary.disabled = primaryDisabled;
  gatePrimary.onclick = onPrimary || null;
  gateSecondary.hidden = !secondary;
  gateSecondary.textContent = secondary || "";
  gateSecondary.onclick = onSecondary || null;
  gateNote.hidden = !note;
  gateNote.textContent = note || "";
}

// Asks the server (which validates Telegram's signed initData) whether this
// Telegram user is currently a member of the channel.
async function fetchChannelMembership(tg) {
  const response = await fetch("/api/channel-access", {
    cache: "no-store",
    headers: { authorization: `tma ${tg.initData}` },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || typeof payload?.member !== "boolean") throw new Error("membership check failed");
  return payload.member;
}

// Asks the server to send the "you've been accepted" message (with an
// "Open Miniapp" button) in the user's private chat with the bot. Best
// effort: the app doesn't wait for it and ignores failures.
function sendWelcomeMessage(tg) {
  fetch("/api/welcome-message", {
    method: "POST",
    cache: "no-store",
    headers: { authorization: `tma ${tg.initData}` },
  }).catch(() => {});
}

function openChannelInvite(tg) {
  if (typeof tg.openTelegramLink === "function") tg.openTelegramLink(channelInviteLink);
  else window.open(channelInviteLink, "_blank", "noopener");
}

function unlockApp() {
  gateNode.hidden = true;
}

function showGateError(tg) {
  setGate({
    text: "Unable to verify access. Please try again.",
    primary: "Try again",
    onPrimary: () => runAccessGate(tg),
  });
}

const JOIN_TEXT = "To continue you need to be a member of the official Cleo and Leo channel.";

function showJoinStep(tg, note = "") {
  setGate({
    text: JOIN_TEXT,
    primary: "REQUEST ACCESS TO CONTINUE",
    note,
    onPrimary: async () => {
      setGate({ text: JOIN_TEXT, primary: "Checking...", primaryDisabled: true });
      openChannelInvite(tg);
      await new Promise((resolve) => setTimeout(resolve, GATE_RECHECK_DELAY_MS));
      try {
        if (await fetchChannelMembership(tg)) {
          sendWelcomeMessage(tg);
          unlockApp();
        } else {
          showJoinStep(tg, "Wait to be accepted and come back later.");
        }
      } catch {
        showGateError(tg);
      }
    },
  });
}

function showAgeStep(tg) {
  setGate({
    text: "This app contains explicit adult content. Are you at least 18 years old?",
    primary: "Yes, I'm at least 18",
    secondary: "No",
    onPrimary: () => {
      showJoinStep(tg);
    },
    onSecondary: () => {
      setGate({ text: "Access is only allowed to adults." });
      if (typeof tg.close === "function") setTimeout(() => tg.close(), 1500);
    },
  });
}

async function runAccessGate(tg) {
  setGate({ text: "Checking..." });
  let member;
  try {
    member = await fetchChannelMembership(tg);
  } catch {
    showGateError(tg);
    return;
  }
  if (member) unlockApp();
  else showAgeStep(tg);
}

function initTelegram() {
  const tg = window.Telegram?.WebApp;
  if (!tg) return;
  tg.ready();
  tg.expand();
  // Non-empty initData = really launched from Telegram (in a normal
  // browser the SDK loads too, but initData is empty).
  insideTelegram = Boolean(tg.initData);
  if (insideTelegram) {
    // Developer-only affordance, not meant for end users inside Telegram.
    // Stays hidden (it's hidden by default in the markup already).
    runAccessGate(tg);
  } else {
    authStatusButton.hidden = false;
  }
}

function initWallet() {
  tonConnectUI = new window.TON_CONNECT_UI.TonConnectUI({
    manifestUrl: new URL("/tonconnect-manifest.json", window.location.href).toString(),
  });
  tonConnectUI.onStatusChange((wallet) => setWalletState(wallet));
  tonConnectUI.connectionRestored.then(() => setWalletState(tonConnectUI.wallet));
  walletButton.addEventListener("click", () => {
    if (state.connected) {
      renderAccountPanel();
      accountModal.hidden = false;
    } else {
      tonConnectUI.openModal();
    }
  });
  accountClose.addEventListener("click", () => {
    accountModal.hidden = true;
  });
  accountModal.addEventListener("click", (event) => {
    if (event.target === accountModal) accountModal.hidden = true;
  });
  accountCopy.addEventListener("click", async () => {
    if (!state.walletAddress) return;
    const ok = await copyToClipboard(formatAddress(state.walletAddress));
    accountCopy.classList.remove("copied", "copy-error");
    accountCopy.classList.add(ok ? "copied" : "copy-error");
    setTimeout(() => accountCopy.classList.remove("copied", "copy-error"), 1500);
  });
  accountDisconnect.addEventListener("click", () => {
    accountModal.hidden = true;
    tonConnectUI.disconnect();
  });
}

window.addEventListener("DOMContentLoaded", () => {
  initTelegram();
  initNav();
  initIntro();
  initWallet();
  loadCollectionInfo();
  loadCatalog();
  loadTonPrice();
  authStatusButton.addEventListener("click", () => checkAuthStatus());
  if (!insideTelegram) checkAuthStatus();
  mintResultClose.addEventListener("click", () => {
    mintResultModal.hidden = true;
  });
  debugCopyButton?.addEventListener("click", () => copyMintReport());
  debugCloseButton?.addEventListener("click", () => {
    debugSection.hidden = true;
  });
  withdrawButton?.addEventListener("click", () => withdrawFunds());
  lightboxClose?.addEventListener("click", () => closeLightbox());
  lightbox?.addEventListener("click", (event) => {
    if (event.target === lightbox) closeLightbox();
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !lightbox.hidden) closeLightbox();
  });
});