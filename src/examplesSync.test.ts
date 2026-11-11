import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseObjectOntology } from "./objectOntology/parse";
import { buildAgentTools } from "./objectOntology/export/agentTools";
import { buildContextSummary } from "./objectOntology/export/contextSummary";
import { objectOntologyToTurtle } from "./objectOntology/export/turtle";

/**
 * The Claude Code examples (tutorials 8 and 9) ship copies of bundled samples
 * and of what the extension exports from them. Readers follow the tutorials
 * by exporting those files themselves, so the copies must be byte-for-byte
 * what the current extension produces.
 */
const ROOT = join(__dirname, "..");
const SAMPLES = join(ROOT, "samples");
const MCP = join(ROOT, "examples", "claude-code", "object-ontology-mcp");
const SPARQL = join(ROOT, "examples", "claude-code", "semantic-web-sparql");

const read = (...path: string[]): string => readFileSync(join(...path), "utf8");

describe("Claude Code examples stay in sync with the extension", () => {
  for (const [workspace, sample] of [
    ["delivery", "delivery-ops"],
    ["support", "support-desk"],
  ] as const) {
    describe(`object-ontology-mcp/${workspace}`, () => {
      const yaml = read(SAMPLES, `${sample}.oont.yaml`);
      const ontology = parseObjectOntology(yaml).ontology!;

      it("ships the bundled sample unchanged", () => {
        expect(read(MCP, workspace, `${sample}.oont.yaml`)).toBe(yaml);
      });

      it("ships the tool definitions the export command writes", () => {
        expect(read(MCP, workspace, `${sample}.tools.json`)).toBe(`${JSON.stringify(buildAgentTools(ontology), null, 2)}\n`);
      });

      it("embeds the context summary the export command writes", () => {
        expect(read(MCP, workspace, "CLAUDE.md")).toContain(buildContextSummary(ontology).trim());
      });
    });
  }

  describe("semantic-web-sparql/data", () => {
    for (const sample of ["product-compatibility", "glossary-skos", "dataset-catalog", "research-kg"]) {
      it(`ships ${sample}.ttl unchanged`, () => {
        expect(read(SPARQL, "data", `${sample}.ttl`)).toBe(read(SAMPLES, `${sample}.ttl`));
      });
    }

    it("ships the Turtle export of delivery-ops", async () => {
      const ontology = parseObjectOntology(read(SAMPLES, "delivery-ops.oont.yaml")).ontology!;
      expect(read(SPARQL, "data", "delivery-ops.export.ttl")).toBe(await objectOntologyToTurtle(ontology));
    });
  });
});
