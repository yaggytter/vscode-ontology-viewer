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
  { file: "product-compatibility.ttl", label: "Bicycle Parts Compatibility", detail: "OWL reasoning facts for grounded LLM answers (GraphRAG)" },
  { file: "glossary-skos.ttl", label: "Logistics Glossary (en/ja)", detail: "Bilingual SKOS glossary for query expansion and term normalization" },
  { file: "dataset-catalog.ttl", label: "Dataset Catalog with Provenance", detail: "DCAT + PROV-O for answers that cite their sources" },
  { file: "research-kg.ttl", label: "Research Knowledge Graph", detail: "schema.org entities linked across organizations" },
  { file: "delivery-ops.ttl", label: "Delivery Operations (OWL)", detail: "The OWL counterpart of the Object Ontology delivery sample" },
  { file: "cafe-orders.oont.yaml", label: "Corner Cafe Orders (Object Ontology)", detail: "Start here: object types, links and actions" },
  { file: "delivery-ops.oont.yaml", label: "Delivery Operations (Object Ontology)", detail: "Actions as AI-agent tools for delay handling" },
  { file: "plant-maintenance.oont.yaml", label: "Plant Maintenance (Object Ontology)", detail: "Follow links from a sensor alert to a work order" },
  { file: "support-desk.oont.yaml", label: "Support Desk (Object Ontology)", detail: "Validations as guard rails for agent-issued refunds" },
];

function languageFor(file: string): string {
  if (file.endsWith(".oont.yaml")) {
    return "yaml";
  }
  return path.extname(file) === ".rdf" ? "rdfxml" : "turtle";
}

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
    language: languageFor(pick.sample.file),
    content: Buffer.from(bytes).toString("utf8"),
  });
  await vscode.window.showTextDocument(doc);
}
