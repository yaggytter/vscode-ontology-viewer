# Tutorial 8: Run It with Claude Code — Object Ontology Agents

[Tutorial 6](tutorial-6-object-ontology-ai-agents.md) explains how an Object Ontology becomes an agent's context and tool list. This tutorial runs that setup for real. **Claude Code** plays the agent. A small **MCP server** plays your backend: it serves the tools you export from the viewer, checks every precondition, and records what changed. You watch the agent read the data, call an action, get refused, and pick something else.

> **New to these ideas?** Read the [illustrated primer](https://yaggytter.github.io/vscode-ontology-viewer/index.en.html) first. It walks through the scenario, the problem and the steps with pictures, and lists what to watch for in the videos.

The server is a ready-made example in this repository. You don't have to write any code, except in section 5, where Claude Code writes a check for you.

What you need:

- [Claude Code](https://docs.claude.com/en/docs/claude-code/overview), installed and signed in. The conversations below use your Claude plan.
- Node.js 22.6 or later (`node -v`). The example runs its TypeScript directly with Node, without a build step.
- Git, VS Code and this extension.

> Claude Code's replies differ from run to run. The transcripts below are from real runs; yours will be worded differently and may take other reasonable steps. Watch which tools it calls and what the server answers. That part is deterministic.

## 0. Get the example

```sh
git clone https://github.com/yaggytter/vscode-ontology-viewer.git
cd vscode-ontology-viewer/examples/claude-code/object-ontology-mcp
npm install
npm test
```

`npm test` should report 11 passing tests. They run the scenarios below without Claude Code, including one round trip through the real server over MCP.

| Path | What it is |
| --- | --- |
| `delivery/`, `support/` | Workspaces. You start Claude Code inside one of them. |
| `delivery/delivery-ops.oont.yaml` | The ontology: the bundled delivery sample, unchanged. |
| `delivery/delivery-ops.tools.json` | Output of **Export Actions as AI Agent Tools**. |
| `delivery/CLAUDE.md` | Instructions for the agent, plus the output of **Export Ontology Summary for LLM Context**. |
| `delivery/.mcp.json` | Tells Claude Code how to start the server. |
| `delivery/.claude/settings.json` | Permissions: read tools run freely; data and ontology files may not be edited. |
| `delivery/workspace.json` | Which files the server uses, and a fixed clock for the scenario. |
| `delivery/state.json` | The "database". Created on the first tool call; not in git. |
| `src/` | The server: a few hundred lines of commented TypeScript. `src/guards/` holds the precondition checks. |

## 1. Export the tools and the summary yourself

The workspace already contains both exports, so you can skip this step. Doing it once shows where the files come from.

1. Open `delivery/delivery-ops.oont.yaml` in VS Code and open the diagram.
2. Run **Ontology Viewer: Export Actions as AI Agent Tools (JSON Schema)...**. Save the untitled document over `delivery/delivery-ops.tools.json`. Git shows no change, because the shipped file is exactly this output.
3. Run **Ontology Viewer: Export Ontology Summary for LLM Context...** and compare it with the `<ontology>` block in `delivery/CLAUDE.md`. It is the same text.

The rest of `CLAUDE.md` is the system prompt from [tutorial 6, section 4](tutorial-6-object-ontology-ai-agents.md#4-wire-it-up). It adds two rules this setup needs: never edit `state.json` to change data, and trust the read tools over the example objects in the summary.

## 2. Start Claude Code in the delivery workspace

```sh
cd delivery
claude
```

Claude Code asks two questions on the first start. In both, the highlighted default is the safe "no", so move the selection with the arrow keys before pressing Enter:

1. **Is this a project you trust?** The folder's `.claude/settings.json` pre-approves the three read tools, so Claude Code lists them and asks. Choose **Yes, I trust this folder**.
2. **New MCP server found in this project: delivery-ops.** Choose **Use this MCP server**. If you choose **Continue without using this MCP server**, Claude Code records `delivery-ops` under `disabledMcpjsonServers` in `.claude/settings.local.json`; delete that entry, or enable the server in `/mcp`, to get it back.

Then type `/mcp`. `delivery-ops` should be connected with 7 tools:

- **Read tools**, defined by the server: `list_objects`, `get_object` and `follow_link`. The export only contains writes, but an agent has to look things up before it acts.
- **Action tools**, exactly as exported: `assignVehicle`, `reassignShipment`, `markDelayed` and `notifyCustomer`.

`.claude/settings.json` lets the read tools run without asking. Every action needs your approval, so you see each write before it happens. That's the development-time version of a human in the loop.

The same file denies edits to `state.json`, the ontology and the tool definitions (an `Edit(...)` deny rule covers every Claude Code tool that writes files), so the agent can't change data by editing files. Deny rules don't cover shell commands, but Claude Code asks before running any command that isn't allowed. Don't approve one that writes to those files.

## 3. Fix the late shipment

Type the request from tutorial 6:

```text
Shipment S-5001 is late — fix it and tell the customer.
```

In one real run, Claude Code made these calls:

```text
get_object       { "objectType": "Shipment", "id": "S-5001" }
list_objects     { "objectType": "Vehicle" }
list_objects     { "objectType": "Driver" }
reassignShipment { "shipment": "S-5001", "fromVehicle": "V-101", "toVehicle": "V-102" }
get_object       { "objectType": "Shipment", "id": "S-5001" }
notifyCustomer   { "shipment": "S-5001", "message": "Hello Bayview Bakery, your shipment S-5001 was delayed because its delivery van needed maintenance. ..." }
```

For each action Claude Code shows you the tool name and arguments and waits for approval. The server's answer to the first one:

```text
Applied: reassignShipment(shipment: "S-5001", fromVehicle: "V-101", toVehicle: "V-102")
Changes:
- Shipment S-5001: vehicle "V-101" → (none)
- Shipment S-5001: vehicle (none) → "V-102"
```

Its closing summary said V-102 was at the same depot, available, with 650 kg free and a driver on shift. It also said what it did *not* do. It didn't call `markDelayed`, because no tool gave it a new arrival time, and it didn't make one up.

Tutorial 6 picks `assignVehicle` instead. Both actions can move the shipment, and the agent's choice is a fair reading of the ontology. Compare their preconditions in the Actions panel. `reassignShipment` doesn't check the depot and doesn't set the status to `assigned`. If dispatch should always check the depot, that rule belongs in the ontology, not in the agent's judgement. Try adding it to `reassignShipment` once you've done section 5.

Open a second terminal in `object-ontology-mcp/` to see what the server recorded:

```sh
npm run show -- delivery                   # audit log and outbox
npm run show -- delivery Shipment S-5001   # one object, with its links
```

The outbox holds the side effects the ontology declares, such as the customer email. In this example they are only recorded, not sent.

## 4. Watch the guard rails

Ask for something the rules forbid:

```text
Put shipment S-5001 on truck V-201.
```

In a real run, Claude Code read the shipment and both vehicles and then **refused without calling the action**. It listed the three preconditions V-201 fails: the truck is on route, has only 100 kg free for a 120 kg shipment, and is based at another depot. It offered V-102 instead. That's the first layer working: the preconditions are written into the tool description, so the model sees them before it acts.

The second layer is the server. Ask Claude Code to try anyway:

```text
Call assignVehicle with shipment S-5001 and vehicle V-201 anyway, then tell me exactly what the server answered.
```

```text
Rejected: assignVehicle(shipment: "S-5001", vehicle: "V-201") was not applied.
- The vehicle must be available (not on route or in maintenance).
- The shipment must fit in the vehicle's remaining capacity.
- The vehicle must be based at the shipment's origin depot.
```

The server checks every precondition and reports all the failures at once, so the agent can choose a better option in one step. Nothing changed. `npm run show -- delivery` lists the attempt as `rejected`. Don't rely on the model alone: it is usually right, and the server is what makes sure.

## 5. Change the ontology, and let the server refuse until it can check

Dispatch now wants drivers to be on shift. Add this validation to `assignVehicle` in `delivery/delivery-ops.oont.yaml`, after the depot rule:

```yaml
      - description: The vehicle's driver must be on shift.
        expr: "vehicle.driver.onShift"
```

The Actions panel shows the new line under **Rejected unless**. Export the tools again over `delivery/delivery-ops.tools.json`. Then type `/mcp` and reconnect `delivery-ops`, so Claude Code loads the new tool description. Alternatively, quit and run `claude --continue`.

Ask for a valid assignment:

```text
Assign shipment S-5001 to van V-102.
```

```text
Rejected: assignVehicle(shipment: "S-5001", vehicle: "V-102") was not applied.
- The vehicle's driver must be on shift. (The server has no check for "vehicle.driver.onShift" yet, so it refuses the action instead of skipping the rule. Implement it in src/guards/delivery-ops.ts.)
```

V-102's driver *is* on shift, but the server has no code for the new rule, so it **fails closed**. In the real run, the agent checked the driver itself and explained why the call was blocked. It also declined to fall back to `reassignShipment`, which has no on-shift rule, because that would get around the rule that had just blocked it.

Now act as the developer. In the second terminal, start another Claude Code session in `object-ontology-mcp/` and ask:

```text
The delivery ontology (delivery/delivery-ops.oont.yaml) gained a precondition on assignVehicle with expr "vehicle.driver.onShift". Implement that check in src/guards/delivery-ops.ts, following the existing checks and src/guards.ts. Then run npm test.
```

In the real run it added one line and the tests passed:

```ts
  "vehicle.driver.onShift": (c) => c.linkedObjects("vehicle", "driver")[0]?.onShift === true,
```

Go back to the agent session and ask again. You don't need to restart anything: the server reloads the ontology and the guards on every call.

```text
Applied: assignVehicle(shipment: "S-5001", vehicle: "V-102")
Changes:
- Shipment S-5001: vehicle "V-101" → "V-102"
- Shipment S-5001: status "delayed" → "assigned"
Side effects (simulated; recorded in the outbox of state.json):
- The vehicle's driver receives the updated route.
```

The loop is: change the ontology, re-export, and the server refuses until someone implements the new check. The agent never runs with a rule silently missing.

To start again, run `npm run reset -- delivery` (from `object-ontology-mcp/`). To undo the exercise, run `git checkout -- delivery src`.

## 6. Exercise: the support desk

```sh
cd ../support
claude
```

Answer the two startup questions as in [section 2](#2-start-claude-code-in-the-delivery-workspace), this time for `support-desk`.

The support workspace serves `support-desk.oont.yaml` from [tutorial 6, section 5](tutorial-6-object-ontology-ai-agents.md#5-guard-rails-the-support-desk). Its clock is fixed to the scenario date, 2026-05-10 (`now` in `workspace.json`). Without that, the "within 30 days" rule would reject both refunds today. Ask:

```text
Tickets TK-301 and TK-302 both report items that arrived damaged. Refund the damaged items and close what can be closed.
```

In a real run, the agent:

- refunded only the cracked earbuds on TK-301 (`issueRefund`, 4,800 JPY), not the cable on the same order;
- sent the 24,800 JPY speaker on TK-302 to `requestRefundApproval`, because the tool description says to use it over 10,000 JPY;
- closed TK-301 and left TK-302 open, because a ticket with a refund waiting for approval cannot be closed.

Then try to break the rules. Ask it to call `issueRefund` for TK-302 anyway, or to close TK-302, and read what the server answers.

## How the server works

Each tool call goes through `src/server.ts`. It re-reads `workspace.json`, the ontology, the exported tools and the guards, so your edits take effect at once.

1. **Arguments** are checked against the action's parameters: required, type, enum, and whether each referenced object exists (`src/actions.ts`).
2. **Preconditions** are looked up in `src/guards/<ontology>.ts` by their `expr` text. The extension never evaluates `expr`; this is where it gets implemented. A precondition with no check rejects the action.
3. **Rules** (`createObject`, `modifyObject`, `createLink`, ...) are applied to a copy of the data, so a call is applied completely or not at all.
4. The call goes into the **audit log**, and the action's side effects go into the **outbox** in `state.json`.

The server does exactly what the ontology declares and nothing more. For example, `assignVehicle` doesn't increase the vehicle's `loadKg`, because no rule says it should. Whether it should is a modelling question, and the ontology is where to answer it.

## Toward production

- Replace `state.json` with your database in `src/store.ts`. The tools and checks stay the same.
- Run real side effects (email, SMS, route updates) from the outbox, after the write has committed.
- Add authentication, and decide which actions need a human's approval. Claude Code's permission prompt is the development-time stand-in for that.

## Troubleshooting

- **`delivery-ops` is not connected.** Check `node -v` (22.6 or later) and that you ran `npm install` in `object-ontology-mcp/`. Run `npm run server -- delivery` there. It should wait silently for input; press Ctrl+C to stop it.
- **The agent doesn't know about a new rule.** Re-export the tools, then reconnect the server with `/mcp`. Rules themselves apply immediately, because the server reads the YAML on every call.
- **Claude Code asks before running `cat` or `grep`.** That's expected. Approve it, or add the command to `.claude/settings.json`.

## Next steps

- [Tutorial 9: Run It with Claude Code — Semantic Web Answers](tutorial-9-claude-code-semantic-web.md): the same hands-on approach for tutorial 7.
- [Tutorial 6: Object Ontology × AI Agents](tutorial-6-object-ontology-ai-agents.md): the concepts behind this setup.

Back to the [tutorial list](../en/).
