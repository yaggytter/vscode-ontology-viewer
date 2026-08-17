import { clear, h } from "../dom";
import type { PropertyType, SchemaEntity, SchemaModel, SchemaRelation } from "../../src/rdf/schemaModel";
import type { UiStrings } from "../../src/shared/messages";

const PROPERTY_TYPES: PropertyType[] = ["string", "integer", "decimal", "double", "date", "datetime", "boolean", "enum", "other"];

export function connectionGroupText(
  template: string,
  group: SchemaEntity["connectionGroup"],
): string {
  return template
    .replace("{0}", String(group.index))
    .replace("{1}", String(group.count))
    .replace("{2}", String(group.size));
}

export interface RevealCallback {
  onRevealInSource: (iri: string) => void;
}

export interface InspectorCallbacks extends RevealCallback {
  /** Renames the rdfs:label of any subject — reused as-is for both entities and properties. */
  onRename: (subjectId: string, newName: string) => void;
  onEditComment: (entityId: string, newComment: string) => void;
  /** The user tried to clear an existing description — deletion isn't implemented yet (see DevPlan.md). */
  onCommentClearUnsupported: () => void;
  onUpdatePropertyType: (propertyIri: string, propertyType: PropertyType) => void;
  onAddProperty: (entityId: string) => void;
  /** Deletes a declared property's or relation's entire declaration (see src/edit/deleteStatement.ts). */
  onDeleteDeclaration: (iri: string) => void;
}

function relationLabel(strings: UiStrings, rel: SchemaRelation): string {
  if (rel.kind === "subClassOf") {
    return strings.legendSubClassOf;
  }
  if (rel.kind === "skosBroader") {
    return strings.legendSkosBroader;
  }
  return rel.name;
}

function listItemClass(inferred: boolean): string {
  return `inspector-list-item${inferred ? " inferred" : ""}`;
}

export function renderEmptySelection(container: HTMLElement, strings: UiStrings): void {
  clear(container);
  container.appendChild(
    h("div", {
      className: "inspector-empty-state",
      children: [
        h("div", { className: "inspector-empty-icon", text: "⌁", attrs: { "aria-hidden": "true" } }),
        h("h3", { text: strings.inspectorEmptyTitle }),
        h("p", { className: "inspector-hint", text: strings.inspectorEmptyHint }),
      ],
    }),
  );
}

export function renderEntitySelection(
  container: HTMLElement,
  strings: UiStrings,
  schema: SchemaModel,
  entity: SchemaEntity,
  callbacks: InspectorCallbacks,
  commentEditable: boolean,
): void {
  clear(container);

  const header = h("div", { className: "inspector-header inspector-entity-header" });
  header.appendChild(h("span", { className: "inspector-icon", text: entity.icon }));
  const nameInput = h("input", {
    className: "inspector-name-input",
    attrs: { type: "text", "aria-label": strings.nameFieldLabel },
  });
  nameInput.value = entity.name;
  const commitRename = () => {
    const value = nameInput.value.trim();
    if (value && value !== entity.name) {
      callbacks.onRename(entity.id, value);
    } else {
      nameInput.value = entity.name;
    }
  };
  nameInput.addEventListener("blur", commitRename);
  nameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      nameInput.blur();
    } else if (e.key === "Escape") {
      nameInput.value = entity.name;
      nameInput.blur();
    }
  });
  header.appendChild(nameInput);
  container.appendChild(header);

  const commentInput = h("textarea", {
    className: "inspector-comment-input",
    attrs: {
      rows: "2",
      placeholder: strings.commentFieldPlaceholder,
      "aria-label": strings.commentFieldLabel,
      ...(commentEditable ? {} : { readonly: "readonly", title: strings.commentNotEditableHint }),
    },
  });
  commentInput.value = entity.description ?? "";
  const previousComment = entity.description ?? "";
  const commitComment = () => {
    if (!commentEditable) {
      return;
    }
    const value = commentInput.value.trim();
    if (value === previousComment) {
      return;
    }
    if (value.length === 0) {
      commentInput.value = previousComment;
      callbacks.onCommentClearUnsupported();
      return;
    }
    callbacks.onEditComment(entity.id, value);
  };
  commentInput.addEventListener("blur", commitComment);
  commentInput.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      commentInput.value = previousComment;
      commentInput.blur();
    }
  });
  container.appendChild(commentInput);

  container.appendChild(
    h("p", { className: "inspector-meta", text: strings.instancesLabel.replace("{0}", String(entity.instanceCount)) }),
  );
  container.appendChild(
    h("p", {
      className: "inspector-meta inspector-color-group",
      text: connectionGroupText(strings.connectionGroupLabel, entity.connectionGroup),
    }),
  );
  if (entity.colorOverride) {
    container.appendChild(h("p", { className: "inspector-meta-small", text: strings.customColorLabel }));
  }

  container.appendChild(h("h4", { className: "panel-heading", text: strings.propertiesLabel }));
  if (entity.properties.length > 0) {
    const propList = h("ul", { className: "inspector-list" });
    for (const prop of entity.properties) {
      const declared = prop.provenance === "declared";
      const row = h("li", { className: `inspector-property-row${declared ? "" : " inferred"}` });

      const nameInput = h("input", {
        className: "inspector-property-name-input",
        attrs: { type: "text", "aria-label": strings.nameFieldLabel, ...(declared ? {} : { readonly: "readonly", title: strings.propertyNotEditableHint }) },
      });
      nameInput.value = prop.name;
      if (declared) {
        const commitPropertyRename = () => {
          const value = nameInput.value.trim();
          if (value && value !== prop.name) {
            callbacks.onRename(prop.iri, value);
          } else {
            nameInput.value = prop.name;
          }
        };
        nameInput.addEventListener("blur", commitPropertyRename);
        nameInput.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            nameInput.blur();
          } else if (e.key === "Escape") {
            nameInput.value = prop.name;
            nameInput.blur();
          }
        });
      }
      row.appendChild(nameInput);

      const typeSelect = h("select", {
        className: "inspector-property-type-select",
        attrs: { "aria-label": strings.propertyTypeLabel, ...(declared ? {} : { title: strings.propertyNotEditableHint }) },
      });
      for (const type of PROPERTY_TYPES) {
        const option = h("option", { text: type, attrs: { value: type } });
        typeSelect.appendChild(option);
      }
      typeSelect.value = prop.type;
      typeSelect.disabled = !declared;
      typeSelect.addEventListener("change", () => {
        callbacks.onUpdatePropertyType(prop.iri, typeSelect.value as PropertyType);
      });
      row.appendChild(typeSelect);

      if (prop.isIdentifier) {
        row.appendChild(h("span", { className: "inspector-property-badge", text: "🔑" }));
      }
      if (declared) {
        row.appendChild(
          h("button", {
            className: "inspector-delete-btn",
            text: "🗑",
            attrs: { "aria-label": strings.deleteLabel, title: strings.deleteLabel },
            onClick: () => callbacks.onDeleteDeclaration(prop.iri),
          }),
        );
      }
      propList.appendChild(row);
    }
    container.appendChild(propList);
  }
  container.appendChild(
    h("button", { className: "inspector-add-property-btn", text: strings.addPropertyLabel, onClick: () => callbacks.onAddProperty(entity.id) }),
  );

  const outgoing = schema.relations.filter((r) => r.source === entity.id);
  const incoming = schema.relations.filter((r) => r.target === entity.id && r.source !== entity.id);
  if (outgoing.length + incoming.length > 0) {
    container.appendChild(h("h4", { className: "panel-heading", text: strings.relationsLabel }));
    const relList = h("ul", { className: "inspector-list" });
    for (const rel of outgoing) {
      const other = schema.entities.find((e) => e.id === rel.target);
      relList.appendChild(
        h("li", {
          className: listItemClass(rel.provenance !== "declared"),
          text: `→ ${other?.name ?? rel.target} (${relationLabel(strings, rel)})`,
        }),
      );
    }
    for (const rel of incoming) {
      const other = schema.entities.find((e) => e.id === rel.source);
      relList.appendChild(
        h("li", {
          className: listItemClass(rel.provenance !== "declared"),
          text: `← ${other?.name ?? rel.source} (${relationLabel(strings, rel)})`,
        }),
      );
    }
    container.appendChild(relList);
  }

  container.appendChild(
    h("button", { className: "inspector-reveal-btn", text: strings.revealInSource, onClick: () => callbacks.onRevealInSource(entity.id) }),
  );
}

export function renderRelationSelection(
  container: HTMLElement,
  strings: UiStrings,
  schema: SchemaModel,
  relation: SchemaRelation,
  callbacks: InspectorCallbacks,
): void {
  clear(container);

  const source = schema.entities.find((e) => e.id === relation.source);
  const target = schema.entities.find((e) => e.id === relation.target);

  container.appendChild(
    h("div", {
      className: "inspector-header inspector-relation-header",
      children: [
        h("span", { className: "inspector-relation-icon", text: "↗", attrs: { "aria-hidden": "true" } }),
        h("span", { text: relationLabel(strings, relation) }),
      ],
    }),
  );
  container.appendChild(
    h("p", { className: "inspector-meta", text: `${source?.name ?? relation.source} → ${target?.name ?? relation.target}` }),
  );
  if (relation.cardinality !== "unspecified") {
    container.appendChild(h("p", { className: "inspector-meta", text: relation.cardinality }));
  }
  if (relation.description) {
    container.appendChild(h("p", { className: "inspector-description", text: relation.description }));
  }
  if (relation.provenance !== "declared") {
    container.appendChild(h("p", { className: "inspector-meta inferred-note", text: strings.legendInferredHint }));
  }

  if (relation.attributes && relation.attributes.length > 0) {
    container.appendChild(h("h4", { className: "panel-heading", text: strings.propertiesLabel }));
    const attrList = h("ul", { className: "inspector-list" });
    for (const attr of relation.attributes) {
      attrList.appendChild(h("li", { className: "inspector-list-item", text: `${attr.name}: ${attr.type}` }));
    }
    container.appendChild(attrList);
  }

  const revealIri = relation.iri ?? relation.source;
  container.appendChild(
    h("button", { className: "inspector-reveal-btn", text: strings.revealInSource, onClick: () => callbacks.onRevealInSource(revealIri) }),
  );

  // subClassOf/skosBroader relations have no declaration of their own to
  // delete (they're a single triple using a standard predicate directly on
  // the entity, not a separate subject) — only a declared object property
  // (which does have its own `iri`) is offered a delete button.
  if (relation.iri && relation.provenance === "declared") {
    container.appendChild(
      h("button", {
        className: "inspector-delete-btn inspector-delete-btn-relation",
        text: strings.deleteLabel,
        onClick: () => callbacks.onDeleteDeclaration(relation.iri as string),
      }),
    );
  }
}

/** "Never silently drop data" only holds if this list is actually visible somewhere — this is its home. */
export function renderUnattached(
  container: HTMLElement,
  strings: UiStrings,
  schema: SchemaModel,
  callbacks: RevealCallback,
): void {
  clear(container);
  if (schema.unattachedProperties.length === 0) {
    return;
  }
  container.appendChild(
    h("h4", { className: "panel-heading", text: `${strings.unattachedHeading} (${schema.unattachedProperties.length})` }),
  );
  const list = h("ul", { className: "inspector-list" });
  for (const prop of schema.unattachedProperties) {
    const item = h("li", { className: "inspector-list-item unattached-item" });
    item.appendChild(h("div", { text: prop.name }));
    item.appendChild(h("div", { className: "inspector-meta-small", text: prop.reason }));
    item.appendChild(
      h("button", {
        className: "inspector-reveal-btn-small",
        text: strings.revealInSource,
        onClick: () => callbacks.onRevealInSource(prop.iri),
      }),
    );
    list.appendChild(item);
  }
  container.appendChild(list);
}
