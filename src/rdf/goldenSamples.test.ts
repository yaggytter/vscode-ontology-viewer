import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { detectFormatFromExtension, parseOntology } from "./parse";
import { buildGraphModel } from "./graphModel";
import { buildSchemaModel } from "./schemaModel";

/**
 * Regression net for the RDF pipeline: every bundled RDF sample's graph and
 * schema model is pinned as a snapshot, so refactors around the preview
 * pipeline (e.g. adding non-RDF document kinds) cannot silently change what
 * an existing Turtle/RDF-XML document renders as. An intentional model change
 * updates the snapshot with `vitest -u` and shows up in review as a diff.
 */
const SAMPLES_DIR = join(__dirname, "..", "..", "samples");

const RDF_SAMPLES = readdirSync(SAMPLES_DIR)
  .filter((name) => detectFormatFromExtension(name) !== undefined)
  .sort();

describe("RDF sample golden models", () => {
  it("covers at least the original bundled samples", () => {
    expect(RDF_SAMPLES.length).toBeGreaterThanOrEqual(7);
  });

  for (const fileName of RDF_SAMPLES) {
    it(`${fileName} produces a stable graph and schema model`, async () => {
      const format = detectFormatFromExtension(fileName)!;
      const text = readFileSync(join(SAMPLES_DIR, fileName), "utf8");
      const parsed = await parseOntology(text, format, `file:///samples/${fileName}`);
      expect(parsed.errors).toEqual([]);
      expect({
        graph: buildGraphModel(parsed.quads),
        schema: buildSchemaModel(parsed.quads),
      }).toMatchSnapshot();
    });
  }
});
