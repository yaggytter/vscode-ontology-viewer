import { buildPositionIndex } from "../rdf/positionIndex";
import type { PropertyType } from "../rdf/schemaModel";
import { OWL_DATATYPE_PROPERTY, RDFS_DOMAIN, RDFS_LABEL, RDFS_RANGE, RDF_TYPE, XSD } from "../rdf/vocabulary";
import { planNewTopLevelStatement, type StatementLine } from "./addStatement";
import { mintIri } from "./mintIri";
import { escapeTurtleShortString, splice, type TextEdit } from "./textEdit";
import { verifyProposedText } from "./verify";

/** Inverse of schemaModel.ts's XSD_LOCAL_TO_PROPERTY_TYPE — "enum"/"other" have no single xsd equivalent, so they fall back to xsd:string. */
const PROPERTY_TYPE_TO_XSD_LOCAL: Record<PropertyType, string> = {
  string: "string",
  integer: "integer",
  decimal: "decimal",
  double: "double",
  date: "date",
  datetime: "dateTime",
  boolean: "boolean",
  enum: "string",
  other: "string",
};

export function xsdIriFor(propertyType: PropertyType): string {
  return `${XSD}${PROPERTY_TYPE_TO_XSD_LOCAL[propertyType]}`;
}

export interface AddPropertyPlan {
  ok: boolean;
  reason?: string;
  newIri?: string;
  edit?: TextEdit;
  proposedText?: string;
}

/**
 * Plans a brand-new `owl:DatatypeProperty` statement (`<newIri> a
 * owl:DatatypeProperty ; rdfs:label "..." ; rdfs:domain <entityIri> ;
 * rdfs:range <xsd:...> .`) appended at the end of the document.
 */
export function planAddProperty(
  documentText: string,
  baseIRI: string,
  existingIris: string[],
  entityIri: string,
  name: string,
  propertyType: PropertyType,
): AddPropertyPlan {
  const index = buildPositionIndex(documentText, baseIRI);
  if (index.degraded) {
    return { ok: false, reason: `document position index is unavailable: ${index.degradedReason}` };
  }
  const trimmedName = name.trim();
  if (!trimmedName) {
    return { ok: false, reason: "a property needs a name" };
  }
  if (!existingIris.includes(entityIri)) {
    return { ok: false, reason: "the owning entity must already exist in the document" };
  }

  const newIri = mintIri(existingIris, baseIRI, trimmedName, "camelCase");
  const lines: StatementLine[] = [
    { predicateIri: RDF_TYPE, objectTurtle: `<${OWL_DATATYPE_PROPERTY}>` },
    { predicateIri: RDFS_LABEL, objectTurtle: `"${escapeTurtleShortString(trimmedName)}"` },
    { predicateIri: RDFS_DOMAIN, objectTurtle: `<${entityIri}>` },
    { predicateIri: RDFS_RANGE, objectTurtle: `<${xsdIriFor(propertyType)}>` },
  ];

  const edit = planNewTopLevelStatement(documentText, newIri, lines);
  return { ok: true, newIri, edit, proposedText: splice(documentText, edit.span, edit.newText) };
}

export async function planAndVerifyAddProperty(
  documentText: string,
  baseIRI: string,
  existingIris: string[],
  entityIri: string,
  name: string,
  propertyType: PropertyType,
): Promise<AddPropertyPlan & { verified: boolean; verifyReason?: string }> {
  const plan = planAddProperty(documentText, baseIRI, existingIris, entityIri, name, propertyType);
  if (!plan.ok || !plan.proposedText || !plan.newIri) {
    return { ...plan, verified: false, verifyReason: plan.reason };
  }
  const result = await verifyProposedText(plan.proposedText, baseIRI, (quads) => {
    const hasType = quads.some(
      (q) => q.subject.value === plan.newIri && q.predicate.value === RDF_TYPE && q.object.value === OWL_DATATYPE_PROPERTY,
    );
    if (!hasType) {
      return { ok: false, reason: "resulting document does not type the new predicate as owl:DatatypeProperty" };
    }
    const hasDomain = quads.some((q) => q.subject.value === plan.newIri && q.predicate.value === RDFS_DOMAIN && q.object.value === entityIri);
    return hasDomain ? { ok: true } : { ok: false, reason: "resulting document does not contain the expected rdfs:domain triple" };
  });
  return { ...plan, verified: result.ok, verifyReason: result.reason };
}
