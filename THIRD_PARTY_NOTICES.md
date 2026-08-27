# Third-Party Notices

Ontology Viewer bundles open-source packages. The following inventory lists the extension's direct production dependencies. Adding the in-editor SPARQL engine pulls in the [Comunica](https://comunica.dev/) framework, which contributes a large tree of transitively bundled `@comunica/*`, `@rdfjs/*`, and related packages; the complete, machine-readable inventory of every bundled package and version is preserved in `package-lock.json`. The packages remain subject to their own licenses; this file does not replace those license texts.

Ontology Viewerには、次のオープンソースパッケージが含まれます。以下は直接の本番依存の一覧です。エディタ内SPARQL機能の追加により [Comunica](https://comunica.dev/) フレームワークが取り込まれ、多数の `@comunica/*`・`@rdfjs/*` 系パッケージが推移的に同梱されます。同梱される全パッケージとバージョンの完全な一覧は `package-lock.json` に記録されています。各パッケージにはそれぞれのライセンスが適用され、この文書はライセンス本文に代わるものではありません。

| Package | Version | License |
| --- | --- | --- |
| `@comunica/query-sparql-rdfjs` | 4.5.0 | MIT |
| `@vscode/l10n` | 0.0.18 | MIT |
| `cytoscape` | 3.34.0 | MIT |
| `cytoscape-dagre` | 4.0.0 | MIT |
| `cytoscape-fcose` | 2.2.0 | MIT |
| `jsonld-streaming-parser` | 5.0.1 | MIT |
| `n3` | 2.1.1 | MIT |
| `rdfxml-streaming-parser` | 3.2.0 | MIT |

The Comunica SPARQL engine and its `@comunica/*` / `@rdfjs/*` dependency tree are published under the MIT license. Source code and complete license information for each package are available through its npm package page at `https://www.npmjs.com/package/<package-name>` and in the corresponding package metadata installed by npm. A machine-readable dependency snapshot is preserved in `package-lock.json`.

The project as a whole is distributed under the [MIT License](LICENSE).
