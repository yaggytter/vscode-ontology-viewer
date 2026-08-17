/** Namespace (up to and including the last `/` or `#`) of an IRI. */
function namespaceOf(iri: string): string {
  const cut = Math.max(iri.lastIndexOf("#"), iri.lastIndexOf("/"));
  return cut >= 0 ? iri.slice(0, cut + 1) : `${iri}#`;
}

/**
 * The namespace new entities should be minted into: the most common
 * namespace among the document's existing entities (so a new class lands
 * next to the ones the user is already looking at), falling back to
 * `baseIRI#` only for a document that doesn't have any entities yet.
 */
export function inferNamespace(existingIris: string[], baseIRI: string): string {
  if (existingIris.length === 0) {
    return `${baseIRI}#`;
  }
  const counts = new Map<string, number>();
  for (const iri of existingIris) {
    const ns = namespaceOf(iri);
    counts.set(ns, (counts.get(ns) ?? 0) + 1);
  }
  let best = "";
  let bestCount = -1;
  for (const [ns, count] of counts) {
    if (count > bestCount) {
      best = ns;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Turns free-text into a Turtle-safe local name. `PascalCase` for classes,
 * `camelCase` for properties/relations — matching this document's own
 * convention isn't attempted (there's no reliable signal for it); these are
 * simply the two conventional OWL styles.
 */
export function slugify(name: string, style: "PascalCase" | "camelCase"): string {
  const words = name
    .trim()
    .split(/[^A-Za-z0-9]+/)
    .filter((w) => w.length > 0);
  if (words.length === 0) {
    return style === "PascalCase" ? "Thing" : "property";
  }
  const cased = words.map((w, i) => {
    const lower = w.toLowerCase();
    const capitalized = lower.charAt(0).toUpperCase() + lower.slice(1);
    return style === "camelCase" && i === 0 ? lower : capitalized;
  });
  return cased.join("");
}

/**
 * Mints a fresh, collision-free IRI for a new class/property, always in the
 * inferred namespace and always emitted as a full `<...>` form by callers
 * (never a prefix this function invents). Collisions with an existing
 * entity's local name get a numeric suffix (`Widget`, `Widget2`, `Widget3`, ...).
 */
export function mintIri(existingIris: string[], baseIRI: string, name: string, style: "PascalCase" | "camelCase"): string {
  const namespace = inferNamespace(existingIris, baseIRI);
  const existing = new Set(existingIris);
  const base = slugify(name, style);
  let candidate = `${namespace}${base}`;
  let n = 2;
  while (existing.has(candidate)) {
    candidate = `${namespace}${base}${n}`;
    n += 1;
  }
  return candidate;
}
