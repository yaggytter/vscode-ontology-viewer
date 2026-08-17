import { defineConfig } from "@vscode/test-cli";

export default defineConfig({
  files: "out-test/src/test/**/*.test.js",
  workspaceFolder: "./samples",
  mocha: {
    timeout: 20000,
  },
});
