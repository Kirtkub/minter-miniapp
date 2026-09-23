import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import catalogHandler from "../api/catalog.js";
import signMintHandler from "../api/sign-mint.js";

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
  return res;
}

const server = createServer(async (req, res) => {
  const requestPath = decodeURIComponent((req.url || "/").split("?")[0]);
  if (requestPath === "/api/catalog") return catalogHandler(req, responseAdapter(res));
  if (requestPath === "/api/sign-mint") return signMintHandler(req, responseAdapter(res));

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
