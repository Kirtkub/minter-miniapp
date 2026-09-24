import { Address } from "@ton/core";
import { collectionAddress } from "../src/config.js";
import { fetchJsonCached, getItemNftData, jsonResponse } from "./_catalog.js";

// Proxies the "privateImage" referenced by an NFT's metadata, but only
// after independently verifying on-chain — right now, not from any cached
// or client-supplied claim — that `owner` is the NFT's current owner.
//
// The privateImage itself lives behind a bearer secret (NETLIFY_PRIVATE_SECRET)
// on the metadata host, so it is never reachable directly from the browser;
// this function is the only thing that holds that secret and only forwards
// the bytes once ownership has been checked for this exact request.
//
// Note on scope: this trusts the `owner` wallet address supplied by the
// client the same way the rest of this app does (e.g. the mint flow trusts
// the connected wallet address reported by TonConnect) — there is no
// wallet-signature ("ton_proof") session here. That means access is
// correctly restricted to whoever the NFT is actually owned by on-chain,
// but is not cryptographically bound to a proven wallet signature. Adding
// TonConnect's ton_proof flow would close that last gap if ever needed.
export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return jsonResponse(res, 405, { error: "Method not allowed" });
  }

  const secret = process.env.NETLIFY_PRIVATE_SECRET;
  if (!secret) {
    return jsonResponse(res, 500, { error: "NETLIFY_PRIVATE_SECRET is not configured" });
  }

  let itemAddress;
  let ownerAddress;
  try {
    const params = new URL(req.url || "/", "http://localhost").searchParams;
    itemAddress = Address.parse(String(params.get("item")));
    ownerAddress = Address.parse(String(params.get("owner")));
  } catch {
    return jsonResponse(res, 400, { error: "Invalid item or owner address" });
  }

  try {
    const data = await getItemNftData(itemAddress.toString());
    if (
      !data.inited ||
      !data.contentUrl ||
      !data.collection.equals(Address.parse(collectionAddress)) ||
      !data.owner.equals(ownerAddress)
    ) {
      return jsonResponse(res, 403, { error: "not_owner" });
    }

    const metadata = await fetchJsonCached(data.contentUrl);
    const privateImageUrl = metadata && typeof metadata.privateImage === "string" ? metadata.privateImage : null;
    if (!privateImageUrl) {
      return jsonResponse(res, 404, { error: "No private image configured for this NFT" });
    }

    const upstream = await fetch(privateImageUrl, {
      headers: { authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!upstream.ok) {
      console.error("private_image_upstream_error", privateImageUrl, upstream.status);
      return jsonResponse(res, 502, { error: "Unable to fetch the revealed image" });
    }

    const buffer = Buffer.from(await upstream.arrayBuffer());
    res.setHeader("content-type", upstream.headers.get("content-type") || "image/jpeg");
    // Owner-specific and re-checked on every request — never cache this
    // response anywhere shared (proxies/CDNs), and keep browser caching
    // short so a resale is reflected quickly.
    res.setHeader("cache-control", "private, max-age=60, must-revalidate");
    res.status(200).send(buffer);
  } catch (error) {
    console.error("private_image_error", error);
    return jsonResponse(res, 502, { error: "Unable to verify ownership or load the image" });
  }
}
