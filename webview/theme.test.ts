import { describe, expect, it } from "vitest";
import { accessibleTextColor, contrastRatio, paletteColorFor, paletteSurfaceFor } from "./theme";

describe("paletteColorFor", () => {
  it("returns Cytoscape-compatible legacy HSL syntax", () => {
    expect(paletteColorFor(7, 48)).toMatch(/^hsl\([\d.]+, \d+%, \d+%\)$/);
    expect(paletteSurfaceFor(7, 48)).toMatch(/^hsl\([\d.]+, \d+%, \d+%\)$/);
  });

  it("uses a distinct tinted surface instead of a flat editor widget", () => {
    expect(paletteSurfaceFor(7, 48)).not.toBe(paletteColorFor(7, 48));
  });
});

describe("accessibleTextColor", () => {
  it("uses dark text on the bright green that made triple labels unreadable", () => {
    expect(accessibleTextColor("#89d185")).toBe("#000000");
  });

  it("uses white text on a dark background", () => {
    expect(accessibleTextColor("hsl(270, 38%, 23%)")).toBe("#ffffff");
  });

  it("composites translucent colors over the canvas background", () => {
    expect(accessibleTextColor("rgba(255, 255, 255, 0.8)", "#ffffff")).toBe("#000000");
  });

  it("always gives generated palette surfaces WCAG AA contrast", () => {
    for (const darkTheme of [true, false]) {
      for (let index = 0; index < 48; index += 1) {
        const background = paletteSurfaceFor(index, 48, darkTheme);
        const foreground = accessibleTextColor(background);
        expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});
