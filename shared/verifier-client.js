// Browser-side helpers for TON Sources Registry verification. Shared by both
// bundles (the mint app at "/" and the collection-deploy tool at
// "/deploycollection") so the two "Verify & Publish Source Code" flows stay
// in sync.
//
// What this does, for real:
// 1. Computes the exact on-chain "code cell hash" of a compiled contract
//    (the same hash TEP-91 / the Sources Registry index sources by), from
//    the .code.boc that was actually deployed.
// 2. Asks the *official* registry (via @ton-community/contract-verifier-sdk,
//    the same library verifier.ton.org itself uses) whether that hash
//    already has a published, verified source — this is real on-chain/IPFS
//    state, never a local flag.
// 3. Drives the publish flow: our own /api/verify-source endpoint asks the
//    public TON Sources Registry verifier backend to recompile the exact
//    FunC this project deployed and, if it matches, hands back a signed
//    message; this module relays that message through the connected wallet
//    (TonConnect pays the gas and signs — it never sees or needs the
//    verifier's private key, which stays with the verifier service).
import { Cell } from "@ton/core";
import { ContractVerifier } from "@ton-community/contract-verifier-sdk";

export function codeCellHashBase64(codeBocBytes) {
  return Cell.fromBoc(Buffer.from(codeBocBytes))[0].hash().toString("base64");
}

export async function isSourceVerified(hashBase64, testnet) {
  try {
    const url = await ContractVerifier.getSourcesJsonUrl(hashBase64, { testnet });
    return Boolean(url);
  } catch (err) {
    // Registry unreachable/empty for this hash: treat as "not verified yet"
    // rather than failing the whole flow.
    console.error("sources_registry_check_failed", err);
    return false;
  }
}

export async function pollUntilVerified(hashBase64, testnet, { attempts = 20, delayMs = 3000 } = {}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await isSourceVerified(hashBase64, testnet)) return true;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return false;
}

// Asks our backend to compile+sign the proof and hands back everything
// needed to relay it on-chain via TonConnect.
export async function requestVerificationSubmission(role) {
  const response = await fetch("/api/verify-source", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ role }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || "Verification request failed");
  }
  return data;
}
