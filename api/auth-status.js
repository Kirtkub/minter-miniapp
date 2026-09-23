import { collectionAddress, tonChain } from "../src/config.js";
import { privateKeyFromEnvironment, privateKeyPublicKey } from "./_auth.js";
import { getAuthPublicKey, isContractActive, jsonResponse } from "./_catalog.js";

// Reports whether the mint app is correctly wired up:
//  1. the collection contract (`collectionAddress`, on `tonChain`) is
//     deployed and active on-chain;
//  2. AUTHENTICATION_SIGNATURE_PRIVATE_KEY (Vercel env var) is configured
//     and its public key matches the AUTHENTICATION_SIGNATURE_PUBLIC_KEY
//     stored in that deployed contract, i.e. this backend is able to
//     authorize mints for it.
// Never returns the actual key material — only booleans.
export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return jsonResponse(res, 405, { error: "Method not allowed" });
  }

  const status = {
    network: tonChain,
    collectionAddress,
    deployed: false,
    keyConfigured: false,
    keyMatches: false,
    authorized: false,
  };

  try {
    status.deployed = await isContractActive();
  } catch (error) {
    console.error("auth_status_chain_check_failed", error);
    return jsonResponse(res, 200, { ...status, error: "chain_unreachable" });
  }

  if (!status.deployed) {
    return jsonResponse(res, 200, { ...status, error: "collection_not_deployed" });
  }

  let privateKey;
  try {
    privateKey = privateKeyFromEnvironment();
    status.keyConfigured = true;
  } catch (error) {
    return jsonResponse(res, 200, { ...status, error: "key_not_configured" });
  }

  try {
    const configuredPublicKey = privateKeyPublicKey(privateKey);
    const deployedPublicKey = await getAuthPublicKey();
    status.keyMatches = configuredPublicKey === deployedPublicKey;
  } catch (error) {
    console.error("auth_status_key_check_failed", error);
    return jsonResponse(res, 200, { ...status, error: "chain_unreachable" });
  }

  status.authorized = status.deployed && status.keyConfigured && status.keyMatches;
  return jsonResponse(res, 200, status.authorized ? status : { ...status, error: "key_mismatch" });
}
