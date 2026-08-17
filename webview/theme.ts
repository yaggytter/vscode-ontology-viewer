/**
 * Resolves VS Code theme CSS custom properties to concrete color strings.
 *
 * Cytoscape renders to a `<canvas>`, so it cannot resolve `var(--vscode-*)`
 * itself — a raw `var(...)` string passed into a cytoscape stylesheet is
 * simply invalid and silently falls back to cytoscape's own defaults. Every
 * color handed to cytoscape must go through `cssVar()` first.
 */
export function cssVar(name: string, fallback: string): string {
  if (typeof document === "undefined") {
    return fallback;
  }
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

/**
 * Invokes `callback` whenever VS Code swaps the active theme. VS Code
 * reflects the theme kind as a class on `<body>` (`vscode-light` /
 * `vscode-dark` / `vscode-high-contrast`), so a class-attribute
 * MutationObserver on `<body>` is the standard way to detect the change.
 * Returns a disposer.
 */
export function onThemeChange(callback: () => void): () => void {
  const observer = new MutationObserver(callback);
  observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

export function isDarkTheme(): boolean {
  if (typeof document === "undefined") {
    return true;
  }
  const cls = document.body.classList;
  return cls.contains("vscode-dark") || cls.contains("vscode-high-contrast");
}

/**
 * Resolves a `SchemaEntity.colorIndex` (0..COLOR_PALETTE_SIZE-1, from
 * `rdf/appearance.ts`'s `assignRelationalColorIndices`) to a concrete,
 * theme-aware color. VS Code only exposes ~7 semantic chart color tokens
 * (`--vscode-charts-{red,orange,yellow,green,blue,purple,foreground}`) — far
 * fewer than the model's slots — so reusing them directly would force
 * collisions long before the palette actually runs out. Instead this
 * generates `paletteSize` evenly-spaced hues directly, at a fixed
 * saturation/lightness tuned per theme kind for contrast against the editor
 * background and picked to read as vivid/colorful rather than muted.
 * Deterministic and re-derivable on every theme change (see
 * `onThemeChange`), same as `cssVar()`-resolved colors.
 */
export function paletteColorFor(colorIndex: number, paletteSize: number, darkTheme = isDarkTheme()): string {
  const hue = ((colorIndex % paletteSize) + paletteSize) % paletteSize * (360 / paletteSize);
  const saturation = darkTheme ? 70 : 75;
  const lightness = darkTheme ? 62 : 42;
  // Cytoscape's color parser accepts the legacy comma-separated HSL form
  // across all supported versions; CSS Color 4's space/`deg` syntax can
  // silently fall back to black on canvas even though Chromium accepts it.
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

/** A low-glare tint used as the body of an entity card. */
export function paletteSurfaceFor(colorIndex: number, paletteSize: number, darkTheme = isDarkTheme()): string {
  const hue = ((colorIndex % paletteSize) + paletteSize) % paletteSize * (360 / paletteSize);
  return darkTheme ? `hsl(${hue}, 38%, 23%)` : `hsl(${hue}, 62%, 92%)`;
}

interface RgbaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

function hslToRgb(hue: number, saturation: number, lightness: number): RgbaColor {
  const normalizedHue = ((hue % 360) + 360) % 360;
  const s = saturation / 100;
  const l = lightness / 100;
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const segment = normalizedHue / 60;
  const secondary = chroma * (1 - Math.abs((segment % 2) - 1));
  const [r1, g1, b1] =
    segment < 1 ? [chroma, secondary, 0]
      : segment < 2 ? [secondary, chroma, 0]
        : segment < 3 ? [0, chroma, secondary]
          : segment < 4 ? [0, secondary, chroma]
            : segment < 5 ? [secondary, 0, chroma]
              : [chroma, 0, secondary];
  const offset = l - chroma / 2;
  return { r: (r1 + offset) * 255, g: (g1 + offset) * 255, b: (b1 + offset) * 255, a: 1 };
}

function parseCssColor(value: string): RgbaColor | undefined {
  const color = value.trim().toLowerCase();
  const hex = color.match(/^#([0-9a-f]{3,8})$/i)?.[1];
  if (hex && [3, 4, 6, 8].includes(hex.length)) {
    const expanded = hex.length <= 4 ? [...hex].map((digit) => digit + digit).join("") : hex;
    return {
      r: Number.parseInt(expanded.slice(0, 2), 16),
      g: Number.parseInt(expanded.slice(2, 4), 16),
      b: Number.parseInt(expanded.slice(4, 6), 16),
      a: expanded.length === 8 ? Number.parseInt(expanded.slice(6, 8), 16) / 255 : 1,
    };
  }

  const rgb = color.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/);
  if (rgb) {
    return {
      r: Math.min(255, Number(rgb[1])),
      g: Math.min(255, Number(rgb[2])),
      b: Math.min(255, Number(rgb[3])),
      a: rgb[4] === undefined ? 1 : Math.min(1, Number(rgb[4])),
    };
  }

  const hsl = color.match(/^hsla?\(\s*([\d.-]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%(?:\s*,\s*([\d.]+))?\s*\)$/);
  if (hsl) {
    return { ...hslToRgb(Number(hsl[1]), Number(hsl[2]), Number(hsl[3])), a: hsl[4] === undefined ? 1 : Math.min(1, Number(hsl[4])) };
  }
  return undefined;
}

function composite(foreground: RgbaColor, background: RgbaColor): RgbaColor {
  const alpha = foreground.a + background.a * (1 - foreground.a);
  if (alpha === 0) {
    return { r: 0, g: 0, b: 0, a: 0 };
  }
  return {
    r: (foreground.r * foreground.a + background.r * background.a * (1 - foreground.a)) / alpha,
    g: (foreground.g * foreground.a + background.g * background.a * (1 - foreground.a)) / alpha,
    b: (foreground.b * foreground.a + background.b * background.a * (1 - foreground.a)) / alpha,
    a: alpha,
  };
}

function relativeLuminance(color: RgbaColor): number {
  const linear = [color.r, color.g, color.b].map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

export function contrastRatio(foreground: string, background: string): number {
  const foregroundColor = parseCssColor(foreground);
  const backgroundColor = parseCssColor(background);
  if (!foregroundColor || !backgroundColor) {
    return 1;
  }
  const foregroundLuminance = relativeLuminance(foregroundColor);
  const backgroundLuminance = relativeLuminance(backgroundColor);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Selects black or white text with the higher WCAG contrast against a solid/composited background. */
export function accessibleTextColor(background: string, canvasBackground = "#ffffff"): "#000000" | "#ffffff" {
  const parsedBackground = parseCssColor(background);
  const parsedCanvas = parseCssColor(canvasBackground);
  if (!parsedBackground || !parsedCanvas) {
    return isDarkTheme() ? "#ffffff" : "#000000";
  }
  const solidBackground = composite(parsedBackground, parsedCanvas);
  const blackContrast = (relativeLuminance(solidBackground) + 0.05) / 0.05;
  const whiteContrast = 1.05 / (relativeLuminance(solidBackground) + 0.05);
  return blackContrast >= whiteContrast ? "#000000" : "#ffffff";
}
