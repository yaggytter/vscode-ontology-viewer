import { clear, h } from "../dom";
import type { SchemaModel } from "../../src/rdf/schemaModel";
import type { UiStrings } from "../../src/shared/messages";

/**
 * Lists only the entity origins and relation kinds actually present in the
 * current model — a legend showing four entity kinds when the document has
 * one is noise, not help.
 */
export function renderLegend(container: HTMLElement, strings: UiStrings, schema: SchemaModel): void {
  clear(container);
  const details = h("details", { className: "inspector-disclosure" });
  details.appendChild(h("summary", { text: strings.legendTitle }));

  const origins = new Set(schema.entities.map((e) => e.origin));
  const list = h("div", { className: "legend-list" });

  if (origins.has("owlClass") || origins.has("rdfsClass")) {
    list.appendChild(legendRow("legend-swatch legend-swatch-class", strings.legendClass));
  }
  if (origins.has("skosConcept")) {
    list.appendChild(legendRow("legend-swatch legend-swatch-skos", strings.legendSkosConcept));
  }
  if (origins.has("inferred")) {
    list.appendChild(legendRow("legend-swatch legend-swatch-inferred", strings.legendInferredEntity));
  }

  const kinds = new Set(schema.relations.map((r) => r.kind));
  if (kinds.has("objectProperty")) {
    list.appendChild(legendRow("legend-line legend-line-relation", strings.legendRelation));
  }
  if (kinds.has("subClassOf")) {
    list.appendChild(legendRow("legend-line legend-line-subclassof", strings.legendSubClassOf));
  }
  if (kinds.has("skosBroader")) {
    list.appendChild(legendRow("legend-line legend-line-broader", strings.legendSkosBroader));
  }

  details.appendChild(list);

  if (schema.entities.length > 0) {
    details.appendChild(
      h("div", {
        className: "legend-color-guide",
        children: [
          h("span", { className: "legend-color-gradient", attrs: { "aria-hidden": "true" } }),
          h("span", { text: strings.legendColorHint }),
        ],
      }),
    );
  }

  if (schema.relations.some((r) => r.provenance !== "declared")) {
    details.appendChild(h("div", { className: "legend-hint", text: strings.legendInferredHint }));
  }
  container.appendChild(details);
}

function legendRow(swatchClass: string, label: string): HTMLDivElement {
  return h("div", {
    className: "legend-row",
    children: [h("span", { className: swatchClass }), h("span", { text: label })],
  });
}
