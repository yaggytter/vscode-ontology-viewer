/**
 * Chooses which of several language-tagged literals to show, e.g. between
 * `rdfs:label "Component"@en, "部品"@ja`.
 *
 * With a preferred language (VS Code's display language, such as "en" or
 * "ja"), candidates rank: the exact tag, then the same primary subtag
 * ("en-GB" for "en-US"), then an untagged literal, then English, then
 * anything else. Without one, the last candidate wins, which is how the
 * viewer always behaved, so callers that pass no language see no change.
 * Ties also go to the last candidate, for the same reason.
 *
 * The diagram and the edit planner both use this, so renaming a node from the
 * diagram rewrites the literal the diagram is actually showing.
 */
export interface LanguageTagged {
  language?: string;
}

function primarySubtag(tag: string): string {
  return tag.split("-")[0];
}

function rank(language: string | undefined, preferred: string): number {
  if (!language) {
    return 2;
  }
  const tag = language.toLowerCase();
  if (tag === preferred) {
    return 4;
  }
  if (primarySubtag(tag) === primarySubtag(preferred)) {
    return 3;
  }
  return primarySubtag(tag) === "en" ? 1 : 0;
}

export function pickByLanguage<T extends LanguageTagged>(
  candidates: readonly T[],
  preferredLanguage?: string,
): T | undefined {
  if (candidates.length === 0) {
    return undefined;
  }
  if (!preferredLanguage) {
    return candidates[candidates.length - 1];
  }
  const preferred = preferredLanguage.toLowerCase();
  let best = candidates[0];
  let bestRank = rank(best.language, preferred);
  for (const candidate of candidates.slice(1)) {
    const candidateRank = rank(candidate.language, preferred);
    if (candidateRank >= bestRank) {
      best = candidate;
      bestRank = candidateRank;
    }
  }
  return best;
}
