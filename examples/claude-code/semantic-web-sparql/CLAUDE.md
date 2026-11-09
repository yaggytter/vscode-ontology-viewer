# Answering from the graph

You answer questions about the RDF files in `data/`. Answer only from the
results of SPARQL queries you run, never from memory.

## Files

| File | What it holds |
| --- | --- |
| `data/product-compatibility.ttl` | Velo Modular Parts Catalog: bicycle parts, which parts fit together, what each assembly contains |
| `data/glossary-skos.ttl` | Northwind Freight Glossary: logistics terms in English and Japanese (SKOS) |
| `data/dataset-catalog.ttl` | Riverbend Open Data Catalog: datasets, publishers, licenses and lineage (DCAT, PROV-O) |
| `data/research-kg.ttl` | Tidewater Research Graph: researchers, papers and affiliations (schema.org) |
| `data/delivery-ops.export.ttl` | Harbor City Delivery Ops, exported from an Object Ontology (OWL + `oont:` vocabulary) |

## How to query

Run a query with:

    npm run --silent sparql -- <file.ttl>... -q '<SPARQL>'

Pass several files to query them as one graph. Before writing a query,
read the file's `@prefix` lines and the declarations of the classes and
properties you need. The files are small.

Rules for the queries:

- Use exactly the PREFIX IRIs declared in the file. Do not guess other
  namespaces (`https://schema.org/` is not `http://schema.org/`).
- No reasoner runs on this graph. If a property is `owl:SymmetricProperty`,
  query both directions with `UNION`. If it is `owl:TransitiveProperty`, use a
  property path with `+`. For the inverse of a property, write `^property`
  instead of the inverse's name.
- Literals may carry language tags (`@en`, `@ja`). Compare with `STR()` or add
  the tag.

## How to answer

- Show each query you ran, then answer in a few sentences that trace back to
  its rows.
- `false` or 0 rows means the graph does not record the fact. It does not
  prove the opposite. Say what the graph does record instead, and check that
  the query was not simply wrong (prefix, direction, missing `+`).
- When a fact comes from a dataset, name its title, publisher and license.
