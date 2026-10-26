# チュートリアル7: Semantic Web オントロジー × LLM

LLM は、答えを知っていてもいなくても、同じように流暢に答えます。Semantic Web のオントロジーを組み合わせると、その答えを確かめる手段が手に入ります。グローバルな識別子を持つ明示的な事実、標準語彙（SKOS、DCAT、PROV-O、schema.org）、そして毎回同じ行を返す問い合わせ言語です。このチュートリアルでは、両者を組み合わせる方法を6つ紹介します。どれも同梱のサンプルと、ビューワーの SPARQL パネルでそのまま実行できるクエリ付きです。

先に、拡張機能がすることとしないことを確認しておきます。

- 拡張機能は LLM を呼び出さず、ネットワーク通信も行いません。LLM やエージェントはご自身のものを使います。ビューワーは、オントロジーを確認し、LLM が書いたクエリを検証する場所です。
- SPARQL は**開いているドキュメントだけ**を対象に実行されます。一度に扱えるのは1ファイルです。
- **推論器はありません**。サンプルには `owl:TransitiveProperty`、`owl:SymmetricProperty`、`owl:inverseOf` が書かれていますが、そこから新しい事実は導かれません。推移や対称から導かれる関係は、`+` や `^` といったプロパティパス、または `UNION` でクエリに書く必要があります。LLM に SPARQL を書かせるときに最も重要な点です（2章で詳しく扱います）。

各サンプルは **「Ontology Viewer: サンプルオントロジーを作成...」** から開けます。選択肢の名前は各章に書いてあります。表を短くするため、結果はローカル名（`:chainR11` など）で示します。

## 1. GraphRAG: 記憶ではなくグラフから答える

サンプル: **自転車パーツの互換性**（`product-compatibility.ttl`）。自転車店のアシスタントに、お客さまが次のように尋ねたとします。

> Ridge の12速カセットは、いま使っている Ridge の11速チェーンに合いますか？

裏付けがないと、モデルは「Ridge の部品は相互に互換性があります」と答えるかもしれません。もっともらしく聞こえますが、このカタログでは誤りです。GraphRAG では、アシスタントのツールがクエリを実行し、その結果だけを根拠に答えます。

```sparql
PREFIX : <https://example.org/product-compatibility#>
ASK {
  { :cassetteR12 :compatibleWith :chainR11 } UNION { :chainR11 :compatibleWith :cassetteR12 }
}
```

結果は `false` です。ここは注意して読んでください。開世界のグラフで `false` が意味するのは「互換性が記録されていない」ことで、「互換性がないと証明された」ことではありません。よい回答は、カタログに何が記録されているかを伝えます。そこでアシスタントは、続けて2つのクエリを実行します。

```sparql
PREFIX : <https://example.org/product-compatibility#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT DISTINCT ?part ?label WHERE {
  { :cassetteR12 :compatibleWith ?part } UNION { ?part :compatibleWith :cassetteR12 }
  ?part rdfs:label ?label .
}
```

| part | label |
| --- | --- |
| `:wheelsetBoost` | Boost 29 Wheelset |
| `:chainR12` | Ridge 12-speed Chain |

```sparql
PREFIX : <https://example.org/product-compatibility#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT ?newPart ?label WHERE {
  ?newPart :replaces :chainR11 ; rdfs:label ?label .
}
```

| newPart | label |
| --- | --- |
| `:chainR12` | Ridge 12-speed Chain |

これで回答は「カタログには、12速カセットとお使いの11速チェーンの互換性は記録されていません。このカセットは Ridge 12-speed Chain と互換と記録されており、そのチェーンは11速チェーンの後継品です」となります。回答のどの部分も、結果の行までたどれます。

GraphRAG のもう半分は、文脈となる情報を集めることです。`:partOf` は推移的なので、「Trailfinder にはどんな部品が付いているか」を調べるには、駆動系キットの先までたどる `+` が必要です。

```sparql
PREFIX : <https://example.org/product-compatibility#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT ?part ?label ?type WHERE {
  ?part :partOf+ :trailBike ;
        a ?type ;
        rdfs:label ?label .
}
ORDER BY ?label
```

結果は7行です。Boost 29 Wheelset、Ridge 11 Drivetrain Kit、Ridge 11 Rear Derailleur、Ridge 11-speed Cassette 11-42、Ridge 11-speed Chain、Ridge Crankset 32T、Trailfinder Frame が返ります。ラベル付きのこの程度の行数なら、そのままモデルのコンテキストに貼り付けられます。

## 2. LLM に SPARQL を書かせ、ビューワーで検証する

SPARQL を書く作業は、結果を確認しさえすれば LLM に任せやすい仕事です。手順は、モデルに語彙を渡し、質問し、返ってきたクエリを SPARQL パネルに貼り付けて実行し、表と図の両方を見る、という流れです。

### プロンプトのテンプレート

小さなオントロジーなら、語彙の説明には Turtle ファイルそのものが一番です。プレフィックス、クラス、プロパティ、それぞれの `rdfs:comment` が数 KB に収まっています。`<TURTLE>` の部分にファイルの内容を貼り付けてください。テンプレートは英語のままでも日本語の質問に使えます。大きなオントロジーでは、インスタンスをすべて渡すのではなく、プレフィックスとクラス・プロパティの宣言だけを貼り付けます。テンプレートのルールは、宣言どおりのプレフィックスを使うこと、推論器がないので対称は `UNION`・推移は `+`・逆プロパティは `^` で書くこと、言語タグに注意すること、の3点です。

```text
You write SPARQL 1.1 SELECT or ASK queries for the RDF graph below.
Rules:
- Use exactly the PREFIX IRIs declared in the Turtle. Do not guess other namespaces.
- No reasoner runs on this graph. If a property is owl:SymmetricProperty, query both
  directions with UNION. If it is owl:TransitiveProperty, use a property path with +.
  If you need the inverse of a property, write ^property instead of the inverse name.
- Literals may carry language tags (@en, @ja). Compare with STR() or add the tag.
- Return only the query, then one line explaining what each variable holds.

Turtle:
<TURTLE>

Question: <QUESTION>
```

### パネルで結果を確かめる

クエリを貼り付けて **実行** を押し、**一致時:** は **ハイライト** のままにします。**スキーマ** ビューでは、一致したリソースのクラスが強調されます。個々の部品を強調して見たいときは **トリプル** ビューに切り替えます。**絞り込み** にすると一致しなかった部分が薄く表示されるので、クエリがグラフの見当違いの場所に一致したときや、何にも一致しなかったときにすぐ気づけます。

### LLM が書く SPARQL によくある間違い

以下はどれもエラーにならず、黙って少なすぎる結果を返します。すべて同梱のサンプルで実行して確かめたものです。

**プレフィックスの IRI が違う。** `research-kg.ttl` は `https://schema.org/` を使っています。古い `http://` の形を覚えているモデルが書くと、4行ではなく0行になります。

```sparql
PREFIX schema: <http://schema.org/>
SELECT ?name WHERE {
  ?person a schema:Person ; schema:name ?name .
}
```

対策: ファイルの `@prefix` 行をそのまま写します。`https://schema.org/` にすると、Aiko Tanabe、Marco Vell、Priya Raman、P. Raman が返ります。

**対称プロパティを片方向だけで問い合わせる。** ファイルに書かれているのは `:chainR11 :compatibleWith :cassetteR11` だけです。そのため次のクエリは、2つの部品が互換であるにもかかわらず `false` を返します。

```sparql
PREFIX : <https://example.org/product-compatibility#>
ASK { :cassetteR11 :compatibleWith :chainR11 }
```

対策: 1章のように `UNION` で両方向を問い合わせます。結果は `true` になります。

**逆プロパティが推論されると思い込む。** `:hasPart` は `owl:inverseOf :partOf` と宣言されていますが、`:hasPart` のトリプル自体は書かれていません。そのため次のクエリは0行です。

```sparql
PREFIX : <https://example.org/product-compatibility#>
SELECT ?part WHERE {
  :trailBike :hasPart ?part .
}
```

対策: `:trailBike ^:partOf ?part` と書きます。直接の部品3つ（駆動系キット、ホイールセット、フレーム）が返ります。

**推移プロパティに `+` を付け忘れる。** `?part :partOf :trailBike` も同じ直接の部品3つしか返しません。チェーン、カセット、ディレイラー、クランクセットは一段下にあるので、全体を得るには `:partOf+` が必要です（7行）。

**言語タグを付け忘れる。** `glossary-skos.ttl` のラベルにはすべて言語タグが付いているので、タグなしの文字列は一致しません。

```sparql
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
SELECT ?concept WHERE {
  ?concept skos:prefLabel "Last Mile" .
}
```

結果は0行です。対策: `"Last Mile"@en` と書くか、`FILTER (STR(?label) = "Last Mile")` で比較します。どちらも `:lastMile` が返ります。

パネルに0行や `false` が出たら、グラフに本当にその事実がないのか、クエリが取りこぼしているだけなのかを考えてください。これだけで、たいていの間違いは見つかります。

## 3. SKOS で用語を正規化し、検索語を広げる

サンプル: **物流用語集（英日）**（`glossary-skos.ttl`）。同じものを指すのに、利用者は「ETA」とも「arrival estimate」とも「到着予定時刻」とも書きます。RAG システムが文書を検索する前に、利用者の言葉を概念に対応付け、その概念のラベルをすべて集めておけます。

```sparql
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
SELECT ?concept ?label WHERE {
  ?concept skos:prefLabel|skos:altLabel ?match .
  FILTER (STR(?match) = "ETA")
  ?concept skos:prefLabel|skos:altLabel ?label .
}
```

5行すべてが `:eta` を指し、ラベルは ETA、Arrival Estimate、Estimated Time of Arrival、到着予定、到着予定時刻 です。`"ETA"` を `"到着予定時刻"` に替えても同じ5行が返ります。日本語の質問で英語の文書を探す、またはその逆も、これで可能になります。検索語の拡張はさらに一歩進んだ使い方です。「Last Mile」で検索したら、その下位語や関連語を扱った文書も見つかるようにします。

```sparql
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
SELECT ?term ?en ?ja WHERE {
  ?c skos:prefLabel "Last Mile"@en .
  { ?term skos:broader+ ?c } UNION { ?c skos:related ?term } UNION { ?term skos:related ?c }
  ?term skos:prefLabel ?en , ?ja .
  FILTER (LANG(?en) = "en" && LANG(?ja) = "ja")
}
```

| term | en | ja |
| --- | --- | --- |
| `:eta` | Estimated Time of Arrival | 到着予定時刻 |
| `:proofOfDelivery` | Proof of Delivery | 配達証明 |
| `:onTimeRate` | On-Time Delivery Rate | 定時配達率 |

検索システムは、この6つのラベルを検索語に加えます。用語集には定義もあるので、モデルは定義を作り出さずに引用できます。たとえば「POD」の日本語の定義を問い合わせると、「受取人が貨物を受け取ったことを示す署名または写真の記録。」と、上位概念の「ラストワンマイル」が返ります。

## 4. 出典とライセンスを示す回答

サンプル: **来歴付きデータカタログ**（`dataset-catalog.ttl`）。「2026年3月の路線全体の利用者数は？」と聞かれたら、アシスタントは数字と一緒に出典も答えるべきです。まず、その数字を公表しているデータセットを探します。

```sparql
PREFIX : <https://example.org/dataset-catalog#>
PREFIX dct: <http://purl.org/dc/terms/>
PREFIX dcat: <http://www.w3.org/ns/dcat#>
SELECT ?title ?format ?url WHERE {
  ?ds :reportedTotal 1284300 ; dct:title ?title ;
      dcat:distribution ?dist .
  ?dist dct:format ?format ; dcat:downloadURL ?url .
}
```

結果は1行で、Monthly Ridership Summary、CSV、`https://example.org/data/ridership-monthly.csv` です。次に、来歴を生データまでさかのぼります。`prov:wasDerivedFrom` は推移的とは宣言されていませんが、派生が2段階あるので `+` を使います。

```sparql
PREFIX prov: <http://www.w3.org/ns/prov#>
PREFIX dct: <http://purl.org/dc/terms/>
PREFIX : <https://example.org/dataset-catalog#>
SELECT ?source ?title WHERE {
  :ridershipMonthly prov:wasDerivedFrom+ ?source .
  ?source dct:title ?title .
}
```

Daily Ridership by Station と Raw Turnstile Counts の2行が返ります。`+` がなければ1つ目しか返りません。ライセンスは、全データセットを対象にした別のクエリで調べます。

```sparql
PREFIX prov: <http://www.w3.org/ns/prov#>
PREFIX dct: <http://purl.org/dc/terms/>
PREFIX dcat: <http://www.w3.org/ns/dcat#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT ?title ?publisher ?license ?activity ?producedBy WHERE {
  ?ds a dcat:Dataset ; dct:title ?title ;
      dct:publisher/rdfs:label ?publisher ;
      dct:license/rdfs:label ?license .
  OPTIONAL { ?ds prov:wasGeneratedBy ?act . ?act rdfs:label ?activity ;
             prov:wasAssociatedWith/rdfs:label ?producedBy . }
}
ORDER BY ?title
```

| title | publisher | license | activity | producedBy |
| --- | --- | --- | --- | --- |
| Daily Ridership by Station | Riverbend Transit Office | Riverbend Open Data License 1.0 | Sensor data cleaning run 2026-04 | Riverbend Transit Office |
| Monthly Ridership Summary | Riverbend City Analytics Team | Riverbend Open Data License 1.0 | Monthly aggregation 2026-03 | Riverbend City Analytics Team |
| Raw Turnstile Counts | Cobalt Sensing Co. | Riverbend Internal Use License | | |

これで回答に「Monthly Ridership Summary（Riverbend City Analytics Team、Riverbend Open Data License 1.0）。Daily Ridership by Station と Raw Turnstile Counts から作成」と出典を添えられます。グラフが示す事実は、判断を加えずにそのまま伝えます。月次の数字はオープンライセンスですが、そのもとになった生データは内部利用ライセンスです。アシスタントにはこの事実を述べさせ、生データの再利用が問題になる場合は公開元に確認するよう案内させます。オントロジーはライセンスを記録するだけで、何が許されるかを判断するものではありません。

## 5. エンティティリンキング: `schema:sameAs` でレコードを統合する

サンプル: **研究知識グラフ**（`research-kg.ttl`）。提携先の研究所のシステムには「P. Raman」、自組織のシステムには「Priya Raman」と登録されています。名前で問い合わせると、彼女の論文は1本しか見つかりません。

```sparql
PREFIX schema: <https://schema.org/>
SELECT ?title WHERE {
  ?person schema:name "Priya Raman" .
  ?paper schema:author ?person ; schema:name ?title .
}
```

結果は Sediment Drift in Shallow Estuaries の1行です。2つのレコードは同じグローバル識別子を持っているので、識別子で問い合わせます。

```sparql
PREFIX schema: <https://schema.org/>
SELECT DISTINCT ?paper ?title ?listedAs WHERE {
  ?person schema:sameAs <https://example.org/ids/person/0103> ; schema:name ?listedAs .
  ?paper schema:author ?person ; schema:name ?title .
}
```

| paper | title | listedAs |
| --- | --- | --- |
| `:paperEstuary` | Sediment Drift in Shallow Estuaries | Priya Raman |
| `:paperTideModel` | A Lightweight Tide Prediction Model | P. Raman |

LLM と組み合わせるなら、これが安全な統合のしかたです。モデルは「同一人物のようです」と提案するだけで、統合は両方の情報源が共有する識別子を通じてのみ行います。名前だけを根拠に、モデルが同一性を決めることはありません。それぞれのレコードの所属も同じように調べられます。Priya Raman は North Harbor University と Coastal Systems Institute、P. Raman は Marine Data Lab に所属しているので、回答では3つの所属すべてに触れられます。

## 6. ハイブリッド: エクスポートした Object Ontology と用語集を組み合わせる

`delivery-ops.oont.yaml` のような業務モデルは Object Ontology 形式で書きます（[オントロジー方式の選び方](choosing-ontology-style.md) を参照）。これを用語集とつなぐには、YAML ファイルを開いて **「Ontology Viewer: Object Ontology を Turtle (OWL) としてエクスポート...」** を実行します。無題の Turtle ドキュメントができ、ビューワーで開けます。

ビューワーは一度に1つのドキュメントしか問い合わせないので、両方をまとめて問い合わせるには Turtle を1つにします。いちばん簡単なのは、エクスポートしたドキュメントの末尾に `glossary-skos.ttl` の全文を貼り付ける方法です。Turtle では後から `@prefix :` で空のプレフィックスを定義し直せるので、前半と後半はどちらも元の意味を保ちます。規模が大きい場合は、両方のファイルを外部のトリプルストアに読み込んでください。

結合したドキュメントで次のクエリを実行すると、用語集に載っているプロパティを変更するアクションがわかります。

```sparql
PREFIX oont: <urn:object-ontology:vocab#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
SELECT ?action ?property ?concept ?ja WHERE {
  ?a a oont:ActionType ; oont:apiName ?action ; oont:rule/oont:sets ?p .
  ?p oont:apiName ?property .
  ?concept skos:prefLabel|skos:altLabel ?label ;
           skos:prefLabel ?ja .
  FILTER (LCASE(STR(?label)) = LCASE(?property) && LANG(?ja) = "ja")
}
```

結果は `markDelayed`、`eta`、`:eta`、到着予定時刻 の1行です。日本のお客さまに遅延を説明するエージェントは、アクションが変更した項目を用語集の言葉で伝えられます。ただし、この結合はプロパティ名とラベルを単なる文字列として照合しています。ここでは名前がたまたま一致しているのでうまくいきますが、実際に使うときは、名前の一致に頼らず、プロパティと用語集の概念を対応付けるトリプルを明示的に追加してください。

## 補足

- クエリは、保存していない編集も含めて開いているドキュメントだけを対象に実行され、すべてローカルで完結します。
- 推論器はありません。`+`、`^`、`UNION` は自分で書き、クエリを書かせる LLM にもそう指示してください。
- サンプルのデータはすべて架空のもので、`example.org` の IRI は実在のエンドポイントではありません。

## 次のステップ

- [チュートリアル4: SPARQL で問い合わせる](tutorial-4-sparql.md) — SPARQL パネルの詳しい使い方。
- [チュートリアル5: はじめての Object Ontology](tutorial-5-object-ontology.md) と [チュートリアル6: Object Ontology × AI エージェント](tutorial-6-object-ontology-ai-agents.md) — ハイブリッド構成の業務側。
- [ユースケース集](use-cases.md) — どの業務場面にどちらの方式が合うか。
- [オントロジー方式の選び方](choosing-ontology-style.md) — Object Ontology と Semantic Web の比較。
