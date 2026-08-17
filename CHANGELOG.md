# Changelog

All notable changes to the Ontology Viewer extension are documented in this file.

[日本語](CHANGELOG.ja.md)

## [0.2.0] — Schema diagram

- **Schema diagram** (new default view) — a class-centric ER-style diagram: one node per `owl:Class`, one edge per relation, with datatype properties folded into each class instead of drawn as separate nodes. A resolution ladder rescues object properties that only have `owl:inverseOf`, a union/intersection domain, an `owl:Restriction`, or purely instance-level usage, rather than silently dropping them; anything still unresolved is listed as an unattached property instead of vanishing. SKOS-only documents (no `owl:Class` at all) fall back to treating `skos:Concept` as the entity type.
- **Triples view** — the previous raw subject/predicate/object graph, kept behind a toolbar toggle for lower-level debugging.
- **Inspector panel** — click a node or edge to see its name, description, properties, and relations, with instance counts and per-relation cardinality where known. Includes live search, a double-click focus mode, a legend, and entity/relation/property counts.
- **Playground-inspired exploration UX** — the canvas now uses readable color-accented entity cards, a dotted workspace, floating zoom/fit/layout controls, and a keyboard-friendly navigator that searches entities, relations, and properties. The Inspector stays beside wide diagrams, floats above medium-width diagrams, and becomes a dismissible bottom sheet in narrow VS Code editor groups so it never crushes the graph.
- **Write-back from the diagram**: create classes and relations (two-click "Connect" mode), add/rename/retype/**delete** properties, rename any entity or property, and edit descriptions — all via the Inspector, all verified by re-parsing before every write. Deleting a property or an object-property relation removes its entire declaration as one unit; if anything else in the document still references it, a confirmation dialog shows how many places would be left pointing at nothing. Deleting a class, or a `subClassOf`/`skosBroader` edge, isn't offered — those don't fit the same "one self-contained declaration" shape and need a much larger reference check to remove safely.
- **Deterministic icon**, and **relational color**: entities connected in the diagram (by a relation, `subClassOf`, or `skosBroader`) are colored as one hue family, and unrelated parts of the graph get visibly different colors — a rough visual cue for how related two entities are, not just a per-name hash. An `icon`/`color` override is recognized when a document already uses the Ontology-Playground extension predicates, and neither is ever written to the file.
- **Export the diagram as PNG.**
- Japanese localization for the "Create Sample Ontology..." picker's sample names and descriptions (previously always shown in English regardless of VS Code's display language).
- `ontologyViewer.preview.defaultView` setting (`schema` or `triples`) to control which view opens by default.
- Added an original bundled sample, `harbor-market.ttl`, demonstrating `icon`/`color`/`isIdentifier`/`fromEntityId`/`toEntityId`/`cardinality`/`relationshipAttributeOf` extensions.
- Several webview bug fixes carried over from the previous view: the empty-state banner, canvas sizing, and saved-layout restoration are all more robust now, and diagram edge lines use a theme token (`--vscode-charts-lines`) that stays visible in dark themes instead of one tuned for subtle borders.

## [0.1.0] — Initial release
