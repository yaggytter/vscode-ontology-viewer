import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "..");

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(resolve(root, path), "utf8")) as Record<string, unknown>;
}

function keys(path: string): string[] {
  return Object.keys(readJson(path)).sort();
}

describe("Marketplace release assets", () => {
  it("uses the intended public extension identity and localized listing text", () => {
    const manifest = readJson("package.json");

    expect(manifest.publisher).toBe("AkihiroYAGASAKI");
    expect(manifest.name).toBe("ontology-viewer");
    expect(manifest.displayName).toBe("%extension.displayName%");
    expect(manifest.description).toBe("%extension.description%");
    expect(manifest.license).toBe("SEE LICENSE IN LICENSE");
  });

  it("keeps English and Japanese manifest localization keys in lockstep", () => {
    expect(keys("package.nls.ja.json")).toEqual(keys("package.nls.json"));
  });

  it("keeps English and Japanese runtime localization keys in lockstep", () => {
    expect(keys("l10n/bundle.l10n.ja.json")).toEqual(keys("l10n/bundle.l10n.json"));
    expect(keys("l10n/bundle.l10n.json")).toContain("Reset zoom to 100%");
  });

  it("ships the complete public documentation set in both languages", () => {
    const bilingualDocuments = [
      "README",
      "CHANGELOG",
      "CONTRIBUTING",
      "SECURITY",
      "SUPPORT",
      "PRIVACY",
    ];

    for (const name of bilingualDocuments) {
      expect(() => readFileSync(resolve(root, `${name}.md`), "utf8")).not.toThrow();
      expect(() => readFileSync(resolve(root, `${name}.ja.md`), "utf8")).not.toThrow();
    }

    expect(() => readFileSync(resolve(root, "THIRD_PARTY_NOTICES.md"), "utf8")).not.toThrow();
    expect(() => readFileSync(resolve(root, "media/ontology-viewer-overview.png"))).not.toThrow();
  });

  it("defines repeatable CI and release workflows", () => {
    expect(() => readFileSync(resolve(root, ".github/workflows/ci.yml"), "utf8")).not.toThrow();
    expect(() => readFileSync(resolve(root, ".github/workflows/release.yml"), "utf8")).not.toThrow();
    expect(() => readFileSync(resolve(root, ".github/ISSUE_TEMPLATE/bug-report.yml"), "utf8")).not.toThrow();
    expect(() => readFileSync(resolve(root, ".github/ISSUE_TEMPLATE/feature-request.yml"), "utf8")).not.toThrow();
    expect(() => readFileSync(resolve(root, ".github/PULL_REQUEST_TEMPLATE.md"), "utf8")).not.toThrow();
    expect(() => readFileSync(resolve(root, "scripts/validate-release.mjs"), "utf8")).not.toThrow();
  });
});
