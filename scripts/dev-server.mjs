import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import catalogHandler from "../api/catalog.js";
import signMintHandler from "../api/sign-mint.js";
import authStatusHandler from "../api/auth-status.js";
import myCollectionHandler from "../api/my-collection.js";
import privateImageHandler from "../api/private-image.js";
import tonPriceHandler from "../api/ton-price.js";
import collectionInfoHandler from "../api/collection-info.js";
import channelAccessHandler from "../api/channel-access.js";
import welcomeMessageHandler from "../api/welcome-message.js";
import mintNotifyHandler from "../api/mint-notify.js";
import deployNotifyHandler from "../api/deploy-notify.js";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..", "public");
const port = Number(process.env.PORT || 5000);
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

// Paths with no matching static file that should fall back to a directory's
// index.html, mirroring the rewrites configured in vercel.json.
const HTML_FALLBACKS = {
  "/": "/index.html",
  "/deploycollection": "/deploycollection/index.html",
  "/deploycollection/": "/deploycollection/index.html",
};

function responseAdapter(res) {
  res.status = (status) => {
    res.statusCode = status;
    return res;
  };
  res.json = (body) => {
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify(body));
  };
  res.send = (body) => {
    res.end(body);
  };
  return res;
}

const server = createServer(async (req, res) => {
  const requestPath = decodeURIComponent((req.url || "/").split("?")[0]);
  if (requestPath === "/api/catalog") return catalogHandler(req, responseAdapter(res));
  if (requestPath === "/api/sign-mint") return signMintHandler(req, responseAdapter(res));
  if (requestPath === "/api/auth-status") return authStatusHandler(req, responseAdapter(res));
  if (requestPath === "/api/my-collection") return myCollectionHandler(req, responseAdapter(res));
  if (requestPath === "/api/private-image") return privateImageHandler(req, responseAdapter(res));
  if (requestPath === "/api/ton-price") return tonPriceHandler(req, responseAdapter(res));
  if (requestPath === "/api/collection-info") return collectionInfoHandler(req, responseAdapter(res));
  if (requestPath === "/api/channel-access") return channelAccessHandler(req, responseAdapter(res));
  if (requestPath === "/api/welcome-message") return welcomeMessageHandler(req, responseAdapter(res));
  if (requestPath === "/api/mint-notify") return mintNotifyHandler(req, responseAdapter(res));
  if (requestPath === "/api/deploy-notify") return deployNotifyHandler(req, responseAdapter(res));

  const relative = normalize(HTML_FALLBACKS[requestPath] || requestPath);
  const filePath = join(root, relative);
  if (!filePath.startsWith(root)) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error("Not a file");
    res.writeHead(200, { "content-type": contentTypes[extname(filePath)] || "application/octet-stream" });
    createReadStream(filePath).pipe(res);
  } catch {
    res.writeHead(404).end("Not found");
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`NFT miniapp (mint + deploycollection) listening on ${port}`);
});
