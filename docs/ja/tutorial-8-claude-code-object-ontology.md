# チュートリアル8: Claude Code で動かす — Object Ontology とエージェント

[チュートリアル6](tutorial-6-object-ontology-ai-agents.md) では、Object Ontology をエージェントのコンテキストとツール一覧に変える方法を説明しました。このチュートリアルでは、それを実際に動かします。エージェント役は **Claude Code** です。バックエンド役は小さな **MCP サーバー**で、ビューワーから書き出したツールを公開し、実行条件をすべて確認し、何が変わったかを記録します。エージェントがデータを読み、アクションを呼び、拒否されて別の手を選ぶところを、手元で確かめられます。

> **はじめての方へ:** 先に[イラスト付きの予習ノート](https://yaggytter.github.io/vscode-ontology-viewer/index.ja.html)を読むと、場面、課題、進め方がつかめます。動画の見どころもまとめています。

サーバーは、このリポジトリに完成品として同梱しています。コードを書く必要はありません。5章で Claude Code に確認処理を1つ書いてもらうだけです。

必要なもの:

- [Claude Code](https://docs.claude.com/ja/docs/claude-code/overview)（インストールとサインインを済ませておく）。以下の会話には、お使いの Claude のプランの利用枠を使います。
- Node.js 22.6 以降（`node -v` で確認）。サンプルは、ビルドなしで TypeScript を Node で直接実行します。
- Git、VS Code、この拡張機能。

> Claude Code の応答は毎回少しずつ変わります。以下の記録は実際に動かしたときのものです。言い回しが違ったり、別の妥当な手順をとったりすることがあります。注目してほしいのは、どのツールを呼んだかと、サーバーが何を返したかです。こちらは毎回同じになります。

## 0. サンプルを用意する

```sh
git clone https://github.com/yaggytter/vscode-ontology-viewer.git
cd vscode-ontology-viewer/examples/claude-code/object-ontology-mcp
npm install
npm test
```

`npm test` で 11件のテストが通れば準備完了です。テストは、Claude Code を使わずにこのチュートリアルのシナリオを実行します。MCP 経由で実際のサーバーとやり取りするテストも1件含まれています。

| パス | 内容 |
| --- | --- |
| `delivery/`、`support/` | ワークスペース。この中で Claude Code を起動します。 |
| `delivery/delivery-ops.oont.yaml` | オントロジー。同梱サンプルの配送オントロジーそのままです。 |
| `delivery/delivery-ops.tools.json` | **「アクションを AI エージェント用ツール定義 (JSON Schema) としてエクスポート」** の出力。 |
| `delivery/CLAUDE.md` | エージェントへの指示と、**「LLM コンテキスト用のオントロジー要約をエクスポート」** の出力。 |
| `delivery/.mcp.json` | サーバーの起動方法を Claude Code に伝える設定。 |
| `delivery/.claude/settings.json` | 権限の設定。読み取り用ツールは確認なしで実行でき、データとオントロジーのファイルは編集できません。 |
| `delivery/workspace.json` | サーバーが使うファイルと、シナリオ用に固定した時計。 |
| `delivery/state.json` | 「データベース」。最初のツール呼び出しで作られます。git には含めません。 |
| `src/` | サーバー本体（コメント付きの TypeScript、数百行）。実行条件の確認処理は `src/guards/` にあります。 |

## 1. ツール定義と要約を自分でエクスポートする

ワークスペースには両方のエクスポート結果が入っているので、この手順は飛ばしてもかまいません。一度やっておくと、ファイルがどこから来たかがわかります。

1. VS Code で `delivery/delivery-ops.oont.yaml` を開き、図を開きます。
2. **「Ontology Viewer: アクションを AI エージェント用ツール定義 (JSON Schema) としてエクスポート...」** を実行し、開いた無題のドキュメントを `delivery/delivery-ops.tools.json` に上書き保存します。同梱のファイルはこの出力そのものなので、git の差分は出ません。
3. **「Ontology Viewer: LLM コンテキスト用のオントロジー要約をエクスポート...」** を実行し、`delivery/CLAUDE.md` の `<ontology>` の部分と比べます。同じ内容です。

`CLAUDE.md` の残りは、[チュートリアル6の4章](tutorial-6-object-ontology-ai-agents.md#4-つなぎ込む)のシステムプロンプトです。この構成のために、ルールを2つ足しています。データを変えるために `state.json` を編集しないこと、要約にあるサンプルオブジェクトより読み取り用ツールの結果を信じること、の2つです。

## 2. 配送のワークスペースで Claude Code を起動する

```sh
cd delivery
claude
```

初回の起動時、Claude Code は2つのことを確認してきます。どちらも、最初に選ばれているのは安全側の「いいえ」です。矢印キーで選択を動かしてから Enter を押してください。

1. **このフォルダを信頼するか（Is this a project you trust?）。** このフォルダの `.claude/settings.json` が読み取り用ツール3つを事前に許可しているので、その一覧が表示されます。**Yes, I trust this folder** を選びます。
2. **MCP サーバーを使うか（New MCP server found in this project: delivery-ops）。** **Use this MCP server** を選びます。**Continue without using this MCP server** を選ぶと、`.claude/settings.local.json` の `disabledMcpjsonServers` に `delivery-ops` が記録されます。使えるように戻すには、その記録を消すか、`/mcp` でサーバーを有効にしてください。

続けて `/mcp` と入力すると、`delivery-ops` が接続済みで、ツールが7つあることを確かめられます。

- **読み取り用ツール**（サーバーが独自に用意）: `list_objects`、`get_object`、`follow_link`。エクスポートに含まれるのは書き込みだけですが、エージェントは動く前にデータを調べる必要があります。
- **アクション**（エクスポートしたまま）: `assignVehicle`、`reassignShipment`、`markDelayed`、`notifyCustomer`。

`.claude/settings.json` によって、読み取り用ツールは確認なしで実行されます。アクションは毎回あなたの許可が必要なので、書き込みはすべて実行前に目で確かめられます。開発時の「人による承認」に当たります。

同じファイルで、`state.json`、オントロジー、ツール定義の編集も禁止しているので（`Edit(...)` の禁止ルールは、ファイルを書き込む Claude Code のツールすべてに効きます）、エージェントがファイルを書き換えてデータを変えることはできません。この禁止はシェルのコマンドには効きませんが、許可していないコマンドは実行前に必ず確認されます。これらのファイルに書き込むコマンドは許可しないでください。

## 3. 遅れている出荷を直してもらう

チュートリアル6と同じ依頼を入力します。

```text
Shipment S-5001 is late — fix it and tell the customer.
```

実際の実行では、Claude Code は次の順にツールを呼びました。

```text
get_object       { "objectType": "Shipment", "id": "S-5001" }
list_objects     { "objectType": "Vehicle" }
list_objects     { "objectType": "Driver" }
reassignShipment { "shipment": "S-5001", "fromVehicle": "V-101", "toVehicle": "V-102" }
get_object       { "objectType": "Shipment", "id": "S-5001" }
notifyCustomer   { "shipment": "S-5001", "message": "Hello Bayview Bakery, your shipment S-5001 was delayed because its delivery van needed maintenance. ..." }
```

アクションのたびに、Claude Code はツール名と引数を表示して許可を求めます。最初のアクションに対するサーバーの応答は次のとおりです。

```text
Applied: reassignShipment(shipment: "S-5001", fromVehicle: "V-101", toVehicle: "V-102")
Changes:
- Shipment S-5001: vehicle "V-101" → (none)
- Shipment S-5001: vehicle (none) → "V-102"
```

最後のまとめでは、V-102 が同じ拠点にあって空いており、650 kg の余裕があり、ドライバーが勤務中であることを理由に挙げていました。*やらなかったこと*も書いていました。新しい到着予定時刻はどのツールからも得られなかったので、`markDelayed` は呼ばず、時刻を勝手に作ることもしませんでした。

チュートリアル6では `assignVehicle` を選んでいます。どちらのアクションでも出荷は移せるので、エージェントの選択はオントロジーの妥当な読み方です。アクションパネルで2つの実行条件を見比べてみてください。`reassignShipment` は拠点の一致を確認せず、状態を `assigned` にもしません。配車で必ず拠点を確認したいなら、そのルールはエージェントの判断に任せず、オントロジーに書くべきです。5章を終えたら、`reassignShipment` にも追加してみてください。

サーバーが何を記録したかは、`object-ontology-mcp/` で別のターミナルを開いて確かめられます。

```sh
npm run show -- delivery                   # 監査ログと送信予定(outbox)
npm run show -- delivery Shipment S-5001   # 1つのオブジェクトとそのリンク
```

outbox には、顧客へのメールなど、オントロジーに書かれた副作用が入ります。このサンプルでは記録するだけで、実際には送信しません。

## 4. ガードレールを確かめる

ルールで禁じられていることを頼んでみます。

```text
Put shipment S-5001 on truck V-201.
```

実際の実行では、Claude Code は出荷と2台の車両を調べたうえで、**アクションを呼ばずに断りました**。V-201 が満たさない実行条件を3つとも挙げています。走行中であること、空きが 100 kg しかなく 120 kg の荷物が載らないこと、別の拠点に所属していること、の3つです。代わりに V-102 を提案しました。これが1つ目の守りです。実行条件はツールの説明文に書かれているので、モデルは動く前にそれを読めます。

2つ目の守りはサーバーです。それでも呼ぶよう頼んでみます。

```text
Call assignVehicle with shipment S-5001 and vehicle V-201 anyway, then tell me exactly what the server answered.
```

```text
Rejected: assignVehicle(shipment: "S-5001", vehicle: "V-201") was not applied.
- The vehicle must be available (not on route or in maintenance).
- The shipment must fit in the vehicle's remaining capacity.
- The vehicle must be based at the shipment's origin depot.
```

サーバーは実行条件をすべて確認し、満たさなかったものをまとめて返します。エージェントは一度で別の選択肢を選べます。データは何も変わっていません。`npm run show -- delivery` を実行すると、この呼び出しが `rejected` として記録されています。モデルだけに頼らないことが大切です。モデルはたいてい正しく判断しますが、確実に止めるのはサーバーです。

## 5. オントロジーを変え、確認できるまでサーバーに拒否させる

配車担当から、ドライバーが勤務中であることも条件にしたいという要望が来ました。`delivery/delivery-ops.oont.yaml` の `assignVehicle` に、拠点のルールの後ろに次の検証ルールを追加します。

```yaml
      - description: The vehicle's driver must be on shift.
        expr: "vehicle.driver.onShift"
```

アクションパネルの **実行条件（満たさない場合は拒否）** に新しい行が表示されます。ツール定義をエクスポートし直して、`delivery/delivery-ops.tools.json` に上書きします。続けて `/mcp` から `delivery-ops` に再接続し、新しいツールの説明文を Claude Code に読み込ませます。一度終了して `claude --continue` で再開してもかまいません。

条件を満たすはずの割り当てを頼みます。

```text
Assign shipment S-5001 to van V-102.
```

```text
Rejected: assignVehicle(shipment: "S-5001", vehicle: "V-102") was not applied.
- The vehicle's driver must be on shift. (The server has no check for "vehicle.driver.onShift" yet, so it refuses the action instead of skipping the rule. Implement it in src/guards/delivery-ops.ts.)
```

V-102 のドライバーは勤務中です。それでも、新しいルールを確認するコードがサーバーにないため、**安全側に倒して拒否**します。実際の実行では、エージェントはドライバーの状態を自分で確かめたうえで、拒否された理由を説明しました。勤務中の条件がない `reassignShipment` に切り替えることもしませんでした。たった今止められたルールを迂回することになるからです。

ここからは開発者の役です。別のターミナルの `object-ontology-mcp/` で、もう1つ Claude Code を起動して頼みます。

```text
The delivery ontology (delivery/delivery-ops.oont.yaml) gained a precondition on assignVehicle with expr "vehicle.driver.onShift". Implement that check in src/guards/delivery-ops.ts, following the existing checks and src/guards.ts. Then run npm test.
```

実際の実行では、1行を追加してテストを通しました。

```ts
  "vehicle.driver.onShift": (c) => c.linkedObjects("vehicle", "driver")[0]?.onShift === true,
```

エージェント側のセッションに戻り、もう一度頼みます。サーバーは呼び出しのたびにオントロジーと確認処理を読み直すので、何も再起動する必要はありません。

```text
Applied: assignVehicle(shipment: "S-5001", vehicle: "V-102")
Changes:
- Shipment S-5001: vehicle "V-101" → "V-102"
- Shipment S-5001: status "delayed" → "assigned"
Side effects (simulated; recorded in the outbox of state.json):
- The vehicle's driver receives the updated route.
```

流れをまとめると、オントロジーを変えてエクスポートし直すと、誰かが新しい確認処理を実装するまでサーバーは拒否し続けます。ルールが黙って抜け落ちたままエージェントが動くことはありません。

やり直すときは `object-ontology-mcp/` で `npm run reset -- delivery` を実行します。この練習で変えたファイルは `git checkout -- delivery src` で元に戻せます。

## 6. 練習問題: サポートデスク

```sh
cd ../support
claude
```

起動時の2つの確認には、[2章](#2-配送のワークスペースで-claude-code-を起動する)と同じように答えます（今度は `support-desk` サーバーです）。

support ワークスペースでは、[チュートリアル6の5章](tutorial-6-object-ontology-ai-agents.md#5-ガードレールの例-サポートデスク)の `support-desk.oont.yaml` を使います。時計はシナリオの日付の 2026-05-10 に固定してあります（`workspace.json` の `now`）。固定しないと、「30日以内」のルールで今日の日付では両方の返金が拒否されてしまいます。次のように頼みます。

```text
Tickets TK-301 and TK-302 both report items that arrived damaged. Refund the damaged items and close what can be closed.
```

実際の実行では、エージェントは次のように動きました。

- TK-301 では、割れていたイヤホンの分だけを返金しました（`issueRefund`、4,800 円）。同じ注文のケーブルは対象にしていません。
- TK-302 のスピーカー（24,800 円）は `requestRefundApproval` に回しました。1万円を超える場合はそちらを使うよう、ツールの説明文に書いてあるからです。
- TK-301 はクローズし、TK-302 は開いたままにしました。承認待ちの返金があるチケットはクローズできないからです。

続けて、ルールを破らせてみてください。TK-302 にそれでも `issueRefund` を呼ぶよう頼んだり、TK-302 をクローズするよう頼んだりして、サーバーの応答を読んでみましょう。

## サーバーの仕組み

ツールの呼び出しはすべて `src/server.ts` を通ります。呼び出しのたびに `workspace.json`、オントロジー、エクスポートしたツール定義、確認処理を読み直すので、編集はすぐに反映されます。

1. **引数**を、アクションのパラメーターと照らし合わせます。必須かどうか、型、選択肢、参照先のオブジェクトが存在するかを確認します（`src/actions.ts`）。
2. **実行条件**は、`expr` の文字列をキーにして `src/guards/<オントロジー名>.ts` から確認処理を探します。拡張機能は `expr` を評価しないので、ここで実装します。確認処理がない実行条件があれば、アクションは拒否されます。
3. **ルール**（`createObject`、`modifyObject`、`createLink` など）は、データのコピーに対して適用します。そのため、呼び出しは全部反映されるか、まったく反映されないかのどちらかです。
4. 呼び出しを `state.json` の**監査ログ**に、アクションの副作用を **outbox** に記録します。

サーバーは、オントロジーに書かれたことだけをそのまま実行します。たとえば `assignVehicle` は車両の `loadKg` を増やしません。そう書いたルールがないからです。増やすべきかどうかはモデリングの問題なので、オントロジーで決めます。

## 本番に向けて

- `src/store.ts` の `state.json` を自分のデータベースに置き換えます。ツール定義と確認処理はそのまま使えます。
- メール、SMS、ルート更新などの実際の副作用は、書き込みが確定してから outbox をもとに実行します。
- 認証を加え、どのアクションに人の承認が必要かを決めます。Claude Code の許可確認は、その開発時の代わりです。

## トラブルシューティング

- **`delivery-ops` が接続されない。** `node -v` が 22.6 以降か、`object-ontology-mcp/` で `npm install` を実行したかを確かめてください。そこで `npm run server -- delivery` を実行すると、何も表示せずに入力を待つ状態になるはずです。Ctrl+C で止めます。
- **エージェントが新しいルールを知らない。** ツール定義をエクスポートし直し、`/mcp` からサーバーに再接続してください。ルールそのものはすぐに効きます。サーバーが呼び出しのたびに YAML を読むからです。
- **`cat` や `grep` の実行前に確認される。** 想定どおりの動作です。許可するか、そのコマンドを `.claude/settings.json` に追加してください。

## 次のステップ

- [チュートリアル9: Claude Code で動かす — Semantic Web と根拠のある回答](tutorial-9-claude-code-semantic-web.md): チュートリアル7の内容を、同じように実際に動かします。
- [チュートリアル6: Object Ontology × AI エージェント](tutorial-6-object-ontology-ai-agents.md): この構成の考え方。

[チュートリアル一覧](../ja/) に戻る。
