# Tutorial 9: Run It with Claude Code — Semantic Web Answers

[Tutorial 7](tutorial-7-semantic-web-llm.md) shows how an LLM can answer from a Semantic Web ontology instead of from memory: it writes SPARQL, runs it, and answers only from the rows. This tutorial runs that loop for real, with **Claude Code** as the assistant.

> **New to these ideas?** Read the [illustrated primer](https://yaggytter.github.io/vscode-ontology-viewer/index.en.html) first. It walks through the scenario, the problem and the steps with pictures, and has [captioned videos](https://yaggytter.github.io/vscode-ontology-viewer/index.en.html#video) of the terminal parts, with what to watch for.

No server is involved this time. The example gives Claude Code one local command, `npm run sparql`, which runs a query over Turtle files with **the same engine as the viewer's SPARQL panel**. Claude Code reads the files, writes a query, runs it, and answers. You then paste its query into the panel and check the result on the diagram.

What you need:

- [Claude Code](https://docs.claude.com/en/docs/claude-code/overview), installed and signed in. The conversations below use your Claude plan.
- Node.js 22.6 or later (`node -v`).
- Git, VS Code and this extension.

> Claude Code's replies differ from run to run. The transcripts below are from real runs; yours may use other queries that are just as correct. What to check is the same every time: did it run a query, and does every claim in the answer trace back to a row?

## 0. Get the example

```sh
git clone https://github.com/yaggytter/vscode-ontology-viewer.git
cd vscode-ontology-viewer/examples/claude-code/semantic-web-sparql
npm install
npm test
```

`npm test` should report 7 passing tests. They run tutorial 7's queries through the command and check the results the tutorial documents.

| Path | What it is |
| --- | --- |
| `data/*.ttl` | Bundled samples, unchanged: `product-compatibility`, `glossary-skos`, `dataset-catalog`, `research-kg`. |
| `data/delivery-ops.export.ttl` | Output of **Export Object Ontology as Turtle (OWL)** for the delivery sample. |
| `CLAUDE.md` | Instructions for Claude Code: tutorial 7's prompt template turned into project rules, plus a list of the files. |
| `.claude/settings.json` | Permissions: the `sparql` command runs without asking; files in `data/` may not be edited. |
| `src/sparql.ts` | The command. |

## 1. Run the command yourself

Before handing it to Claude Code, run tutorial 7's first query yourself:

```sh
npm run --silent sparql -- data/product-compatibility.ttl -q '
PREFIX : <https://example.org/product-compatibility#>
ASK { { :cassetteR12 :compatibleWith :chainR11 } UNION { :chainR11 :compatibleWith :cassetteR12 } }'
```

It prints `false`. A SELECT query prints a Markdown table, with IRIs shortened by the file's prefixes:

```text
3 rows

| term | en | ja |
| --- | --- | --- |
| :eta | "Estimated Time of Arrival"@en | "到着予定時刻"@ja |
| :proofOfDelivery | "Proof of Delivery"@en | "配達証明"@ja |
| :onTimeRate | "On-Time Delivery Rate"@en | "定時配達率"@ja |
```

Pass several files to query them as one graph. The command reads only the files you name. It has no network access, and it rejects `SERVICE`, `LOAD` and `FROM` with a message instead of quietly returning nothing.

## 2. Start Claude Code

```sh
claude
```

On the first start, Claude Code asks whether you trust this folder, because its `.claude/settings.json` pre-approves the `sparql` command. The highlighted default is **No, continue without these permissions**; move to **Yes, I trust this folder** with the arrow keys and press Enter. With "No", Claude Code asks before every query.

Claude Code reads `CLAUDE.md`. These are the rules from tutorial 7's prompt template: use the declared prefixes, spell out symmetric, transitive and inverse properties because no reasoner runs, mind language tags, and treat `false` as "not recorded" rather than "untrue". It also adds one rule for this setup: show each query before the answer.

## 3. GraphRAG: a compatibility question

```text
Does the Ridge 12-speed cassette fit my Ridge 11-speed chain?
```

In a real run, Claude Code read `data/product-compatibility.ttl` and ran three queries in one command. The first was the symmetric `ASK` from tutorial 7, which returned `false`. Then it asked what each part *does* fit. Its answer:

> The catalog has no compatibility link between the Ridge 12-speed Cassette 10-51 (CS-R12) and the Ridge 11-speed Chain (CH-R11). That absence doesn't prove they're incompatible. … The 12-speed cassette is listed as fitting only the **Ridge 12-speed Chain (CH-R12)** and the Boost 29 Wheelset. … The file also says the 12-speed chain replaces the 11-speed chain.

It read `false` correctly as "not recorded". It checked both directions of the symmetric property. It also found the `:replaces` fact, which tutorial 7 reaches with a separate query.

## 4. Check its query in the viewer

Open `data/product-compatibility.ttl` in VS Code and open the diagram. Open the **SPARQL** panel and paste one of Claude Code's SELECT queries. Set **On match:** to **Highlight**, press **Run**, then switch to **Triples**. The rows match the command's output, because both use the same engine, and the matched parts light up on the diagram.

This is the habit from [tutorial 7, section 2](tutorial-7-semantic-web-llm.md#2-let-the-llm-write-sparql-then-verify-it-in-the-viewer): the model writes the query, you check what it matched.

## 5. A Japanese question, an English glossary

```text
「到着予定時刻」について書かれた社内ドキュメントを探したいです。検索語として使える言い換えを、英語と日本語ですべて挙げてください。
```

In a real run, Claude Code first grepped the glossary for its prefixes and the matching entries. Then it ran a single query that matched the term with `STR()`, so the `@ja` tag didn't get in the way, and collected every label of that concept. It answered in Japanese, listing the same 5 labels as tutorial 7: Estimated Time of Arrival / ETA / Arrival Estimate / 到着予定時刻 / 到着予定.

It also noted that the glossary uses no `skos:hiddenLabel` or `skos:exactMatch`, so these 5 are all the glossary records. And it suggested the related concept On-Time Delivery Rate and the broader concept Last Mile for widening the search.

## 6. Provenance and licenses

```text
How many people rode the network in March 2026? Where does that number come from, and can I reuse the underlying data?
```

In a real run, Claude Code answered **1,284,300 entries** and pointed out that the figure counts turnstile entries, not distinct people. It ran two queries: one for the dataset that reports the figure, and one that walked `prov:wasDerivedFrom*` back to the raw data, with each dataset's publisher and license. Its answer named all three datasets. It said the monthly and daily data are under the Riverbend Open Data License 1.0, while the raw turnstile counts are under an internal-use license. It added that the graph names the licenses but doesn't record what they permit. That matches tutorial 7's advice: state the facts, and send the user to the license for the rest.

## 7. Entity linking

```text
List every paper by Priya Raman, including any listed under another name.
```

In a real run, Claude Code didn't search by name. It followed `schema:sameAs` from "Priya Raman" to the shared identifier, and from there to every record carrying it. That found two papers: one credited to Priya Raman, and one to "P. Raman" from a partner's system. It also explained that searching by name alone would have found only the first.

## 8. Hybrid: the exported Object Ontology plus the glossary

`data/delivery-ops.export.ttl` is the delivery Object Ontology, exported as Turtle. To make it yourself, open `delivery-ops.oont.yaml` and run **Ontology Viewer: Export Object Ontology as Turtle (OWL)...**. Unlike the viewer, the command can load two files at once, so you don't have to combine them first.

```text
Which delivery actions change a field that has a glossary entry? What is that field called in Japanese?
```

In a real run, Claude Code first listed the fields each action's rules set. Then it queried both files together, matching field names against glossary labels without regard to case. The result was the row from tutorial 7: `markDelayed` changes `eta`, whose Japanese term is 到着予定時刻.

It added the warning tutorial 7 gives as well: the two files share no IRIs, so the match is by name only. The other fields have no glossary entry, which doesn't prove the terms exist nowhere else.

In the output, IRIs from the glossary appear in full (`<https://example.org/glossary-skos#eta>`). Both files bind `:` to different namespaces, so the command doesn't use `:` when printing results from the two together.

## 9. Exercise: the transitive trap

```text
List every part on the Trailfinder Complete Bike.
```

The bike's chain, cassette, crankset and derailleur sit inside its drivetrain kit, so a correct answer needs a transitive path. In a real run, Claude Code used `?part (:partOf|^:hasPart)+ :trailBike` and found all 7 parts. Now run the query without `+` yourself, in the panel or with the command. Only the 3 direct parts come back. That's the mistake tutorial 7 warns about. Seeing the difference once makes it easy to spot in a model's query.

## How the command works

`src/sparql.ts` parses each file with N3 into one in-memory store and runs the query with Comunica, the engine behind the viewer's SPARQL panel. It prints the result as text. Prefixes come from the files' `@prefix` lines; a prefix that two files bind differently is dropped from the output. The engine has no HTTP support, so queries cannot reach the network.

## Troubleshooting

- **Claude Code asks before running `cat` or `grep`.** It reads the files to learn their prefixes. Approve it, or add the commands to `.claude/settings.json`.
- **0 rows for a query that should match.** Check the prefix IRIs (`https://schema.org/` vs `http://`), the direction of the property, a missing `+`, and language tags. These are the usual mistakes from [tutorial 7, section 2](tutorial-7-semantic-web-llm.md#common-llm-sparql-mistakes-to-check).
- **"Remove FROM / FROM NAMED".** Every file you pass is already in the default graph, so delete the clause.

## Next steps

- [Tutorial 8: Run It with Claude Code — Object Ontology Agents](tutorial-8-claude-code-object-ontology.md): agents that change data through actions.
- [Tutorial 7: Semantic Web Ontologies × LLMs](tutorial-7-semantic-web-llm.md): the concepts and verified queries behind this tutorial.

Back to the [tutorial list](../en/).
