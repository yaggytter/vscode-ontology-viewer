# Tutorial 7: Semantic Web Ontologies × LLMs

An LLM answers fluently whether or not it knows the answer. A Semantic Web ontology gives it something to check against: explicit facts with global identifiers, standard vocabularies (SKOS, DCAT, PROV-O, schema.org), and a query language that returns the same rows every time. This tutorial walks through six ways to put the two together, each with a bundled sample and a query you can run in the viewer's SPARQL panel.

What the extension does and does not do matters here:

- The extension never calls an LLM and makes no network calls. You use your own model or agent; the viewer is where you inspect the ontology and check the queries it writes.
- SPARQL runs against **the open document only** — one file at a time.
- There is **no reasoner**. `owl:TransitiveProperty`, `owl:SymmetricProperty` and `owl:inverseOf` are stated in the samples, but nothing is inferred from them. A query must spell the consequences out with property paths such as `+`, `^`, or a `UNION`. This is the single most important thing to remember when an LLM writes SPARQL for you (see section 2).

Each sample opens with **Ontology Viewer: Create Sample Ontology...**; the picker name is given in each section. Results are shown with local names (`:chainR11`) to keep the tables short.

## 1. GraphRAG: answer from the graph, not from memory

Sample: **Bicycle Parts Compatibility** (`product-compatibility.ttl`). A customer asks a shop's assistant:

> Does the Ridge 12-speed cassette fit my Ridge 11-speed chain?

Without grounding, the model may say "yes, Ridge parts are cross-compatible", which sounds plausible and is wrong for this catalog. With GraphRAG, the assistant's tool runs a query and answers only from the result:

```sparql
PREFIX : <https://example.org/product-compatibility#>
ASK {
  { :cassetteR12 :compatibleWith :chainR11 } UNION { :chainR11 :compatibleWith :cassetteR12 }
}
```

The result is `false`. Read it carefully: in an open-world graph, `false` means *no compatibility is recorded*, not *proven incompatible*. A good answer says what the catalog does record, so the assistant runs two follow-up queries:

```sparql
PREFIX : <https://example.org/product-compatibility#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT DISTINCT ?part ?label WHERE {
  { :cassetteR12 :compatibleWith ?part } UNION { ?part :compatibleWith :cassetteR12 }
  ?part rdfs:label ?label .
}
```

| part | label |
| --- | --- |
| `:wheelsetBoost` | Boost 29 Wheelset |
| `:chainR12` | Ridge 12-speed Chain |

```sparql
PREFIX : <https://example.org/product-compatibility#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT ?newPart ?label WHERE {
  ?newPart :replaces :chainR11 ; rdfs:label ?label .
}
```

| newPart | label |
| --- | --- |
| `:chainR12` | Ridge 12-speed Chain |

The grounded answer becomes: "The catalog records no compatibility between the 12-speed cassette and your 11-speed chain. The cassette is listed as compatible with the Ridge 12-speed Chain, which replaces the 11-speed chain." Every clause traces to a row.

The other half of GraphRAG is collecting context. `:partOf` is transitive, so "what is on the Trailfinder bike?" needs `+` to walk through the drivetrain kit:

```sparql
PREFIX : <https://example.org/product-compatibility#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT ?part ?label ?type WHERE {
  ?part :partOf+ :trailBike ;
        a ?type ;
        rdfs:label ?label .
}
ORDER BY ?label
```

This returns 7 rows: Boost 29 Wheelset, Ridge 11 Drivetrain Kit, Ridge 11 Rear Derailleur, Ridge 11-speed Cassette 11-42, Ridge 11-speed Chain, Ridge Crankset 32T, and Trailfinder Frame. Those rows, with labels, are compact enough to paste straight into the model's context.

## 2. Let the LLM write SPARQL, then verify it in the viewer

Writing SPARQL is a good job for an LLM, as long as you check the result. The loop is: give the model the vocabulary, ask your question, paste its query into the SPARQL panel, run it, and look at both the table and the diagram.

### A prompt template

For a small ontology the Turtle file itself is the best description of the vocabulary: prefixes, classes, properties and their `rdfs:comment`s in a few kilobytes. Paste it in place of `<TURTLE>`. For a larger ontology, paste only the prefixes and the class and property declarations rather than every instance.

```text
You write SPARQL 1.1 SELECT or ASK queries for the RDF graph below.
Rules:
- Use exactly the PREFIX IRIs declared in the Turtle. Do not guess other namespaces.
- No reasoner runs on this graph. If a property is owl:SymmetricProperty, query both
  directions with UNION. If it is owl:TransitiveProperty, use a property path with +.
  If you need the inverse of a property, write ^property instead of the inverse name.
- Literals may carry language tags (@en, @ja). Compare with STR() or add the tag.
- Return only the query, then one line explaining what each variable holds.

Turtle:
<TURTLE>

Question: <QUESTION>
```

### Check the result in the panel

Paste the query, press **Run**, and keep **On match:** on **Highlight**. In the **Schema** view the classes of the matched resources light up; switch to **Triples** to see the individual parts highlighted. **Filter** dims everything else, which makes it obvious when a query matched the wrong part of the graph — or nothing at all.

### Common LLM SPARQL mistakes to check

Each of these runs without an error and silently returns too little. All were run against the bundled samples.

**Wrong prefix IRI.** `research-kg.ttl` uses `https://schema.org/`. A model that remembers the older `http://` form gets 0 rows instead of 4:

```sparql
PREFIX schema: <http://schema.org/>
SELECT ?name WHERE {
  ?person a schema:Person ; schema:name ?name .
}
```

Fix: copy the `@prefix` lines from the file. With `https://schema.org/`, the query returns Aiko Tanabe, Marco Vell, Priya Raman, and P. Raman.

**Querying a symmetric property in one direction.** Only `:chainR11 :compatibleWith :cassetteR11` is stated, so this returns `false` although the two parts are compatible:

```sparql
PREFIX : <https://example.org/product-compatibility#>
ASK { :cassetteR11 :compatibleWith :chainR11 }
```

Fix: query both directions with `UNION`, as in section 1. That returns `true`.

**Expecting the inverse to be inferred.** `:hasPart` is declared `owl:inverseOf :partOf`, but no `:hasPart` triple is stated, so this returns 0 rows:

```sparql
PREFIX : <https://example.org/product-compatibility#>
SELECT ?part WHERE {
  :trailBike :hasPart ?part .
}
```

Fix: write `:trailBike ^:partOf ?part`. That returns the 3 direct parts (drivetrain kit, wheelset, frame).

**Forgetting `+` on a transitive property.** `?part :partOf :trailBike` returns the same 3 direct parts. The chain, cassette, derailleur and crankset sit one level down, so the full answer needs `:partOf+` (7 rows).

**Missing language tag.** In `glossary-skos.ttl` every label is tagged, so a bare string never matches:

```sparql
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
SELECT ?concept WHERE {
  ?concept skos:prefLabel "Last Mile" .
}
```

That returns 0 rows. Fix: write `"Last Mile"@en`, or compare with `FILTER (STR(?label) = "Last Mile")`. Both return `:lastMile`.

A quick sanity check catches most of these: if the panel says 0 rows, or `false`, ask whether the graph really lacks the fact or the query just missed it.

## 3. Normalize terms and expand queries with SKOS

Sample: **Logistics Glossary (en/ja)** (`glossary-skos.ttl`). Users write "ETA", "arrival estimate" or 「到着予定時刻」 for the same thing. Before a RAG system searches its documents, it can map the user's term to a concept and collect every label:

```sparql
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
SELECT ?concept ?label WHERE {
  ?concept skos:prefLabel|skos:altLabel ?match .
  FILTER (STR(?match) = "ETA")
  ?concept skos:prefLabel|skos:altLabel ?label .
}
```

All 5 rows point at `:eta`, with the labels ETA, Arrival Estimate, Estimated Time of Arrival, 到着予定, and 到着予定時刻. Replace `"ETA"` with `"到着予定時刻"` and you get the same 5 rows, so a Japanese question can retrieve English documents and vice versa. Query expansion goes one step further: a search for "Last Mile" should also find documents about its narrower and related terms.

```sparql
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
SELECT ?term ?en ?ja WHERE {
  ?c skos:prefLabel "Last Mile"@en .
  { ?term skos:broader+ ?c } UNION { ?c skos:related ?term } UNION { ?term skos:related ?c }
  ?term skos:prefLabel ?en , ?ja .
  FILTER (LANG(?en) = "en" && LANG(?ja) = "ja")
}
```

| term | en | ja |
| --- | --- | --- |
| `:eta` | Estimated Time of Arrival | 到着予定時刻 |
| `:proofOfDelivery` | Proof of Delivery | 配達証明 |
| `:onTimeRate` | On-Time Delivery Rate | 定時配達率 |

The retriever adds these six labels to the search. The glossary also gives the model definitions to quote instead of inventing them: asking for the Japanese definition of "POD" returns 「受取人が貨物を受け取ったことを示す署名または写真の記録。」 with the broader concept ラストワンマイル.

## 4. Provenance and license-aware answers

Sample: **Dataset Catalog with Provenance** (`dataset-catalog.ttl`). A user asks "How many people rode the network in March 2026?" The assistant should answer with the figure *and* its source. First, find the dataset that publishes the figure:

```sparql
PREFIX : <https://example.org/dataset-catalog#>
PREFIX dct: <http://purl.org/dc/terms/>
PREFIX dcat: <http://www.w3.org/ns/dcat#>
SELECT ?title ?format ?url WHERE {
  ?ds :reportedTotal 1284300 ; dct:title ?title ;
      dcat:distribution ?dist .
  ?dist dct:format ?format ; dcat:downloadURL ?url .
}
```

One row: Monthly Ridership Summary, CSV, `https://example.org/data/ridership-monthly.csv`. Then walk the lineage back to raw data. `prov:wasDerivedFrom` is not declared transitive, but the chain has two steps, so the query uses `+`:

```sparql
PREFIX prov: <http://www.w3.org/ns/prov#>
PREFIX dct: <http://purl.org/dc/terms/>
PREFIX : <https://example.org/dataset-catalog#>
SELECT ?source ?title WHERE {
  :ridershipMonthly prov:wasDerivedFrom+ ?source .
  ?source dct:title ?title .
}
```

Two rows: Daily Ridership by Station and Raw Turnstile Counts. Without `+` you get only the first. Licenses come from a second query over every dataset:

```sparql
PREFIX prov: <http://www.w3.org/ns/prov#>
PREFIX dct: <http://purl.org/dc/terms/>
PREFIX dcat: <http://www.w3.org/ns/dcat#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT ?title ?publisher ?license ?activity ?producedBy WHERE {
  ?ds a dcat:Dataset ; dct:title ?title ;
      dct:publisher/rdfs:label ?publisher ;
      dct:license/rdfs:label ?license .
  OPTIONAL { ?ds prov:wasGeneratedBy ?act . ?act rdfs:label ?activity ;
             prov:wasAssociatedWith/rdfs:label ?producedBy . }
}
ORDER BY ?title
```

| title | publisher | license | activity | producedBy |
| --- | --- | --- | --- | --- |
| Daily Ridership by Station | Riverbend Transit Office | Riverbend Open Data License 1.0 | Sensor data cleaning run 2026-04 | Riverbend Transit Office |
| Monthly Ridership Summary | Riverbend City Analytics Team | Riverbend Open Data License 1.0 | Monthly aggregation 2026-03 | Riverbend City Analytics Team |
| Raw Turnstile Counts | Cobalt Sensing Co. | Riverbend Internal Use License | | |

The answer can now cite "Monthly Ridership Summary (Riverbend City Analytics Team, Riverbend Open Data License 1.0), derived from Daily Ridership by Station and Raw Turnstile Counts." Note what the graph shows without judging it: the monthly figure is openly licensed, while the raw counts it ultimately comes from are under an internal-use license. Have the assistant state these facts and, if reuse of the raw data matters, tell the user to check with the publisher. The ontology records licenses; it does not decide what they permit.

## 5. Entity linking: merge records with `schema:sameAs`

Sample: **Research Knowledge Graph** (`research-kg.ttl`). A partner institute's system lists "P. Raman"; yours lists "Priya Raman". A name-based query finds only one of her papers:

```sparql
PREFIX schema: <https://schema.org/>
SELECT ?title WHERE {
  ?person schema:name "Priya Raman" .
  ?paper schema:author ?person ; schema:name ?title .
}
```

One row: Sediment Drift in Shallow Estuaries. Both records carry the same global identifier, so query by that instead:

```sparql
PREFIX schema: <https://schema.org/>
SELECT DISTINCT ?paper ?title ?listedAs WHERE {
  ?person schema:sameAs <https://example.org/ids/person/0103> ; schema:name ?listedAs .
  ?paper schema:author ?person ; schema:name ?title .
}
```

| paper | title | listedAs |
| --- | --- | --- |
| `:paperEstuary` | Sediment Drift in Shallow Estuaries | Priya Raman |
| `:paperTideModel` | A Lightweight Tide Prediction Model | P. Raman |

For an LLM this is the safe way to merge: the model proposes "these look like the same person", but the merge happens only through an identifier both sources share. The model never decides identity from a name alone. The same query also shows where each record comes from — Priya Raman with North Harbor University and Coastal Systems Institute, P. Raman with Marine Data Lab — so the answer can mention all three affiliations.

## 6. Hybrid: an exported Object Ontology plus the glossary

Operational models such as `delivery-ops.oont.yaml` live in the Object Ontology format (see [Choosing an Ontology Style](choosing-ontology-style.md)). To connect one to the glossary, open the YAML file and run **Ontology Viewer: Export Object Ontology as Turtle (OWL)...**. The result is an untitled Turtle document that opens in the viewer.

The viewer queries one document at a time, so to query both together you combine the Turtle. The simplest way is to paste the whole of `glossary-skos.ttl` at the end of the exported document. Turtle allows a later `@prefix :` to redefine the empty prefix, so both halves keep their meaning. For anything larger, load both files into an external triple store.

This query, run on the combined document, finds which actions change a property that has a glossary entry:

```sparql
PREFIX oont: <urn:object-ontology:vocab#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
SELECT ?action ?property ?concept ?ja WHERE {
  ?a a oont:ActionType ; oont:apiName ?action ; oont:rule/oont:sets ?p .
  ?p oont:apiName ?property .
  ?concept skos:prefLabel|skos:altLabel ?label ;
           skos:prefLabel ?ja .
  FILTER (LCASE(STR(?label)) = LCASE(?property) && LANG(?ja) = "ja")
}
```

One row: `markDelayed`, `eta`, `:eta`, 到着予定時刻. An agent that explains a delay to a Japanese customer can now use the glossary's term for the field the action changed. Be aware that this join matches a property name against a label as plain strings. It works here because the names line up; for real use, add explicit mapping triples between your properties and glossary concepts rather than relying on matching names.

## Good to know

- Queries run against the open document only, including unsaved edits, and everything stays local.
- There is no reasoner. Write `+`, `^` and `UNION` yourself, and tell any LLM that writes queries for you to do the same.
- All sample data is fictional, and `example.org` IRIs are not real endpoints.

## Next steps

- [Tutorial 4: Ask Questions with SPARQL](tutorial-4-sparql.md) — the SPARQL panel in detail.
- [Tutorial 5: Your First Object Ontology](tutorial-5-object-ontology.md) and [Tutorial 6: Object Ontology × AI Agents](tutorial-6-object-ontology-ai-agents.md) — the operational side of the hybrid setup.
- [Use Cases](use-cases.md) — which style fits which business scenario.
- [Choosing an Ontology Style](choosing-ontology-style.md) — Object Ontology vs Semantic Web, side by side.
