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

const VALID_ID = "abcdefghjk23";

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
    const writer: PairingWriter = { addEnvironmentId: async () => ({ ok: true }) };
    const response = await handlePairingRequest(request, url, {
      authVerifier: acceptingVerifier,
      writer,
    });
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST, OPTIONS");
  });

  it("returns auth error when token verification fails", async () => {
    const { request, url } = makePostRequest({ environmentId: VALID_ID });
    const writer: PairingWriter = { addEnvironmentId: async () => ({ ok: true }) };
    const response = await handlePairingRequest(request, url, {
      authVerifier: rejectingVerifier,
      writer,
    });
    expect(response.status).toBe(401);
  });

  it("400s on non-JSON body", async () => {
    const { request, url } = makePostRequest("not-json");
    const writer: PairingWriter = { addEnvironmentId: async () => ({ ok: true }) };
    const response = await handlePairingRequest(request, url, {
      authVerifier: acceptingVerifier,
      writer,
    });
    expect(response.status).toBe(400);
  });

  it("400s when environmentId is missing or invalid", async () => {
    const writer: PairingWriter = { addEnvironmentId: async () => ({ ok: true }) };
    for (const body of [{}, { environmentId: "" }, { environmentId: "Not-Valid!" }, { environmentId: "tooshort" }]) {
      const { request, url } = makePostRequest(body);
      const response = await handlePairingRequest(request, url, {
        authVerifier: acceptingVerifier,
        writer,
      });
      expect(response.status).toBe(400);
    }
  });

  it("appends environmentId for the authenticated user and returns ok", async () => {
    const writes: Array<{ userId: string; environmentId: string }> = [];
    const writer: PairingWriter = {
      addEnvironmentId: async (userId, environmentId) => {
        writes.push({ userId, environmentId });
        return { ok: true };
      },
    };
    const { request, url } = makePostRequest({ environmentId: VALID_ID });
    const response = await handlePairingRequest(request, url, {
      authVerifier: acceptingVerifier,
      writer,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, environmentId: VALID_ID });
    expect(writes).toEqual([{ userId: "user_test", environmentId: VALID_ID }]);
  });

  it("returns 409 when claimEnvironmentOwner reports a collision", async () => {
    const writer: PairingWriter = { addEnvironmentId: async () => ({ ok: true }) };
    const { request, url } = makePostRequest({ environmentId: VALID_ID });
    const response = await handlePairingRequest(request, url, {
      authVerifier: acceptingVerifier,
      writer,
      claimEnvironmentOwner: async () => ({
        ok: false,
        status: 409,
        reason: "environment already claimed",
      }),
    });
    expect(response.status).toBe(409);
  });

  it("does not call the writer when the claim check fails", async () => {
    let writes = 0;
    const writer: PairingWriter = {
      addEnvironmentId: async () => {
        writes += 1;
        return { ok: true };
      },
    };
    const { request, url } = makePostRequest({ environmentId: VALID_ID });
    await handlePairingRequest(request, url, {
      authVerifier: acceptingVerifier,
      writer,
      claimEnvironmentOwner: async () => ({
        ok: false,
        status: 409,
        reason: "taken",
      }),
    });
    expect(writes).toBe(0);
  });

  it("502s when the upstream write fails", async () => {
    const writer: PairingWriter = {
      addEnvironmentId: async () => ({ ok: false, status: 502, reason: "boom" }),
    };
    const { request, url } = makePostRequest({ environmentId: VALID_ID });
    const response = await handlePairingRequest(request, url, {
      authVerifier: acceptingVerifier,
      writer,
    });
    expect(response.status).toBe(502);
  });
});

describe("makeWorkOsPairingWriter", () => {
  it("appends environmentId to existing metadata", async () => {
    let lastWrite: Record<string, unknown> | null = null;
    const writer = makeWorkOsPairingWriter({
      apiKey: "sk_test_x",
      fetchMetadata: async () => ({ otherField: "preserved", environmentIds: ["existing12"] }),
      putMetadata: async (_userId, metadata) => {
        lastWrite = metadata;
      },
    });
    const result = await writer.addEnvironmentId("user_x", VALID_ID);
    expect(result.ok).toBe(true);
    expect(lastWrite).toEqual({
      otherField: "preserved",
      environmentIds: ["existing12", VALID_ID],
    });
  });

  it("is idempotent — does not duplicate an environmentId", async () => {
    let lastWrite: Record<string, unknown> | null = null;
    const writer = makeWorkOsPairingWriter({
      apiKey: "sk_test_x",
      fetchMetadata: async () => ({ environmentIds: [VALID_ID] }),
      putMetadata: async (_userId, metadata) => {
        lastWrite = metadata;
      },
    });
    const result = await writer.addEnvironmentId("user_x", VALID_ID);
    expect(result.ok).toBe(true);
    expect(lastWrite).toEqual({ environmentIds: [VALID_ID] });
  });

  it("returns 503 when the read step fails", async () => {
    const writer = makeWorkOsPairingWriter({
      apiKey: "sk_test_x",
      fetchMetadata: async () => {
        throw new Error("upstream down");
      },
      putMetadata: async () => undefined,
    });
    const result = await writer.addEnvironmentId("user_x", VALID_ID);
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
    const result = await writer.addEnvironmentId("user_x", VALID_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(502);
  });
});
