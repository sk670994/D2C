import { describe, expect, it } from "vitest";
import { withKeyedSerialLock } from "./keyed-serial-lock";

describe("withKeyedSerialLock", () => {
  it("serializes operations using the same key", async () => {
    const order: string[] = [];
    const work = (name: string) => withKeyedSerialLock("IN", async () => {
      order.push(`${name}:start`);
      await new Promise((resolve) => setTimeout(resolve, 15));
      order.push(`${name}:end`);
      return name;
    });

    await expect(Promise.all([work("a"), work("b"), work("c")])).resolves.toEqual(["a", "b", "c"]);
    expect(order).toEqual(["a:start", "a:end", "b:start", "b:end", "c:start", "c:end"]);
  });

  it("allows different keys to proceed concurrently", async () => {
    let active = 0;
    let maxActive = 0;
    const work = (key: string) => withKeyedSerialLock(key, async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 15));
      active -= 1;
    });

    await Promise.all([work("IN"), work("US")]);
    expect(maxActive).toBe(2);
  });

  it("releases the key when an operation throws", async () => {
    await expect(withKeyedSerialLock("IN", async () => { throw new Error("expected"); })).rejects.toThrow("expected");
    await expect(withKeyedSerialLock("IN", async () => "recovered")).resolves.toBe("recovered");
  });
});
