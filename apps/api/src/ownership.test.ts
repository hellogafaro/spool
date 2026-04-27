import { describe, expect, it } from "vitest";
import { allowAllOwnershipChecker, makeWorkOsOwnershipChecker } from "./ownership.ts";

const ENV = "abcdefghjk23";

describe("allowAllOwnershipChecker", () => {
  it("always allows", async () => {
    const result = await allowAllOwnershipChecker("user_a", ENV);
    expect(result.ok).toBe(true);
  });
});

describe("makeWorkOsOwnershipChecker", () => {
  it("allows when environmentId is in the user's environmentIds array", async () => {
    const checker = makeWorkOsOwnershipChecker({
      apiKey: "sk_test_x",
      getMetadata: async () => ({ environments: `${ENV},ANOTHERENV12` }),
    });
    const result = await checker("user_abc", ENV);
    expect(result.ok).toBe(true);
  });

  it("denies with 403 when environmentId is not in the array", async () => {
    const checker = makeWorkOsOwnershipChecker({
      apiKey: "sk_test_x",
      getMetadata: async () => ({ environments: "DIFFRENTNEV12" }),
    });
    const result = await checker("user_abc", ENV);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });

  it("denies with 403 when metadata is empty", async () => {
    const checker = makeWorkOsOwnershipChecker({
      apiKey: "sk_test_x",
      getMetadata: async () => null,
    });
    const result = await checker("user_abc", ENV);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });

  it("returns 503 on lookup failure", async () => {
    const checker = makeWorkOsOwnershipChecker({
      apiKey: "sk_test_x",
      getMetadata: async () => {
        throw new Error("upstream down");
      },
    });
    const result = await checker("user_abc", ENV);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(503);
  });

  it("caches a successful result for the configured TTL", async () => {
    let calls = 0;
    let now = 1000;
    const checker = makeWorkOsOwnershipChecker({
      apiKey: "sk_test_x",
      ttlMs: 5000,
      now: () => now,
      getMetadata: async () => {
        calls += 1;
        return { environments: ENV };
      },
    });

    expect((await checker("user_abc", ENV)).ok).toBe(true);
    expect((await checker("user_abc", ENV)).ok).toBe(true);
    expect(calls).toBe(1);

    now += 5001;
    expect((await checker("user_abc", ENV)).ok).toBe(true);
    expect(calls).toBe(2);
  });

  it("caches per (userId, environmentId) so separate pairs hit the upstream", async () => {
    let calls = 0;
    const checker = makeWorkOsOwnershipChecker({
      apiKey: "sk_test_x",
      getMetadata: async () => {
        calls += 1;
        return { environments: ENV };
      },
    });

    await checker("user_a", ENV);
    await checker("user_b", ENV);
    expect(calls).toBe(2);
  });
});
