import * as path from "node:path";
import * as vscode from "vscode";

interface SampleDescriptor {
  file: string;
  label: string;
  detail: string;
}

const SAMPLES: SampleDescriptor[] = [
  { file: "neighborhood-garden.ttl", label: "Neighborhood Garden", detail: "Small class hierarchy and inverse relations" },
  { file: "tool-lending.ttl", label: "Tool Lending Circle", detail: "Relationship characteristics and instance data" },
  { file: "field-research.ttl", label: "Field Research Notes", detail: "Catalog records and typed literals" },
  { file: "community-services-skos.ttl", label: "Community Services", detail: "Concept scheme with SKOS" },
  { file: "harbor-market.ttl", label: "Harbor Market", detail: "Icons, colors, cardinality, and edge attributes" },
  { file: "city-mobility.ttl", label: "City Mobility Hub", detail: "Medium operational ontology" },
  { file: "community-event.rdf", label: "Community Event (RDF/XML)", detail: "View-only format + convert-to-Turtle demo" },
];

export async function createSampleOntology(extensionUri: vscode.Uri): Promise<void> {
  const pick = await vscode.window.showQuickPick(
    SAMPLES.map((s) => ({ label: vscode.l10n.t(s.label), description: s.file, detail: vscode.l10n.t(s.detail), sample: s })),
    { placeHolder: vscode.l10n.t("Choose a sample ontology to open") },
  );
  if (!pick) {
    return;
  }

  const source = vscode.Uri.joinPath(extensionUri, "samples", pick.sample.file);
  const bytes = await vscode.workspace.fs.readFile(source);
  const doc = await vscode.workspace.openTextDocument({
    language: path.extname(pick.sample.file) === ".rdf" ? "rdfxml" : "turtle",
    content: Buffer.from(bytes).toString("utf8"),
  });
  await vscode.window.showTextDocument(doc);
}
