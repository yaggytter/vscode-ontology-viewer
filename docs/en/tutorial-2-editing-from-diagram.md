# Tutorial 2: Edit From the Diagram

This is the feature that makes this extension different from a plain viewer: you can create classes, relations, and properties — and rename or retype existing ones — right from the diagram, and it writes back to your file.

## What "editable" means

A node is editable — shown with a **dashed border**, and with active fields in the Inspector — when its `rdfs:label` (and, for properties, its declaration) can be safely written back to the underlying Turtle. That's true for almost everything in a normal, flat Turtle file. It's **not** true for:

- entities whose existing `rdfs:label` is a multi-line (triple-quoted) string,
- entities that only appear nested inside a blank-node property list (`[ ... ]`) or an RDF collection (`( ... )`),
- properties whose provenance is `inferred` rather than `declared` — i.e. the diagram guessed at them from how they're used, and there's no declaration in the file yet to edit.

Those are documented, deliberate limits — see [Format Support](format-support.md) for why.

## Rename an entity

1. Open `samples/neighborhood-garden.ttl` (via **Ontology Viewer: Create Sample Ontology...**) and open its diagram — it opens in the schema view by default.
2. Click the **Riverside Garden** node. The Inspector opens on the right with a name field showing `Riverside Garden`.
3. Clear it, type `Riverside Community Garden`, and press Enter (or click elsewhere to commit).
4. Look at the text editor: the line

   ```turtle
   :riversideGarden a :Garden ; rdfs:label "Riverside Garden"@en ; :containsPlot :sunnyPlot .
   ```

   became

   ```turtle
   :riversideGarden a :Garden ; rdfs:label "Riverside Community Garden"@en ; :containsPlot :sunnyPlot .
   ```

   Nothing else in the file changed — no reformatting, no reordered prefixes, no touched comments.

## Add a property

Every property in the Inspector's **Properties** list has a name field and a type dropdown, plus a **+ Property** button below the list.

1. Click the **Plot** node.
2. Click **+ Property**, type `wateringFrequency`, and confirm.
3. A brand-new statement gets appended to the file:

   ```turtle
   :wateringFrequency a owl:DatatypeProperty ;
     rdfs:label "wateringFrequency" ;
     rdfs:domain :Plot ;
     rdfs:range xsd:string .
   ```

4. Back in the Inspector, change its type from the dropdown (e.g. to `integer`) — the `rdfs:range` triple updates to `xsd:integer` in place.

## Add a class, and connect it to another with a relation

1. Click **+ Class** in the toolbar, type a name (e.g. `Compost`), and confirm. A new `owl:Class` node appears and is auto-selected.
2. Click **Connect** in the toolbar, then click the **Plot** node (the source), then the new **Compost** node (the target). You'll be prompted for the relation's name — try `receivesCompost`.
3. A new `owl:ObjectProperty` is appended with `rdfs:domain :Plot` and `rdfs:range :Compost`. Press **Esc** at any point before the second click to cancel the connection.

## Safety: what happens if verification fails

Every diagram edit follows the same rule before it ever touches your file:

1. Compute what the edited text *would* look like.
2. Re-parse that proposed text from scratch.
3. Confirm the resulting graph contains exactly the triple(s) you intended.
4. Only then apply it to the real document.

If step 3 fails for any reason, the edit is discarded and you'll see a toast with an error message — your file is left untouched. This is deliberate: a visualization tool that can silently corrupt your data on a bad edge case isn't safe to use for real work.

## Renaming an entity's identifier (not just its label)

Editing the Inspector's name field changes the entity's `rdfs:label`, not its IRI/local name. To rename the *identifier* itself (e.g. `:riversideGarden` → `:riversideCommunityGarden`) everywhere it's used, put your cursor on it in the text editor and press **F2** (Rename Symbol) — same safety check applies before the rename is offered.

## Deleting a property or relation

Each declared property row in the Inspector has a small 🗑 button, and a selected declared relation (an `owl:ObjectProperty`, not a `subClassOf`/`skosBroader` edge) has a **Delete** button of its own. Deleting removes that property's or relation's *entire* declaration — every statement joined to it by `;` — as one unit; nothing else in the file is touched.

If the property or relation is still used elsewhere in the file (as a predicate, e.g. `:lemonBalm :growsIn :sunnyPlot`, or referenced by another declaration, e.g. `owl:inverseOf`), you'll get a confirmation dialog telling you how many places would be left pointing at something that no longer exists, before anything is deleted.

Delete is refused — with a toast, and the text editor jumping to the declaration so you can finish by hand — when:

- the declaration isn't in a simple enough form (nested `[ ... ]`/`( ... )` content, or a multi-line literal), same as any other write-back operation, or
- the same subject is declared as more than one separate top-level statement in the file (rare, but the extension won't guess which one you meant).

## What the diagram still can't do

Deleting a **class**, or a `subClassOf`/`skosBroader` **edge**, isn't implemented — clearing the Inspector's description field, for instance, shows a toast explaining this rather than silently discarding your text. A class's declaration is usually referenced from many other places in the file (every property with it as a domain/range, every subclass, every individual), so removing it safely needs a much bigger reference check than a property or relation's single, self-contained declaration. Delete the relevant lines directly in the text editor for now; the diagram picks up the change on save.

Next: [Tutorial 3: Bring In an Existing .owl File](tutorial-3-importing-owl.md).
