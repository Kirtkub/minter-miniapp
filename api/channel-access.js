import { createHmac, timingSafeEqual } from "node:crypto";
import { channelChatId } from "../src/config.js";
import { jsonResponse } from "./_catalog.js";

// Tells whether the Telegram user who opened the miniapp is a member of the
// official channel.
//
// The client sends Telegram's signed `initData` in the Authorization header
// ("tma <initData>"). It is validated here with the bot token (HMAC, as
// documented for Telegram Mini Apps), so the user id can't be forged, and
// then the Bot API's getChatMember is asked about that user.
//
// Requirements (Vercel environment):
//   TELEGRAM_BOT_TOKEN — token of the bot that launches the miniapp; that
//   bot must be an administrator of the channel to be able to read members.

const MAX_INIT_DATA_AGE_SECONDS = 24 * 60 * 60;

function verifyInitData(initData, botToken) {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expected = createHmac("sha256", secretKey).update(dataCheckString).digest();
  const received = Buffer.from(hash, "hex");
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;

  const authDate = Number(params.get("auth_date"));
  if (!Number.isFinite(authDate) || Date.now() / 1000 - authDate > MAX_INIT_DATA_AGE_SECONDS) return null;

  try {
    const user = JSON.parse(params.get("user") || "null");
    return user && Number.isSafeInteger(user.id) ? user : null;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return jsonResponse(res, 405, { error: "Method not allowed" });
  }
  res.setHeader("cache-control", "no-store");

  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!botToken) return jsonResponse(res, 500, { error: "bot_token_not_configured" });

  const authorization = String(req.headers?.authorization || "");
  const initData = authorization.startsWith("tma ") ? authorization.slice(4) : "";
  const user = initData ? verifyInitData(initData, botToken) : null;
  if (!user) return jsonResponse(res, 401, { error: "invalid_init_data" });

  try {
    const url =
      `https://api.telegram.org/bot${botToken}/getChatMember` +
      `?chat_id=${encodeURIComponent(channelChatId)}&user_id=${user.id}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    const payload = await response.json().catch(() => null);

    if (!payload?.ok) {
      // "user not found" just means they have never been in the channel.
      const description = String(payload?.description || "");
      if (/user not found|participant_id_invalid/i.test(description)) {
        return jsonResponse(res, 200, { member: false });
      }
      console.error("channel_access_telegram_error", response.status, description);
      return jsonResponse(res, 502, { error: "telegram_error" });
    }

    const { status, is_member: isMember } = payload.result || {};
    const member =
      status === "creator" ||
      status === "administrator" ||
      status === "member" ||
      (status === "restricted" && isMember === true);
    return jsonResponse(res, 200, { member });
  } catch (error) {
    console.error("channel_access_error", error);
    return jsonResponse(res, 502, { error: "telegram_unreachable" });
  }
}
