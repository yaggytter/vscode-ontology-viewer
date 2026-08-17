// Build script: two esbuild targets — the extension host (Node/CJS) and the
// webview UI (browser/IIFE). Kept as a single plain script (no bundler config
// file) per VS Code extension convention: https://code.visualstudio.com/api/working-with-extensions/bundling-extension
import * as esbuild from "esbuild";

const watch = process.argv.includes("--watch");
const production = process.argv.includes("--production");

/** @type {import('esbuild').BuildOptions} */
const extensionConfig = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "dist/extension.js",
  platform: "node",
  target: "node20",
  format: "cjs",
  external: ["vscode"],
  sourcemap: !production,
  minify: production,
  logLevel: "info",
};

/** @type {import('esbuild').BuildOptions} */
const webviewConfig = {
  entryPoints: ["webview/main.ts"],
  bundle: true,
  outfile: "dist/webview.js",
  platform: "browser",
  target: "es2020",
  format: "iife",
  sourcemap: !production,
  minify: production,
  logLevel: "info",
};

async function run() {
  if (watch) {
    const [extCtx, webCtx] = await Promise.all([
      esbuild.context(extensionConfig),
      esbuild.context(webviewConfig),
    ]);
    await Promise.all([extCtx.watch(), webCtx.watch()]);
    console.log("watching for changes...");
  } else {
    await Promise.all([esbuild.build(extensionConfig), esbuild.build(webviewConfig)]);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
