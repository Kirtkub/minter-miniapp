import { build } from "esbuild";

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
});