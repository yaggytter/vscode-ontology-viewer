import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { describe, it } from "node:test";
import { loadTurtle, refuseRemoteClauses, runQuery } from "../src/sparql.ts";

/** The queries and results of tutorial 7, run through this command. */

const data = (name: string): string => new URL(`../data/${name}`, import.meta.url).pathname;
const products = loadTurtle([data("product-compatibility.ttl")]);
const glossary = loadTurtle([data("glossary-skos.ttl")]);

const P = "PREFIX : <https://example.org/product-compatibility#>\n";

describe("tutorial 7 queries", () => {
  it("answers the compatibility question from the graph", async () => {
    assert.equal(await runQuery(products, `${P}ASK { { :cassetteR12 :compatibleWith :chainR11 } UNION { :chainR11 :compatibleWith :cassetteR12 } }`), "false");
    assert.equal(await runQuery(products, `${P}ASK { :cassetteR11 :compatibleWith :chainR11 }`), "false");
    assert.equal(await runQuery(products, `${P}ASK { { :cassetteR11 :compatibleWith :chainR11 } UNION { :chainR11 :compatibleWith :cassetteR11 } }`), "true");
  });

  it("walks a transitive property only with +", async () => {
    const direct = await runQuery(products, `${P}SELECT ?part WHERE { ?part :partOf :trailBike }`);
    const all = await runQuery(products, `${P}SELECT ?part WHERE { ?part :partOf+ :trailBike }`);
    assert.match(direct, /^3 rows/);
    assert.match(all, /^7 rows/);
    assert.match(all, /\| :chainR11 \|/);
  });

  it("expands a term through SKOS labels in both languages", async () => {
    const result = await runQuery(
      glossary,
      `PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
       SELECT ?concept ?label WHERE {
         ?concept skos:prefLabel|skos:altLabel ?match . FILTER (STR(?match) = "到着予定時刻")
         ?concept skos:prefLabel|skos:altLabel ?label . }`,
    );
    assert.match(result, /^5 rows/);
    assert.match(result, /\| :eta \| "ETA"@en \|/);
  });

  it("traces provenance and merges records by a shared identifier", async () => {
    const catalog = loadTurtle([data("dataset-catalog.ttl")]);
    const lineage = await runQuery(
      catalog,
      `PREFIX prov: <http://www.w3.org/ns/prov#> PREFIX dct: <http://purl.org/dc/terms/> PREFIX : <https://example.org/dataset-catalog#>
       SELECT ?title WHERE { :ridershipMonthly prov:wasDerivedFrom+ ?s . ?s dct:title ?title } ORDER BY ?title`,
    );
    assert.match(lineage, /^2 rows/);
    const research = loadTurtle([data("research-kg.ttl")]);
    const papers = await runQuery(
      research,
      `PREFIX schema: <https://schema.org/>
       SELECT DISTINCT ?title ?listedAs WHERE {
         ?person schema:sameAs <https://example.org/ids/person/0103> ; schema:name ?listedAs .
         ?paper schema:author ?person ; schema:name ?title . } ORDER BY ?title`,
    );
    assert.match(papers, /^2 rows/);
    assert.match(papers, /P\. Raman/);
  });

  it("queries an exported Object Ontology together with the glossary", async () => {
    const both = loadTurtle([data("delivery-ops.export.ttl"), data("glossary-skos.ttl")]);
    // Both files bind ":" to different namespaces, so it is not used for display.
    assert.equal(both.prefixes[""], undefined);
    const result = await runQuery(
      both,
      `PREFIX oont: <urn:object-ontology:vocab#> PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
       SELECT ?action ?property ?ja WHERE {
         ?a a oont:ActionType ; oont:apiName ?action ; oont:rule/oont:sets ?p . ?p oont:apiName ?property .
         ?concept skos:prefLabel|skos:altLabel ?label ; skos:prefLabel ?ja .
         FILTER (LCASE(STR(?label)) = LCASE(?property) && LANG(?ja) = "ja") }`,
    );
    assert.equal(result, '1 row\n\n| action | property | ja |\n| --- | --- | --- |\n| markDelayed | eta | "到着予定時刻"@ja |');
  });
});

describe("staying local", () => {
  it("refuses SERVICE, LOAD and FROM but not the same words in strings or variable names", () => {
    assert.throws(() => refuseRemoteClauses("SELECT * WHERE { SERVICE <https://example.org/sparql> { ?s ?p ?o } }"), /SERVICE and LOAD/);
    assert.throws(() => refuseRemoteClauses("LOAD <https://example.org/data.ttl>"), /SERVICE and LOAD/);
    assert.throws(() => refuseRemoteClauses("SELECT * FROM <x> WHERE { ?s ?p ?o }"), /Remove FROM/);
    assert.doesNotThrow(() => refuseRemoteClauses('SELECT ?from WHERE { ?s ?p "SERVICE from LOAD" ; ?q ?from } # FROM here'));
  });

  it("prints a usage line when no query is given", () => {
    assert.throws(
      () => execFileSync(process.execPath, ["--experimental-strip-types", "--no-warnings", new URL("../src/sparql.ts", import.meta.url).pathname, data("research-kg.ttl")], { stdio: "pipe" }),
      (error: { status: number; stderr: Buffer }) => error.status === 2 && /Usage:/.test(String(error.stderr)),
    );
  });
});
