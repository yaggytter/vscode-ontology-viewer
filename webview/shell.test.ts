import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { APP_TEMPLATE } from "./shell";

/**
 * The template's element ids are the contract main.ts looks up with
 * `getElementById`, and a mismatch fails at runtime inside a webview where it
 * is awkward to notice — the control simply never appears. main.ts is not unit
 * testable (it wires a live DOM and a cytoscape instance at import time), so
 * this checks the one thing that binds the two files together.
 */
describe("APP_TEMPLATE", () => {
  const templateIds = new Set([...APP_TEMPLATE.matchAll(/id="([^"]+)"/g)].map((match) => match[1]));
  const mainSource = readFileSync("webview/main.ts", "utf8");
  const lookedUpIds = [...mainSource.matchAll(/getElementById\("([^"]+)"\)/g)].map((match) => match[1]);

  it("declares every id main.ts looks up", () => {
    const missing = lookedUpIds.filter((id) => id !== "app" && !templateIds.has(id));
    expect(missing).toEqual([]);
  });

  it("references every id it declares from either main.ts or the stylesheet", () => {
    // An id nothing points at is dead markup, or a control that was wired up
    // and then lost. Styling by id is legitimate, so the stylesheet counts.
    const styleSheet = readFileSync("webview/style.css", "utf8");
    const unused = [...templateIds].filter(
      (id) => !lookedUpIds.includes(id) && !styleSheet.includes(`#${id}`),
    );
    expect(unused).toEqual([]);
  });

  it("carries the compaction toggle as a labelled checkbox", () => {
    // A pressed button expressed this weakly and, in the sibling browser
    // package, had no styling behind its active state at all.
    expect(templateIds.has("compact-triples-toggle")).toBe(true);
    expect(templateIds.has("compact-triples-checkbox")).toBe(true);
    expect(APP_TEMPLATE).toMatch(/id="compact-triples-checkbox" type="checkbox"/);
  });

  it("interpolates nothing, so untrusted ontology content cannot reach it", () => {
    expect(APP_TEMPLATE).not.toContain("${");
  });
});
