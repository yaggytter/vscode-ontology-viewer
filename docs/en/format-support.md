# Format Support

| Format | Extensions | Diagram | SPARQL | Edit from diagram | Rename (F2) |
| --- | --- | --- | --- | --- | --- |
| Turtle | `.ttl`, `.turtle` | ✅ | ✅ | ✅ | ✅ |
| TriG | `.trig` | ✅ | ✅ | — | — |
| N-Triples | `.nt` | ✅ | ✅ | — | — |
| Notation3 | `.n3` | ✅ | ✅ | — | — |
| RDF/XML | `.rdf`, `.owl` | ✅ | ✅ | Convert to Turtle first | — |
| JSON-LD | `.jsonld` | ✅ | ✅ | Convert to Turtle first | — |
| Object Ontology (YAML) | `.oont.yaml`, `.oont.yml` | ✅ | ✅ | ✅ | — |
| Object Ontology (JSON) | `.oont.json` | ✅ | ✅ | Convert to YAML first | — |

SPARQL querying works on every format the diagram can read, because it runs against the parsed triples rather than the source text — no conversion needed. Among the RDF formats, only *writing back* is Turtle-only; Object Ontology files are covered [below](#object-ontology-files).

## Why only Turtle is editable among RDF formats

Writing a diagram edit back into a source file safely requires knowing the *exact character range* in the original text that corresponds to the piece being changed — not just "this triple changed," but "these specific characters, on this specific line." Turtle's grammar (and the tokenizer this extension builds on) makes that tractable to get right, including tricky cases like:

- a prefix being redeclared partway through a document, so the same `ex:` means something different before and after,
- `@base` changing partway through a document,
- multi-line triple-quoted string literals,
- blank-node property lists (`[ ... ]`) and RDF collections (`( ... )`).

RDF/XML and JSON-LD would each need their own from-scratch position-tracking parser (XML and JSON have completely different tokenization) to get the same guarantee, which is a much larger undertaking with a much larger surface for subtle bugs. Rather than ship write-back for those formats without the same level of confidence, v1 keeps the safe, well-tested path to Turtle only, with **Convert to Turtle** as the documented on-ramp.

## Limits even within Turtle

Not every part of a valid Turtle file is diagram-editable. A node shows a **dashed border** (editable) only when it doesn't run into one of these:

| Situation | What happens |
| --- | --- |
| Existing `rdfs:label` is a multi-line (`"""..."""`) string | Not editable from the diagram — edit it in the text editor directly. |
| Entity only appears inside a blank-node property list (`[ ex:p ex:q ]`) or an RDF collection (`( ex:x ex:y )`) | Not editable from the diagram. |
| Everything else in a normally-written Turtle file | Editable. |

These are conservative by design: the extension will refuse to offer an edit rather than guess and risk writing something wrong.

## The safety guarantee

Every diagram edit and every F2 rename goes through the same check before it's written:

1. Compute the proposed new text.
2. Re-parse it from scratch.
3. Confirm the resulting RDF graph contains exactly the change that was intended (and, for renames, that the old identifier is gone everywhere and the new one is present).
4. Only apply the edit if step 3 passes.

If verification fails, nothing is written, and you'll see an error explaining why.

## Object Ontology files

Object Ontology documents are YAML (or JSON) files whose name ends in `.oont.yaml`, `.oont.yml`, or `.oont.json`. They keep VS Code's normal YAML/JSON language mode, so syntax highlighting and other YAML tooling keep working; the extension recognizes them by file name. An untitled YAML document whose first key is `objectOntology` is recognized too, which is how samples opened with **Create Sample Ontology...** work before you save them. Ordinary `.yaml`, `.json`, and `.jsonld` files are never treated as Object Ontologies.

The top-level keys are `objectOntology` (the format version, `1`), `name`, `description`, `namespace` (optional IRI for the RDF projection), `objectTypes`, `interfaces`, `linkTypes`, `actionTypes`, and `objects` (optional example data). The full shape is defined by the bundled JSON Schema, `schemas/object-ontology.schema.json`, which VS Code applies to `*.oont.json` automatically and the Red Hat YAML extension applies to `*.oont.yaml`. [Your First Object Ontology](tutorial-5-object-ontology.md) walks through every section.

Editing from the diagram works on YAML files only. JSON files are view-only; use **Convert Object Ontology JSON to YAML for Editing...** (or the link in the diagram banner). Diagram edits follow the same safety rule as Turtle: the change is a minimal text replacement at the exact YAML location, the proposed text is re-parsed, and the edit is applied only if the intended change is present. When an edit cannot be placed safely (for example, while the YAML has a syntax error, or when deleting a primary key that the type still names), it is refused with an explanation instead of rewriting the file.

SPARQL on an Object Ontology runs against its RDF projection: object types become `owl:Class`, properties `owl:DatatypeProperty`, link sides `owl:ObjectProperty`, and the `oont:` vocabulary (`urn:object-ontology:vocab#`) describes link types, actions, parameters, and rules. Example objects become individuals. **Export Object Ontology as Turtle (OWL)...** writes the same projection as a Turtle file.
