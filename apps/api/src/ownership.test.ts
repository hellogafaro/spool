import { describe, expect, it } from "vitest";
import {
  allowAllOwnershipChecker,
  makeWorkOsOwnershipChecker,
} from "./ownership.ts";

describe("allowAllOwnershipChecker", () => {
  it("always allows", async () => {
    const result = await allowAllOwnershipChecker("user_a", "server_a");
    expect(result.ok).toBe(true);
  });
});

describe("makeWorkOsOwnershipChecker", () => {
  it("allows when metadata.serverId matches", async () => {
    const checker = makeWorkOsOwnershipChecker({
      apiKey: "sk_test_x",
      fetchMetadata: async () => ({ serverId: "happy-coffee-a7k9" }),
    });
    const result = await checker("user_abc", "happy-coffee-a7k9");
    expect(result.ok).toBe(true);
  });

  it("denies with 403 when metadata.serverId does not match", async () => {
    const checker = makeWorkOsOwnershipChecker({
      apiKey: "sk_test_x",
      fetchMetadata: async () => ({ serverId: "different-server" }),
    });
    const result = await checker("user_abc", "happy-coffee-a7k9");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });

  it("denies with 403 when metadata is empty", async () => {
    const checker = makeWorkOsOwnershipChecker({
      apiKey: "sk_test_x",
      fetchMetadata: async () => null,
    });
    const result = await checker("user_abc", "happy-coffee-a7k9");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });

  it("returns 503 on lookup failure", async () => {
    const checker = makeWorkOsOwnershipChecker({
      apiKey: "sk_test_x",
      fetchMetadata: async () => {
        throw new Error("upstream down");
      },
    });
    const result = await checker("user_abc", "happy-coffee-a7k9");
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
      fetchMetadata: async () => {
        calls += 1;
        return { serverId: "happy-coffee-a7k9" };
      },
    });

    expect((await checker("user_abc", "happy-coffee-a7k9")).ok).toBe(true);
    expect((await checker("user_abc", "happy-coffee-a7k9")).ok).toBe(true);
    expect(calls).toBe(1);

    now += 5001;
    expect((await checker("user_abc", "happy-coffee-a7k9")).ok).toBe(true);
    expect(calls).toBe(2);
  });

  it("caches per (userId, serverId) so separate pairs hit the upstream", async () => {
    let calls = 0;
    const checker = makeWorkOsOwnershipChecker({
      apiKey: "sk_test_x",
      fetchMetadata: async () => {
        calls += 1;
        return { serverId: "matching" };
      },
    });

    await checker("user_a", "matching");
    await checker("user_b", "matching");
    expect(calls).toBe(2);
  });
});
