# Tutorial 3: Bring In an Existing .owl File

Most real-world OWL files you'll find in the wild are RDF/XML (`.owl` or `.rdf`), not Turtle. This extension can display them, but write-back is Turtle-only (see [Format Support](format-support.md)). Here's the recommended workflow.

## 1. Open the file

Open `samples/community-event.rdf` (via **Ontology Viewer: Create Sample Ontology...**), or any `.owl`/`.rdf` file you have.

## 2. Preview it

Press `Cmd+Alt+O` / `Ctrl+Alt+O`. You'll see the graph — participants, activities, venues, and their relationships in this sample — and you can drag nodes around and click them to jump to the underlying XML.

Notice the banner at the top of the diagram: **"This format is view-only in the diagram."**

## 3. Convert to Turtle

Either:

- click **"Convert to Turtle to edit"** in that banner, or
- run **Ontology Viewer: Convert to Turtle for Editing...** from the Command Palette.

This parses the RDF/XML, serializes it as Turtle, and opens the result as a new **untitled** document — your original `.rdf`/`.owl` file is never modified.

## 4. Save and continue

Save the untitled document as a `.ttl` file. From here on, it's a normal editable Turtle file: open its diagram, drag nodes, edit fields in the Inspector, use F2 to rename — everything from [Tutorial 2](tutorial-2-editing-from-diagram.md) applies.

## What to expect in the converted output

- Common vocabularies (`rdf`, `rdfs`, `owl`, `xsd`, `skos`, `dcterms`, `foaf`) come out with their usual prefixes.
- Anything else is written with whatever prefixes were declared in the original file's `xmlns` attributes, where recoverable.
- The exact formatting (line breaks, statement grouping) will look different from hand-written Turtle — that's expected, since it's generated fresh rather than reformatted from the XML source.

Next: [Format Support](format-support.md) for the full picture of what's editable and what isn't.
