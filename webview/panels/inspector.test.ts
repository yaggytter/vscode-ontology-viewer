import { describe, expect, it } from "vitest";
import { connectionGroupText } from "./inspector";

describe("connectionGroupText", () => {
  it("fills the group index, total, and size placeholders", () => {
    expect(
      connectionGroupText("Connection group {0}/{1} · {2} entities", { index: 2, count: 4, size: 7 }),
    ).toBe("Connection group 2/4 · 7 entities");
  });
});
