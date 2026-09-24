import { createHmac, timingSafeEqual } from "node:crypto";
import { channelChatId } from "../src/config.js";

// Shared Telegram helpers for the access gate.
//
// Requirements (Vercel environment):
//   TELEGRAM_BOT_TOKEN — token of the bot that launches the miniapp; that
//   bot must be an administrator of the channel to be able to read members.

const MAX_INIT_DATA_AGE_SECONDS = 24 * 60 * 60;

export function getBotToken() {
  return process.env.TELEGRAM_BOT_TOKEN?.trim() || null;
}

// Validates Telegram's signed miniapp `initData` (HMAC with the bot token, as
// documented for Telegram Mini Apps) and returns the Telegram user, or null.
export function verifyInitData(initData, botToken) {
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

// Reads the Telegram user from a request's "Authorization: tma <initData>".
export function userFromRequest(req, botToken) {
  const authorization = String(req.headers?.authorization || "");
  const initData = authorization.startsWith("tma ") ? authorization.slice(4) : "";
  return initData ? verifyInitData(initData, botToken) : null;
}

// true/false whether the user is currently a member of the channel.
// Throws if Telegram can't be reached or answers with an unexpected error.
export async function isChannelMember(botToken, userId) {
  const url =
    `https://api.telegram.org/bot${botToken}/getChatMember` +
    `?chat_id=${encodeURIComponent(channelChatId)}&user_id=${userId}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
  const payload = await response.json().catch(() => null);

  if (!payload?.ok) {
    // "user not found" just means they have never been in the channel.
    const description = String(payload?.description || "");
    if (/user not found|participant_id_invalid/i.test(description)) return false;
    console.error("telegram_get_chat_member_error", response.status, description);
    throw new Error("Telegram error");
  }

  const { status, is_member: isMember } = payload.result || {};
  return (
    status === "creator" ||
    status === "administrator" ||
    status === "member" ||
    (status === "restricted" && isMember === true)
  );
}

export async function sendMessage(botToken, chatId, text, replyMarkup) {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, reply_markup: replyMarkup }),
    signal: AbortSignal.timeout(10000),
  });
  const payload = await response.json().catch(() => null);
  if (!payload?.ok) {
    console.error("telegram_send_message_error", response.status, payload?.description);
    throw new Error("Unable to send message");
  }
}
