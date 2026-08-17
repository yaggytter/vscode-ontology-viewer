import { describe, expect, it } from "vitest";
import { SerialTaskQueue } from "./serialTaskQueue";

describe("SerialTaskQueue", () => {
  it("runs overlapping persistence tasks in submission order", async () => {
    const queue = new SerialTaskQueue();
    const events: string[] = [];
    let releaseFirst: (() => void) | undefined;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = queue.run(async () => {
      events.push("first:start");
      await firstGate;
      events.push("first:end");
    });
    const second = queue.run(async () => {
      events.push("second");
    });

    await Promise.resolve();
    expect(events).toEqual(["first:start"]);
    releaseFirst?.();
    await Promise.all([first, second]);
    expect(events).toEqual(["first:start", "first:end", "second"]);
  });

  it("continues after a rejected task", async () => {
    const queue = new SerialTaskQueue();
    await expect(queue.run(async () => Promise.reject(new Error("write failed")))).rejects.toThrow("write failed");
    await expect(queue.run(async () => "recovered")).resolves.toBe("recovered");
  });
});
