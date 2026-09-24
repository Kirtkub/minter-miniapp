import { jsonResponse } from "./_catalog.js";

// "GRAM" is just testnet's display name for the native TON coin (the project
// was literally called Gram before its 2020 rename to TON) — same asset, so
// pricing it against TON/USD is correct.
const COINGECKO_URL = "https://api.coingecko.com/api/v3/simple/price?ids=the-open-network&vs_currencies=usd";
const CACHE_TTL_MS = 5 * 60 * 1000;
let cache = { usd: null, expiresAt: 0 };

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return jsonResponse(res, 405, { error: "Method not allowed" });
  }

  if (cache.usd && cache.expiresAt > Date.now()) {
    return jsonResponse(res, 200, { usd: cache.usd });
  }

  try {
    const response = await fetch(COINGECKO_URL, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`CoinGecko request failed with ${response.status}`);
    const payload = await response.json();
    const usd = Number(payload?.["the-open-network"]?.usd);
    if (!Number.isFinite(usd) || usd <= 0) throw new Error("Unexpected CoinGecko response shape");

    cache = { usd, expiresAt: Date.now() + CACHE_TTL_MS };
    return jsonResponse(res, 200, { usd });
  } catch (error) {
    console.error("ton_price_error", error);
    // Prefer a stale cached price over nothing — the UI just hides the USD
    // figure if this endpoint is unreachable and there's no cache yet.
    if (cache.usd) return jsonResponse(res, 200, { usd: cache.usd, stale: true });
    return jsonResponse(res, 502, { error: "Unable to fetch TON price" });
  }
}
