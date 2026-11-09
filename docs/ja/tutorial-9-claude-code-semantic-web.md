# チュートリアル9: Claude Code で動かす — Semantic Web と根拠のある回答

[チュートリアル7](tutorial-7-semantic-web-llm.md) では、LLM が記憶ではなく Semantic Web オントロジーをもとに答える方法を説明しました。LLM が SPARQL を書いて実行し、結果の行だけを根拠に答えるという流れです。このチュートリアルでは、その流れを **Claude Code** で実際に動かします。

> **はじめての方へ:** 先に[イラスト付きの予習ノート](https://yaggytter.github.io/vscode-ontology-viewer/index.ja.html)を読むと、場面、課題、進め方がつかめます。動画の見どころもまとめています。

今回はサーバーを使いません。サンプルは Claude Code に `npm run sparql` というローカルのコマンドを1つ渡します。このコマンドは、**ビューワーの SPARQL パネルと同じエンジン**で Turtle ファイルに問い合わせます。Claude Code はファイルを読み、クエリを書いて実行し、答えます。あなたはそのクエリを SPARQL パネルに貼り付けて、図の上で結果を確かめます。

必要なもの:

- [Claude Code](https://docs.claude.com/ja/docs/claude-code/overview)（インストールとサインインを済ませておく）。以下の会話には、お使いの Claude のプランの利用枠を使います。
- Node.js 22.6 以降（`node -v` で確認）。
- Git、VS Code、この拡張機能。

> Claude Code の応答は毎回少しずつ変わります。以下の記録は実際に動かしたときのものです。同じくらい正しい別のクエリを書くこともあります。確かめる点はいつも同じです。クエリを実行したか、回答の主張がすべて結果の行にたどれるか、の2点です。

## 0. サンプルを用意する

```sh
git clone https://github.com/yaggytter/vscode-ontology-viewer.git
cd vscode-ontology-viewer/examples/claude-code/semantic-web-sparql
npm install
npm test
```

`npm test` で 7件のテストが通れば準備完了です。テストは、チュートリアル7のクエリをこのコマンドで実行し、チュートリアルに書いた結果になるかを確かめます。

| パス | 内容 |
| --- | --- |
| `data/*.ttl` | 同梱サンプルそのまま（`product-compatibility`、`glossary-skos`、`dataset-catalog`、`research-kg`）。 |
| `data/delivery-ops.export.ttl` | 配送サンプルを **「Object Ontology を Turtle (OWL) としてエクスポート」** した出力。 |
| `CLAUDE.md` | Claude Code への指示。チュートリアル7のプロンプトのテンプレートをプロジェクトのルールにしたものと、ファイルの一覧です。 |
| `.claude/settings.json` | 権限の設定。`sparql` コマンドは確認なしで実行でき、`data/` のファイルは編集できません。 |
| `src/sparql.ts` | コマンド本体。 |

## 1. まず自分でコマンドを実行する

Claude Code に渡す前に、チュートリアル7の最初のクエリを自分で実行してみます。

```sh
npm run --silent sparql -- data/product-compatibility.ttl -q '
PREFIX : <https://example.org/product-compatibility#>
ASK { { :cassetteR12 :compatibleWith :chainR11 } UNION { :chainR11 :compatibleWith :cassetteR12 } }'
```

`false` と表示されます。SELECT クエリは Markdown の表で表示され、IRI はファイルのプレフィックスで短く表示されます。

```text
3 rows

| term | en | ja |
| --- | --- | --- |
| :eta | "Estimated Time of Arrival"@en | "到着予定時刻"@ja |
| :proofOfDelivery | "Proof of Delivery"@en | "配達証明"@ja |
| :onTimeRate | "On-Time Delivery Rate"@en | "定時配達率"@ja |
```

ファイルを複数渡すと、1つのグラフとして問い合わせます。読むのは指定したファイルだけです。ネットワークには接続せず、`SERVICE`、`LOAD`、`FROM` を含むクエリは、黙って0件を返すのではなく、理由を示して拒否します。

## 2. Claude Code を起動する

```sh
claude
```

初回の起動時、Claude Code はこのフォルダを信頼するか確認してきます。`.claude/settings.json` が `sparql` コマンドを事前に許可しているためです。最初に選ばれているのは **No, continue without these permissions** なので、矢印キーで **Yes, I trust this folder** に動かしてから Enter を押してください。「No」を選ぶと、クエリのたびに確認されます。

Claude Code は `CLAUDE.md` を読みます。中身はチュートリアル7のプロンプトのテンプレートにあるルールです。宣言どおりのプレフィックスを使うこと、推論器がないので対称・推移・逆のプロパティは自分で書くこと、言語タグに注意すること、`false` は「誤り」ではなく「記録がない」と読むこと、の4つです。この構成のために、回答の前に実行したクエリを示すというルールも足しています。

## 3. GraphRAG: 互換性の質問

```text
Does the Ridge 12-speed cassette fit my Ridge 11-speed chain?
```

実際の実行では、Claude Code は `data/product-compatibility.ttl` を読み、1回のコマンドで3つのクエリを実行しました。1つ目はチュートリアル7と同じ、両方向を調べる `ASK` で、結果は `false` です。続けて、それぞれの部品が*何に*合うかを調べました。回答は次のとおりです。

> The catalog has no compatibility link between the Ridge 12-speed Cassette 10-51 (CS-R12) and the Ridge 11-speed Chain (CH-R11). That absence doesn't prove they're incompatible. … The 12-speed cassette is listed as fitting only the **Ridge 12-speed Chain (CH-R12)** and the Boost 29 Wheelset. … The file also says the 12-speed chain replaces the 11-speed chain.

`false` を正しく「記録がない」と読み、対称プロパティの両方向を調べています。チュートリアル7では別のクエリで調べた `:replaces` の事実も見つけました。

## 4. 書かれたクエリをビューワーで確かめる

VS Code で `data/product-compatibility.ttl` を開き、図を開きます。**SPARQL** パネルを開き、Claude Code が書いた SELECT クエリを1つ貼り付けます。**一致時:** を **ハイライト** にして **実行** を押し、**トリプル** 表示に切り替えます。どちらも同じエンジンなので、結果の行はコマンドの出力と一致し、該当する部品が図の上で光ります。

これが [チュートリアル7の2章](tutorial-7-semantic-web-llm.md#2-llm-に-sparql-を書かせビューワーで検証する) の習慣です。クエリはモデルに書かせ、何に一致したかは自分で確かめます。

## 5. 日本語の質問と英語の用語集

```text
「到着予定時刻」について書かれた社内ドキュメントを探したいです。検索語として使える言い換えを、英語と日本語ですべて挙げてください。
```

実際の実行では、Claude Code はまず用語集のプレフィックスと該当する項目を grep で調べました。続けてクエリを1つ実行しています。`STR()` で比べて `@ja` のタグに邪魔されないようにし、その概念のラベルをすべて集めるクエリです。回答は日本語で、チュートリアル7と同じ5つのラベルを挙げました。Estimated Time of Arrival / ETA / Arrival Estimate / 到着予定時刻 / 到着予定 です。

さらに、この用語集には `skos:hiddenLabel` も `skos:exactMatch` も使われていないので、記録されている言い換えはこの5つですべてだと指摘しました。検索範囲を広げる候補として、関連概念の「定時配達率」と上位概念の「ラストワンマイル」も挙げています。

## 6. 出典とライセンス

```text
How many people rode the network in March 2026? Where does that number come from, and can I reuse the underlying data?
```

実際の実行では、Claude Code は **1,284,300 件の入場**と答え、これは改札の入場回数で、人数ではないと注意しました。実行したクエリは2つです。1つは数値を公開しているデータセットを探すもの、もう1つは `prov:wasDerivedFrom*` で元データまでさかのぼり、各データセットの公開者とライセンスを集めるものです。回答では3つのデータセットをすべて挙げています。月次と日次のデータは Riverbend Open Data License 1.0、元になった改札の生データは内部利用向けのライセンスだと説明しました。また、グラフに記録されているのはライセンスの名前で、何が許されるかまでは記録されていないとも書いています。事実を示し、それ以上はライセンス本文を確かめてもらうという、チュートリアル7の方針どおりです。

## 7. エンティティリンキング

```text
List every paper by Priya Raman, including any listed under another name.
```

実際の実行では、Claude Code は名前で検索しませんでした。「Priya Raman」から `schema:sameAs` をたどって共通の識別子を見つけ、その識別子を持つレコードをすべて集めています。見つかった論文は2本で、1本は Priya Raman 名義、もう1本は提携先のシステムから来た「P. Raman」名義でした。名前だけで検索すると1本目しか見つからないことも説明しています。

## 8. ハイブリッド: エクスポートした Object Ontology と用語集

`data/delivery-ops.export.ttl` は、配送の Object Ontology を Turtle にエクスポートしたものです。自分で作るときは、`delivery-ops.oont.yaml` を開いて **「Ontology Viewer: Object Ontology を Turtle (OWL) としてエクスポート...」** を実行します。ビューワーと違い、このコマンドは2つのファイルを同時に読めるので、事前に1つにまとめる必要はありません。

```text
Which delivery actions change a field that has a glossary entry? What is that field called in Japanese?
```

実際の実行では、Claude Code はまず、各アクションのルールがどのフィールドを変えるかを一覧しました。続けて2つのファイルをまとめて問い合わせ、フィールド名と用語集のラベルを大文字・小文字を区別せずに突き合わせています。結果はチュートリアル7と同じ1行で、`markDelayed` が `eta` を変え、その日本語の用語は「到着予定時刻」でした。

チュートリアル7と同じ注意も書き添えています。2つのファイルには共通の IRI がないので、名前だけで突き合わせていること。ほかのフィールドには用語集の項目がないが、それはどこにもその用語がないという証明にはならないこと、の2点です。

出力では、用語集の IRI が省略されずに表示されます（`<https://example.org/glossary-skos#eta>`）。2つのファイルが `:` を別々の名前空間に割り当てているので、まとめて問い合わせた結果の表示には `:` を使わないためです。

## 9. 練習問題: 推移の落とし穴

```text
List every part on the Trailfinder Complete Bike.
```

この自転車のチェーン、カセット、クランクセット、ディレイラーは、ドライブトレインキットの中に入っています。そのため、正しく答えるには推移的なパスが必要です。実際の実行では、Claude Code は `?part (:partOf|^:hasPart)+ :trailBike` を使い、7つの部品をすべて見つけました。今度は自分で、`+` を外したクエリをパネルかコマンドで実行してみてください。返ってくるのは直接の部品3つだけです。チュートリアル7で注意した間違いです。一度違いを見ておくと、モデルのクエリでも見落としにくくなります。

## コマンドの仕組み

`src/sparql.ts` は、各ファイルを N3 で読み込んでメモリ上の1つのストアにまとめ、ビューワーの SPARQL パネルと同じ Comunica でクエリを実行し、結果をテキストで表示します。プレフィックスはファイルの `@prefix` 行から取り、2つのファイルで割り当てが違うプレフィックスは表示に使いません。エンジンには HTTP の機能が入っていないので、クエリがネットワークに出ることはありません。

## トラブルシューティング

- **`cat` や `grep` の実行前に確認される。** Claude Code がプレフィックスを調べるためにファイルを読んでいます。許可するか、そのコマンドを `.claude/settings.json` に追加してください。
- **一致するはずのクエリが0件になる。** プレフィックスの IRI（`https://schema.org/` と `http://` の違い）、プロパティの向き、`+` の付け忘れ、言語タグを確かめてください。[チュートリアル7の2章](tutorial-7-semantic-web-llm.md#llm-が書く-sparql-によくある間違い) にまとめた、よくある間違いです。
- **「Remove FROM / FROM NAMED」と表示される。** 渡したファイルはすべて既定のグラフに入っているので、その句を消してください。

## 次のステップ

- [チュートリアル8: Claude Code で動かす — Object Ontology とエージェント](tutorial-8-claude-code-object-ontology.md): アクションを通じてデータを変えるエージェント。
- [チュートリアル7: Semantic Web オントロジー × LLM](tutorial-7-semantic-web-llm.md): このチュートリアルの考え方と、検証済みのクエリ。

[チュートリアル一覧](../ja/) に戻る。
