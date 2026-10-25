# チュートリアル5: はじめての Object Ontology

ここまでのチュートリアルでは、すべてをトリプルで表す OWL と RDF を扱ってきました。**Object Ontology** は同じ種類の知識を、アプリケーション開発者の発想に近い形で書きます。プロパティを持つ「もの」があり、もの同士を「リンク」でつなぎ、データを変更できる操作を「アクション」として少数だけ定義します。

題材は **Corner Cafe Orders（街角カフェの注文）** です。メニュー、注文、食材だけを扱う小さなカフェのサンプルです。**「Ontology Viewer: サンプルオントロジーを作成...」** を実行して **街角カフェの注文（Object Ontology）** を選ぶと、`cafe-orders.oont.yaml` が作られます。

## 1. 5つの概念

| 概念 | カフェでの例 | 意味 |
| --- | --- | --- |
| **オブジェクト型** | `MenuItem`、`Order`、`Ingredient` | ものの種類です。主キーとタイトル用のプロパティを持ちます。 |
| **プロパティ** | `priceYen`、`status` | オブジェクト型が持つ、型付きの項目です。 |
| **リンク型** | `orderItems` | オブジェクト型同士を結ぶ名前付きの関係です。両端を持ち、それぞれにカーディナリティを指定します。 |
| **インターフェース** | （このサンプルにはなし） | 複数のオブジェクト型が共通して実装するプロパティの組です。 |
| **アクション型** | `placeOrder`、`markServed` | パラメーター付きの名前のある変更操作です。データを書き換える手段として定義されているのはこれだけです。 |

用語は Palantir Foundry のオントロジーに着想を得ています。ただしファイル形式はこの拡張機能独自のものです。Palantir の形式ではなく、Foundry とのインポートやエクスポートも想定していません。

## 2. ファイルの中身を読む

ファイルの実体はただの YAML（または JSON）です。拡張機能はファイル名で判別します。対象は `*.oont.yaml`、`*.oont.yml`、`*.oont.json` で、先頭のキーが `objectOntology` の無題 YAML ドキュメントも対象になります。冒頭は次のとおりです。

```yaml
objectOntology: 1
name: Corner Cafe Orders
```

オブジェクト型には主キーとタイトル用のプロパティを指定し、続けてプロパティを並べます。プロパティには `enum` や `unit` も付けられます。

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

リンク型には両端があります。それぞれの端に、起点のオブジェクト型、そこから見たリンクの名前、相手が1件か複数件かを書きます。

```yaml
linkTypes:
  orderItems:
    displayName: Ordered items
    from: { objectType: Order, name: items, cardinality: many }
    to: { objectType: MenuItem, name: orders, cardinality: many }
```

アクション型には、パラメーター、適用する `rules`、満たすべき `validations` を書きます。

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

ルールの `op` は `createObject`、`modifyObject`、`deleteObject`、`createLink`、`deleteLink` の5種類です。`expr` は人間や AI エージェントが読むための説明で、拡張機能はこの式を**評価しません**。

末尾の `objects:` にはサンプルのオブジェクトをいくつか書きます。リンクの項目には相手オブジェクトの主キーを入れます。

```yaml
objects:
  Order:
    - { orderId: O-1002, placedAt: "2026-04-01T08:30:00+09:00", status: preparing, totalYen: 520, items: [M-02] }
```

## 3. 図を開いて読む

`Cmd+Alt+O` / `Ctrl+Alt+O` を押します。スキーマビューでは次のように描かれます。

- **オブジェクト型**は角丸の箱です。Menu item、Order、Ingredient の3つが並びます。
- **リンク型**はカーディナリティのバッジ付きの矢印です。`orderItems` と `itemIngredients` はどちらも多対多なので **N:N** と表示されます。ほかに **1:N**、**N:1**、**1:1** があります。
- **インターフェース**は二重線の六角形です。インターフェースの実装は青い破線の矢印、`extends` は紫の矢印で表します。カフェのサンプルにはインターフェースがないので、見てみたい場合は **配送オペレーション（Object Ontology）** を開くと `Trackable` があります。

**RDF** の切り替えを押すと、同じファイルを RDF に変換した結果が表示されます。手順7の SPARQL は、この RDF に対して実行されます。

## 4. 図から編集する

図での編集は、すべて YAML に書き戻されます。

- **+ オブジェクト型** で名前を入力すると、オブジェクト型が追加されます。主キーには型名から作った文字列プロパティが自動で付きます。`Table` なら `tableId` です。
- **関係を作成** は2回クリックします。1回目で起点の型、2回目で相手の型を選び、名前を入力します。新しいリンク型は、起点側が「1件」、相手側が「複数件」になります。違う場合は、あとでテキストのカーディナリティを直してください。
- 右側の **Inspector** では、名前の変更（`displayName` に書き込みます）、説明の編集、プロパティの追加、プロパティの型の変更、プロパティやリンク型の削除ができます。

名前を変えても API 名（`MenuItem` のような YAML のキー）は変わりません。ルールやリンク、エクスポートしたツールはそのまま動きます。また、次の削除は意図的に拒否されます。

- 主キーとタイトル用のプロパティは削除できません。先に `primaryKey` や `titleProperty` を変更してください。
- アクションのルールが使っているリンク型は削除できません。`placeOrder` がリンクを作っているので、`orderItems` の削除は拒否されます。

`*.oont.json` は図での表示のみに対応しています。バナーの **YAML に変換して編集** を押すか、**「Ontology Viewer: Object Ontology の JSON を編集用に YAML へ変換...」** を実行してください。

## 5. 問題パネルとタイプミスの警告

試しに項目名を打ち間違えてみます。`Ingredient` の `description:` を `descripton:` に変えると、問題パネルのそのキーの位置に警告が出ます。

```text
Unknown field "descripton" in object type Ingredient. Expected one of: displayName, pluralDisplayName, description, primaryKey, titleProperty, icon, color, implements, properties.
```

参照先が存在しない場合はエラーになります。`orderItems` リンクの `objectType: Order` を `Orders` にすると、`Link orderItems refers to unknown object type "Orders".` と表示されます。サンプルオブジェクトの主キーの欠落や重複、ルールが参照する未定義のパラメーターも同じように、該当箇所の範囲付きで報告されます。**アウトライン** ビューには、ファイル内の型、インターフェース、リンク、アクションが一覧されます。

入力中の補完には JSON Schema を使います。`*.oont.json` は同梱のスキーマがそのまま効きます。`*.oont.yaml` で同じスキーマを使うには Red Hat の YAML 拡張機能が必要です。

## 6. アクションパネル

ツールバーの **アクション** を押すと、左側にアクション型の一覧が開きます。**Mark order served** を選ぶと次の内容が表示されます。

- **パラメーター**: `order`。型は Order で、必須です。
- **変更内容**: `modifyObject Order · sets status`。
- **実行条件（満たさない場合は拒否）**: Only an order that is being prepared can be served. 後ろの括弧内に `expr` も表示されます。

Mark order served には副作用がありません。**副作用** の表示を見たい場合は **Restock ingredient** を選んでください。

図では、選んだアクションが関係するオブジェクト型がオレンジの枠で強調されます。パネル下部の **エージェント用ツールとしてエクスポート** は [チュートリアル6](tutorial-6-object-ontology-ai-agents.md) で使います。

## 7. SPARQL で問い合わせる

**SPARQL** を押します。[チュートリアル4](tutorial-4-sparql.md) と同じパネルですが、**サンプル:** には Object Ontology 用のクエリが8つ並びます。どれも `oont:` 語彙（`urn:object-ontology:vocab#`）だけを使っているので、どの `*.oont.yaml` でも動きます。

**「3. 各型に対して何ができるか」** を選びます。

```sparql
SELECT ?type ?action ?actionLabel
WHERE {
  ?action a oont:ActionType ;
          rdfs:label ?actionLabel ;
          oont:affects ?type .
}
ORDER BY ?type ?actionLabel
```

結果は4行です。Ingredient に Restock ingredient、MenuItem に Place order、Order に Mark order served と Place order が対応します。Place order が2回出てくるのは、Order を作成し、メニュー項目へのリンクも作るからです。

次に **「6. オブジェクト間のリンクをたどる（search around）」** を選びます。各サンプルオブジェクトからリンクをすべてたどります。たとえば `Order/O-1001` から `items` で `MenuItem/M-01` へ、逆向きに `orders` で戻る行が出ます。`objects:` のリンクは両方向に変換されるためです。

自分でクエリを書くこともできます。次のクエリは「Order を変更するアクションはどれで、どう変更するのか」を調べます。

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

結果は **Mark order served**（`modifyObject`）と **Place order**（`createObject`）の2行です。

## JSON と YAML のどちらを使うか

どちらの形式も中身のモデルは同じです。手で編集するなら YAML を使ってください。図からの書き込みは YAML に対して行われ、コメントも残ります。JSON は、別のプログラムが生成するファイルに向いています。図で表示はできますが、編集はできません。手で引き継ぎたくなったら、変換コマンドで YAML にしてください。

RDF のツールに渡したい場合は **「Ontology Viewer: Object Ontology を Turtle (OWL) としてエクスポート...」** を実行します。OWL と `oont:` 語彙で書かれた Turtle が作られ、ビューアの RDF 側で開けます。

## 次のステップ

- [チュートリアル6: Object Ontology × AI エージェント](tutorial-6-object-ontology-ai-agents.md): ここで定義したアクションを、AI エージェントが呼び出せるツールにします。
- [オントロジー方式の選び方](choosing-ontology-style.md): Object Ontology と OWL/RDF をどう使い分けるかを説明しています。

[チュートリアル一覧](../ja/) に戻る。
