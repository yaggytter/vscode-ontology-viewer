import * as assert from "node:assert";
import * as path from "node:path";
import * as vscode from "vscode";
import { parseObjectOntology } from "../objectOntology/parse";
import { planAddObjectType, planAddProperty, planSetPropertyType } from "../objectOntology/edit/operations";

const EXTENSION_ID = "AkihiroYAGASAKI.ontology-viewer";
const SAMPLES_DIR = path.join(__dirname, "..", "..", "..", "samples");

async function waitFor<T>(probe: () => T | undefined, timeoutMs = 5000): Promise<T | undefined> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = probe();
    if (value !== undefined) {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return undefined;
}

async function applySplice(doc: vscode.TextDocument, plan: ReturnType<typeof planAddObjectType>): Promise<void> {
  assert.ok(plan.ok, plan.ok ? "" : plan.reason);
  if (!plan.ok) {
    return;
  }
  const edit = new vscode.WorkspaceEdit();
  edit.replace(doc.uri, new vscode.Range(doc.positionAt(plan.splice.start), doc.positionAt(plan.splice.end)), plan.splice.newText);
  assert.ok(await vscode.workspace.applyEdit(edit), "VS Code should accept the edit");
}

suite("Ontology Viewer — Object Ontology", () => {
  suiteSetup(async () => {
    await vscode.extensions.getExtension(EXTENSION_ID)?.activate();
  });

  test("registers the Object Ontology commands", async () => {
    const commands = await vscode.commands.getCommands(true);
    for (const id of [
      "ontologyViewer.exportAgentTools",
      "ontologyViewer.exportContextSummary",
      "ontologyViewer.exportObjectOntologyTurtle",
      "ontologyViewer.convertObjectOntologyToYaml",
    ]) {
      assert.ok(commands.includes(id), `expected command ${id} to be registered`);
    }
  });

  test("keeps the yaml language id for *.oont.yaml files", async () => {
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(SAMPLES_DIR, "cafe-orders.oont.yaml")));
    assert.strictEqual(doc.languageId, "yaml");
  });

  test("opens the diagram preview for a sample", async () => {
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(SAMPLES_DIR, "cafe-orders.oont.yaml")));
    await vscode.window.showTextDocument(doc);
    await vscode.commands.executeCommand("ontologyViewer.openPreview");
  });

  test("provides an outline of object types, links and actions", async () => {
    const uri = vscode.Uri.file(path.join(SAMPLES_DIR, "cafe-orders.oont.yaml"));
    await vscode.workspace.openTextDocument(uri);
    const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>("vscode.executeDocumentSymbolProvider", uri);
    const names = (symbols ?? []).map((s) => s.name);
    for (const expected of ["MenuItem", "orderItems", "placeOrder"]) {
      assert.ok(names.includes(expected), `outline should include ${expected}; got ${names.join(", ")}`);
    }
  });

  test("reports broken references in the Problems panel", async () => {
    const doc = await vscode.workspace.openTextDocument({
      language: "yaml",
      content: "objectOntology: 1\nobjectTypes:\n  A: { primaryKey: missing, properties: { id: string } }\n",
    });
    const diagnostics = await waitFor(() => {
      const found = vscode.languages.getDiagnostics(doc.uri).filter((d) => d.source === "Object Ontology");
      return found.length > 0 ? found : undefined;
    });
    assert.ok(diagnostics, "expected Object Ontology diagnostics for an untitled document");
    assert.match(diagnostics![0].message, /primaryKey "missing"/);
  });

  test("diagram edits round-trip through real WorkspaceEdits", async () => {
    const doc = await vscode.workspace.openTextDocument({ language: "yaml", content: "objectOntology: 1\nname: Fleet\n" });
    await applySplice(doc, planAddObjectType(doc.getText(), "Truck", "A delivery truck."));
    const ns = parseObjectOntology(doc.getText()).ontology!.namespace;
    await applySplice(doc, planAddProperty(doc.getText(), `${ns}Truck`, "capacity", "integer"));
    await applySplice(doc, planSetPropertyType(doc.getText(), `${ns}Truck.capacity`, "double"));
    const parsed = parseObjectOntology(doc.getText());
    assert.deepStrictEqual(parsed.diagnostics, []);
    const truck = parsed.ontology!.objectTypes.find((t) => t.apiName === "Truck");
    assert.strictEqual(truck?.description, "A delivery truck.");
    assert.strictEqual(truck?.properties.find((p) => p.apiName === "capacity")?.type, "double");
  });

  test("exports agent tools as an untitled JSON document", async () => {
    const uri = vscode.Uri.file(path.join(SAMPLES_DIR, "cafe-orders.oont.yaml"));
    await vscode.commands.executeCommand("ontologyViewer.exportAgentTools", uri);
    const exported = await waitFor(() =>
      vscode.workspace.textDocuments.find((d) => d.isUntitled && d.languageId === "json" && d.getText().includes('"tools"')),
    );
    assert.ok(exported, "expected an untitled JSON document with tool definitions");
    const tools = JSON.parse(exported!.getText()) as { tools: { name: string }[] };
    assert.deepStrictEqual(
      tools.tools.map((t) => t.name),
      ["placeOrder", "markServed", "restockIngredient"],
    );
  });
});
