# Claude Code examples / Claude Code のサンプル

Runnable companions to the AI tutorials. Each folder is a small, self-contained Node project.
AI 向けチュートリアルを実際に動かすためのサンプルです。各フォルダは独立した小さな Node プロジェクトです。

| Folder / フォルダ | Tutorial / チュートリアル |
| --- | --- |
| [`object-ontology-mcp/`](object-ontology-mcp/) | An MCP server that serves the action tools exported from an Object Ontology and enforces their preconditions. Object Ontology から書き出したアクションを公開し、実行条件を確認する MCP サーバー。 [Tutorial 8 (en)](../../docs/en/tutorial-8-claude-code-object-ontology.md) · [チュートリアル8 (ja)](../../docs/ja/tutorial-8-claude-code-object-ontology.md) |
| [`semantic-web-sparql/`](semantic-web-sparql/) | A local SPARQL command over Turtle files, with the same engine as the viewer's SPARQL panel. ビューワーの SPARQL パネルと同じエンジンで Turtle ファイルに問い合わせるローカルのコマンド。 [Tutorial 9 (en)](../../docs/en/tutorial-9-claude-code-semantic-web.md) · [チュートリアル9 (ja)](../../docs/ja/tutorial-9-claude-code-semantic-web.md) |

Requirements / 必要なもの: Node.js 22.6+, [Claude Code](https://docs.claude.com/en/docs/claude-code/overview).

```sh
cd object-ontology-mcp   # or semantic-web-sparql
npm install
npm test
```

The data files are copies of the bundled samples and of the extension's exports; a test in the repository root keeps them in sync. These folders are not part of the published extension. [`guide/`](guide/) is an illustrated primer for both tutorials, published at [https://yaggytter.github.io/vscode-ontology-viewer/index.en.html](https://yaggytter.github.io/vscode-ontology-viewer/index.en.html).
データファイルは、同梱サンプルと拡張機能のエクスポート結果のコピーです。リポジトリ直下のテストで、元のファイルと一致していることを確かめています。これらのフォルダは、公開する拡張機能には含まれません。[`guide/`](guide/) は、両チュートリアルのイラスト付きの予習ノートで、[https://yaggytter.github.io/vscode-ontology-viewer/index.ja.html](https://yaggytter.github.io/vscode-ontology-viewer/index.ja.html) で読めます。
