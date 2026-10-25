import { describe, expect, it } from "vitest";
import { parseDocument } from "yaml";
import { applySplice, formatFlow, insertEntry, removeEntry, setScalar, type SpliceResult } from "./yamlEdit";

function run(text: string, edit: (doc: ReturnType<typeof parseDocument>) => SpliceResult): string {
  const result = edit(parseDocument(text));
  if (!result.ok) {
    throw new Error(result.reason);
  }
  const next = applySplice(text, result.splice);
  expect(parseDocument(next).errors).toEqual([]);
  return next;
}

describe("insertEntry", () => {
  it("appends to a block map even without a trailing newline", () => {
    expect(run("a:\n  x: 1", (d) => insertEntry("a:\n  x: 1", d, ["a"], "y", 2))).toBe("a:\n  x: 1\n  y: 2");
  });

  it("creates two missing levels of parents", () => {
    const text = "top: 1\n";
    const next = run(text, (d) => insertEntry(text, d, ["a", "b"], "c", "v"));
    expect(parseDocument(next).toJS()).toEqual({ top: 1, a: { b: { c: "v" } } });
  });

  it("fills an inline empty map and an explicit null", () => {
    const empty = "a: {}\n";
    expect(run(empty, (d) => insertEntry(empty, d, ["a"], "k", "v"))).toBe("a: { k: v }\n");
    const nul = "a: null\n";
    expect(parseDocument(run(nul, (d) => insertEntry(nul, d, ["a"], "k", { type: "string" }))).toJS()).toEqual({
      a: { k: { type: "string" } },
    });
  });

  it("keeps CRLF documents parseable", () => {
    const text = "a:\r\n  x: 1\r\nb: 2\r\n";
    const next = run(text, (d) => insertEntry(text, d, ["a"], "y", 2));
    expect(parseDocument(next).toJS()).toEqual({ a: { x: 1, y: 2 }, b: 2 });
    expect(next.replace(/\r\n/g, "")).not.toContain("\n");
  });

  it("refuses duplicates and non-maps", () => {
    const text = "a:\n  x: 1\nl: [1]\n";
    const doc = parseDocument(text);
    expect(insertEntry(text, doc, ["a"], "x", 3).ok).toBe(false);
    expect(insertEntry(text, doc, ["l"], "x", 3).ok).toBe(false);
  });

  it("writes nested maps as blocks with flow leaves", () => {
    const text = "m:\n  a: 1\n";
    const next = run(text, (d) => insertEntry(text, d, ["m"], "T", { primaryKey: "id", properties: { id: { type: "string" } } }));
    expect(next).toBe("m:\n  a: 1\n  T:\n    primaryKey: id\n    properties:\n      id: { type: string }\n");
    expect(formatFlow([])).toBe("[]");
    expect(formatFlow({})).toBe("{}");
  });
});

describe("setScalar", () => {
  it("replaces an existing scalar and fills an empty value", () => {
    const text = "a: old # keep\nb:\nc: 1\n";
    let next = run(text, (d) => setScalar(text, d, ["a"], "new value"));
    expect(next).toBe("a: new value # keep\nb:\nc: 1\n");
    next = run(next, (d) => setScalar(next, d, ["b"], true));
    expect(parseDocument(next).toJS()).toEqual({ a: "new value", b: true, c: 1 });
  });

  it("refuses to overwrite a mapping with a scalar", () => {
    const text = "a:\n  x: 1\n";
    expect(setScalar(text, parseDocument(text), ["a"], "v").ok).toBe(false);
  });
});

describe("removeEntry", () => {
  it("removes block entries including their trailing comment", () => {
    const text = "a:\n  x: 1 # gone\n  y:\n    deep: 2\n  z: 3\n";
    expect(run(text, (d) => removeEntry(text, d, ["a"], "x"))).toBe("a:\n  y:\n    deep: 2\n  z: 3\n");
    expect(run(text, (d) => removeEntry(text, d, ["a"], "y"))).toBe("a:\n  x: 1 # gone\n  z: 3\n");
  });

  it("removes first, middle, last and only entries of a flow map", () => {
    const text = "m: { a: 1, b: { c: 2 }, d: 3 }\n";
    expect(parseDocument(run(text, (d) => removeEntry(text, d, ["m"], "a"))).toJS()).toEqual({ m: { b: { c: 2 }, d: 3 } });
    expect(parseDocument(run(text, (d) => removeEntry(text, d, ["m"], "b"))).toJS()).toEqual({ m: { a: 1, d: 3 } });
    expect(parseDocument(run(text, (d) => removeEntry(text, d, ["m"], "d"))).toJS()).toEqual({ m: { a: 1, b: { c: 2 } } });
    const only = "m: { a: 1 }\n";
    expect(parseDocument(run(only, (d) => removeEntry(only, d, ["m"], "a"))).toJS()).toEqual({ m: {} });
  });

  it("reports missing keys and non-maps", () => {
    const text = "m: { a: 1 }\nl: [1]\n";
    const doc = parseDocument(text);
    expect(removeEntry(text, doc, ["m"], "zz").ok).toBe(false);
    expect(removeEntry(text, doc, ["l"], "a").ok).toBe(false);
  });
});
