import { DataFactory, type Quad } from "n3";
import {
  OWL_CLASS,
  OWL_DATATYPE_PROPERTY,
  OWL_FUNCTIONAL_PROPERTY,
  OWL_INVERSE_OF,
  OWL_OBJECT_PROPERTY,
  OWL_ONTOLOGY,
  RDF_TYPE,
  RDFS_COMMENT,
  RDFS_DOMAIN,
  RDFS_LABEL,
  RDFS_RANGE,
  RDFS_SUBCLASS_OF,
  XSD,
} from "../rdf/vocabulary";
import type { ObjectOntology, OoLinkSide, OoLinkType, OoObjectType, OoProperty } from "./model";
import { actionAffectedTypes } from "./model";
import { actionTypeIri, linkTypeIri, memberIri, objectIri, OONT, parameterIri, ruleIri, typeIri } from "./iris";
import { XSD_DATATYPE } from "./toSchemaModel";

const { namedNode, literal, quad } = DataFactory;

/** Prefixes for Turtle export and the SPARQL examples. */
export function objectOntologyPrefixes(ontology: ObjectOntology): Record<string, string> {
  return {
    "": ontology.namespace,
    oont: OONT,
    owl: "http://www.w3.org/2002/07/owl#",
    rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
    rdfs: "http://www.w3.org/2000/01/rdf-schema#",
    xsd: XSD,
  };
}

class QuadSink {
  readonly quads: Quad[] = [];

  iri(subject: string, predicate: string, object: string): void {
    this.quads.push(quad(namedNode(subject), namedNode(predicate), namedNode(object)));
  }

  text(subject: string, predicate: string, value: string | undefined): void {
    if (value !== undefined && value !== "") {
      this.quads.push(quad(namedNode(subject), namedNode(predicate), literal(value)));
    }
  }

  typed(subject: string, predicate: string, value: string, datatype: string): void {
    this.quads.push(quad(namedNode(subject), namedNode(predicate), literal(value, namedNode(datatype))));
  }
}

function emitProperty(sink: QuadSink, ns: string, owner: string, property: OoProperty, primaryKey?: string): void {
  const iri = memberIri(ns, owner, property.apiName);
  sink.iri(iri, RDF_TYPE, OWL_DATATYPE_PROPERTY);
  sink.iri(iri, RDF_TYPE, `${OONT}Property`);
  sink.iri(iri, RDFS_DOMAIN, typeIri(ns, owner));
  sink.iri(iri, RDFS_RANGE, XSD_DATATYPE[property.type]);
  sink.text(iri, RDFS_LABEL, property.displayName ?? property.apiName);
  sink.text(iri, RDFS_COMMENT, property.description);
  sink.text(iri, `${OONT}apiName`, property.apiName);
  sink.text(iri, `${OONT}dataType`, property.isArray ? `${property.type}[]` : property.type);
  sink.text(iri, `${OONT}unit`, property.unit);
  for (const value of property.enumValues ?? []) {
    sink.text(iri, `${OONT}enumValue`, value);
  }
  if (property.required || property.apiName === primaryKey) {
    sink.typed(iri, `${OONT}required`, "true", `${XSD}boolean`);
  }
}

function emitObjectType(sink: QuadSink, ns: string, type: OoObjectType): void {
  const iri = typeIri(ns, type.apiName);
  sink.iri(iri, RDF_TYPE, OWL_CLASS);
  sink.iri(iri, RDF_TYPE, `${OONT}ObjectType`);
  sink.text(iri, RDFS_LABEL, type.displayName ?? type.apiName);
  sink.text(iri, RDFS_COMMENT, type.description);
  sink.text(iri, `${OONT}apiName`, type.apiName);
  sink.text(iri, `${OONT}pluralDisplayName`, type.pluralDisplayName);
  if (type.primaryKey) {
    sink.iri(iri, `${OONT}primaryKey`, memberIri(ns, type.apiName, type.primaryKey));
  }
  if (type.titleProperty) {
    sink.iri(iri, `${OONT}titleProperty`, memberIri(ns, type.apiName, type.titleProperty));
  }
  for (const iface of type.implements) {
    sink.iri(iri, `${OONT}implements`, typeIri(ns, iface));
    // Lets plain RDFS-aware queries ("every Trackable") see implementers too.
    sink.iri(iri, RDFS_SUBCLASS_OF, typeIri(ns, iface));
  }
  for (const property of type.properties) {
    emitProperty(sink, ns, type.apiName, property, type.primaryKey);
  }
}

function emitLinkSide(sink: QuadSink, ns: string, link: OoLinkType, side: OoLinkSide, other: OoLinkSide): void {
  const iri = memberIri(ns, side.objectType, side.name);
  sink.iri(iri, RDF_TYPE, OWL_OBJECT_PROPERTY);
  sink.iri(iri, RDF_TYPE, `${OONT}LinkSide`);
  if (side.cardinality === "one") {
    sink.iri(iri, RDF_TYPE, OWL_FUNCTIONAL_PROPERTY);
  }
  sink.iri(iri, RDFS_DOMAIN, typeIri(ns, side.objectType));
  sink.iri(iri, RDFS_RANGE, typeIri(ns, other.objectType));
  sink.iri(iri, OWL_INVERSE_OF, memberIri(ns, other.objectType, other.name));
  sink.iri(iri, `${OONT}linkType`, linkTypeIri(ns, link.apiName));
  sink.text(iri, RDFS_LABEL, side.displayName ?? side.name);
  sink.text(iri, `${OONT}apiName`, side.name);
  sink.text(iri, `${OONT}cardinality`, side.cardinality);
}

function emitLinkType(sink: QuadSink, ns: string, link: OoLinkType): void {
  const iri = linkTypeIri(ns, link.apiName);
  sink.iri(iri, RDF_TYPE, `${OONT}LinkType`);
  sink.text(iri, RDFS_LABEL, link.displayName ?? link.apiName);
  sink.text(iri, RDFS_COMMENT, link.description);
  sink.text(iri, `${OONT}apiName`, link.apiName);
  sink.iri(iri, `${OONT}fromType`, typeIri(ns, link.from.objectType));
  sink.iri(iri, `${OONT}toType`, typeIri(ns, link.to.objectType));
  sink.iri(iri, `${OONT}fromSide`, memberIri(ns, link.from.objectType, link.from.name));
  sink.iri(iri, `${OONT}toSide`, memberIri(ns, link.to.objectType, link.to.name));
  emitLinkSide(sink, ns, link, link.from, link.to);
  emitLinkSide(sink, ns, link, link.to, link.from);
}

function emitActions(sink: QuadSink, ontology: ObjectOntology): void {
  const ns = ontology.namespace;
  for (const action of ontology.actionTypes) {
    const iri = actionTypeIri(ns, action.apiName);
    sink.iri(iri, RDF_TYPE, `${OONT}ActionType`);
    sink.text(iri, RDFS_LABEL, action.displayName ?? action.apiName);
    sink.text(iri, RDFS_COMMENT, action.description);
    sink.text(iri, `${OONT}apiName`, action.apiName);
    for (const typeName of actionAffectedTypes(ontology, action)) {
      sink.iri(iri, `${OONT}affects`, typeIri(ns, typeName));
    }
    for (const parameter of action.parameters) {
      const p = parameterIri(ns, action.apiName, parameter.id);
      sink.iri(iri, `${OONT}parameter`, p);
      sink.iri(p, RDF_TYPE, `${OONT}Parameter`);
      sink.text(p, RDFS_LABEL, parameter.displayName ?? parameter.id);
      sink.text(p, RDFS_COMMENT, parameter.description);
      sink.text(p, `${OONT}apiName`, parameter.id);
      sink.text(p, `${OONT}dataType`, parameter.isArray ? `${parameter.type}[]` : parameter.type);
      sink.typed(p, `${OONT}required`, String(parameter.required), `${XSD}boolean`);
      if (parameter.objectType) {
        sink.iri(p, `${OONT}objectType`, typeIri(ns, parameter.objectType));
      }
    }
    action.rules.forEach((rule, index) => {
      const r = ruleIri(ns, action.apiName, index);
      sink.iri(iri, `${OONT}rule`, r);
      sink.iri(r, RDF_TYPE, `${OONT}Rule`);
      sink.text(r, `${OONT}op`, rule.op);
      if (rule.objectType) {
        sink.iri(r, `${OONT}objectType`, typeIri(ns, rule.objectType));
      }
      if (rule.linkType) {
        sink.iri(r, `${OONT}linkType`, linkTypeIri(ns, rule.linkType));
      }
      for (const property of Object.keys(rule.set)) {
        if (rule.objectType) {
          sink.iri(r, `${OONT}sets`, memberIri(ns, rule.objectType, property));
        }
      }
    });
    for (const validation of action.validations) {
      sink.text(iri, `${OONT}validation`, validation.description);
    }
    for (const effect of action.sideEffects) {
      sink.text(iri, `${OONT}sideEffect`, effect);
    }
  }
}

function literalFor(value: unknown, property: OoProperty | undefined): { value: string; datatype: string } | undefined {
  if (value === null || value === undefined || typeof value === "object") {
    return undefined;
  }
  const datatype = property ? XSD_DATATYPE[property.type] : `${XSD}string`;
  if (value instanceof Date) {
    return { value: value.toISOString(), datatype };
  }
  return { value: String(value), datatype };
}

/** Example objects become individuals; link fields and foreign keys become links in both directions. */
function emitObjects(sink: QuadSink, ontology: ObjectOntology): void {
  const ns = ontology.namespace;
  const types = new Map(ontology.objectTypes.map((t) => [t.apiName, t]));
  const sides = new Map<string, { link: OoLinkType; side: OoLinkSide; other: OoLinkSide }>();
  for (const link of ontology.linkTypes) {
    sides.set(`${link.from.objectType}.${link.from.name}`, { link, side: link.from, other: link.to });
    sides.set(`${link.to.objectType}.${link.to.name}`, { link, side: link.to, other: link.from });
  }
  const linked = new Set<string>();
  const addLink = (fromIri: string, side: OoLinkSide, toIri: string, other: OoLinkSide): void => {
    const key = `${fromIri} ${side.objectType}.${side.name} ${toIri}`;
    if (linked.has(key)) {
      return;
    }
    linked.add(key);
    sink.iri(fromIri, memberIri(ns, side.objectType, side.name), toIri);
    sink.iri(toIri, memberIri(ns, other.objectType, other.name), fromIri);
    linked.add(`${toIri} ${other.objectType}.${other.name} ${fromIri}`);
  };

  const keyOf = (typeName: string, record: { values: ReadonlyMap<string, unknown> }): string | undefined => {
    const type = types.get(typeName);
    const key = type ? record.values.get(type.primaryKey) : undefined;
    return key === undefined || key === null || key === "" ? undefined : String(key);
  };

  for (const record of ontology.objects) {
    const type = types.get(record.objectType);
    const key = keyOf(record.objectType, record);
    if (!type || key === undefined) {
      continue;
    }
    const iri = objectIri(ns, type.apiName, key);
    sink.iri(iri, RDF_TYPE, typeIri(ns, type.apiName));
    const title = type.titleProperty ? record.values.get(type.titleProperty) : undefined;
    sink.text(iri, RDFS_LABEL, title === undefined || title === null ? key : String(title));
    for (const [field, value] of record.values) {
      const property = type.properties.find((p) => p.apiName === field);
      const side = sides.get(`${type.apiName}.${field}`);
      if (side) {
        const targets = Array.isArray(value) ? value : [value];
        for (const target of targets) {
          if (target !== null && target !== undefined && typeof target !== "object") {
            addLink(iri, side.side, objectIri(ns, side.other.objectType, String(target)), side.other);
          }
        }
        continue;
      }
      if (!property) {
        continue;
      }
      for (const item of Array.isArray(value) ? value : [value]) {
        const lit = literalFor(item, property);
        if (lit) {
          sink.typed(iri, memberIri(ns, type.apiName, field), lit.value, lit.datatype);
        }
      }
    }
  }

  for (const link of ontology.linkTypes) {
    if (!link.foreignKey) {
      continue;
    }
    const holderSide = link.foreignKey.objectType === link.from.objectType ? link.from : link.to;
    const otherSide = holderSide === link.from ? link.to : link.from;
    for (const record of ontology.objects) {
      if (record.objectType !== holderSide.objectType) {
        continue;
      }
      const key = keyOf(record.objectType, record);
      const target = record.values.get(link.foreignKey.property);
      if (key === undefined || target === undefined || target === null || typeof target === "object") {
        continue;
      }
      addLink(
        objectIri(ns, holderSide.objectType, key),
        holderSide,
        objectIri(ns, otherSide.objectType, String(target)),
        otherSide,
      );
    }
  }
}

/**
 * The RDF projection of an Object Ontology, in two layers at once: plain
 * OWL/RDFS terms (so generic SPARQL and the Turtle export read naturally to
 * anyone who knows OWL) plus the `oont:` vocabulary for the concepts OWL has
 * no word for — link types, action types, parameters, rules.
 */
export function objectOntologyToQuads(ontology: ObjectOntology): Quad[] {
  const sink = new QuadSink();
  const ns = ontology.namespace;
  sink.iri(ns, RDF_TYPE, OWL_ONTOLOGY);
  sink.text(ns, RDFS_LABEL, ontology.name);
  sink.text(ns, RDFS_COMMENT, ontology.description);
  for (const iface of ontology.interfaces) {
    const iri = typeIri(ns, iface.apiName);
    sink.iri(iri, RDF_TYPE, OWL_CLASS);
    sink.iri(iri, RDF_TYPE, `${OONT}Interface`);
    sink.text(iri, RDFS_LABEL, iface.displayName ?? iface.apiName);
    sink.text(iri, RDFS_COMMENT, iface.description);
    sink.text(iri, `${OONT}apiName`, iface.apiName);
    for (const parent of iface.extends) {
      sink.iri(iri, `${OONT}extends`, typeIri(ns, parent));
      sink.iri(iri, RDFS_SUBCLASS_OF, typeIri(ns, parent));
    }
    for (const property of iface.properties) {
      emitProperty(sink, ns, iface.apiName, property);
    }
  }
  for (const type of ontology.objectTypes) {
    emitObjectType(sink, ns, type);
  }
  for (const link of ontology.linkTypes) {
    emitLinkType(sink, ns, link);
  }
  emitActions(sink, ontology);
  emitObjects(sink, ontology);
  return sink.quads;
}
