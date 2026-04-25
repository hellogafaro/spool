import { describe, expect, it } from "vitest";
import type { BrowserAuthVerifier } from "./auth.ts";
import {
  handlePairingRequest,
  makeWorkOsPairingWriter,
  type PairingWriter,
} from "./pairing.ts";

const acceptingVerifier: BrowserAuthVerifier = async () => ({
  ok: true,
  auth: { userId: "user_test", payload: { sub: "user_test" } },
});
const rejectingVerifier: BrowserAuthVerifier = async () => ({
  ok: false,
  status: 401,
  reason: "no token",
});

function makePostRequest(body: unknown): { request: Request; url: URL } {
  const url = new URL("https://api.test.local/pairing");
  return {
    request: new Request(url.toString(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    url,
  };
}

describe("handlePairingRequest", () => {
  it("rejects non-POST methods with 405", async () => {
    const url = new URL("https://api.test.local/pairing");
    const request = new Request(url.toString(), { method: "GET" });
    const writer: PairingWriter = { setServerId: async () => ({ ok: true }) };
    const response = await handlePairingRequest(request, url, {
      authVerifier: acceptingVerifier,
      writer,
    });
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
  });

  it("returns auth error when token verification fails", async () => {
    const { request, url } = makePostRequest({ serverId: "happy-coffee-a7k9" });
    const writer: PairingWriter = { setServerId: async () => ({ ok: true }) };
    const response = await handlePairingRequest(request, url, {
      authVerifier: rejectingVerifier,
      writer,
    });
    expect(response.status).toBe(401);
  });

  it("400s on non-JSON body", async () => {
    const { request, url } = makePostRequest("not-json");
    const writer: PairingWriter = { setServerId: async () => ({ ok: true }) };
    const response = await handlePairingRequest(request, url, {
      authVerifier: acceptingVerifier,
      writer,
    });
    expect(response.status).toBe(400);
  });

  it("400s when serverId is missing or invalid", async () => {
    const writer: PairingWriter = { setServerId: async () => ({ ok: true }) };
    for (const body of [{}, { serverId: "" }, { serverId: "Not Valid!" }]) {
      const { request, url } = makePostRequest(body);
      const response = await handlePairingRequest(request, url, {
        authVerifier: acceptingVerifier,
        writer,
      });
      expect(response.status).toBe(400);
    }
  });

  it("writes serverId for the authenticated user and returns ok", async () => {
    const writes: Array<{ userId: string; serverId: string }> = [];
    const writer: PairingWriter = {
      setServerId: async (userId, serverId) => {
        writes.push({ userId, serverId });
        return { ok: true };
      },
    };
    const { request, url } = makePostRequest({ serverId: "happy-coffee-a7k9" });
    const response = await handlePairingRequest(request, url, {
      authVerifier: acceptingVerifier,
      writer,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, serverId: "happy-coffee-a7k9" });
    expect(writes).toEqual([{ userId: "user_test", serverId: "happy-coffee-a7k9" }]);
  });

  it("502s when the upstream write fails", async () => {
    const writer: PairingWriter = {
      setServerId: async () => ({ ok: false, status: 502, reason: "boom" }),
    };
    const { request, url } = makePostRequest({ serverId: "happy-coffee-a7k9" });
    const response = await handlePairingRequest(request, url, {
      authVerifier: acceptingVerifier,
      writer,
    });
    expect(response.status).toBe(502);
  });
});

describe("makeWorkOsPairingWriter", () => {
  it("merges new serverId with existing metadata", async () => {
    let lastWrite: Record<string, unknown> | null = null;
    const writer = makeWorkOsPairingWriter({
      apiKey: "sk_test_x",
      fetchMetadata: async () => ({ otherField: "preserved" }),
      putMetadata: async (_userId, metadata) => {
        lastWrite = metadata;
      },
    });
    const result = await writer.setServerId("user_x", "happy-coffee-a7k9");
    expect(result.ok).toBe(true);
    expect(lastWrite).toEqual({ otherField: "preserved", serverId: "happy-coffee-a7k9" });
  });

  it("returns 503 when the read step fails", async () => {
    const writer = makeWorkOsPairingWriter({
      apiKey: "sk_test_x",
      fetchMetadata: async () => {
        throw new Error("upstream down");
      },
      putMetadata: async () => undefined,
    });
    const result = await writer.setServerId("user_x", "happy-coffee-a7k9");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(503);
  });

  it("returns 502 when the write step fails", async () => {
    const writer = makeWorkOsPairingWriter({
      apiKey: "sk_test_x",
      fetchMetadata: async () => null,
      putMetadata: async () => {
        throw new Error("forbidden");
      },
    });
    const result = await writer.setServerId("user_x", "happy-coffee-a7k9");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(502);
  });
});
