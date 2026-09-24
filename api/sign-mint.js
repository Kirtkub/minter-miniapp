import { createHash, randomBytes, sign } from "node:crypto";
import { Address, beginCell } from "@ton/core";
import { collectionAddress, nftsMetadataIndex, tonChain } from "../src/config.js";
import { privateKeyFromEnvironment, privateKeyPublicKey } from "./_auth.js";
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

function sha256Integer(value) {
  return BigInt(`0x${createHash("sha256").update(value).digest("hex")}`);
}

function signedDataCell({ metadataIndex, contentUrl, newOwner, validUntil, nextItemIndex }) {
  const contentHash = sha256Integer(contentUrl);
  // Must mirror nft_collection.tact's Mint receiver exactly, including the 5-bit
  // padding added there to make the slice byte-aligned (843 -> 848 bits) so that
  // sha256(Slice)/HASHEXT_SHA256 doesn't throw on-chain.
  return beginCell()
    .storeUint(BigInt(metadataIndex), 32)
    .storeUint(contentHash, 256)
    .storeAddress(newOwner)
    .storeUint(BigInt(validUntil), 32)
    .storeUint(BigInt(nextItemIndex), 256)
    .storeUint(0, 5)
    .endCell();
}

// Replicates TVM's HASHEXT_SHA256 (what Tact's sha256(Slice) compiles to): a
// plain SHA-256 over the slice's raw data bits, packed most-significant-bit
// first into bytes. Unlike the "standard cell hash" (HASHCU/HASHSU), there is
// no completion tag / padding bit — the bit length must already be a multiple
// of 8, or the real opcode throws a cell-underflow exception on-chain.
function hashSliceData(cell) {
  if (cell.bits.length % 8 !== 0) {
    throw new Error(
      `signedData is ${cell.bits.length} bits, not byte-aligned; sha256(Slice) would throw on-chain`,
    );
  }
  const byteLength = cell.bits.length / 8;
  const data = Buffer.alloc(byteLength);
  for (let bitIndex = 0; bitIndex < cell.bits.length; bitIndex += 1) {
    if (cell.bits.at(bitIndex)) data[bitIndex >> 3] |= 1 << (7 - (bitIndex % 8));
  }
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
  // checkSignature() on-chain (CHKSIGNU) verifies the Ed25519 signature directly
  // against `digest` (= sha256(signedData.asSlice())) with no further hashing, so
  // we must sign `digest` as-is rather than hashing it again before signing.
  return sign(null, digest, privateKey).toString("hex");
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
    !Number.isFinite(mintingPrice) ||
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