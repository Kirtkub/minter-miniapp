import { Address, beginCell, Cell, storeStateInit } from "@ton/core";
import { sign, keyPairFromSeed, keyPairFromSecretKey, mnemonicToPrivateKey } from "@ton/crypto";
import { APP_RUNTIME } from "@/config";

const SIGNED_MINT_OP = APP_RUNTIME.signedMintOpCode;

export type SignedMintPayload = {
  body: Cell;
  unsigned: Cell;
  signature: Buffer;
  queryId: bigint;
  validUntil: number;
};

function parseSecretKey(raw: string): Buffer {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("AUTHENTICATION_SIGNATURE_PRIVATE_KEY is empty");
  }

  if (trimmed.includes(" ")) {
    throw new Error("MNEMONIC_ASYNC");
  }

  if (/^[0-9a-fA-F]+$/.test(trimmed)) {
    const hex = Buffer.from(trimmed, "hex");
    if (hex.length === 32) return keyPairFromSeed(hex).secretKey;
    if (hex.length === 64) return hex;
  }

  try {
    const b64 = Buffer.from(trimmed, "base64");
    if (b64.length === 32) return keyPairFromSeed(b64).secretKey;
    if (b64.length === 64) return b64;
  } catch {
    // fall through
  }

  throw new Error("Unsupported AUTHENTICATION_SIGNATURE_PRIVATE_KEY format");
}

export async function loadMintKeyPair(raw: string) {
  const trimmed = raw.trim();
  if (trimmed.includes(" ")) {
    return mnemonicToPrivateKey(trimmed.split(/\s+/));
  }
  const secretKey = parseSecretKey(trimmed);
  return keyPairFromSecretKey(secretKey);
}

function encodeOffchainContent(uri: string): Cell {
  return beginCell().storeUint(0x01, 8).storeStringTail(uri).endCell();
}

/**
 * Signed mint body (opcode 25), Ed25519 over the hash of the unsigned payload.
 *
 * unsigned:
 *   valid_until:uint64
 *   item_index:uint64
 *   item_value:coins
 *   nft_message:^(owner:MsgAddress content:^Cell)
 *   forward_amount:coins
 *
 * body:
 *   op:uint32 = 25
 *   query_id:uint64
 *   signature:bits512
 *   unsigned
 */
export function buildSignedMintBody(params: {
  secretKey: Buffer;
  owner: Address;
  itemIndex: number;
  metadataUrl: string;
  itemValue: bigint;
  forwardAmount: bigint;
  queryId?: bigint;
  validUntil?: number;
}): SignedMintPayload {
  const queryId = params.queryId ?? BigInt(Date.now());
  const validUntil =
    params.validUntil ??
    Math.floor(Date.now() / 1000) + APP_RUNTIME.signatureTtlSeconds;

  const nftMessage = beginCell()
    .storeAddress(params.owner)
    .storeRef(encodeOffchainContent(params.metadataUrl))
    .endCell();

  const unsigned = beginCell()
    .storeUint(validUntil, 64)
    .storeUint(params.itemIndex, 64)
    .storeCoins(params.itemValue)
    .storeRef(nftMessage)
    .storeCoins(params.forwardAmount)
    .endCell();

  const signature = sign(unsigned.hash(), params.secretKey);

  const body = beginCell()
    .storeUint(SIGNED_MINT_OP, 32)
    .storeUint(queryId, 64)
    .storeBuffer(signature)
    .storeSlice(unsigned.beginParse())
    .endCell();

  return { body, unsigned, signature, queryId, validUntil };
}

export function cellToBase64(cell: Cell): string {
  return cell.toBoc().toString("base64");
}

export function stateInitToBase64(code: Cell, data: Cell): string {
  return beginCell()
    .store(storeStateInit({ code, data }))
    .endCell()
    .toBoc()
    .toString("base64");
}
