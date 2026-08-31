// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { createSparqlPanel, renderSparqlResultTable } from "./sparql";
import type { SparqlResult } from "../../src/sparql/resultModel";
import type { UiStrings } from "../../src/shared/messages";

// Only the SPARQL strings are exercised here; a Proxy fills the rest so the
// test does not have to hand-build the whole (large) UiStrings object.
const strings = new Proxy(
  {
    sparqlAskResultTrue: "Result: true",
    sparqlAskResultFalse: "Result: false",
    sparqlResultCount: "{0} rows",
    sparqlNoResults: "No results.",
    sparqlConstructHeading: "Constructed triples",
  } as Partial<UiStrings>,
  { get: (target, prop) => (target as Record<string, string>)[prop as string] ?? String(prop) },
) as UiStrings;

describe("renderSparqlResultTable", () => {
  it("renders a SELECT result as a table with a header per variable", () => {
    const result: SparqlResult = {
      kind: "bindings",
      variables: ["s", "label"],
      rows: [
        { s: { termKind: "NamedNode", value: "http://ex/A" }, label: { termKind: "Literal", value: "Alpha" } },
      ],
    };
    const el = renderSparqlResultTable(result, strings);
    const headers = Array.from(el.querySelectorAll("th")).map((th) => th.textContent);
    expect(headers).toEqual(["s", "label"]);
    const cells = Array.from(el.querySelectorAll("td")).map((td) => td.textContent);
    expect(cells).toContain("http://ex/A");
    expect(cells).toContain("Alpha");
  });

  it("shows an empty-state message for a SELECT with no rows", () => {
    const result: SparqlResult = { kind: "bindings", variables: ["s"], rows: [] };
    const el = renderSparqlResultTable(result, strings);
    expect(el.textContent).toContain("No results.");
  });

  it("renders an ASK result as a boolean statement", () => {
    expect(renderSparqlResultTable({ kind: "boolean", value: true }, strings).textContent).toContain("Result: true");
    expect(renderSparqlResultTable({ kind: "boolean", value: false }, strings).textContent).toContain("Result: false");
  });

  it("renders a CONSTRUCT result as subject/predicate/object rows", () => {
    const result: SparqlResult = {
      kind: "quads",
      triples: [
        {
          subject: { termKind: "NamedNode", value: "http://ex/A" },
          predicate: { termKind: "NamedNode", value: "http://ex/rel" },
          object: { termKind: "NamedNode", value: "http://ex/B" },
        },
      ],
    };
    const el = renderSparqlResultTable(result, strings);
    const cells = Array.from(el.querySelectorAll("td")).map((td) => td.textContent);
    expect(cells).toEqual(["http://ex/A", "http://ex/rel", "http://ex/B"]);
  });

  it("never uses innerHTML — renders untrusted values via textContent only", () => {
    const result: SparqlResult = {
      kind: "bindings",
      variables: ["x"],
      rows: [{ x: { termKind: "Literal", value: "<img src=x onerror=alert(1)>" } }],
    };
    const el = renderSparqlResultTable(result, strings);
    // The malicious literal must appear as text, not as a live <img> element.
    expect(el.querySelector("img")).toBeNull();
    expect(el.textContent).toContain("<img src=x onerror=alert(1)>");
  });
});

describe("createSparqlPanel example picker", () => {
  const samples = [
    { id: "a", name: "First example", description: "Does the simplest thing.", query: "SELECT * WHERE { ?s ?p ?o }" },
    { id: "b", name: "Second example", description: "Does another thing.", query: "ASK { ?s ?p ?o }" },
  ];

  it("offers every sample plus a placeholder option", () => {
    const panel = createSparqlPanel(strings, samples, { onRun: () => {}, onModeChange: () => {} });
    const options = Array.from(panel.element.querySelectorAll(".sparql-sample-select option"));
    expect(options.map((o) => o.textContent)).toEqual([
      strings.sparqlSamplesPlaceholder,
      "First example",
      "Second example",
    ]);
  });

  it("fills the editor and shows the description when a sample is chosen", () => {
    const panel = createSparqlPanel(strings, samples, { onRun: () => {}, onModeChange: () => {} });
    const select = panel.element.querySelector(".sparql-sample-select") as HTMLSelectElement;
    select.value = "b";
    select.dispatchEvent(new Event("change"));

    const textarea = panel.element.querySelector(".sparql-input") as HTMLTextAreaElement;
    expect(textarea.value).toBe("ASK { ?s ?p ?o }");
    expect(panel.element.querySelector(".sparql-sample-hint")?.textContent).toBe("Does another thing.");
  });

  it("runs the chosen sample through onRun", () => {
    const run: string[] = [];
    const panel = createSparqlPanel(strings, samples, { onRun: (q) => run.push(q), onModeChange: () => {} });
    const select = panel.element.querySelector(".sparql-sample-select") as HTMLSelectElement;
    select.value = "a";
    select.dispatchEvent(new Event("change"));
    (panel.element.querySelector(".sparql-run-btn") as HTMLButtonElement).click();
    expect(run).toEqual(["SELECT * WHERE { ?s ?p ?o }"]);
  });

  it("omits the picker entirely when the host supplied no samples", () => {
    const panel = createSparqlPanel(strings, [], { onRun: () => {}, onModeChange: () => {} });
    expect(panel.element.querySelector(".sparql-sample-select")).toBeNull();
  });
});
