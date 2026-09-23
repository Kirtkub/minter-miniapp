import { build } from "esbuild";

await build({
  entryPoints: ["web/src/app.ts"],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: ["es2020"],
  outfile: "public/app.js",
  inject: ["web/src/shims/buffer-shim.js"],
  define: { global: "globalThis" },
  minify: true,
  logLevel: "info",
});
