# Tutorial 5: Your First Object Ontology

The earlier tutorials worked with OWL and RDF, where everything is a triple. An **Object Ontology** describes the same kind of knowledge the way an application developer thinks about it: *things* with properties, *links* between them, and a short list of *actions* that are allowed to change them.

We'll use **Corner Cafe Orders**, a tiny cafe with menu items, orders and ingredients. Run **Ontology Viewer: Create Sample Ontology...** and pick **Corner Cafe Orders (Object Ontology)**. This creates `cafe-orders.oont.yaml`.

## 1. Five ideas

| Concept | In the cafe | What it means |
| --- | --- | --- |
| **Object type** | `MenuItem`, `Order`, `Ingredient` | A kind of thing, with a primary key and a title property. |
| **Property** | `priceYen`, `status` | A typed field on an object type. |
| **Link type** | `orderItems` | A named, two-sided relationship between object types, with a cardinality on each side. |
| **Interface** | (none here) | A shared set of properties several object types implement. |
| **Action type** | `placeOrder`, `markServed` | A named, parameterized change. It is the only declared way to write data. |

The vocabulary is inspired by the ontology in Palantir Foundry. The file format, however, is this extension's own: it is **not** Palantir's format and is not meant to be imported into or exported from Foundry.

## 2. Walk through the file

Files are plain YAML (or JSON). The extension recognizes them by name: `*.oont.yaml`, `*.oont.yml` or `*.oont.json`. An untitled YAML document whose first key is `objectOntology` counts too. The header looks like this:

```yaml
objectOntology: 1
name: Corner Cafe Orders
```

An object type names its primary key and its title property, then lists its properties. Types can carry an `enum` or a `unit`:

```yaml
objectTypes:
  MenuItem:
    displayName: Menu item
    description: Something a customer can order.
    primaryKey: itemId
    titleProperty: name
    properties:
      itemId: { type: string }
      name: { type: string }
      priceYen: { type: integer, unit: JPY }
      category: { type: string, enum: [drink, food, dessert] }
      available: { type: boolean }
```

A link type has two sides. Each side says which object type it starts from, what the link is called from there, and whether it holds one or many:

```yaml
linkTypes:
  orderItems:
    displayName: Ordered items
    from: { objectType: Order, name: items, cardinality: many }
    to: { objectType: MenuItem, name: orders, cardinality: many }
```

An action type lists its parameters, the `rules` it applies, and the `validations` that must hold:

```yaml
actionTypes:
  markServed:
    displayName: Mark order served
    parameters:
      order: { type: objectRef, objectType: Order, required: true }
    rules:
      - { op: modifyObject, objectType: Order, object: order, set: { status: served } }
    validations:
      - description: Only an order that is being prepared can be served.
        expr: "order.status == 'preparing'"
```

The rule ops are `createObject`, `modifyObject`, `deleteObject`, `createLink` and `deleteLink`. The `expr` string is documentation for humans and AI agents. The extension does **not** evaluate it.

At the bottom, `objects:` holds a few example objects. Link fields use the other object's primary key:

```yaml
objects:
  Order:
    - { orderId: O-1002, placedAt: "2026-04-01T08:30:00+09:00", status: preparing, totalYen: 520, items: [M-02] }
```

## 3. Open and read the diagram

Press `Cmd+Alt+O` / `Ctrl+Alt+O`. The Schema view draws:

- **Object types** as rounded boxes: Menu item, Order and Ingredient.
- **Link types** as arrows with a cardinality badge. `orderItems` and `itemIngredients` are both many-to-many, so each shows **N:N**. Other links show **1:N**, **N:1** or **1:1**.
- **Interfaces** as hexagons with a double border. Implementing an interface draws a dashed blue arrow, and `extends` draws a purple one. The cafe has no interfaces; open **Delivery Operations (Object Ontology)** to see `Trackable`.

The **RDF** toggle switches to the RDF projection of the same file. That projection is what SPARQL queries run against (step 7).

## 4. Edit from the diagram

Every edit from the diagram is written back into the YAML.

- **+ Object type** asks for a name and adds an object type with a string primary key named after it. `Table` gets `tableId`.
- **Connect** takes two clicks: the source type, then the target type. Then type a name. The new link type is "one" on the from side and "many" on the to side. Change the cardinality in the text afterwards if that is wrong.
- In the **Inspector** on the right you can rename (this writes `displayName`), edit the description, add a property, change a property's type, and delete a property or a link type.

Renaming never changes the API name (the YAML key such as `MenuItem`). Rules, links and exported tools keep working. Some deletions are refused on purpose:

- The primary key and the title property cannot be deleted. Change `primaryKey` or `titleProperty` first.
- A link type used by an action rule cannot be deleted. Deleting `orderItems` is refused because `placeOrder` creates that link.

`*.oont.json` files are view-only in the diagram. Click **Convert to YAML to edit** in the banner, or run **Ontology Viewer: Convert Object Ontology JSON to YAML for Editing...**.

## 5. Problems and typo warnings

Misspell a field. Change `description:` under `Ingredient` to `descripton:`. The Problems panel shows a warning on that key:

```text
Unknown field "descripton" in object type Ingredient. Expected one of: displayName, pluralDisplayName, description, primaryKey, titleProperty, icon, color, implements, properties.
```

Broken references are errors. Change `objectType: Order` in the `orderItems` link to `Orders`, and you get `Link orderItems refers to unknown object type "Orders".` Missing primary keys in example objects, duplicate keys and unknown parameters in rules are reported the same way, each at its exact position. The **Outline** view lists the types, interfaces, links and actions in the file.

For completion while you type, `*.oont.json` uses the bundled JSON Schema directly. `*.oont.yaml` gets the same schema when the Red Hat YAML extension is installed.

## 6. The Actions panel

Click **Actions** in the toolbar. A panel opens on the left with every action type. Select **Mark order served** to see:

- **Parameters**: `order`, of type Order, required.
- **Effects**: `modifyObject Order · set: status`.
- **Rejected unless**: Only an order that is being prepared can be served. The `expr` appears next to it in parentheses.

Mark order served has no side effects. Select **Restock ingredient** to see one.

On the diagram, the object types the action touches get an orange outline. **Export as agent tools** at the bottom of the panel is the subject of [Tutorial 6](tutorial-6-object-ontology-ai-agents.md).

## 7. Ask questions with SPARQL

Click **SPARQL**. This is the same panel as in [Tutorial 4](tutorial-4-sparql.md), but **Examples:** now lists eight Object Ontology queries. They use only the `oont:` vocabulary (`urn:object-ontology:vocab#`), so they work on any `*.oont.yaml` file.

Choose **3. What can be done to each type?**:

```sparql
SELECT ?type ?action ?actionLabel
WHERE {
  ?action a oont:ActionType ;
          rdfs:label ?actionLabel ;
          oont:affects ?type .
}
ORDER BY ?type ?actionLabel
```

You get four rows: Ingredient with Restock ingredient, MenuItem with Place order, and Order with Mark order served and Place order. Place order shows up twice because it creates an Order and links it to menu items.

Choose **6. Follow links between objects (search around)**. It follows every link from each example object, for example `Order/O-1001` to `MenuItem/M-01` via `items`, and back again via `orders`. Links in `objects:` are projected in both directions.

You can also write your own. This query answers "which actions change Order, and how?":

```sparql
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX oont: <urn:object-ontology:vocab#>

SELECT ?action ?label ?op
WHERE {
  ?type a oont:ObjectType ;
        oont:apiName "Order" .
  ?action a oont:ActionType ;
          rdfs:label ?label ;
          oont:affects ?type .
  OPTIONAL {
    ?action oont:rule ?rule .
    ?rule oont:objectType ?type ;
          oont:op ?op .
  }
}
ORDER BY ?label
```

It returns two rows: **Mark order served** (`modifyObject`) and **Place order** (`createObject`).

## JSON or YAML?

The two formats hold the same model. YAML is the one to edit: the diagram writes to it, and comments survive. JSON suits files that another program generates. The diagram shows JSON files but does not edit them. Use the convert command when you want to take one over by hand.

To hand the ontology to RDF tools, run **Ontology Viewer: Export Object Ontology as Turtle (OWL)...**. The result uses OWL plus the `oont:` vocabulary and opens in the RDF side of the viewer.

## Next steps

- [Tutorial 6: Object Ontology × AI agents](tutorial-6-object-ontology-ai-agents.md): turn these actions into tools an AI agent can call.
- [Choosing an Ontology Style](choosing-ontology-style.md): when to use an Object Ontology, and when to use OWL/RDF.

Back to the [tutorial list](../en/).
