import * as assert from "node:assert";
import * as path from "node:path";
import * as vscode from "vscode";
import { parseOntology } from "../rdf/parse";
import { buildSchemaModel } from "../rdf/schemaModel";
import { planAndVerifyAddClass } from "../edit/addClass";
import { planAndVerifyAddRelation } from "../edit/addRelation";
import { planAndVerifyAddProperty } from "../edit/addProperty";
import { planAndVerifySetPropertyType } from "../edit/setPropertyType";
import { planAndVerifyDeleteStatement } from "../edit/deleteStatement";

const EXTENSION_ID = "AkihiroYAGASAKI.ontology-viewer";
const SAMPLES_DIR = path.join(__dirname, "..", "..", "..", "samples");

async function waitForExtension(id: string, timeoutMs = 5000): Promise<vscode.Extension<unknown> | undefined> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const extension = vscode.extensions.getExtension(id);
    if (extension) {
      return extension;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return undefined;
}

suite("Ontology Viewer — extension host smoke tests", () => {
  test("activates", async () => {
    const ext = await waitForExtension(EXTENSION_ID);
    assert.ok(
      ext,
      `extension ${EXTENSION_ID} should be discoverable; available: ${vscode.extensions.all.map((item) => item.id).join(", ")}`,
    );
    await ext!.activate();
    assert.ok(ext!.isActive, "extension should be active after activate()");
  });

  test("registers all contributed commands", async () => {
    const commands = await vscode.commands.getCommands(true);
    for (const id of [
      "ontologyViewer.openPreview",
      "ontologyViewer.convertToTurtle",
      "ontologyViewer.exportLayout",
      "ontologyViewer.newSample",
    ]) {
      assert.ok(commands.includes(id), `expected command ${id} to be registered`);
    }
  });

  test("assigns the turtle language id to .ttl files", async () => {
    const uri = vscode.Uri.file(path.join(SAMPLES_DIR, "neighborhood-garden.ttl"));
    const doc = await vscode.workspace.openTextDocument(uri);
    assert.strictEqual(doc.languageId, "turtle");
  });

  test("provides a non-empty document outline for a sample ontology", async () => {
    const uri = vscode.Uri.file(path.join(SAMPLES_DIR, "neighborhood-garden.ttl"));
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc);
    const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
      "vscode.executeDocumentSymbolProvider",
      uri,
    );
    assert.ok(symbols && symbols.length > 0, "expected at least one outline group");
  });

  test("opening the diagram preview does not throw", async () => {
    const uri = vscode.Uri.file(path.join(SAMPLES_DIR, "tool-lending.ttl"));
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc);
    await vscode.commands.executeCommand("ontologyViewer.openPreview");
  });

  // Real end-to-end coverage of the Phase 5 write-back path: everything
  // above `vscode.workspace.applyEdit` is covered by vitest (src/edit/*.test.ts),
  // but that boundary itself — a real vscode.TextDocument, a real
  // WorkspaceEdit, a real re-read of the document afterwards — has no vitest
  // equivalent (there is no `vscode` module outside the extension host).
  // Runs against an untitled scratch document so the committed samples are
  // never touched.
  test("planAndVerifyAddClass's edit round-trips through a real WorkspaceEdit", async () => {
    const doc = await vscode.workspace.openTextDocument({
      language: "turtle",
      content: [
        "@prefix : <http://example.org/onto#> .",
        "@prefix owl: <http://www.w3.org/2002/07/owl#> .",
        "@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .",
        "",
        ':Pizza a owl:Class ; rdfs:label "Pizza" .',
        "",
      ].join("\n"),
    });
    const baseIRI = doc.uri.toString();
    const before = await parseOntology(doc.getText(), "turtle", baseIRI);
    const existingIris = buildSchemaModel(before.quads).entities.map((e) => e.id);

    const plan = await planAndVerifyAddClass(doc.getText(), baseIRI, existingIris, "Topping");
    assert.ok(plan.verified, `plan should verify: ${plan.verifyReason ?? plan.reason}`);
    assert.ok(plan.edit && plan.newIri);

    const workspaceEdit = new vscode.WorkspaceEdit();
    const range = new vscode.Range(
      plan.edit!.span.start.line,
      plan.edit!.span.start.character,
      plan.edit!.span.end.line,
      plan.edit!.span.end.character,
    );
    workspaceEdit.replace(doc.uri, range, plan.edit!.newText);
    const applied = await vscode.workspace.applyEdit(workspaceEdit);
    assert.ok(applied, "VS Code should accept the edit");

    const after = await parseOntology(doc.getText(), "turtle", baseIRI);
    assert.strictEqual(after.errors.length, 0, "document must still parse cleanly after the edit");
    const schema = buildSchemaModel(after.quads);
    const newEntity = schema.entities.find((e) => e.id === plan.newIri);
    assert.ok(newEntity, "the newly added class should appear in the reparsed schema model");
    assert.strictEqual(newEntity!.name, "Topping");

    // The original class must be untouched — this is an append-only edit.
    assert.ok(schema.entities.some((e) => e.name === "Pizza"));
  });

  test("planAndVerifyAddRelation's edit round-trips through a real WorkspaceEdit", async () => {
    const doc = await vscode.workspace.openTextDocument({
      language: "turtle",
      content: [
        "@prefix : <http://example.org/onto#> .",
        "@prefix owl: <http://www.w3.org/2002/07/owl#> .",
        "@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .",
        "",
        ':Pizza a owl:Class ; rdfs:label "Pizza" .',
        ':Topping a owl:Class ; rdfs:label "Topping" .',
        "",
      ].join("\n"),
    });
    const baseIRI = doc.uri.toString();
    const before = await parseOntology(doc.getText(), "turtle", baseIRI);
    const schemaBefore = buildSchemaModel(before.quads);
    const pizza = schemaBefore.entities.find((e) => e.name === "Pizza")!;
    const topping = schemaBefore.entities.find((e) => e.name === "Topping")!;

    const plan = await planAndVerifyAddRelation(
      doc.getText(),
      baseIRI,
      schemaBefore.entities.map((e) => e.id),
      pizza.id,
      topping.id,
      "has topping",
    );
    assert.ok(plan.verified, `plan should verify: ${plan.verifyReason ?? plan.reason}`);

    const workspaceEdit = new vscode.WorkspaceEdit();
    const range = new vscode.Range(
      plan.edit!.span.start.line,
      plan.edit!.span.start.character,
      plan.edit!.span.end.line,
      plan.edit!.span.end.character,
    );
    workspaceEdit.replace(doc.uri, range, plan.edit!.newText);
    assert.ok(await vscode.workspace.applyEdit(workspaceEdit));

    const after = await parseOntology(doc.getText(), "turtle", baseIRI);
    assert.strictEqual(after.errors.length, 0);
    const schemaAfter = buildSchemaModel(after.quads);
    const relation = schemaAfter.relations.find((r) => r.iri === plan.newIri);
    assert.ok(relation, "the newly added relation should appear in the reparsed schema model");
    assert.strictEqual(relation!.source, pizza.id);
    assert.strictEqual(relation!.target, topping.id);
  });

  test("planAndVerifyAddProperty + planAndVerifySetPropertyType round-trip through real WorkspaceEdits", async () => {
    const doc = await vscode.workspace.openTextDocument({
      language: "turtle",
      content: [
        "@prefix : <http://example.org/onto#> .",
        "@prefix owl: <http://www.w3.org/2002/07/owl#> .",
        "@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .",
        "",
        ':Pizza a owl:Class ; rdfs:label "Pizza" .',
        "",
      ].join("\n"),
    });
    const baseIRI = doc.uri.toString();

    // Add a property.
    const before = await parseOntology(doc.getText(), "turtle", baseIRI);
    const pizzaId = buildSchemaModel(before.quads).entities[0].id;
    const addPlan = await planAndVerifyAddProperty(doc.getText(), baseIRI, [pizzaId], pizzaId, "calories", "integer");
    assert.ok(addPlan.verified, `add-property plan should verify: ${addPlan.verifyReason ?? addPlan.reason}`);

    let workspaceEdit = new vscode.WorkspaceEdit();
    let range = new vscode.Range(
      addPlan.edit!.span.start.line,
      addPlan.edit!.span.start.character,
      addPlan.edit!.span.end.line,
      addPlan.edit!.span.end.character,
    );
    workspaceEdit.replace(doc.uri, range, addPlan.edit!.newText);
    assert.ok(await vscode.workspace.applyEdit(workspaceEdit));

    const afterAdd = await parseOntology(doc.getText(), "turtle", baseIRI);
    assert.strictEqual(afterAdd.errors.length, 0);
    let schema = buildSchemaModel(afterAdd.quads);
    let pizza = schema.entities.find((e) => e.id === pizzaId)!;
    assert.deepStrictEqual(
      pizza.properties.map((p) => ({ name: p.name, type: p.type })),
      [{ name: "calories", type: "integer" }],
    );

    // Change its type.
    const propertyIri = addPlan.newIri!;
    const typePlan = await planAndVerifySetPropertyType(doc.getText(), baseIRI, propertyIri, "double");
    assert.ok(typePlan.verified, `set-property-type plan should verify: ${typePlan.verifyReason ?? typePlan.reason}`);

    workspaceEdit = new vscode.WorkspaceEdit();
    range = new vscode.Range(
      typePlan.edit!.span.start.line,
      typePlan.edit!.span.start.character,
      typePlan.edit!.span.end.line,
      typePlan.edit!.span.end.character,
    );
    workspaceEdit.replace(doc.uri, range, typePlan.edit!.newText);
    assert.ok(await vscode.workspace.applyEdit(workspaceEdit));

    const afterTypeChange = await parseOntology(doc.getText(), "turtle", baseIRI);
    assert.strictEqual(afterTypeChange.errors.length, 0);
    schema = buildSchemaModel(afterTypeChange.quads);
    pizza = schema.entities.find((e) => e.id === pizzaId)!;
    assert.deepStrictEqual(
      pizza.properties.map((p) => ({ name: p.name, type: p.type })),
      [{ name: "calories", type: "double" }],
    );
  });

  test("planAndVerifyDeleteStatement's edit round-trips through a real WorkspaceEdit", async () => {
    const doc = await vscode.workspace.openTextDocument({
      language: "turtle",
      content: [
        "@prefix : <http://example.org/onto#> .",
        "@prefix owl: <http://www.w3.org/2002/07/owl#> .",
        "@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .",
        "@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .",
        "",
        ':Pizza a owl:Class ; rdfs:label "Pizza" .',
        ":calories a owl:DatatypeProperty ;",
        '  rdfs:label "calories" ;',
        "  rdfs:domain :Pizza ;",
        "  rdfs:range xsd:integer .",
        "",
      ].join("\n"),
    });
    const baseIRI = doc.uri.toString();

    const plan = await planAndVerifyDeleteStatement(doc.getText(), baseIRI, "http://example.org/onto#calories");
    assert.ok(plan.verified, `delete plan should verify: ${plan.verifyReason ?? plan.reason}`);

    const workspaceEdit = new vscode.WorkspaceEdit();
    const range = new vscode.Range(
      plan.edit!.span.start.line,
      plan.edit!.span.start.character,
      plan.edit!.span.end.line,
      plan.edit!.span.end.character,
    );
    workspaceEdit.replace(doc.uri, range, plan.edit!.newText);
    assert.ok(await vscode.workspace.applyEdit(workspaceEdit));

    const after = await parseOntology(doc.getText(), "turtle", baseIRI);
    assert.strictEqual(after.errors.length, 0, "document must still parse cleanly after the delete");
    const schema = buildSchemaModel(after.quads);
    const pizza = schema.entities.find((e) => e.id === "http://example.org/onto#Pizza");
    assert.ok(pizza, "Pizza itself must survive deleting one of its properties");
    assert.deepStrictEqual(pizza!.properties, []);
    assert.ok(!doc.getText().includes("calories"), "no trace of the deleted property's declaration should remain");
  });
});
