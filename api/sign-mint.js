import { createHash, createPrivateKey, createPublicKey, randomBytes, sign } from "node:crypto";
import { Address, beginCell } from "@ton/core";
import { collectionAddress, nftsMetadataIndex, tonChain } from "../src/config.js";
import {
  fetchJson,
  getAuthPublicKey,
  getMintedCount,
  getNextItemIndex,
  jsonResponse,
} from "./_catalog.js";

const MAX_VALIDITY_SECONDS = 5 * 60;
const TON_CENTER_BASE =
  tonChain === "Testnet" ? "https://testnet.toncenter.com" : "https://toncenter.com";

function readRequestBody(req) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 10000) reject(new Error("Request body too large"));
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

function privateKeyFromEnvironment() {
  const raw = process.env.AUTHENTICATION_SIGNATURE_PRIVATE_KEY?.trim();
  if (!raw) throw new Error("AUTHENTICATION_SIGNATURE_PRIVATE_KEY is not configured");

  if (raw.includes("BEGIN")) return createPrivateKey(raw);

  const bytes = /^[0-9a-f]+$/i.test(raw) && raw.length % 2 === 0
    ? Buffer.from(raw, "hex")
    : Buffer.from(raw, "base64");
  if (bytes.length !== 32 && bytes.length !== 64) {
    throw new Error("AUTHENTICATION_SIGNATURE_PRIVATE_KEY must be a 32/64-byte Ed25519 key");
  }

  // @ton/crypto exposes a 64-byte secret key as seed + public key. Node's
  // PKCS#8 Ed25519 private key format contains only the 32-byte seed.
  const seed = bytes.subarray(0, 32);
  const pkcs8 = Buffer.concat([
    Buffer.from("302e020100300506032b657004220420", "hex"),
    seed,
  ]);
  return createPrivateKey({ key: pkcs8, format: "der", type: "pkcs8" });
}

function privateKeyPublicKey(privateKey) {
  const der = createPublicKey(privateKey).export({ format: "der", type: "spki" });
  return BigInt(`0x${der.subarray(-32).toString("hex")}`);
}

function sha256Integer(value) {
  return BigInt(`0x${createHash("sha256").update(value).digest("hex")}`);
}

function signedDataCell({ metadataIndex, contentUrl, newOwner, validUntil, nextItemIndex }) {
  const contentHash = sha256Integer(contentUrl);
  return beginCell()
    .storeUint(BigInt(metadataIndex), 32)
    .storeUint(contentHash, 256)
    .storeAddress(newOwner)
    .storeUint(BigInt(validUntil), 32)
    .storeUint(BigInt(nextItemIndex), 256)
    .endCell();
}

function hashSliceData(cell) {
  const byteLength = Math.ceil(cell.bits.length / 8);
  const data = Buffer.alloc(byteLength);
  for (let bitIndex = 0; bitIndex < cell.bits.length; bitIndex += 1) {
    if (cell.bits.at(bitIndex)) data[bitIndex >> 3] |= 1 << (7 - (bitIndex % 8));
  }
  const paddingBit = cell.bits.length;
  data[paddingBit >> 3] |= 1 << (7 - (paddingBit % 8));
  return createHash("sha256").update(data).digest();
}

function signMint({ metadataIndex, contentUrl, newOwner, validUntil, nextItemIndex, privateKey }) {
  const signedData = signedDataCell({
    metadataIndex,
    contentUrl,
    newOwner,
    validUntil,
    nextItemIndex,
  });
  const digest = hashSliceData(signedData);
  const contractDigest = createHash("sha256").update(digest).digest();
  return sign(null, contractDigest, privateKey).toString("hex");
}

async function getMintingItem(metadataIndex) {
  const index = await fetchJson(nftsMetadataIndex);
  if (!Array.isArray(index) || !Number.isInteger(metadataIndex) || metadataIndex < 0 || metadataIndex >= index.length) {
    throw new Error("Unknown metadata item");
  }
  const contentUrl = index[metadataIndex];
  if (typeof contentUrl !== "string" || !URL.canParse(contentUrl)) throw new Error("Invalid metadata URL");
  const raw = await fetchJson(contentUrl);
  const mintingPrice = Number(raw?.mintingPrice);
  const maxSupply = Number(raw?.maxSupply);
  const start = Date.parse(raw?.mintStartDate);
  const end = Date.parse(raw?.mintEndDate);
  if (
    !Number.isSafeInteger(mintingPrice) ||
    mintingPrice <= 0 ||
    !Number.isSafeInteger(maxSupply) ||
    maxSupply <= 0 ||
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    Date.now() < start ||
    Date.now() > end
  ) {
    throw new Error("This NFT is not available to mint");
  }
  return { contentUrl, mintingPrice, maxSupply };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return jsonResponse(res, 405, { error: "Method not allowed" });
  }

  try {
    const body = await readRequestBody(req);
    const metadataIndex = Number(body.metadataIndex);
    const newOwner = Address.parse(String(body.newOwner));
    const item = await getMintingItem(metadataIndex);
    const minted = Number(await getMintedCount(metadataIndex));
    if (minted >= item.maxSupply) throw new Error("This NFT has reached its maximum supply");

    const nextItemIndex = await getNextItemIndex();
    const privateKey = privateKeyFromEnvironment();
    const configuredPublicKey = privateKeyPublicKey(privateKey);
    const deployedPublicKey = await getAuthPublicKey();
    if (configuredPublicKey !== deployedPublicKey) {
      throw new Error(
        `AUTHENTICATION_SIGNATURE_PRIVATE_KEY does not match collection public key ` +
        `(deployed ${deployedPublicKey.toString(16)}, configured ${configuredPublicKey.toString(16)})`,
      );
    }
    const validUntil = Math.floor(Date.now() / 1000) + MAX_VALIDITY_SECONDS;
    const queryId = randomBytes(8).readBigUInt64BE();
    const signature = signMint({
      metadataIndex,
      contentUrl: item.contentUrl,
      newOwner,
      validUntil,
      nextItemIndex,
      privateKey,
    });

    return jsonResponse(res, 200, {
      collectionAddress,
      queryId: queryId.toString(),
      metadataIndex,
      contentUrl: item.contentUrl,
      mintingPrice: item.mintingPrice,
      validUntil,
      signature,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Mint authorization failed";
    const status = /not available|maximum supply|Unknown metadata|Invalid metadata|configured|key|address/i.test(message)
      ? 400
      : 502;
    console.error("sign_mint_error", message);
    return jsonResponse(res, status, { error: status === 400 ? message : "Unable to authorize mint" });
  }
}