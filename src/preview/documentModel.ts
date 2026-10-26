import type { Quad } from "n3";
import * as vscode from "vscode";
import { parseOntology, type OntologyFormat } from "../rdf/parse";
import { buildGraphModel, type OntologyGraph } from "../rdf/graphModel";
import { buildSchemaModel, type SchemaModel } from "../rdf/schemaModel";
import { computeEditableSubjects } from "../edit/editLiteral";
import { computeCommentEditableSubjects } from "../edit/editComment";
import { isEditableLanguage } from "../util/languages";
import type { ObjectOntologySyntax } from "../objectOntology/detect";
import { detectDocumentObjectOntology } from "../objectOntology/detectDocument";
import { parseObjectOntology, type ParsedObjectOntology } from "../objectOntology/parse";
import { objectOntologyToSchemaModel } from "../objectOntology/toSchemaModel";
import { objectOntologyToQuads } from "../objectOntology/toQuads";
import { buildActionViews, type ActionView } from "../objectOntology/actionView";
import { resolveFormat } from "./format";

/**
 * The one place that decides how a document is read. The preview, the
 * SPARQL handler and the edit dispatch all ask here, so adding a document
 * kind cannot leave one of them reading the file the old way.
 */
export type DocumentKind =
  | { kind: "rdf"; format: OntologyFormat }
  | { kind: "objectOntology"; syntax: ObjectOntologySyntax };

export function resolveDocumentKind(document: vscode.TextDocument): DocumentKind | undefined {
  const syntax = detectDocumentObjectOntology(document);
  if (syntax) {
    return { kind: "objectOntology", syntax };
  }
  const format = resolveFormat(document);
  return format ? { kind: "rdf", format } : undefined;
}

export interface LoadedDocumentModel {
  kind: DocumentKind;
  graph: OntologyGraph;
  schema: SchemaModel;
  editableNodeIds: string[];
  commentEditableNodeIds: string[];
  isEditableDocument: boolean;
  parseErrorMessage?: string;
  actions: ActionView[];
}

const EMPTY_SCHEMA: SchemaModel = { entities: [], relations: [], unattachedProperties: [], isEmpty: true };

async function loadRdf(document: vscode.TextDocument, kind: { kind: "rdf"; format: OntologyFormat }): Promise<LoadedDocumentModel> {
  const isEditableDocument = isEditableLanguage(document.languageId);
  const text = document.getText();
  const baseIRI = document.uri.toString();
  const parsed = await parseOntology(text, kind.format, baseIRI);
  // Language-tagged labels and comments follow the VS Code display language.
  const graph = buildGraphModel(parsed.quads, vscode.env.language);
  const schema = buildSchemaModel(parsed.quads, vscode.env.language);
  const editableNodeIds = isEditableDocument
    ? [...computeEditableSubjects(text, baseIRI, graph.nodes.map((n) => n.id))]
    : [];
  const commentEditableNodeIds = isEditableDocument
    ? [...computeCommentEditableSubjects(text, baseIRI, graph.nodes.map((n) => n.id))]
    : [];
  return {
    kind,
    graph,
    schema,
    editableNodeIds,
    commentEditableNodeIds,
    isEditableDocument,
    parseErrorMessage: parsed.errors[0]?.message,
    actions: [],
  };
}

/** YAML syntax errors block a clean render; semantic problems are left to the Problems panel. */
export function objectOntologySyntaxError(parsed: ParsedObjectOntology): string | undefined {
  return parsed.document.errors[0]?.message.split("\n")[0] ?? (parsed.ontology ? undefined : parsed.diagnostics[0]?.message);
}

function loadObjectOntology(document: vscode.TextDocument, kind: { kind: "objectOntology"; syntax: ObjectOntologySyntax }): LoadedDocumentModel {
  const parsed = parseObjectOntology(document.getText());
  const isEditableDocument = kind.syntax === "yaml";
  if (!parsed.ontology) {
    return {
      kind,
      graph: { nodes: [], edges: [] },
      schema: EMPTY_SCHEMA,
      editableNodeIds: [],
      commentEditableNodeIds: [],
      isEditableDocument,
      parseErrorMessage: objectOntologySyntaxError(parsed),
      actions: [],
    };
  }
  const schema = objectOntologyToSchemaModel(parsed.ontology);
  const editable = isEditableDocument ? schema.entities.map((e) => e.id) : [];
  return {
    kind,
    graph: buildGraphModel(objectOntologyToQuads(parsed.ontology)),
    schema,
    editableNodeIds: editable,
    commentEditableNodeIds: editable,
    isEditableDocument,
    parseErrorMessage: objectOntologySyntaxError(parsed),
    actions: buildActionViews(parsed.ontology),
  };
}

export async function loadDocumentModel(document: vscode.TextDocument): Promise<LoadedDocumentModel | undefined> {
  const kind = resolveDocumentKind(document);
  if (!kind) {
    return undefined;
  }
  return kind.kind === "rdf" ? loadRdf(document, kind) : loadObjectOntology(document, kind);
}

/** The quads a SPARQL query runs against — the parsed RDF, or an Object Ontology's projection. */
export async function documentQuads(document: vscode.TextDocument): Promise<Quad[] | undefined> {
  const kind = resolveDocumentKind(document);
  if (!kind) {
    return undefined;
  }
  if (kind.kind === "rdf") {
    return (await parseOntology(document.getText(), kind.format, document.uri.toString())).quads;
  }
  const { ontology } = parseObjectOntology(document.getText());
  return ontology ? objectOntologyToQuads(ontology) : [];
}
