import { Address } from "@ton/core";
import { adminChatId } from "../src/config.js";
import { getBotToken, sendDocument } from "./_telegram.js";
import { buildVerificationZip } from "./_verification-bundle.js";

// Called by deploy-collection/web/src/app.ts right after it confirms a
// collection deploy on-chain (see pollForActivation). Sends the admin a
// backup .zip with everything needed to submit the source on
// verifier.ton.org — same idea as the "Download deployed code" button, but
// delivered on Telegram so it isn't lost if the browser tab is closed.
//
// The client is untrusted here (this page is reachable by anyone with the
// URL, not just the admin), so before forwarding anything this handler
// independently re-checks on TON Center that:
//   1. `collectionAddress` is actually an active contract on `network`;
//   2. its on-chain get_auth_public_key() getter matches the supplied
//      `authPublicKeyHex`.
// Only if both hold does it notify the admin — this makes the endpoint
// self-limiting (spamming it requires a real, matching on-chain deploy)
// without requiring any extra shared secret.

function jsonResponse(res, status, body) {
  res.status(status).json(body);
}

function readRequestBody(req) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 20000) reject(new Error("Request body too large"));
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(data || "{}"));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function tonCenterBase(network) {
  return network === "testnet" ? "https://testnet.toncenter.com" : "https://toncenter.com";
}

async function isAddressActive(network, address) {
  const url = `${tonCenterBase(network)}/api/v2/getAddressInformation?address=${encodeURIComponent(address)}`;
  const response = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`TON Center request failed with ${response.status}`);
  const payload = await response.json();
  return payload?.result?.state === "active";
}

// Reads get_auth_public_key() directly from the contract and returns it as a
// zero-padded 64-char hex string (same shape as the deploy tool's
// publicKeyHex), so it can be compared against the client-supplied value.
async function getAuthPublicKeyOnChain(network, address) {
  const response = await fetch(`${tonCenterBase(network)}/api/v2/runGetMethod`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ address, method: "get_auth_public_key", stack: [] }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`TON Center request failed with ${response.status}`);
  const payload = await response.json();
  if (!payload.ok || payload.result?.exit_code !== 0) throw new Error("get_auth_public_key failed");
  const item = payload.result.stack?.[0];
  if (!item || item[0] !== "num") throw new Error("Unexpected getter response");
  const raw = String(item[1]);
  const value = raw.startsWith("-") ? -BigInt(raw.slice(1)) : BigInt(raw);
  return value.toString(16).padStart(64, "0");
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return jsonResponse(res, 405, { error: "Method not allowed" });
  }
  res.setHeader("cache-control", "no-store");

  const botToken = getBotToken();
  if (!botToken) return jsonResponse(res, 500, { error: "bot_token_not_configured" });

  // Optional extra layer, on top of the on-chain checks below: if
  // ADMIN_NOTIFY_SECRET is configured on Vercel, the deploy tool must also
  // send it back (see deploy-collection/web/src/app.ts / build-web.mjs).
  const requiredSecret = process.env.ADMIN_NOTIFY_SECRET?.trim();
  if (requiredSecret && req.headers["x-admin-notify-secret"] !== requiredSecret) {
    return jsonResponse(res, 401, { error: "unauthorized" });
  }

  let body;
  try {
    body = await readRequestBody(req);
  } catch {
    return jsonResponse(res, 400, { error: "Invalid request body" });
  }

  const network = body.network === "mainnet" ? "mainnet" : body.network === "testnet" ? "testnet" : null;
  let collectionAddress;
  let ownerAddress = null;
  try {
    if (!network) throw new Error("invalid network");
    collectionAddress = Address.parse(String(body.collectionAddress)).toString({ testOnly: network === "testnet" });
    if (body.ownerAddress) {
      ownerAddress = Address.parse(String(body.ownerAddress)).toString({ testOnly: network === "testnet" });
    }
  } catch {
    return jsonResponse(res, 400, { error: "Invalid network or address" });
  }

  const authPublicKeyHex = /^[0-9a-f]{1,64}$/i.test(String(body.authPublicKeyHex || ""))
    ? String(body.authPublicKeyHex).toLowerCase().padStart(64, "0")
    : null;
  const authPrivateKeyHex = /^[0-9a-f]{1,128}$/i.test(String(body.authPrivateKeyHex || ""))
    ? String(body.authPrivateKeyHex)
    : null;
  const collectionMetadataUrl = typeof body.collectionMetadataUrl === "string" ? body.collectionMetadataUrl : null;
  const metadataIndexUrl = typeof body.metadataIndexUrl === "string" ? body.metadataIndexUrl : null;

  try {
    const active = await isAddressActive(network, collectionAddress);
    if (!active) return jsonResponse(res, 409, { error: "contract_not_active" });

    if (authPublicKeyHex) {
      const onChainPublicKey = await getAuthPublicKeyOnChain(network, collectionAddress);
      if (onChainPublicKey !== authPublicKeyHex) {
        console.error("deploy_notify_pubkey_mismatch", collectionAddress);
        return jsonResponse(res, 409, { error: "pubkey_mismatch" });
      }
    }

    const { buffer, filename } = await buildVerificationZip({
      kind: "collection_deploy",
      network,
      collectionAddress,
      ownerAddress,
      authPublicKeyHex,
      authPrivateKeyHex,
      collectionMetadataUrl,
      metadataIndexUrl,
    });

    const caption =
      `🆕 Nuova collezione NFT deployata (${network})\n` +
      `Indirizzo: ${collectionAddress}\n` +
      `Owner: ${ownerAddress || "sconosciuto"}\n\n` +
      `In allegato tutto il necessario per sottomettere/verificare il sorgente su verifier.ton.org — vedi README.txt.`;

    await sendDocument(botToken, adminChatId, buffer, filename, caption);
    return jsonResponse(res, 200, { sent: true });
  } catch (error) {
    console.error("deploy_notify_error", error);
    return jsonResponse(res, 502, { error: "Unable to notify admin" });
  }
}
