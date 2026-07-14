import { describe, expect, it } from "vitest";
import { TimeoutError, withTimeout } from "@/lib/with-timeout";

describe("withTimeout", () => {
  it("resolves with the value when the promise settles before the timeout", async () => {
    const fast = new Promise((resolve) => setTimeout(() => resolve("done"), 5));

    await expect(withTimeout(fast, 200)).resolves.toBe("done");
  });

  it("rejects with a TimeoutError when the promise takes longer than the given ms", async () => {
    const neverSettles = new Promise(() => {});

    await expect(withTimeout(neverSettles, 20)).rejects.toBeInstanceOf(TimeoutError);
  });

  it("propagates the original rejection unchanged when it happens before the timeout", async () => {
    const boom = new Error("boom");
    const failsFast = Promise.reject(boom);

    await expect(withTimeout(failsFast, 200)).rejects.toBe(boom);
  });
});
