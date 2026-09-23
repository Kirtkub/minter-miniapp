import { createPrivateKey, createPublicKey } from "node:crypto";

// Reads the Ed25519 signing key used to authorize mints from the
// AUTHENTICATION_SIGNATURE_PRIVATE_KEY Vercel environment variable.
// Accepts either a PEM-encoded PKCS#8 key or a raw 32/64-byte
// hex/base64-encoded seed (the format @ton/crypto's keyPairFromSeed produces).
export function privateKeyFromEnvironment() {
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

// Derives the Ed25519 public key (as a bigint, matching the on-chain
// AUTHENTICATION_SIGNATURE_PUBLIC_KEY representation) from a Node KeyObject.
export function privateKeyPublicKey(privateKey) {
  const der = createPublicKey(privateKey).export({ format: "der", type: "spki" });
  return BigInt(`0x${der.subarray(-32).toString("hex")}`);
}
