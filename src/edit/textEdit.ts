import type { Span } from "../rdf/positionIndex";

export interface TextEdit {
  span: Span;
  newText: string;
}

/**
 * Escapes a plain-text value for a Turtle short string literal (`"..."`).
 * Editing always produces the short form, even for multi-line input — raw
 * newlines become `\n` — so the result never needs the triple-quote grammar
 * this extension otherwise treats as non-editable (see positionIndex.ts).
 */
export function escapeTurtleShortString(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t");
}

export function offsetOf(text: string, position: { line: number; character: number }): number {
  const lines = text.split("\n");
  let offset = 0;
  for (let i = 0; i < position.line; i++) {
    offset += lines[i].length + 1;
  }
  return offset + position.character;
}

/** Inverse of `offsetOf` — an absolute character offset back to a (line, character) position. */
export function positionOf(text: string, offset: number): { line: number; character: number } {
  const lines = text.slice(0, offset).split("\n");
  return { line: lines.length - 1, character: lines[lines.length - 1].length };
}

export function splice(text: string, span: Span, newText: string): string {
  const start = offsetOf(text, span.start);
  const end = offsetOf(text, span.end);
  return text.slice(0, start) + newText + text.slice(end);
}

/** The exclusive-end position of the whole document, for appending a brand-new top-level statement. */
export function endOfDocument(text: string): { line: number; character: number } {
  const lines = text.split("\n");
  return { line: lines.length - 1, character: lines[lines.length - 1].length };
}
