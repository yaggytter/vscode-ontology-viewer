import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function fail(message) {
  failures.push(message);
}

function readJson(relativePath) {
  try {
    return JSON.parse(readFileSync(resolve(root, relativePath), "utf8"));
  } catch (error) {
    fail(`${relativePath}: ${error instanceof Error ? error.message : String(error)}`);
    return {};
  }
}

function requireFiles(paths) {
  for (const path of paths) {
    if (!existsSync(resolve(root, path))) {
      fail(`Missing required release file: ${path}`);
    }
  }
}

function compareKeys(leftPath, rightPath) {
  const left = Object.keys(readJson(leftPath)).sort();
  const right = Object.keys(readJson(rightPath)).sort();
  if (JSON.stringify(left) !== JSON.stringify(right)) {
    const onlyLeft = left.filter((key) => !right.includes(key));
    const onlyRight = right.filter((key) => !left.includes(key));
    fail(`${leftPath} and ${rightPath} have different keys (only left: ${onlyLeft.join(", ") || "none"}; only right: ${onlyRight.join(", ") || "none"})`);
  }
}

function validatePng(relativePath, minimumWidth, minimumHeight = minimumWidth) {
  try {
    const data = readFileSync(resolve(root, relativePath));
    const pngSignature = "89504e470d0a1a0a";
    if (extname(relativePath).toLowerCase() !== ".png" || data.subarray(0, 8).toString("hex") !== pngSignature) {
      fail(`${relativePath} must be a PNG image`);
      return;
    }
    const width = data.readUInt32BE(16);
    const height = data.readUInt32BE(20);
    if (width < minimumWidth || height < minimumHeight) {
      fail(`${relativePath} is ${width}x${height}; expected at least ${minimumWidth}x${minimumHeight}`);
    }
  } catch (error) {
    fail(`${relativePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function markdownFiles() {
  const rootDocuments = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => resolve(root, entry.name));
  const docsRoot = resolve(root, "docs");
  const nestedDocuments = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        visit(path);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        nestedDocuments.push(path);
      }
    }
  };
  visit(docsRoot);
  return [...rootDocuments, ...nestedDocuments];
}

function validateLocalMarkdownLinks() {
  const markdownLink = /\]\(([^)]+)\)/g;
  for (const file of markdownFiles()) {
    const contents = readFileSync(file, "utf8");
    for (const match of contents.matchAll(markdownLink)) {
      const rawTarget = match[1].trim().replace(/^<|>$/g, "");
      if (!rawTarget || rawTarget.startsWith("#") || /^(?:https?:|mailto:)/i.test(rawTarget)) {
        continue;
      }
      const fileTarget = decodeURIComponent(rawTarget.split("#", 1)[0]);
      if (fileTarget && !existsSync(resolve(dirname(file), fileTarget))) {
        fail(`${relative(root, file)} links to missing local path: ${rawTarget}`);
      }
    }
  }
}

/**
 * `vsce package` bundles the working directory, not the git index, so an
 * untracked file sitting in a packaged directory ships to Marketplace users
 * without ever appearing in a diff. That happened during 0.4.0 preparation:
 * two scratch ontologies left in `samples/` were packaged. Anything shipped
 * must therefore be tracked, which is also what keeps the originality claim in
 * samples/README.md true.
 */
function validateBundledSamplesAreTracked() {
  let tracked;
  try {
    tracked = new Set(
      execFileSync("git", ["ls-files", "samples"], { cwd: root, encoding: "utf8" })
        .split("\n")
        .filter(Boolean),
    );
  } catch {
    // Not a git checkout (e.g. an extracted tarball) — nothing to compare against.
    return;
  }
  const present = readdirSync(resolve(root, "samples"), { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => `samples/${entry.name}`);
  for (const path of present) {
    if (!tracked.has(path)) {
      fail(`${path} is untracked but would be packaged. Move it out of samples/ or commit it as a bundled sample.`);
    }
  }
}

const bilingualDocumentBases = [
  "README",
  "CHANGELOG",
  "CONTRIBUTING",
  "SECURITY",
  "SUPPORT",
  "PRIVACY",
];

requireFiles([
  "LICENSE",
  "THIRD_PARTY_NOTICES.md",
  ".github/workflows/ci.yml",
  ".github/workflows/release.yml",
  ".github/ISSUE_TEMPLATE/bug-report.yml",
  ".github/ISSUE_TEMPLATE/feature-request.yml",
  ".github/PULL_REQUEST_TEMPLATE.md",
  "media/ontology-viewer-overview.png",
  ...bilingualDocumentBases.flatMap((name) => [`${name}.md`, `${name}.ja.md`]),
]);

const manifest = readJson("package.json");
if (manifest.publisher !== "AkihiroYAGASAKI" || manifest.name !== "ontology-viewer") {
  fail("package.json must publish as AkihiroYAGASAKI.ontology-viewer");
}
if (manifest.displayName !== "%extension.displayName%" || manifest.description !== "%extension.description%") {
  fail("Marketplace displayName and description must use package.nls localization keys");
}
if (manifest.license !== "SEE LICENSE IN LICENSE") {
  fail("package.json license must point Marketplace readers to LICENSE");
}
if (manifest.preview !== true || manifest.pricing !== "Free") {
  fail("package.json must explicitly declare preview status and free pricing");
}
if (manifest.contributes?.configuration?.properties?.["ontologyViewer.layout.storage"]) {
  fail("Do not advertise ontologyViewer.layout.storage until the setting is implemented");
}

compareKeys("package.nls.json", "package.nls.ja.json");
compareKeys("l10n/bundle.l10n.json", "l10n/bundle.l10n.ja.json");
validateLocalMarkdownLinks();
validateBundledSamplesAreTracked();

const runtimeMessages = readJson("l10n/bundle.l10n.json");
if (!("Reset zoom to 100%" in runtimeMessages)) {
  fail("Runtime localization is missing the zoom reset label");
}

if (typeof manifest.icon !== "string") {
  fail("package.json must define a Marketplace icon");
} else {
  validatePng(manifest.icon, 128);
}
validatePng("media/ontology-viewer-overview.png", 1000, 600);

if (failures.length > 0) {
  console.error("Release validation failed:\n");
  for (const message of failures) {
    console.error(`- ${message}`);
  }
  process.exitCode = 1;
} else {
  console.log("Release validation passed: identity, localization, icon, documentation, and workflows are ready.");
}
