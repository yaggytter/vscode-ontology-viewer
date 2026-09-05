# Third-Party Notices

Ontology Viewer bundles open-source packages. The table below lists the extension's direct production dependencies for version 0.4.0. The in-editor SPARQL engine brings in the [Comunica](https://comunica.dev/) framework, which expands the bundled set to 403 packages in total (mostly `@comunica/*`, `@rdfjs/*`, and their supporting libraries); the complete, machine-readable inventory of every bundled package and exact version is preserved in `package-lock.json`. The packages remain subject to their own licenses; this file does not replace those license texts.

Ontology Viewerには、次のオープンソースパッケージが含まれます。下の表はバージョン0.4.0における直接の本番依存です。エディタ内SPARQL機能により [Comunica](https://comunica.dev/) フレームワークが加わり、同梱されるパッケージは合計403個になります（大半は `@comunica/*`・`@rdfjs/*` とその依存ライブラリです）。同梱される全パッケージと正確なバージョンの完全な一覧は `package-lock.json` に記録されています。各パッケージにはそれぞれのライセンスが適用され、この文書はライセンス本文に代わるものではありません。

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

## License summary of the full bundled set

Every one of the 403 bundled production packages is distributed under a permissive license. No copyleft-licensed package (GPL, LGPL, AGPL, MPL, EPL, CDDL, or SSPL) is included.

同梱される403個の本番依存パッケージは、すべて許容的ライセンスで配布されています。コピーレフト系ライセンス（GPL・LGPL・AGPL・MPL・EPL・CDDL・SSPL）のパッケージは含まれていません。

| License | Packages |
| --- | ---: |
| MIT | 385 |
| ISC | 9 |
| BSD-2-Clause | 5 |
| Apache-2.0 | 1 |
| BSD-3-Clause | 1 |
| FreeBSD (BSD-2-Clause) | 1 |
| WTFPL OR MIT | 1 |

Counts were taken from the installed dependency tree for version 0.4.0 (`npm ls --omit=dev --all`). Re-run that command against `package-lock.json` to reproduce them.

One package, `negotiate`, declares its license through the legacy
`licenses: [{ "type": "FreeBSD" }]` array rather than the modern `license`
string field, so tooling that only reads `license` reports it as unknown.
FreeBSD is the historical name for the 2-clause BSD license.

The project as a whole is distributed under the [MIT License](LICENSE).
