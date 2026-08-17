import { describe, expect, it } from "vitest";
import { inspectorPlacementForWidth } from "./layout";

describe("inspectorPlacementForWidth", () => {
  it("keeps the inspector beside the graph in a wide editor", () => {
    expect(inspectorPlacementForWidth(1440)).toBe("side");
  });

  it("uses an overlay without shrinking the graph in a medium editor", () => {
    expect(inspectorPlacementForWidth(800)).toBe("overlay");
  });

  it("uses a bottom sheet in a narrow editor", () => {
    expect(inspectorPlacementForWidth(560)).toBe("sheet");
  });

  it("uses stable inclusive breakpoint boundaries", () => {
    expect(inspectorPlacementForWidth(1280)).toBe("side");
    expect(inspectorPlacementForWidth(1279)).toBe("overlay");
    expect(inspectorPlacementForWidth(640)).toBe("overlay");
    expect(inspectorPlacementForWidth(639)).toBe("sheet");
  });
});
