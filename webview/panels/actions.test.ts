// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { createActionsPanel, renderActionDetails } from "./actions";
import { renderLegend } from "./legend";
import type { UiStrings } from "../../src/shared/messages";
import type { ActionView } from "../../src/objectOntology/actionView";
import type { SchemaModel } from "../../src/rdf/schemaModel";

const strings = new Proxy({ actionRequiredLabel: "required" } as Partial<UiStrings>, {
  get: (target, prop) => (target as Record<string, string>)[prop as string] ?? String(prop),
}) as UiStrings;

const ACTION: ActionView = {
  id: "urn:x#action/markServed",
  apiName: "markServed",
  name: "Mark order served",
  description: "Close out an order.",
  parameters: [{ id: "order", name: "order", type: "Order", required: true, objectTypeId: "urn:x#Order", objectTypeName: "Order" }],
  rules: ["modifyObject Order · sets status"],
  validations: ["<img src=x onerror=alert(1)>"],
  sideEffects: [],
  affectedTypeIds: ["urn:x#Order"],
};

describe("renderActionDetails", () => {
  it("lists parameters, effects and validations as text", () => {
    const el = renderActionDetails(ACTION, strings);
    expect(el.textContent).toContain("order: Order (required)");
    expect(el.textContent).toContain("modifyObject Order · sets status");
    // Document content is rendered as text, never parsed as markup.
    expect(el.querySelector("img")).toBeNull();
    expect(el.textContent).toContain("<img src=x onerror=alert(1)>");
  });

  it("omits empty sections", () => {
    const el = renderActionDetails(ACTION, strings);
    expect(el.textContent).not.toContain("actionSideEffectsLabel");
  });
});

describe("createActionsPanel", () => {
  it("selects and deselects an action, reporting it to the caller", () => {
    const onSelect = vi.fn();
    const panel = createActionsPanel(strings, { onSelect, onRevealInSource: vi.fn(), onExportTools: vi.fn() });
    panel.update([ACTION]);
    const header = panel.element.querySelector<HTMLButtonElement>(".action-item-header")!;
    header.click();
    expect(onSelect).toHaveBeenLastCalledWith(ACTION);
    expect(panel.element.querySelector(".action-details")).not.toBeNull();
    panel.element.querySelector<HTMLButtonElement>(".action-item-header")!.click();
    expect(onSelect).toHaveBeenLastCalledWith(undefined);
  });

  it("clears the selection when the action disappears", () => {
    const onSelect = vi.fn();
    const panel = createActionsPanel(strings, { onSelect, onRevealInSource: vi.fn(), onExportTools: vi.fn() });
    panel.update([ACTION]);
    panel.element.querySelector<HTMLButtonElement>(".action-item-header")!.click();
    panel.update([]);
    expect(onSelect).toHaveBeenLastCalledWith(undefined);
    expect(panel.element.textContent).toContain("actionsEmpty");
  });

  it("starts hidden and asks the host to export tools", () => {
    const onExportTools = vi.fn();
    const panel = createActionsPanel(strings, { onSelect: vi.fn(), onRevealInSource: vi.fn(), onExportTools });
    expect(panel.isVisible()).toBe(false);
    panel.element.querySelector<HTMLButtonElement>(".sparql-panel-header button")!.click();
    expect(onExportTools).toHaveBeenCalled();
  });
});

describe("renderLegend for Object Ontology models", () => {
  it("shows object type, interface, link and implements rows", () => {
    const schema: SchemaModel = {
      entities: [
        { id: "a", name: "A", origin: "objectType", properties: [], instanceCount: 0, icon: "x", colorIndex: 0, connectionGroup: { index: 1, count: 1, size: 2 } },
        { id: "i", name: "I", origin: "interface", properties: [], instanceCount: 0, icon: "x", colorIndex: 0, connectionGroup: { index: 1, count: 1, size: 2 } },
      ],
      relations: [
        { id: "l", name: "l", source: "a", target: "a", kind: "linkType", cardinality: "one-to-many", provenance: "declared" },
        { id: "m", name: "", source: "a", target: "i", kind: "implements", cardinality: "unspecified", provenance: "declared" },
      ],
      unattachedProperties: [],
      isEmpty: false,
    };
    const container = document.createElement("div");
    renderLegend(container, strings, schema);
    const text = container.textContent ?? "";
    expect(text).toContain("legendObjectType");
    expect(text).toContain("legendInterface");
    expect(text).toContain("legendLinkType");
    expect(text).toContain("legendImplements");
    expect(text).not.toContain("legendClass");
  });
});
