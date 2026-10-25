# チュートリアル6: Object Ontology × AI エージェント

実データを変更する AI エージェントには、2つのものを渡す必要があります。ひとつは業務領域の正確な全体像、もうひとつは「やってよいこと」を絞り込んだ厳密な一覧です。Object Ontology なら、この2つを1つのファイルにまとめられます。このチュートリアルでは、オントロジーからエージェント用のコンテキストとツール一覧を作り、配送遅延に対応するエージェントの動きを順に追います。

題材は **Harbor City Delivery Ops** です。**「Ontology Viewer: サンプルオントロジーを作成...」** を実行して **配送オペレーション（Object Ontology）** を選ぶと、`delivery-ops.oont.yaml` が作られます。ファイル形式をまだ知らない場合は、先に [チュートリアル5](tutorial-5-object-ontology.md) を読んでください。

拡張機能はネットワーク通信を行わず、LLM も呼び出しません。作るのはテキストと JSON だけで、それをどのエージェントに渡すかは利用者が決めます。

## オントロジーがエージェントの役に立つ理由

- **語彙をそろえられる。** エージェントは `Shipment`、`vehicleId`、`assignVehicle` といった正確な API 名を受け取るので、項目名を推測せずに済みます。
- **結合を推測させずに、リンクをたどらせられる。** 「各 Shipment は `vehicle` で Vehicle を1件持つ」と書いてあれば、エージェントは出荷から車両へ迷わずたどれます。`depotId` がどこかに対応しているはずだ、と推測する必要はありません。
- **書き込みはアクションだけ。** アクション型1つが、型付きのツール1つになります。存在しない `updateShipment` をエージェントが勝手に作り出すことはできません。
- **ガードレールを書ける。** 「車両は空いていること」といった検証ルールや承認フローを、アクションのすぐそばに書きます。エージェントはそれをツールの説明として読み、バックエンドが実際に強制します。
- **定義の出どころが1つ。** ツール定義は、図で見ているのと同じファイルから生成されます。オントロジーを変えて再エクスポートすれば、ツールも追従します。

## 1. コンテキスト用の要約をエクスポートする

`delivery-ops.oont.yaml` を開いて **「Ontology Viewer: LLM コンテキスト用のオントロジー要約をエクスポート...」** を実行すると、無題の Markdown ドキュメントが開きます。実際の出力から一部を抜き出すと次のとおりです。

```markdown
# Ontology: Harbor City Delivery Ops

Use these exact API names. Objects are identified by their type's primary key.
Only the actions listed below may change data; everything else is read-only.

### Vehicle
A delivery van, truck or cargo bike.
Implements: Trackable
Properties:
  - vehicleId: string (primary key)
  - status: string (one of: available | onRoute | maintenance)
  - capacityKg: double (unit: kg)
  - loadKg: double (unit: kg) — Weight already assigned to this vehicle.
  - depotId: string

## Links
- vehicleDepot ("Based at"): each Vehicle has exactly one Depot via `depot`; each Depot has many Vehicle via `vehicles`. Backed by Vehicle.depotId.
- shipmentOrigin: each Shipment has exactly one Depot via `originDepot`; each Depot has many Shipment via `outboundShipments`.
- shipmentVehicle ("Carried by"): each Shipment has exactly one Vehicle via `vehicle`; each Vehicle has many Shipment via `shipments`.

## Actions (the only allowed writes)

### assignVehicle ("Assign vehicle")
Put a pending or delayed shipment on a vehicle. Replaces any earlier vehicle assignment.
Parameters:
  - shipment: Shipment (by primary key), required
  - vehicle: Vehicle (by primary key), required
Effects:
  - createLink shipmentVehicle
  - modifyObject Shipment (sets status)
Rejected unless:
  - The vehicle must be available (not on route or in maintenance).
  - The shipment must fit in the vehicle's remaining capacity.
  - The vehicle must be based at the shipment's origin depot.
Side effects:
  - The vehicle's driver receives the updated route.

## Example objects
- Vehicle:
  - vehicleId=V-101, plate=HC-101, kind=van, status=maintenance, capacityKg=800, loadKg=120, depotId=D-01, lat=35.4521, lon=139.6402, driver=DR-01
  - vehicleId=V-102, plate=HC-102, kind=van, status=available, capacityKg=1000, loadKg=350, depotId=D-01, lat=35.4524, lon=139.6398, driver=DR-02
- Shipment:
  - shipmentId=S-5001, status=delayed, weightKg=120, promisedBy=2026-05-12T11:00:00+09:00, eta=2026-05-12T15:30:00+09:00, delayReason=vehicleMaintenance, customerNotified=false, customerId=C-01, originDepot=D-01, vehicle=V-101, stops=[ST-01]
```

実際の出力には、このほかの型、`Trackable` インターフェース、残りのアクション、型ごとに最大3件のサンプルオブジェクトも含まれます。

## 2. エージェント用ツールをエクスポートする

**「Ontology Viewer: アクションを AI エージェント用ツール定義 (JSON Schema) としてエクスポート...」** を実行するか、アクションパネルの **エージェント用ツールとしてエクスポート** を押します。`{ "source": {...}, "tools": [...] }` という形の無題 JSON が開き、アクション型ごとに1つずつツールが入っています。4つのうち2つを、出力そのままで示します。

```json
{
  "name": "assignVehicle",
  "description": "Assign vehicle\nPut a pending or delayed shipment on a vehicle. Replaces any earlier vehicle assignment.\nEffects: createLink shipmentVehicle (Shipment → Vehicle); modifyObject Shipment setting status.\nPreconditions (the call is rejected otherwise): The vehicle must be available (not on route or in maintenance). The shipment must fit in the vehicle's remaining capacity. The vehicle must be based at the shipment's origin depot.\nSide effects: The vehicle's driver receives the updated route.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "shipment": {
        "type": "string",
        "description": "Primary key (shipmentId) of the Shipment"
      },
      "vehicle": {
        "type": "string",
        "description": "Primary key (vehicleId) of the Vehicle"
      }
    },
    "required": [
      "shipment",
      "vehicle"
    ],
    "additionalProperties": false
  }
}
```

```json
{
  "name": "notifyCustomer",
  "description": "Notify customer\nSend a short status message about a shipment to its customer.\nEffects: modifyObject Shipment setting customerNotified.\nPreconditions (the call is rejected otherwise): The message must be between 1 and 300 characters.\nSide effects: An email or SMS is sent to the customer, using their preferred channel.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "shipment": {
        "type": "string",
        "description": "Primary key (shipmentId) of the Shipment"
      },
      "message": {
        "type": "string",
        "description": "Plain-text message, at most 300 characters."
      }
    },
    "required": [
      "shipment",
      "message"
    ],
    "additionalProperties": false
  }
}
```

`objectRef` のパラメーターは、参照先の型の主キーを入れる文字列になります。enum、必須指定、配列もそのまま引き継がれます。たとえば `markDelayed` の `reason` は、5種類の遅延理由の enum になります。要約にはパラメーターの enum は載りませんが、ツールのスキーマには載ります。

## 3. 会話の流れを追う

配車担当者が次のように書き込みます。

```text
Shipment S-5001 is late — fix it and tell the customer.
```

要約をコンテキストに持ち、4つのツールを使えるエージェントなら、次の順で考えます。

1. **出荷を確認する。** S-5001 は `delayed` で、`delayReason=vehicleMaintenance`、`customerNotified=false` です。重さは 120 kg です。
2. **`vehicle` をたどる。** 積まれているのは V-101 で、`status=maintenance` です。このバンは出発できません。
3. **`originDepot`、続けて `vehicles` をたどる。** S-5001 の出発拠点は D-01（Harbor North Depot）で、D-01 に所属する車両は V-101 と V-102 です。
4. **候補を実行条件と照らし合わせる。** V-102 は `available` です。積載量にはすでに自分の荷物が含まれているので、確認する式は 350 + 120 = 470 kg ≤ 1000 kg です。所属は出発拠点と同じ D-01 です。V-201 は候補から外れます。所属が D-02 で、`onRoute` のうえ、2900 + 120 kg は積載上限の 3000 kg を超えます。
5. **ツールを呼ぶ。**

```json
{ "name": "assignVehicle", "arguments": { "shipment": "S-5001", "vehicle": "V-102" } }
```

```json
{ "name": "notifyCustomer", "arguments": { "shipment": "S-5001", "message": "Your delivery S-5001 was delayed because its van needed maintenance. It has been moved to another van at Harbor North Depot, and we will send you the new arrival time shortly." } }
```

メッセージは 175 文字で、300 文字の上限に収まっています。根拠となるデータがないので、エージェントは新しい到着予定時刻を勝手に作りません。`markDelayed` も呼びません。S-5001 はすでに遅延として記録済みで、このアクションには顧客への通知という副作用があるため、二重に通知してしまいます。`reassignShipment`（`fromVehicle: "V-101"` を指定）でも出荷は移せます。ここで `assignVehicle` を選ぶのは、拠点の一致も確認し、状態を `assigned` に更新するからです。

拡張機能が**行わない**ことが2つあります。

- **実データは読みません。** この例では、エージェントは要約のサンプルオブジェクトから V-101 の状態を知りました。本番では「車両を取得する」「拠点の車両を一覧する」といった読み取り用のツールを、自分のサーバーで用意する必要があります。エクスポートに含まれるのは書き込み、つまりアクションだけです。
- **検証ルールを強制しません。** 拡張機能は `expr` を評価しません。「空いているか」「積めるか」「同じ拠点か」は、ツールを実行する側で確認し、拒否した場合はモデルが読める理由を返してください。

## 4. つなぎ込む

**ツール。** `tools` 配列は、MCP の `tools/list` が返す形と同じです。そのまま返し、`source` は含めません。`source` はツールの出どころを記録するためだけの項目です。function calling の API で使う場合は、`inputSchema` を API の期待する名前に変えます。Anthropic の Messages API なら `input_schema`、OpenAI の function calling なら `parameters` です。

**強制。** ハンドラーは、書き込む前に実行条件を確認します。次は `assignVehicle` の例です。

```typescript
// Illustration only — not part of the Ontology Viewer extension.
// Your backend (for example an MCP server) runs the tool and enforces
// the validations written in the ontology.
import exported from "./delivery-ops.tools.json";

interface Vehicle { vehicleId: string; status: string; capacityKg: number; loadKg: number; depotId: string }
interface Shipment { shipmentId: string; weightKg: number; originDepot: string }

interface Store {
  getShipment(id: string): Promise<Shipment | undefined>;
  getVehicle(id: string): Promise<Vehicle | undefined>;
  assignVehicle(shipmentId: string, vehicleId: string): Promise<void>;
}

// tools/list: serve the exported "tools" array; "source" is for humans.
export function listTools() {
  return { tools: exported.tools };
}

export async function callTool(store: Store, name: string, args: Record<string, unknown>): Promise<string> {
  if (name !== "assignVehicle") {
    throw new Error(`Unknown tool: ${name}`);
  }
  const shipment = await store.getShipment(String(args.shipment));
  const vehicle = await store.getVehicle(String(args.vehicle));
  if (!shipment || !vehicle) {
    return "Rejected: unknown shipment or vehicle.";
  }
  if (vehicle.status !== "available") {
    return `Rejected: ${vehicle.vehicleId} is ${vehicle.status}.`;
  }
  if (vehicle.loadKg + shipment.weightKg > vehicle.capacityKg) {
    return `Rejected: ${vehicle.vehicleId} has only ${vehicle.capacityKg - vehicle.loadKg} kg left.`;
  }
  if (vehicle.depotId !== shipment.originDepot) {
    return "Rejected: the vehicle is based at a different depot.";
  }
  await store.assignVehicle(shipment.shipmentId, vehicle.vehicleId);
  return `Assigned ${shipment.shipmentId} to ${vehicle.vehicleId}.`;
}
```

**コンテキスト。** 要約は、システムプロンプト、プロジェクトのナレッジ、コーディングエージェントが読む `CLAUDE.md` などに入れます。

```text
You are the dispatch assistant for Harbor City Delivery Ops.
The ontology below is the source of truth for names and relationships.
Change data only through the provided tools. If a tool call is rejected,
read the reason and choose another option instead of retrying unchanged.

<ontology>
(paste the exported summary here)
</ontology>
```

## 5. ガードレールの例: サポートデスク

サンプルから **サポートデスク（Object Ontology）**（`support-desk.oont.yaml`）を作ります。2人の顧客から、商品が壊れていたという連絡が来ています。

- **TK-301**: イヤホンが割れて届いた件です。注文 OR-7001 の合計は 6,000 円で、まだ返金はありません。イヤホンは 4,800 円です。`issueRefund` の実行条件は3つとも満たします。金額は注文の返金可能残額に収まります。注文日は 2026-05-02 で、チケットの8日前なので30日以内です。金額も 10,000 円以下です。`daysSince` はサーバーが自分の時計で計算するので、サンプルの日付が条件を満たすのはこのシナリオの中だけです。
- **TK-302**: スピーカーの箱が潰れていた件です。注文 OR-7002 は 24,800 円で、上限を超えます。`issueRefund` の説明に「Use requestRefundApproval for anything over 10,000 JPY」と書いてあるので、エージェントは代わりに承認を依頼します。

```json
{ "name": "issueRefund", "arguments": { "refundId": "RF-101", "ticket": "TK-301", "order": "OR-7001", "amountYen": 4800, "reason": "damaged" } }
```

```json
{ "name": "requestRefundApproval", "arguments": { "refundId": "RF-102", "ticket": "TK-302", "order": "OR-7002", "amountYen": 24800, "reason": "damaged" } }
```

2つ目の呼び出しは、状態が `pendingApproval` の Refund を作ります。SS-02（Ada Brooks）のようなリーダーが承認するまで、お金は動きません。返金が承認待ちのあいだは、TK-302 の `closeTicket` も拒否されます。それでもエージェントが TK-302 に `issueRefund` を呼んだ場合は、10,000 円のルールでサーバーが拒否します。確認をモデルではなくサーバーに任せるのは、こうした場合の最後の砦にするためです。

## 6. オントロジーを変えて、ツールを再エクスポートする

配車担当から「ドライバーが勤務中であることも条件にしたい」と要望が来たとします。YAML の `assignVehicle` に検証ルールを1つ追加します。

```yaml
      - description: The vehicle's driver must be on shift.
        expr: "vehicle.driver.onShift"
```

アクションパネルの **実行条件（満たさない場合は拒否）** には、すぐに新しい行が表示されます。エクスポートし直すと、ツールの `Preconditions` にもこの文が加わります。あとはハンドラーにも同じ確認を足してください。ツール名は YAML のキーから作られます。Inspector でアクションの名前を変えても `displayName` が変わるだけなので、サーバー側のツール名には影響しません。キー自体を変えた場合はツール名も変わります。

## 制限とコツ

- **ファイルに実データは入っていません。** `objects:` は、要約、図、SPARQL のためのサンプルデータです。実際のオブジェクトは、読み取り用ツールを通じて自分のシステムから取得します。
- **アクション名は動詞で始める。** `assignVehicle` や `notifyCustomer` は、名前を見れば何をするかがわかります。モデルは名前と説明でツールを選びます。
- **説明文はモデルが読む前提で書く。** `description`、検証ルールの説明、副作用は、すべてツールの説明文に入ります。`issueRefund` のように、そのアクションを使うべきでない場面も書いておきましょう。
- **検証ルールは人が読める文で書く。** モデルが読むのは `description` です。`expr` は、確認処理を実装する人へのヒントです。

## 次のステップ

- [チュートリアル7: Semantic Web オントロジー × LLM](tutorial-7-semantic-web-llm.md): OWL/RDF のサンプルを、回答の裏付け、用語集、来歴の記録に使います。
- [オントロジー方式の選び方](choosing-ontology-style.md): Object Ontology と OWL/RDF をどう使い分けるかを説明しています。

[チュートリアル一覧](../ja/) に戻る。
