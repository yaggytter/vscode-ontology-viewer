# Tutorial 6: Object Ontology × AI Agents

An AI agent that can change real data needs two things from you: an accurate picture of your domain, and a short, strict list of what it is allowed to do. An Object Ontology holds both in one file. This tutorial turns one into an agent's context and tool list, then follows the agent through a delayed delivery.

We'll use **Harbor City Delivery Ops**. Run **Ontology Viewer: Create Sample Ontology...** and pick **Delivery Operations (Object Ontology)**. This creates `delivery-ops.oont.yaml`. If the file format is new to you, start with [Tutorial 5](tutorial-5-object-ontology.md).

The extension makes no network calls and does not call any LLM. It produces text and JSON for you to hand to the agent of your choice.

## Why an ontology helps an agent

- **Shared vocabulary.** The agent sees exact API names such as `Shipment`, `vehicleId` and `assignVehicle`, so it does not have to guess at field names.
- **Links instead of guessed joins.** "Each Shipment has exactly one Vehicle via `vehicle`" tells the agent how to get from a shipment to its van. It does not have to infer that `depotId` probably matches something.
- **Actions are the only writes.** Each action type becomes one typed tool. The agent cannot invent an `updateShipment` call that does not exist.
- **Guard rails.** Validations ("the vehicle must be available") and approval flows are written next to the action. The agent reads them in the tool description, and your backend enforces them.
- **One source of truth.** Tool definitions are generated from the same file you see in the diagram. Change the ontology, re-export, and the tools follow.

## 1. Export the context summary

Open `delivery-ops.oont.yaml` and run **Ontology Viewer: Export Ontology Summary for LLM Context...**. An untitled Markdown document opens. Here is a trimmed excerpt of the real output:

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

The full document also lists the other types, the `Trackable` interface, the remaining actions, and up to three example objects per type.

## 2. Export the agent tools

Run **Ontology Viewer: Export Actions as AI Agent Tools (JSON Schema)...**, or click **Export as agent tools** in the Actions panel. You get an untitled JSON document shaped as `{ "source": {...}, "tools": [...] }`, with one tool per action type. These are two of the four tools, exactly as exported:

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

An `objectRef` parameter becomes a string holding the target type's primary key. Enums, required flags and arrays carry over. In `markDelayed`, for example, `reason` is an enum of the five delay reasons. The summary does not list parameter enums; the tool schema does.

## 3. A conversation, step by step

The dispatcher writes:

```text
Shipment S-5001 is late — fix it and tell the customer.
```

With the summary in its context and the four tools available, a well-behaved agent works like this:

1. **Find the shipment.** S-5001 is `delayed` with `delayReason=vehicleMaintenance` and `customerNotified=false`. It weighs 120 kg.
2. **Follow `vehicle`.** The shipment is on V-101, which has `status=maintenance`. The van cannot leave.
3. **Follow `originDepot`, then `vehicles`.** S-5001 starts at D-01 (Harbor North Depot). D-01's vehicles are V-101 and V-102.
4. **Check the candidate against the preconditions.** V-102 is `available`. Its load already includes its own shipments, so the check is 350 + 120 = 470 kg ≤ 1000 kg. It is based at D-01, the origin depot. V-201 is ruled out: it belongs to D-02, it is `onRoute`, and 2900 + 120 kg would exceed its 3000 kg capacity.
5. **Call the tools.**

```json
{ "name": "assignVehicle", "arguments": { "shipment": "S-5001", "vehicle": "V-102" } }
```

```json
{ "name": "notifyCustomer", "arguments": { "shipment": "S-5001", "message": "Your delivery S-5001 was delayed because its van needed maintenance. It has been moved to another van at Harbor North Depot, and we will send you the new arrival time shortly." } }
```

The message is 175 characters, within the 300-character limit. The agent does not invent a new ETA it has no data for. It also skips `markDelayed`: S-5001 is already marked delayed, and that action's side effect would notify the customer a second time. `reassignShipment` (with `fromVehicle: "V-101"`) would also move the shipment. `assignVehicle` is the better fit here because it also checks the depot and sets the status to `assigned`.

Two things the extension does **not** do:

- **It does not read live data.** In this walkthrough the agent learns V-101's status from the summary's example objects. In a real deployment, the agent needs read tools, such as "get vehicle" or "list a depot's vehicles", from your own server. The export contains only the actions, which are the writes.
- **It does not enforce validations.** `expr` strings are never evaluated by the extension. Whatever executes the tool must check "available", "capacity" and "same depot" itself, and return a rejection the model can read.

## 4. Wire it up

**Tools.** The `tools` array has the shape MCP's `tools/list` returns. Serve it as-is and leave out `source`, which is only there to record where the tools came from. For a function-calling API, rename `inputSchema` to the field that API expects, such as `input_schema` in the Anthropic Messages API or `parameters` in OpenAI function calling.

**Enforcement.** Your handler checks the preconditions before it writes anything. The sketch below shows `assignVehicle`.

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

**Context.** Put the summary in the system prompt, in project knowledge, or in a `CLAUDE.md` file that a coding agent reads:

```text
You are the dispatch assistant for Harbor City Delivery Ops.
The ontology below is the source of truth for names and relationships.
Change data only through the provided tools. If a tool call is rejected,
read the reason and choose another option instead of retrying unchanged.

<ontology>
(paste the exported summary here)
</ontology>
```

## 5. Guard rails: the support desk

Create **Support Desk (Object Ontology)** from the samples (`support-desk.oont.yaml`). Two customers report damaged items.

- **TK-301**: earbuds arrived cracked. Order OR-7001 totals 6,000 JPY with nothing refunded yet, and the earbuds cost 4,800 JPY. All three `issueRefund` preconditions hold: the amount fits what is left of the order, the order was placed on 2026-05-02 (eight days before the ticket, within 30 days), and the amount is 10,000 JPY or less. Your server evaluates `daysSince` with its own clock, so these sample dates only work inside the scenario.
- **TK-302**: a speaker box was crushed. Order OR-7002 is 24,800 JPY, which is over the limit. The `issueRefund` description already says "Use requestRefundApproval for anything over 10,000 JPY", so the agent asks for approval instead:

```json
{ "name": "issueRefund", "arguments": { "refundId": "RF-101", "ticket": "TK-301", "order": "OR-7001", "amountYen": 4800, "reason": "damaged" } }
```

```json
{ "name": "requestRefundApproval", "arguments": { "refundId": "RF-102", "ticket": "TK-302", "order": "OR-7002", "amountYen": 24800, "reason": "damaged" } }
```

The second call creates a Refund with status `pendingApproval`. No money moves until a lead such as SS-02 (Ada Brooks) approves it. `closeTicket` on TK-302 stays rejected while that refund is pending. If the agent calls `issueRefund` for TK-302 anyway, your server rejects it on the 10,000 JPY rule. That backstop is the reason the server, not the model, enforces the checks.

## 6. Change the ontology, re-export the tools

Say dispatch also wants the driver to be on shift. Add a validation to `assignVehicle` in the YAML:

```yaml
      - description: The vehicle's driver must be on shift.
        expr: "vehicle.driver.onShift"
```

The Actions panel shows the new line under **Rejected unless** right away. Re-run the export, and the sentence appears in the tool's `Preconditions`. Then add the same check to your handler. Tool names come from the YAML keys, so renaming an action in the Inspector (which only writes `displayName`) leaves your server's tool names unchanged. Renaming a key does change them.

## Limits and tips

- **The file has no live data.** `objects:` holds example data for the summary, the diagram and SPARQL. Real objects come from your own systems through read tools.
- **Name actions verb-first.** `assignVehicle` and `notifyCustomer` read like what they do. The model picks tools by name and description.
- **Write descriptions for the model.** `description`, validation descriptions and side effects all end up in the tool description. Say when *not* to use an action, as `issueRefund` does.
- **Keep validations human-readable.** The model reads the `description`. The `expr` is a hint for whoever implements the check.

## Next steps

- [Tutorial 7: Semantic Web Ontologies × LLMs](tutorial-7-semantic-web-llm.md): use the OWL/RDF samples for grounding, glossaries and provenance.
- [Choosing an Ontology Style](choosing-ontology-style.md): when to use an Object Ontology, and when to use OWL/RDF.

Back to the [tutorial list](../en/).
