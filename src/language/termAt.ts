import * as vscode from "vscode";
import type { IndexedTerm, PositionIndex, Span } from "../rdf/positionIndex";

export function spanToRange(span: Span): vscode.Range {
  return new vscode.Range(span.start.line, span.start.character, span.end.line, span.end.character);
}

function contains(span: Span, position: vscode.Position): boolean {
  const afterStart =
    position.line > span.start.line || (position.line === span.start.line && position.character >= span.start.character);
  const beforeEnd =
    position.line < span.end.line || (position.line === span.end.line && position.character <= span.end.character);
  return afterStart && beforeEnd;
}

/** Finds the NamedNode/BlankNode term (subject, predicate, or object) whose span contains `position`, if any. */
export function findNamedTermAt(index: PositionIndex, position: vscode.Position): IndexedTerm | undefined {
  for (const stmt of index.statements) {
    if (stmt.subject.kind !== "Literal" && contains(stmt.subject.span, position)) {
      return stmt.subject;
    }
    if (contains(stmt.predicate.span, position)) {
      return stmt.predicate;
    }
    if (stmt.object.kind !== "Literal" && contains(stmt.object.span, position)) {
      return stmt.object;
    }
  }
  return undefined;
}
