import { appUrl } from "../src/config.js";
import { jsonResponse } from "./_catalog.js";
import { getBotToken, isChannelMember, sendMessage, userFromRequest } from "./_telegram.js";

// Sends the "you've been accepted" message in the user's private chat with
// the bot, with a button that opens the miniapp. Called by the client right
// after the user joined the channel via the access gate. The server checks
// the (signed) user and their channel membership itself, so it only ever
// messages a real, current member — and only that same user.
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

  try {
    if (!(await isChannelMember(botToken, user.id))) {
      return jsonResponse(res, 403, { error: "not_a_member" });
    }
    // In a private chat with a user, the chat id is the user's id.
    await sendMessage(
      botToken,
      user.id,
      "You've been accepted into the official Cleo and Leo channel!\nNow you can mint their exclusive NFTs!",
      { inline_keyboard: [[{ text: "Open Miniapp", web_app: { url: appUrl } }]] },
    );
    return jsonResponse(res, 200, { sent: true });
  } catch (error) {
    console.error("welcome_message_error", error);
    return jsonResponse(res, 502, { error: "Unable to send the welcome message" });
  }
}
