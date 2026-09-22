import nacl from "tweetnacl";
import { Address, beginCell } from "@ton/core";
import { createHash } from "crypto";
import { SIGNATURE_TTL_SECONDS } from "../config";

/**
 * Parses AUTHENTICATION_SIGNATURE_PRIVATE_KEY from the environment.
 * Accepts either:
 *  - a 64-byte hex string (32-byte seed + 32-byte pubkey, tweetnacl secretKey format), or
 *  - a 32-byte hex/base64 seed, from which the full keypair is derived.
 * Never log or return this value.
 */
function loadSigningKeyPair(): nacl.SignKeyPair {
  const raw = process.env.AUTHENTICATION_SIGNATURE_PRIVATE_KEY;
  if (!raw) {
    throw new Error(
      "AUTHENTICATION_SIGNATURE_PRIVATE_KEY is not configured on the server."
    );
  }

  const isHex = /^[0-9a-fA-F]+$/.test(raw.trim());
  const bytes = isHex
    ? Uint8Array.from(Buffer.from(raw.trim(), "hex"))
    : Uint8Array.from(Buffer.from(raw.trim(), "base64"));

  if (bytes.length === 64) {
    // Already a full tweetnacl secret key (seed || pubkey).
    return nacl.sign.keyPair.fromSecretKey(bytes);
  }
  if (bytes.length === 32) {
    return nacl.sign.keyPair.fromSeed(bytes);
  }

  throw new Error(
    `AUTHENTICATION_SIGNATURE_PRIVATE_KEY has unexpected length ${bytes.length} bytes; expected 32 (seed) or 64 (secret key).`
  );
}

let cachedKeyPair: nacl.SignKeyPair | null = null;
function getSigningKeyPair(): nacl.SignKeyPair {
  if (!cachedKeyPair) {
    cachedKeyPair = loadSigningKeyPair();
  }
  return cachedKeyPair;
}

export interface MintAuthorizationInput {
  collectionAddress: string;
  itemIndex: number;
  walletAddress: string;
  metadataUrl: string;
  expiresAt: number; // unix seconds
}

/**
 * Builds the canonical, deterministic message that the on-chain contract's
 * mint entrypoint is expected to verify against `signature`.
 *
 * NOTE: The exact cell layout MUST match the deployed smart contract's
 * `op::authorized_mint` handler. This is a reasonable, explicit reference
 * encoding (collection address + item index + recipient address + sha256
 * of the metadata URL + expiry) — adjust field order/types here if the
 * deployed contract expects a different layout, and keep the client's
 * transaction-building code (lib/mintTransaction.ts) in sync.
 */
export function buildMintAuthorizationCell(input: MintAuthorizationInput) {
  const metadataHash = createHash("sha256")
    .update(input.metadataUrl)
    .digest();

  return beginCell()
    .storeAddress(Address.parse(input.collectionAddress))
    .storeUint(input.itemIndex, 64)
    .storeAddress(Address.parse(input.walletAddress))
    .storeBuffer(metadataHash) // 32 bytes
    .storeUint(input.expiresAt, 32)
    .endCell();
}

export interface MintAuthorization {
  signatureBase64: string;
  payloadBase64: string;
  expiresAt: number;
  publicKeyHex: string;
}

/**
 * Signs a mint authorization for (collection, itemIndex, walletAddress,
 * metadataUrl) that is valid for SIGNATURE_TTL_SECONDS from now.
 */
export function signMintAuthorization(
  collectionAddress: string,
  itemIndex: number,
  walletAddress: string,
  metadataUrl: string
): MintAuthorization {
  const keyPair = getSigningKeyPair();
  const expiresAt = Math.floor(Date.now() / 1000) + SIGNATURE_TTL_SECONDS;

  const cell = buildMintAuthorizationCell({
    collectionAddress,
    itemIndex,
    walletAddress,
    metadataUrl,
    expiresAt
  });

  const message = cell.hash(); // 32-byte cell hash, standard TON signing target
  const signature = nacl.sign.detached(message, keyPair.secretKey);

  return {
    signatureBase64: Buffer.from(signature).toString("base64"),
    payloadBase64: cell.toBoc().toString("base64"),
    expiresAt,
    publicKeyHex: Buffer.from(keyPair.publicKey).toString("hex")
  };
}
