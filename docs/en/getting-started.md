# Getting Started

## Install

Install **Ontology Viewer** from the VS Code Marketplace (or a `.vsix` file, if you were given one directly).

## Open a sample

Run the command **Ontology Viewer: Create Sample Ontology...** from the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`) and pick one:

| Sample | What it shows |
| --- | --- |
| Neighborhood Garden | A small class hierarchy, inverse relations, and instances. |
| Tool Lending Circle | Inverse, symmetric, transitive, and functional properties. |
| Field Research Notes | Catalog records and typed literals. |
| Community Services | A concept scheme built with SKOS instead of OWL classes. |
| Harbor Market | Icons, colors, cardinality, and relationship attributes. |
| City Mobility Hub | A medium operational ontology spanning several domains. |
| Community Event (RDF/XML) | An original view-only sample and the "Convert to Turtle" workflow. |

Or just open your own `.ttl` file — nothing special is required.

## Open the diagram

With an ontology file focused, press:

- **macOS**: `Cmd+Alt+O`
- **Windows/Linux**: `Ctrl+Alt+O`

...or click the diagram icon in the editor's title bar, or run **Ontology Viewer: Open Diagram Preview** from the Command Palette.

The diagram opens beside your file in the **schema view** by default: one node per class, one edge per relation, with datatype properties folded into each class rather than drawn as separate nodes. Use the **Schema / Triples** toggle in the toolbar to switch to the raw triple graph (every subject/predicate/object as its own node) when you need to see exactly what's in the file.

> **Why not `Cmd+Shift+O`?** That's VS Code's built-in "Go to Symbol in Editor" — genuinely useful on a large `.ttl` file — so this extension deliberately doesn't take it over.

## Try the basics

1. **Drag a node** — its position is remembered the next time you open this file's diagram.
2. **Click a node** — the Inspector opens on the right, showing its name, description, properties, and relations (nodes with a dashed border are editable).
   The Legend explains the color families, and the selected entity shows its connection group.
3. **Edit the name field in the Inspector** — type a new value and press Enter or click away. Watch the `.ttl` file update. The same panel lets you add a property with the "+ Property" button, or change an existing property's type from its dropdown.
4. **Double-click a node** to enter focus mode — everything outside that node's neighborhood dims. Click the background to leave focus mode.
5. Try breaking something on purpose: type invalid Turtle in the editor. The diagram keeps showing the last valid graph, and a diagnostic squiggly line appears at the error.

## Next steps

- [Tutorial 1: Build Your First Ontology](tutorial-1-first-ontology.md)
- [Tutorial 2: Edit From the Diagram](tutorial-2-editing-from-diagram.md)
- [Tutorial 3: Bring In an Existing .owl File](tutorial-3-importing-owl.md)
- [Format Support](format-support.md)
- [Troubleshooting](troubleshooting.md)
