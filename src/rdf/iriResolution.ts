/**
 * Resolves a (possibly relative) IRI against a base IRI using the same
 * algorithm N3.Parser uses internally (RFC 3986 §5), so that positions
 * computed here (src/rdf/positionIndex.ts) always agree with the absolute
 * IRIs N3.Parser reports in its quads. Verified empirically: `new URL(rel,
 * base).href` matches N3.Parser's resolution for both http(s) and file
 * base IRIs, including `../` segment normalization and the `<>` (empty
 * relative IRI = base itself) case.
 */
export function resolveIri(raw: string, base: string): string {
  if (raw === "") {
    return base;
  }
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw)) {
    // Already absolute (has a scheme) — no resolution needed.
    return raw;
  }
  try {
    return new URL(raw, base).href;
  } catch {
    // No usable base (e.g. base itself is relative/absent) — fall back to
    // the raw form so callers can still detect the mismatch downstream.
    return raw;
  }
}
