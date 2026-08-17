// Flat config for ESLint 9.
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";

export default [
  {
    ignores: ["dist/**", "out/**", "out-test/**", "node_modules/**", "**/*.js", "**/*.mjs"],
  },
  {
    files: ["src/**/*.ts", "webview/**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  {
    // .ttl-derived strings (labels, comments, IRIs, unattached-property
    // reasons, ...) flow into the Inspector/search/legend panels in volume
    // starting Phase 4. innerHTML is the one path that turns "open a
    // malicious ontology file" into "run script in the webview, which can
    // postMessage the host into editing files" — enforced mechanically here
    // rather than left as a code-review reminder. Route DOM construction
    // through webview/dom.ts's h(), which only accepts textContent.
    files: ["webview/**/*.ts"],
    rules: {
      "no-restricted-properties": [
        "error",
        {
          object: "*",
          property: "innerHTML",
          message: "Do not use innerHTML in the webview — use dom.ts's h() (textContent only) instead.",
        },
      ],
    },
  },
  {
    // The one exception: main.ts's static, hardcoded page shell (no
    // document-derived content in it).
    files: ["webview/main.ts"],
    rules: {
      "no-restricted-properties": "off",
    },
  },
];
