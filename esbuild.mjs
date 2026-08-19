// Build script: two esbuild targets — the extension host (Node/CJS) and the
// webview UI (browser/IIFE). Kept as a single plain script (no bundler config
// file) per VS Code extension convention: https://code.visualstudio.com/api/working-with-extensions/bundling-extension
import * as esbuild from "esbuild";
import { copyFileSync } from "node:fs";

const watch = process.argv.includes("--watch");
const production = process.argv.includes("--production");

// style.css is loaded by previewPanel.ts at runtime via webview.asWebviewUri
// rather than imported by webview/main.ts, so esbuild's bundler never sees
// it — it must be copied into dist/ explicitly, or a packaged (.vscodeignore
// strips webview/**) extension serves a 404 stylesheet and the graph
// container collapses to 0x0.
const copyStylesPlugin = {
  name: "copy-styles",
  setup(build) {
    build.onEnd(() => copyFileSync("webview/style.css", "dist/style.css"));
  },
};

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
  plugins: [copyStylesPlugin],
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
