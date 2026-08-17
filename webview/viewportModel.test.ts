import { describe, expect, it } from "vitest";
import {
  clampZoom,
  readableFitZoom,
  zoomLabel,
  zoomStep,
} from "./viewportModel";

describe("viewportModel", () => {
  it("never lets fit-to-view make a normal ontology unreadably small", () => {
    expect(readableFitZoom(0.31, 12)).toBe(0.8);
    expect(readableFitZoom(0.88, 12)).toBe(0.88);
  });

  it("uses a slightly lower floor for a genuinely large ontology", () => {
    expect(readableFitZoom(0.2, 64)).toBe(0.6);
  });

  it("clamps every zoom change to the supported camera range", () => {
    expect(clampZoom(0.1)).toBe(0.35);
    expect(clampZoom(1.25)).toBe(1.25);
    expect(clampZoom(9)).toBe(2.5);
  });

  it("steps zoom predictably and reports an honest percentage", () => {
    expect(zoomStep(1, "in")).toBeCloseTo(1.2);
    expect(zoomStep(1, "out")).toBeCloseTo(1 / 1.2);
    expect(zoomLabel(0.724)).toBe("72%");
  });
});
