import type { NextApiRequest, NextApiResponse } from "next";
import { ALLOWED_PRIVATE_IMAGE_HOST } from "../../config";

function isAllowedUrl(raw: string): URL | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return null;
    if (url.hostname !== ALLOWED_PRIVATE_IMAGE_HOST) return null;
    return url;
  } catch {
    return null;
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed. Use GET." });
  }

  const { url } = req.query;
  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "Missing required 'url' query parameter." });
  }

  const target = isAllowedUrl(url);
  if (!target) {
    return res.status(400).json({
      error: `Only https URLs on ${ALLOWED_PRIVATE_IMAGE_HOST} may be proxied.`
    });
  }

  const secret = process.env.NETLIFY_PRIVATE_SECRET;
  if (!secret) {
    console.error("NETLIFY_PRIVATE_SECRET is not configured.");
    return res.status(500).json({ error: "Server misconfiguration." });
  }

  try {
    const upstream = await fetch(target.toString(), {
      headers: { Authorization: `Bearer ${secret}` }
    });

    if (!upstream.ok) {
      return res
        .status(upstream.status)
        .json({ error: `Upstream image fetch failed: ${upstream.status}` });
    }

    const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";
    const arrayBuffer = await upstream.arrayBuffer();

    res.setHeader("Content-Type", contentType);
    // Private, per-user gated content: cache briefly at the edge/browser only.
    res.setHeader("Cache-Control", "private, max-age=300");
    return res.status(200).send(Buffer.from(arrayBuffer));
  } catch (err) {
    console.error("private-image-proxy failed:", err);
    return res.status(502).json({ error: "Failed to proxy private image." });
  }
}
