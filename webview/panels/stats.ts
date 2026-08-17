import { clear, h } from "../dom";
import type { SchemaModel } from "../../src/rdf/schemaModel";
import type { UiStrings } from "../../src/shared/messages";

export function renderStats(container: HTMLElement, strings: UiStrings, schema: SchemaModel): void {
  clear(container);
  const propertyCount = schema.entities.reduce((sum, e) => sum + e.properties.length, 0);
  const items: [string, number][] = [
    [strings.entitiesLabel, schema.entities.length],
    [strings.relationsLabel, schema.relations.length],
    [strings.propertiesLabel, propertyCount],
  ];
  const grid = h("div", { className: "stats-grid" });
  for (const [label, count] of items) {
    grid.appendChild(
      h("div", {
        className: "stats-item",
        children: [h("span", { className: "stats-count", text: String(count) }), h("span", { className: "stats-label", text: label })],
      }),
    );
  }
  container.appendChild(grid);
}
