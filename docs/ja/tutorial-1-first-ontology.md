# チュートリアル1: 最初のオントロジーを作る

ゼロから小さなオントロジーを作り、入力するそばから図に反映されていく様子を見ていきます。

## 1. 新しいファイルを作る

`animals.ttl` を作成し、必要なプレフィックスから書き始めます。

```turtle
@prefix : <http://example.org/animals#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
```

## 2. 図を開く

`Cmd+Alt+O` / `Ctrl+Alt+O` を押します。スキーマビューで開きますが、`owl:Class` がまだ無いので空の状態です。

## 3. クラスを追加する

```turtle
:Animal a owl:Class ;
  rdfs:label "Animal" .
```

ファイルを保存する（あるいは少し待つだけでも、図は短い間隔で自動更新されます）と、「Animal」というラベルのノードが1つ現れます。

## 4. サブクラスと関係を追加する

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

クラスのノードが3つになりました。`Dog` は `rdfs:subClassOf` の辺（白抜き三角の矢頭で、通常の関係とは見た目を分けています）で `Animal` とつながり、`Dog` は「has owner」の辺で `Person` ともつながります。データ型プロパティはこのビューでは独立したノードになりません — 代わりに、所属するクラスの Inspector のプロパティ一覧に表示されます。試しに追加してみましょう。

```turtle
:age a owl:DatatypeProperty ;
  rdfs:label "age" ;
  rdfs:domain :Dog ;
  rdfs:range xsd:integer .
```

（これを動かすには、先頭に `@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .` が必要です。）`Dog` ノードをクリックすると、Inspector のプロパティ一覧に `age: integer` が表示されます。

## 5. 個体を追加する

```turtle
:rex a :Dog ;
  rdfs:label "Rex" .

:alice a :Person ;
  rdfs:label "Alice" .

:rex :hasOwner :alice .
```

個体（インスタンス）は、スキーマビューでは独立したノードとして描画されません — `Dog` をクリックして Inspector のインスタンス数を見ると、`1` になっているはずです。個体そのものをノードとして見たい場合（生の主語・述語・目的語すべてを含む）は、ツールバーの切替で **Triples** ビューに切り替えてください。

## 6. 配置を整える

`Dog` と `Person` を並べてドラッグしてみましょう。図を閉じてもう一度開いても（`Cmd+Alt+O` を再度）、配置はそのまま残っています（スキーマビューとトリプルビューは同じファイルでも別のグラフなので、配置はビューごとに個別に記憶されます）。

次へ: [チュートリアル2: 図から編集する](tutorial-2-editing-from-diagram.md)
