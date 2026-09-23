import { jsonResponse, loadCatalog } from "./_catalog.js";
import { nftsMetadataIndex } from "../src/config.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return jsonResponse(res, 405, { error: "Method not allowed" });
  }

  try {
    const requestedIndex = new URL(req.url || "/", "http://localhost").searchParams.get("metadataIndex");
    if (requestedIndex && requestedIndex !== nftsMetadataIndex) {
      return jsonResponse(res, 400, { error: "Metadata source does not match configuration" });
    }
    return jsonResponse(res, 200, { items: await loadCatalog() });
  } catch (error) {
    console.error("catalog_error", error);
    return jsonResponse(res, 502, { error: "Unable to load minting availability" });
  }
}