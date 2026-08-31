# Troubleshooting

## The diagram is empty

- Check the Problems panel — if the file has a syntax error, the diagram keeps showing the last valid graph (or nothing, if it's never parsed successfully).
- An ontology with no `rdf:type` / class / property / individual triples at all will show an empty diagram by design — there's nothing to draw yet.

## My SPARQL query returned rows, but the diagram didn't change

Check the **On match:** selector in the SPARQL panel first — if it is set to **No graph effect**, the result is text-only by design.

Otherwise, the most likely reason is that the query matched things the current view doesn't draw. The **Schema** view draws classes; the **Triples** view draws every resource. So a query matching individuals highlights their *class* in the schema view, and the individuals themselves in the triples view. If nothing lights up in the schema view, try switching to **Triples** and running the query again.

Note that you do *not* need to return a resource in order to highlight it: a query that projects only literals (labels, prices, names) still highlights the resources carrying those literals. If a query returns rows and still highlights nothing in either view, that's worth an issue report.

An `ASK` query never highlights anything — it answers `true`/`false` and has no resources to point at.

## My SPARQL query failed or returned nothing

- A syntax error is reported in the panel and the diagram is left untouched. Check for a missing `PREFIX`, an unbalanced `{`, or a `.` at the end of the last pattern.
- Returning zero rows is a valid answer. Try one of the built-in **Examples:** to confirm the panel works against this document, then narrow from there.
- Remember to declare a prefix for your own namespace. The examples only declare `rdf:`, `rdfs:`, and `owl:`, so a pattern using your ontology's terms needs its own `PREFIX` line.
- Queries run against the file as it currently is in the editor, including unsaved changes.

See the [SPARQL tutorial](tutorial-4-sparql.md) for a guided walkthrough.

## A node doesn't have a dashed border (can't edit it)

That entity's label isn't safely editable from the diagram right now. Common reasons:

- its existing `rdfs:label` is a multi-line (triple-quoted) string,
- it only appears nested inside `[ ... ]` or `( ... )`.

See [Format Support](format-support.md#limits-even-within-turtle) for the full list. Edit it directly in the text editor instead.

## My edit didn't apply / I got an error message

The extension re-parses every proposed edit before writing it and rejects anything that doesn't produce exactly the expected result. If you see a toast error after editing an Inspector field or using F2 rename, nothing was written — your file is unchanged. This is deliberate: it's safer to refuse an edit than to guess and risk corrupting your ontology. If this happens on a file that looks like normal Turtle to you, please file an issue with a minimal reproduction.

## `Cmd+Shift+O` / `Ctrl+Shift+O` didn't open the diagram

That's expected — it's VS Code's built-in "Go to Symbol in Editor". This extension uses `Cmd+Alt+O` / `Ctrl+Alt+O` instead, specifically so it doesn't take over a shortcut that's genuinely useful on large ontology files. Use the editor toolbar button or the Command Palette if you'd rather not memorize a new shortcut.

## RDF/XML or JSON-LD file won't let me edit from the diagram

That's by design — see [Format Support](format-support.md#why-only-turtle-is-editable). Use **Ontology Viewer: Convert to Turtle for Editing...** first.

## Node positions disappeared

Node positions are stored in VS Code's workspace state, keyed by the file's location — not inside the ontology file itself, and not synced across machines by default. If you open the same file from a different machine or a different workspace folder, it'll start with an auto-arranged layout. Use **Ontology Viewer: Export Diagram Layout as JSON...** if you want to save (or share) a layout explicitly.

## Still stuck?

Open an issue on the project's GitHub repository with:

- the VS Code version (`Help > About`),
- the extension version,
- a minimal `.ttl`/`.owl`/`.jsonld` file that reproduces the problem.
