import { collectionMetadata } from "../src/config.js";
import { fetchJsonCached, jsonResponse } from "./_catalog.js";

// Returns the collection's display name, read from the collection metadata
// JSON (TEP-64 `name`). Fetched server-side because the metadata host does
// not expose browser CORS headers.
export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return jsonResponse(res, 405, { error: "Method not allowed" });
  }

  try {
    const metadata = await fetchJsonCached(collectionMetadata, 5 * 60 * 1000);
    const name = metadata && typeof metadata.name === "string" ? metadata.name.trim() : "";
    if (!name) return jsonResponse(res, 404, { error: "Collection name not found in metadata" });
    res.setHeader("cache-control", "public, max-age=60, s-maxage=300");
    return jsonResponse(res, 200, { name });
  } catch (error) {
    console.error("collection_info_error", error);
    return jsonResponse(res, 502, { error: "Unable to load collection info" });
  }
}
