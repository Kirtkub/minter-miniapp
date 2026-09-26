import fs from "node:fs";
import path from "node:path";
import { Address, Cell } from "@ton/core";
import { ContractVerifier } from "@ton-community/contract-verifier-sdk";
import { collectionAddress, tonChain } from "../src/config.js";
import { getNftAddressByIndex, jsonResponse } from "./_catalog.js";

const IS_TESTNET = tonChain === "Testnet";
const CONTRACTS_DIR = path.join(process.cwd(), "deploy-collection", "contracts");
const OUTPUT_DIR = path.join(CONTRACTS_DIR, "output");

// The FunC compiler version that produced the currently-deployed bytecode.
// Both contracts are written in Tact (see deploy-collection/contracts/*.tact)
// and compiled to FunC, then to TVM bytecode, by `npm run compile:contracts`
// (@tact-lang/compiler). The TON Sources Registry's public verifier backend
// only re-compiles FunC (it has no Tact front-end of its own), so what we
// submit for independent recompilation is the *exact* generated FunC file
// that this project's build produced — the same one that was actually
// deployed — never a hand-written approximation. Its pinned FunC version is
// stamped by the compiler itself as the first line of every generated .fc
// file ("#pragma version ="); keep this constant in sync if that ever
// changes (e.g. after bumping @tact-lang/compiler).
const FUNC_VERSION = "0.4.6";

// Base URL of the public TON Sources Registry verifier backend — the same
// service the verifier.ton.org web app talks to (see
// https://github.com/ton-community/contract-verifier-backend). Overridable
// via env vars in case the hosted URL or the testnet counterpart changes.
const BACKEND_BASE =
  (IS_TESTNET ? process.env.VERIFIER_BACKEND_URL_TESTNET : process.env.VERIFIER_BACKEND_URL_MAINNET) ||
  (IS_TESTNET ? "https://verifier-testnet.ton.org" : "https://verifier-backend.ton.org");
const VERIFIER_ID = process.env.VERIFIER_ID || "orbs.com";

const ROLE_CONFIG = {
  collection: {
    fcFile: "NftCollection_NftCollection.fc",
    bocFile: "NftCollection_NftCollection.code.boc",
    tactFiles: ["nft_collection.tact", "messages.tact", "nft_item.tact"],
    contractName: "NftCollection",
  },
  item: {
    fcFile: "NftCollection_NftItem.fc",
    bocFile: "NftCollection_NftItem.code.boc",
    tactFiles: ["nft_item.tact", "messages.tact"],
    contractName: "NftItem",
  },
};

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

function readFile(...segments) {
  return fs.readFileSync(path.join(...segments), "utf8");
}

function codeCellHashBase64(role) {
  const boc = fs.readFileSync(path.join(OUTPUT_DIR, ROLE_CONFIG[role].bocFile));
  return Cell.fromBoc(boc)[0].hash().toString("base64");
}

// Resolves the address of the contract this request is about straight from
// chain state — never trusted from client input:
// - the collection: the single, statically-configured collection address.
// - an NFT item: specifically item #0, via the collection's own
//   get_nft_address_by_index() getter (TEP-62), which is what "the first
//   NFT of the collection" means on-chain.
async function resolveContractAddress(role) {
  if (role === "collection") return Address.parse(collectionAddress).toString({ testOnly: IS_TESTNET });
  const address = await getNftAddressByIndex(0);
  return address.toString({ testOnly: IS_TESTNET });
}

async function alreadyVerified(role) {
  try {
    const url = await ContractVerifier.getSourcesJsonUrl(codeCellHashBase64(role), {
      testnet: IS_TESTNET,
    });
    return Boolean(url);
  } catch (error) {
    console.error("registry_check_failed", role, error);
    return false; // Unknown state must never block a genuine verification attempt.
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return jsonResponse(res, 405, { error: "Method not allowed" });
  }

  try {
    const body = await readRequestBody(req);
    const role = body.role === "item" || body.role === "collection" ? body.role : null;
    if (!role) return jsonResponse(res, 400, { error: 'role must be "collection" or "item"' });

    if (await alreadyVerified(role)) {
      return jsonResponse(res, 200, { alreadyVerified: true });
    }

    const contractAddress = await resolveContractAddress(role);
    const config = ROLE_CONFIG[role];
    const funcSource = readFile(OUTPUT_DIR, config.fcFile);
    const tactSources = config.tactFiles.map((name) => ({
      name,
      content: readFile(CONTRACTS_DIR, name),
    }));

    // Ask the official backend to independently recompile this exact FunC
    // file with the FunC version that produced the deployed bytecode, check
    // the resulting code hash against `contractAddress`, and — only if it
    // matches — sign a proof for the on-chain Sources Registry. We never
    // fabricate that signature ourselves: it must come from the verifier.
    const backendResponse = await fetch(`${BACKEND_BASE}/source`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: AbortSignal.timeout(45000),
      body: JSON.stringify({
        senderAddress: contractAddress,
        knownContractAddress: contractAddress,
        knownContractHash: codeCellHashBase64(role),
        compiler: "func",
        compilerSettings: { funcVersion: FUNC_VERSION, commandLine: "" },
        sourceFiles: [{ name: config.fcFile, content: funcSource }],
        // Included so the published sources.json is human-readable on
        // verifier.ton.org / tonviewer.com alongside the compiled FunC.
        tactSourceFiles: tactSources,
        verifierId: VERIFIER_ID,
      }),
    });

    const payload = await backendResponse.json().catch(() => null);
    if (!backendResponse.ok || !payload) {
      console.error("verifier_backend_error", role, backendResponse.status, payload);
      return jsonResponse(res, 502, {
        error:
          "The TON Sources Registry verifier service did not accept the request. You can still " +
          "verify manually at https://verifier.ton.org using the files in deploy-collection/contracts/.",
      });
    }
    if (payload.compileResult?.result && payload.compileResult.result !== "similar") {
      return jsonResponse(res, 422, {
        error: "The independently recompiled code does not match the deployed contract's bytecode.",
      });
    }

    const payloadBase64 = payload.messageCell || payload.message || payload.boc;
    if (!payloadBase64) {
      return jsonResponse(res, 502, { error: "Verifier backend returned no signed message to publish." });
    }

    return jsonResponse(res, 200, {
      alreadyVerified: false,
      contractAddress,
      toAddress: payload.sourcesRegistryAddress || payload.to || contractAddress,
      // 0.1 TON fallback gas if the backend's response doesn't specify an
      // amount for the registry transaction; comfortably covers it on both
      // networks.
      amountNanoTon: String(payload.amount ?? "100000000"),
      payloadBase64,
    });
  } catch (error) {
    console.error("verify_source_error", error);
    return jsonResponse(res, 502, { error: "Unable to reach the TON Sources Registry service." });
  }
}
