# Tutorial 1: Build Your First Ontology

This walks through creating a tiny ontology from scratch and watching it appear in the diagram as you type.

## 1. Create a new file

Create `animals.ttl` and start with the prefixes you'll need:

```turtle
@prefix : <http://example.org/animals#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
```

## 2. Open the diagram

Press `Cmd+Alt+O` / `Ctrl+Alt+O`. It opens in the schema view — empty for now, since there's no `owl:Class` yet.

## 3. Add a class

```turtle
:Animal a owl:Class ;
  rdfs:label "Animal" .
```

Save the file (or just wait — the diagram refreshes automatically after a short pause). A single node labeled "Animal" appears.

## 4. Add a subclass and a relation

```turtle
:Dog a owl:Class ;
  rdfs:label "Dog" ;
  rdfs:subClassOf :Animal .

:Person a owl:Class ;
  rdfs:label "Person" .

:hasOwner a owl:ObjectProperty ;
  rdfs:label "has owner" ;
  rdfs:domain :Dog ;
  rdfs:range :Person .
```

Three class nodes now: `Dog` connected to `Animal` by an `rdfs:subClassOf` edge (drawn with an open triangle arrowhead, distinct from ordinary relations), and `Dog` connected to `Person` by a `has owner` edge. Datatype properties don't get their own nodes in this view — they show up in the Inspector's property list for whichever class they belong to. Try adding one:

```turtle
:age a owl:DatatypeProperty ;
  rdfs:label "age" ;
  rdfs:domain :Dog ;
  rdfs:range xsd:integer .
```

(You'll need `@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .` at the top for this one.) Click the `Dog` node — the Inspector's Properties list now shows `age: integer`.

## 5. Add an individual

```turtle
:rex a :Dog ;
  rdfs:label "Rex" .

:alice a :Person ;
  rdfs:label "Alice" .

:rex :hasOwner :alice .
```

Individuals aren't drawn as their own nodes in the schema view — click `Dog` and look at the Inspector's instance count, which is now `1`. If you want to see individuals as actual nodes (along with every raw subject/predicate/object triple), switch to the **Triples** view with the toolbar toggle.

## 6. Rearrange it

Drag `Dog` and `Person` next to each other. Close the diagram and reopen it (`Cmd+Alt+O` again) — they're still where you left them. (Layout positions are remembered separately for the schema and triples views, since they're different graphs over the same file.)

Next: [Tutorial 2: Edit From the Diagram](tutorial-2-editing-from-diagram.md).
