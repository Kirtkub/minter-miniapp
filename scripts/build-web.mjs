import { build } from "esbuild";
import { mkdirSync } from "node:fs";

mkdirSync("public/deploycollection", { recursive: true });

// 1) Mint app — served at "/"
await build({
  entryPoints: ["src/app.js"],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["es2020"],
  outfile: "public/app.js",
  minify: false,
  sourcemap: false,
  inject: ["src/shims/buffer.js"],
  define: { global: "globalThis" },
  loader: {
    // Same embedding as the deploy-collection bundle below: needed here so
    // the mint app can compute the NftItem code cell hash and check/publish
    // its TON Sources Registry verification (see shared/verifier-client.js).
    ".tact": "text",
    ".abi": "text",
    ".boc": "binary",
  },
});
console.log("Built mint app -> public/app.js");

// 2) Collection deploy app — served at "/deploycollection"
await build({
  entryPoints: ["deploy-collection/web/src/app.ts"],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: ["es2020"],
  outfile: "public/deploycollection/app.js",
  inject: ["deploy-collection/web/src/shims/buffer-shim.js"],
  define: { global: "globalThis" },
  minify: true,
  logLevel: "info",
  loader: {
    // Contract source and build artifacts are embedded directly into the
    // bundle so the "download deployed code" feature works offline and
    // always matches exactly what was compiled.
    ".tact": "text",
    ".abi": "text",
    ".boc": "binary",
  },
});
console.log("Built deploy-collection app -> public/deploycollection/app.js");
