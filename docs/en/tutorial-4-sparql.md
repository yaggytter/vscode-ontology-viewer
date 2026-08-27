# Tutorial 4: Ask Questions with SPARQL

SPARQL is the query language for RDF. If you have never written a line of it, this tutorial gets you a real answer in about a minute — the panel ships ready-made examples, so you can start by running one rather than by writing one.

We'll use **Harbor Market**, which has both a schema (classes like Stall and Product) and some actual instances to find. Run **Ontology Viewer: Create Sample Ontology...** and pick **Harbor Market**, then press `Cmd+Alt+O` / `Ctrl+Alt+O` to open the diagram.

## 1. Open the SPARQL panel

Click **SPARQL** in the diagram toolbar. A panel opens over the canvas with an example picker, a query editor, and a results area.

## 2. Run your first query without writing one

Open **Examples:** and choose **1. Show me anything (first 20 triples)**. The editor fills in:

```sparql
SELECT ?subject ?predicate ?object
WHERE {
  ?subject ?predicate ?object .
}
LIMIT 20
```

Press **Run** (or `Ctrl`/`Cmd`+`Enter`). You get a table of 20 rows.

That is the whole shape of a SPARQL query: `SELECT` names the columns you want, and `WHERE` describes the pattern to look for. `?subject` is a *variable* — it matches anything, and whatever it matched shows up in that column. Here the pattern is "any statement at all", which is why it returns everything.

## 3. Ask something specific

Choose **2. List all classes**:

```sparql
SELECT ?class ?label
WHERE {
  ?class a owl:Class .
  OPTIONAL { ?class rdfs:label ?label }
}
```

Two new ideas:

- `a` is shorthand for "is a" (`rdf:type`). So `?class a owl:Class` means "find things declared as a class".
- `OPTIONAL` means *include the label if there is one*. Without it, a class with no label would drop out of the results entirely.

You should see Vendor, Stall, Product, and Market Day.

## 4. Watch the diagram react

This is the part that makes querying inside a diagram useful. Look at the **On match:** selector, which is set to **Highlight**.

Choose **3. List instances and their class** and run it. The results list individuals such as Pier Stall and Sea Salt Crackers — and on the diagram, the matching nodes gain a highlight ring.

If you are in the default **Schema** view, you will see **Stall** and **Product** highlighted rather than the individuals themselves. That is intentional: the schema view draws classes, not instances, so a match on `:pierStall` lights up the class it belongs to. Switch to the **Triples** view and run the query again — now the individual nodes `pierStall` and `seaSaltCrackers` highlight directly, because that view actually draws them.

Try the other two graph modes:

- **Filter** dims everything the query did not match, so only the answer stays bright. It combines with the search box and with double-click focus, so you can narrow by query *and* by name at once.
- **No graph effect** leaves the diagram alone and gives you the text result only.

## 5. Count things

Choose **4. Count instances per class**:

```sparql
SELECT ?class (COUNT(?instance) AS ?instances)
WHERE {
  ?instance a ?class .
}
GROUP BY ?class
ORDER BY DESC(?instances)
```

`GROUP BY` collapses all rows that share a class into one, `COUNT` tallies how many were collapsed, and `AS ?instances` names the resulting column. `ORDER BY DESC(...)` puts the biggest number first.

## 6. Search text

Choose **7. Search labels for a word**:

```sparql
SELECT ?resource ?label
WHERE {
  ?resource rdfs:label ?label .
  FILTER(CONTAINS(LCASE(STR(?label)), "a"))
}
```

`FILTER` throws away rows that don't satisfy a condition. `STR` turns the label into plain text, `LCASE` lowercases it so the match is case-insensitive, and `CONTAINS` does the substring test. Replace `"a"` with any word — try `"stall"` — and run it again.

## 7. Yes/no questions and generated graphs

Two query forms return something other than a table:

- **8. Ask a yes/no question** uses `ASK` and answers `true` or `false`. There are no rows and nothing to highlight.
- **9. Build a resource-only graph** uses `CONSTRUCT`, which returns *triples* instead of a table. The results area shows them as subject/predicate/object rows. This one keeps only links between resources and drops literal values, which is a quick way to see the shape of a graph without the noise of every string and number.

## Writing your own

Your ontology has its own namespace, so declare a prefix for it. Harbor Market's is `https://example.org/ontology/harbor-market#`:

```sparql
PREFIX : <https://example.org/ontology/harbor-market#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

SELECT ?stall ?product
WHERE {
  ?stall a :Stall ;
         :offers ?product .
}
```

The `;` repeats the previous subject, so this reads "find a stall, and the products that same stall offers".

A useful thing to know: you do **not** have to return the resources you want highlighted. This query returns only literals —

```sparql
SELECT ?stallLabel ?price
WHERE {
  ?stall a :Stall ; rdfs:label ?stallLabel ; :offers ?product .
  ?product :unitPrice ?price .
}
```

— yet the diagram still highlights Stall and Product. Returned literals are traced back to the resources that carry them, so the diagram reflects what your query was *about*, not just which columns you happened to project.

## Good to know

- **SELECT, ASK, CONSTRUCT, and DESCRIBE** are all supported (SPARQL 1.1).
- Queries run against the file as it is **right now** in the editor, including unsaved edits.
- Everything executes **locally** inside VS Code. No part of your ontology is sent anywhere.
- A syntax error or a failed query is reported in the panel; the diagram is left as it was.

Next: [Format Support](format-support.md), or back to the [tutorial list](../en/).
