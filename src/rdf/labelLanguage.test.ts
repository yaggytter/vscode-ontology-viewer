import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pickByLanguage } from "./labelLanguage";
import { detectFormatFromExtension, parseOntology } from "./parse";
import { buildGraphModel } from "./graphModel";
import { buildSchemaModel } from "./schemaModel";

const v = (value: string, language?: string): { value: string; language?: string } => ({ value, language });

describe("pickByLanguage", () => {
  const bilingual = [v("Component", "en"), v("部品", "ja")];

  it("prefers the display language", () => {
    expect(pickByLanguage(bilingual, "en")?.value).toBe("Component");
    expect(pickByLanguage(bilingual, "ja")?.value).toBe("部品");
  });

  it("matches on the primary subtag and ignores case", () => {
    expect(pickByLanguage([v("Colour", "en-GB"), v("色", "ja")], "en-us")?.value).toBe("Colour");
    expect(pickByLanguage([v("x", "JA"), v("y", "en")], "ja")?.value).toBe("x");
  });

  it("falls back to untagged, then English, then the last value", () => {
    expect(pickByLanguage([v("Komponente", "de"), v("plain"), v("Component", "en")], "ja")?.value).toBe("plain");
    expect(pickByLanguage([v("Komponente", "de"), v("Component", "en")], "ja")?.value).toBe("Component");
    expect(pickByLanguage([v("Komponente", "de"), v("composant", "fr")], "ja")?.value).toBe("composant");
  });

  it("keeps the old last-one-wins rule without a preferred language", () => {
    expect(pickByLanguage(bilingual)?.value).toBe("部品");
    expect(pickByLanguage([v("a"), v("b")], "en")?.value).toBe("b");
    expect(pickByLanguage([], "en")).toBeUndefined();
  });
});

const SAMPLES_DIR = join(__dirname, "..", "..", "samples");

async function quadsOf(fileName: string) {
  const text = readFileSync(join(SAMPLES_DIR, fileName), "utf8");
  return (await parseOntology(text, detectFormatFromExtension(fileName)!, `file:///samples/${fileName}`)).quads;
}

describe("display-language labels in the diagram models", () => {
  it("shows the English or Japanese label of a bilingual sample", async () => {
    const quads = await quadsOf("product-compatibility.ttl");
    const component = "https://example.org/product-compatibility#Component";
    const name = (lang: string) => buildSchemaModel(quads, lang).entities.find((e) => e.id === component)?.name;
    expect(name("en")).toBe("Component");
    expect(name("ja")).toBe("部品");
    const label = (lang: string) => buildGraphModel(quads, lang).nodes.find((n) => n.id === component)?.label;
    expect(label("en")).toBe("Component");
    expect(label("ja")).toBe("部品");
  });

  it("renders a sample without language tags exactly as before, in any language", async () => {
    const untagged = readdirSync(SAMPLES_DIR).filter(
      (name) => detectFormatFromExtension(name) && !/"@[a-zA-Z]|xml:lang/.test(readFileSync(join(SAMPLES_DIR, name), "utf8")),
    );
    expect(untagged.length).toBeGreaterThan(0);
    for (const fileName of untagged) {
      const quads = await quadsOf(fileName);
      expect(buildSchemaModel(quads, "ja"), fileName).toEqual(buildSchemaModel(quads));
      expect(buildGraphModel(quads, "en"), fileName).toEqual(buildGraphModel(quads));
    }
  });
});
