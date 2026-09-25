// Diagnostic script for the "no mint notification arrives" issue.
//
// Sends the two mint-notify messages to a chat_id ONE AT A TIME, completely
// independently of the mint flow, and prints Telegram's raw response for
// each — so a failure in fetching/sending the private photo doesn't hide
// whether the plain text message would have gone through, and vice versa.
//
// Usage:
//   TELEGRAM_BOT_TOKEN=... NETLIFY_PRIVATE_SECRET=... \
//     node scripts/debug-mint-notify.mjs <chatId> <privateImageUrl> [nftName]
//
// - <chatId>: numeric Telegram user id to message privately. Use your own
//   (get it from @userinfobot, or from the "user" field the miniapp itself
//   receives via initData) — NOT the bot's id and NOT a channel id.
// - <privateImageUrl>: the `privateImage` URL from the NFT's metadata JSON
//   (the one behind NETLIFY_PRIVATE_SECRET). Grab it from the contentUrl
//   JSON of the NFT you minted.
// - [nftName]: optional, defaults to "Test NFT".
//
// Requires TELEGRAM_BOT_TOKEN and NETLIFY_PRIVATE_SECRET in the environment
// (the same values configured on Vercel).

const appUrl = "https://minter-miniapp.vercel.app/";

const [, , chatIdArg, privateImageUrlArg, nftNameArg] = process.argv;

if (!chatIdArg || !privateImageUrlArg) {
  console.error(
    "Usage: TELEGRAM_BOT_TOKEN=... NETLIFY_PRIVATE_SECRET=... " +
      "node scripts/debug-mint-notify.mjs <chatId> <privateImageUrl> [nftName]",
  );
  process.exit(1);
}

const chatId = chatIdArg;
const privateImageUrl = privateImageUrlArg;
const nftName = nftNameArg || "Test NFT";

const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
const secret = process.env.NETLIFY_PRIVATE_SECRET?.trim();

if (!botToken) {
  console.error("Missing TELEGRAM_BOT_TOKEN in the environment.");
  process.exit(1);
}
if (!secret) {
  console.error("Missing NETLIFY_PRIVATE_SECRET in the environment.");
  process.exit(1);
}

const caption = `You've got a new Spicy Pic added to your collection!\n\n${nftName}`;
const replyMarkup = { inline_keyboard: [[{ text: "Open Miniapp", web_app: { url: appUrl } }]] };

async function step(label, fn) {
  console.log(`\n--- ${label} ---`);
  try {
    await fn();
  } catch (error) {
    console.error("FAILED:", error instanceof Error ? error.message : error);
  }
}

// Message 1: the private (protected) image, downloaded with the bearer
// secret, then re-uploaded to Telegram as a photo with the caption.
await step("Message 1 — private photo", async () => {
  console.log("Fetching:", privateImageUrl);
  const upstream = await fetch(privateImageUrl, {
    headers: { authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(15000),
  });
  console.log("Image host responded:", upstream.status, upstream.statusText);
  if (!upstream.ok) {
    const bodyText = await upstream.text().catch(() => "");
    throw new Error(`Image fetch failed (${upstream.status}). Body: ${bodyText.slice(0, 300)}`);
  }
  const buffer = Buffer.from(await upstream.arrayBuffer());
  const contentType = upstream.headers.get("content-type") || "image/jpeg";
  console.log("Image bytes:", buffer.length, "content-type:", contentType);

  const form = new FormData();
  form.append("chat_id", String(chatId));
  form.append("caption", caption);
  form.append("reply_markup", JSON.stringify(replyMarkup));
  form.append("photo", new Blob([buffer], { type: contentType }), "nft.jpg");

  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(20000),
  });
  const payload = await response.json().catch(() => null);
  console.log("Telegram sendPhoto response:", JSON.stringify(payload));
  if (!payload?.ok) throw new Error(payload?.description || `sendPhoto failed (HTTP ${response.status})`);
  console.log("OK — message 1 sent.");
});

// Message 2: plain text with the "Open Miniapp" button, no image.
await step('Message 2 — text + "Open Miniapp" button', async () => {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: caption, reply_markup: replyMarkup }),
    signal: AbortSignal.timeout(15000),
  });
  const payload = await response.json().catch(() => null);
  console.log("Telegram sendMessage response:", JSON.stringify(payload));
  if (!payload?.ok) throw new Error(payload?.description || `sendMessage failed (HTTP ${response.status})`);
  console.log("OK — message 2 sent.");
});

console.log("\nDone. Check your private chat with the bot.");
