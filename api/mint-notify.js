import { Address } from "@ton/core";
import { appUrl, collectionAddress } from "../src/config.js";
import { fetchJsonCached, getItemNftData, getNftAddressByIndex, jsonResponse } from "./_catalog.js";
import { getBotToken, userFromRequest } from "./_telegram.js";

// Sends the "new Spicy Pic" message in the user's private chat with the bot
// right after a successful mint, with the NFT's name, its private (revealed)
// image, and an "Open Miniapp" button. Called by the client right after the
// mint transaction is sent, passing the `itemIndex` handed out by
// /api/sign-mint (preferred — resolved to an address here via the
// collection's get_nft_address_by_index() getter, with no indexer involved)
// or, for older clients, a pre-resolved `itemAddress` directly.
//
// The item's deploy message can still be a few seconds behind the mint
// transaction, so a 403 "not_owner" here just means "not deployed/owned
// yet" — the client is expected to retry with backoff, not treat it as a
// permanent failure.
//
// Ownership of the resolved item by `ownerAddress` is checked on-chain here
// (the same check used by private-image.js) before anything is sent, so
// this can't be used to message an arbitrary Telegram user with an NFT they
// don't hold.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return jsonResponse(res, 405, { error: "Method not allowed" });
  }
  res.setHeader("cache-control", "no-store");

  const botToken = getBotToken();
  if (!botToken) return jsonResponse(res, 500, { error: "bot_token_not_configured" });

  const user = userFromRequest(req, botToken);
  if (!user) return jsonResponse(res, 401, { error: "invalid_init_data" });

  const secret = process.env.NETLIFY_PRIVATE_SECRET;
  if (!secret) return jsonResponse(res, 500, { error: "NETLIFY_PRIVATE_SECRET is not configured" });

  let itemAddress;
  let ownerAddress;
  try {
    const body = req.body && typeof req.body === "object" ? req.body : JSON.parse(await readBody(req));
    ownerAddress = Address.parse(String(body.ownerAddress));
    const hasItemIndex = body.itemIndex !== undefined && body.itemIndex !== null && body.itemIndex !== "";
    itemAddress = hasItemIndex
      ? await getNftAddressByIndex(BigInt(body.itemIndex))
      : Address.parse(String(body.itemAddress));
  } catch {
    return jsonResponse(res, 400, { error: "Invalid item index/address or owner address" });
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
    const name = metadata && typeof metadata.name === "string" ? metadata.name : "NFT";
    const privateImageUrl = metadata && typeof metadata.privateImage === "string" ? metadata.privateImage : null;

    const caption = `You've got a new Spicy Pic added to your collection!\n\n${name}`;
    const replyMarkup = { inline_keyboard: [[{ text: "Open Miniapp", web_app: { url: appUrl } }]] };

    if (privateImageUrl) {
      const upstream = await fetch(privateImageUrl, {
        headers: { authorization: `Bearer ${secret}` },
        signal: AbortSignal.timeout(15000),
      });
      if (!upstream.ok) throw new Error(`Unable to fetch the revealed image (${upstream.status})`);
      const buffer = Buffer.from(await upstream.arrayBuffer());
      const contentType = upstream.headers.get("content-type") || "image/jpeg";

      const form = new FormData();
      form.append("chat_id", String(user.id));
      form.append("caption", caption);
      form.append("reply_markup", JSON.stringify(replyMarkup));
      form.append("photo", new Blob([buffer], { type: contentType }), "nft.jpg");

      const response = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(20000),
      });
      const payload = await response.json().catch(() => null);
      if (!payload?.ok) throw new Error(payload?.description || "sendPhoto failed");
    } else {
      // No private image configured for this NFT: fall back to a plain
      // text message so the user is still notified.
      const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: user.id, text: caption, reply_markup: replyMarkup }),
        signal: AbortSignal.timeout(15000),
      });
      const payload = await response.json().catch(() => null);
      if (!payload?.ok) throw new Error(payload?.description || "sendMessage failed");
    }

    return jsonResponse(res, 200, { sent: true });
  } catch (error) {
    console.error("mint_notify_error", error);
    return jsonResponse(res, 502, { error: "Unable to send the mint notification" });
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 10000) reject(new Error("Request body too large"));
    });
    req.on("end", () => resolve(data || "{}"));
    req.on("error", reject);
  });
}
