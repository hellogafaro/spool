import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClientAuthVerifier } from "./auth.ts";
import { handleSavedEnvRequest, type SavedEnvHandlerOptions } from "./saved-env.ts";

const acceptingVerifier: ClientAuthVerifier = async () => ({
  ok: true,
  auth: { userId: "user_test", payload: { sub: "user_test" } },
});

const rejectingVerifier: ClientAuthVerifier = async () => ({
  ok: false,
  status: 401,
  reason: "no token",
});

const ENV_ID = "ABCDEFGHJK23";
const ENV_URL = "https://t3.example.com";
const LABEL = "Laptop";
const BEARER = "bearer-test-token";

interface VaultStub {
  readonly id: string;
  name: string;
  value: string;
  key_context: { owner: string; environmentUrl: string; label: string };
}

function makeVaultStore(initial: ReadonlyArray<VaultStub> = []): {
  readonly entries: VaultStub[];
  readonly fetchSpy: typeof globalThis.fetch;
} {
  const entries: VaultStub[] = initial.map((entry) => ({ ...entry }));
  let nextId = entries.length + 1;

  const fetchSpy = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request =
      input instanceof Request
        ? input
        : new Request(typeof input === "string" ? input : input.toString(), init);
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/vault/v1/kv")) {
      return new Response("not stubbed", { status: 500 });
    }

    if (request.method === "POST" && url.pathname === "/vault/v1/kv") {
      const body = (await request.json()) as VaultStub;
      const existing = entries.find((entry) => entry.name === body.name);
      if (existing) {
        existing.value = body.value;
        existing.key_context = body.key_context;
        return Response.json(existing);
      }
      const created: VaultStub = {
        id: `vault_${nextId++}`,
        name: body.name,
        value: body.value,
        key_context: body.key_context,
      };
      entries.push(created);
      return Response.json(created);
    }

    if (request.method === "GET" && url.pathname.startsWith("/vault/v1/kv/name/")) {
      const name = decodeURIComponent(url.pathname.replace("/vault/v1/kv/name/", ""));
      const found = entries.find((entry) => entry.name === name);
      return found ? Response.json(found) : new Response("not found", { status: 404 });
    }

    if (request.method === "GET" && url.pathname === "/vault/v1/kv") {
      return Response.json({ data: entries, list_metadata: {} });
    }

    if (request.method === "DELETE" && url.pathname.startsWith("/vault/v1/kv/")) {
      const id = decodeURIComponent(url.pathname.replace("/vault/v1/kv/", ""));
      const index = entries.findIndex((entry) => entry.id === id);
      if (index >= 0) entries.splice(index, 1);
      return new Response(null, { status: 204 });
    }

    return new Response("not stubbed", { status: 500 });
  }) as typeof globalThis.fetch;

  return { entries, fetchSpy };
}

function makeRequest(
  method: string,
  pathname: string,
  body?: unknown,
): { request: Request; url: URL } {
  const url = new URL(`https://api.test.local${pathname}`);
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers = { "content-type": "application/json" };
  }
  return { request: new Request(url.toString(), init), url };
}

function makeOptions(verifier: ClientAuthVerifier = acceptingVerifier): SavedEnvHandlerOptions {
  return { authVerifier: verifier, workosApiKey: "sk_test_x" };
}

let originalFetch: typeof globalThis.fetch;

describe("handleSavedEnvRequest", () => {
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns 401 when auth fails", async () => {
    const { request, url } = makeRequest("GET", "/env");
    const response = await handleSavedEnvRequest(request, url, makeOptions(rejectingVerifier));
    expect(response.status).toBe(401);
  });

  it("405s on unknown methods on /env", async () => {
    const { request, url } = makeRequest("PUT", "/env");
    const response = await handleSavedEnvRequest(request, url, makeOptions());
    expect(response.status).toBe(405);
  });

  it("OPTIONS preflight returns 204 with CORS", async () => {
    const { request, url } = makeRequest("OPTIONS", "/env");
    const response = await handleSavedEnvRequest(request, url, makeOptions());
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-methods")).toContain("POST");
  });

  describe("POST /env", () => {
    it("creates a Vault entry and returns the public record", async () => {
      const { entries, fetchSpy } = makeVaultStore();
      globalThis.fetch = fetchSpy;
      const { request, url } = makeRequest("POST", "/env", {
        environmentUrl: ENV_URL,
        environmentId: ENV_ID,
        label: LABEL,
        bearer: BEARER,
      });
      const response = await handleSavedEnvRequest(request, url, makeOptions());
      expect(response.status).toBe(201);
      expect(await response.json()).toEqual({
        environmentId: ENV_ID,
        label: LABEL,
        environmentUrl: ENV_URL,
      });
      expect(entries).toHaveLength(1);
      expect(entries[0]?.name).toBe(`env-user_test-${ENV_ID}`);
      expect(entries[0]?.value).toBe(BEARER);
      expect(entries[0]?.key_context).toEqual({
        owner: "user_test",
        environmentUrl: ENV_URL,
        label: LABEL,
      });
    });

    it("400s on missing fields", async () => {
      const { fetchSpy } = makeVaultStore();
      globalThis.fetch = fetchSpy;
      const cases: Array<Record<string, unknown>> = [
        {},
        { environmentUrl: ENV_URL, environmentId: ENV_ID, label: LABEL },
        { environmentUrl: ENV_URL, environmentId: "", label: LABEL, bearer: BEARER },
        { environmentUrl: "", environmentId: ENV_ID, label: LABEL, bearer: BEARER },
      ];
      for (const body of cases) {
        const { request, url } = makeRequest("POST", "/env", body);
        const response = await handleSavedEnvRequest(request, url, makeOptions());
        expect(response.status).toBe(400);
      }
    });

    it("400s on http:// URL to non-localhost", async () => {
      const { fetchSpy } = makeVaultStore();
      globalThis.fetch = fetchSpy;
      const { request, url } = makeRequest("POST", "/env", {
        environmentUrl: "http://t3.example.com",
        environmentId: ENV_ID,
        label: LABEL,
        bearer: BEARER,
      });
      const response = await handleSavedEnvRequest(request, url, makeOptions());
      expect(response.status).toBe(400);
    });

    it("accepts http://localhost URLs", async () => {
      const { fetchSpy } = makeVaultStore();
      globalThis.fetch = fetchSpy;
      const { request, url } = makeRequest("POST", "/env", {
        environmentUrl: "http://localhost:3773",
        environmentId: ENV_ID,
        label: LABEL,
        bearer: BEARER,
      });
      const response = await handleSavedEnvRequest(request, url, makeOptions());
      expect(response.status).toBe(201);
    });
  });

  describe("GET /env", () => {
    it("lists only the user's envs and omits bearers", async () => {
      const { fetchSpy } = makeVaultStore([
        {
          id: "vault_1",
          name: `env-user_test-${ENV_ID}`,
          value: BEARER,
          key_context: { owner: "user_test", environmentUrl: ENV_URL, label: LABEL },
        },
        {
          id: "vault_2",
          name: "env-user_other-XYZAAAAAAAAA",
          value: "other-bearer",
          key_context: {
            owner: "user_other",
            environmentUrl: "https://other.example.com",
            label: "Other",
          },
        },
      ]);
      globalThis.fetch = fetchSpy;
      const { request, url } = makeRequest("GET", "/env");
      const response = await handleSavedEnvRequest(request, url, makeOptions());
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual([
        { environmentId: ENV_ID, label: LABEL, environmentUrl: ENV_URL },
      ]);
    });

    it("returns empty list when user has none", async () => {
      const { fetchSpy } = makeVaultStore();
      globalThis.fetch = fetchSpy;
      const { request, url } = makeRequest("GET", "/env");
      const response = await handleSavedEnvRequest(request, url, makeOptions());
      expect(await response.json()).toEqual([]);
    });
  });

  describe("GET /env/<id>", () => {
    it("returns the full record including the bearer for the owner", async () => {
      const { fetchSpy } = makeVaultStore([
        {
          id: "vault_1",
          name: `env-user_test-${ENV_ID}`,
          value: BEARER,
          key_context: { owner: "user_test", environmentUrl: ENV_URL, label: LABEL },
        },
      ]);
      globalThis.fetch = fetchSpy;
      const { request, url } = makeRequest("GET", `/env/${ENV_ID}`);
      const response = await handleSavedEnvRequest(request, url, makeOptions());
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        environmentId: ENV_ID,
        label: LABEL,
        environmentUrl: ENV_URL,
        bearer: BEARER,
      });
    });

    it("404s when the env doesn't belong to this user", async () => {
      const { fetchSpy } = makeVaultStore([
        {
          id: "vault_1",
          name: "env-user_other-OTHERIDXXXXX",
          value: "x",
          key_context: { owner: "user_other", environmentUrl: ENV_URL, label: LABEL },
        },
      ]);
      globalThis.fetch = fetchSpy;
      const { request, url } = makeRequest("GET", "/env/OTHERIDXXXXX");
      const response = await handleSavedEnvRequest(request, url, makeOptions());
      expect(response.status).toBe(404);
    });

    it("403s when key_context.owner doesn't match the JWT subject", async () => {
      const { fetchSpy } = makeVaultStore([
        {
          id: "vault_1",
          name: `env-user_test-${ENV_ID}`,
          value: BEARER,
          key_context: { owner: "user_other", environmentUrl: ENV_URL, label: LABEL },
        },
      ]);
      globalThis.fetch = fetchSpy;
      const { request, url } = makeRequest("GET", `/env/${ENV_ID}`);
      const response = await handleSavedEnvRequest(request, url, makeOptions());
      expect(response.status).toBe(403);
    });
  });

  describe("PATCH /env/<id>", () => {
    it("updates the label and returns the public record", async () => {
      const { entries, fetchSpy } = makeVaultStore([
        {
          id: "vault_1",
          name: `env-user_test-${ENV_ID}`,
          value: BEARER,
          key_context: { owner: "user_test", environmentUrl: ENV_URL, label: "Old" },
        },
      ]);
      globalThis.fetch = fetchSpy;
      const { request, url } = makeRequest("PATCH", `/env/${ENV_ID}`, { label: "New" });
      const response = await handleSavedEnvRequest(request, url, makeOptions());
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        environmentId: ENV_ID,
        label: "New",
        environmentUrl: ENV_URL,
      });
      expect(entries[0]?.key_context.label).toBe("New");
    });

    it("404s when the env doesn't exist", async () => {
      const { fetchSpy } = makeVaultStore();
      globalThis.fetch = fetchSpy;
      const { request, url } = makeRequest("PATCH", `/env/${ENV_ID}`, { label: "New" });
      const response = await handleSavedEnvRequest(request, url, makeOptions());
      expect(response.status).toBe(404);
    });

    it("403s when ownership doesn't match", async () => {
      const { fetchSpy } = makeVaultStore([
        {
          id: "vault_1",
          name: `env-user_test-${ENV_ID}`,
          value: BEARER,
          key_context: { owner: "user_other", environmentUrl: ENV_URL, label: LABEL },
        },
      ]);
      globalThis.fetch = fetchSpy;
      const { request, url } = makeRequest("PATCH", `/env/${ENV_ID}`, { label: "New" });
      const response = await handleSavedEnvRequest(request, url, makeOptions());
      expect(response.status).toBe(403);
    });
  });

  describe("DELETE /env/<id>", () => {
    it("removes the entry and returns 204", async () => {
      const { entries, fetchSpy } = makeVaultStore([
        {
          id: "vault_1",
          name: `env-user_test-${ENV_ID}`,
          value: BEARER,
          key_context: { owner: "user_test", environmentUrl: ENV_URL, label: LABEL },
        },
      ]);
      globalThis.fetch = fetchSpy;
      const { request, url } = makeRequest("DELETE", `/env/${ENV_ID}`);
      const response = await handleSavedEnvRequest(request, url, makeOptions());
      expect(response.status).toBe(204);
      expect(entries).toHaveLength(0);
    });

    it("204s idempotently when the entry is already gone", async () => {
      const { fetchSpy } = makeVaultStore();
      globalThis.fetch = fetchSpy;
      const { request, url } = makeRequest("DELETE", `/env/${ENV_ID}`);
      const response = await handleSavedEnvRequest(request, url, makeOptions());
      expect(response.status).toBe(204);
    });

    it("403s when ownership doesn't match", async () => {
      const { fetchSpy } = makeVaultStore([
        {
          id: "vault_1",
          name: `env-user_test-${ENV_ID}`,
          value: BEARER,
          key_context: { owner: "user_other", environmentUrl: ENV_URL, label: LABEL },
        },
      ]);
      globalThis.fetch = fetchSpy;
      const { request, url } = makeRequest("DELETE", `/env/${ENV_ID}`);
      const response = await handleSavedEnvRequest(request, url, makeOptions());
      expect(response.status).toBe(403);
    });
  });
});
