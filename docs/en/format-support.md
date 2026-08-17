# Format Support

| Format | Extensions | Diagram | Edit from diagram | Rename (F2) |
| --- | --- | --- | --- | --- |
| Turtle | `.ttl`, `.turtle` | ✅ | ✅ | ✅ |
| TriG | `.trig` | ✅ | — | — |
| N-Triples | `.nt` | ✅ | — | — |
| Notation3 | `.n3` | ✅ | — | — |
| RDF/XML | `.rdf`, `.owl` | ✅ | Convert to Turtle first | — |
| JSON-LD | `.jsonld` | ✅ | Convert to Turtle first | — |

## Why only Turtle is editable

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
