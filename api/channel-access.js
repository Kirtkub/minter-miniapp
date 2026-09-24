import { jsonResponse } from "./_catalog.js";
import { getBotToken, isChannelMember, userFromRequest } from "./_telegram.js";

// Tells whether the Telegram user who opened the miniapp is a member of the
// official channel. The client sends Telegram's signed `initData` in the
// Authorization header ("tma <initData>"); it is validated with the bot
// token, so the user id can't be forged (see _telegram.js).
export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return jsonResponse(res, 405, { error: "Method not allowed" });
  }
  res.setHeader("cache-control", "no-store");

  const botToken = getBotToken();
  if (!botToken) return jsonResponse(res, 500, { error: "bot_token_not_configured" });

  const user = userFromRequest(req, botToken);
  if (!user) return jsonResponse(res, 401, { error: "invalid_init_data" });

  try {
    return jsonResponse(res, 200, { member: await isChannelMember(botToken, user.id) });
  } catch (error) {
    console.error("channel_access_error", error);
    return jsonResponse(res, 502, { error: "telegram_unreachable" });
  }
}
