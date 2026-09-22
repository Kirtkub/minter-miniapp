import { beginCell, Address, toNano } from "@ton/core";
import type { SendTransactionRequest } from "@tonconnect/ui-react";
import { APP_CONFIG, MINT_GAS_RESERVE_TON } from "../config";
import type { GenerateMintSignatureResponse } from "../types";

/** op-code for the collection's authorized-mint entrypoint. Adjust to match
 *  the deployed contract's ABI. */
const OP_AUTHORIZED_MINT = 0x4d494e54; // "MINT" — placeholder, align with contract

/**
 * Builds the message body forwarded to the collection contract. Must mirror
 * buildMintAuthorizationCell() in lib/signature.ts on the server, since the
 * contract will re-derive/verify the signed message from these same fields.
 */
function buildMintBody(params: {
  itemIndex: number;
  walletAddress: string;
  payloadBase64: string;
  signatureBase64: string;
  expiresAt: number;
}) {
  return beginCell()
    .storeUint(OP_AUTHORIZED_MINT, 32) // op
    .storeUint(0, 64) // query_id
    .storeUint(params.itemIndex, 64)
    .storeAddress(Address.parse(params.walletAddress))
    .storeUint(params.expiresAt, 32)
    .storeBuffer(Buffer.from(params.signatureBase64, "base64")) // 64-byte ed25519 signature
    .endCell();
}

export interface BuildMintTxParams {
  itemIndex: number;
  walletAddress: string;
  mintingPriceTon: number;
  authorization: GenerateMintSignatureResponse;
}

/**
 * Constructs a TonConnect `SendTransactionRequest` that pays mintingPrice +
 * gas reserve to the collection contract, with the signed authorization
 * attached as the message body.
 */
export function buildMintTransaction(
  params: BuildMintTxParams
): SendTransactionRequest {
  const body = buildMintBody({
    itemIndex: params.itemIndex,
    walletAddress: params.walletAddress,
    payloadBase64: params.authorization.payloadBase64,
    signatureBase64: params.authorization.signatureBase64,
    expiresAt: params.authorization.expiresAt
  });

  const totalTon = params.mintingPriceTon + MINT_GAS_RESERVE_TON;

  return {
    validUntil: Math.floor(Date.now() / 1000) + 300, // 5 minute validity window
    messages: [
      {
        address: APP_CONFIG.collectionAddress,
        amount: toNano(totalTon.toFixed(9)).toString(),
        payload: body.toBoc().toString("base64")
      }
    ]
  };
}
