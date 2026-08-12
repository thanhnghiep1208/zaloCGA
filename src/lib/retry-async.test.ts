import { describe, expect, it, vi } from "vitest";
import { retryAsync } from "@/lib/retry-async";

describe("retryAsync", () => {
  it("returns the result on the first successful attempt without retrying", async () => {
    const fn = vi.fn().mockResolvedValue("ok");

    await expect(retryAsync(fn, 3)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries after a failure and returns the result once an attempt succeeds", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValueOnce("ok");

    await expect(retryAsync(fn, 3)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("stops after the given number of attempts and throws the last error", async () => {
    const err1 = new Error("first");
    const err2 = new Error("second");
    const fn = vi.fn().mockRejectedValueOnce(err1).mockRejectedValueOnce(err2);

    await expect(retryAsync(fn, 2)).rejects.toBe(err2);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does not retry when isFatal(error) returns true", async () => {
    const fatal = { code: "permission-denied" };
    const fn = vi.fn().mockRejectedValue(fatal);

    await expect(
      retryAsync(fn, 3, { isFatal: (e) => (e as { code?: string })?.code === "permission-denied" })
    ).rejects.toBe(fatal);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
