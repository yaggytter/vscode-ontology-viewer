import assert from "node:assert/strict";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

/** Talks to the real server over stdio, the way Claude Code does. */

const ROOT = new URL("..", import.meta.url).pathname;
const workspace = mkdtempSync(join(tmpdir(), "oont-mcp-"));
cpSync(join(ROOT, "delivery"), workspace, { recursive: true });
rmSync(join(workspace, "state.json"), { force: true });

const client = new Client({ name: "test", version: "0.0.0" });

function textOf(result: Awaited<ReturnType<Client["callTool"]>>): string {
  const content = result.content as Array<{ type: string; text?: string }>;
  return content.map((c) => c.text ?? "").join("");
}

describe("MCP server over stdio", () => {
  before(async () => {
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: ["--experimental-strip-types", "--no-warnings", join(ROOT, "src/server.ts"), workspace],
      }),
    );
  });

  after(async () => {
    await client.close();
    rmSync(workspace, { recursive: true, force: true });
  });

  it("serves the read tools plus the exported action tools unchanged", async () => {
    const { tools } = await client.listTools();
    const exported = JSON.parse(readFileSync(join(workspace, "delivery-ops.tools.json"), "utf8")).tools;
    assert.deepEqual(tools.slice(0, 3).map((t) => t.name), ["list_objects", "get_object", "follow_link"]);
    assert.deepEqual(tools.slice(3), exported);
  });

  it("reads, then applies an action and persists it", async () => {
    const vehicles = textOf(await client.callTool({ name: "follow_link", arguments: { objectType: "Depot", id: "D-01", link: "vehicles" } }));
    assert.match(vehicles, /"vehicleId": "V-102"/);

    const rejected = await client.callTool({ name: "assignVehicle", arguments: { shipment: "S-5001", vehicle: "V-201" } });
    assert.equal(rejected.isError, true);

    const applied = await client.callTool({ name: "assignVehicle", arguments: { shipment: "S-5001", vehicle: "V-102" } });
    assert.equal(applied.isError, false, textOf(applied));
    assert.ok(existsSync(join(workspace, "state.json")));
    const state = JSON.parse(readFileSync(join(workspace, "state.json"), "utf8"));
    assert.equal(state.objects.Shipment["S-5001"].vehicle, "V-102");
    assert.deepEqual(state.log.map((e: { outcome: string }) => e.outcome), ["rejected", "applied"]);
  });

  it("reports unknown tools and objects as errors", async () => {
    assert.equal((await client.callTool({ name: "launchRocket", arguments: {} })).isError, true);
    const missing = await client.callTool({ name: "get_object", arguments: { objectType: "Vehicle", id: "V-999" } });
    assert.equal(missing.isError, true);
    assert.match(textOf(missing), /There is no Vehicle "V-999"/);
  });
});
