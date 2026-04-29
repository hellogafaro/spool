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
  metadata: {
    context: { owner: string };
  };
}

interface UserStub {
  metadata: Record<string, unknown>;
}

function makeStores(
  input: {
    readonly vault?: ReadonlyArray<VaultStub>;
    readonly users?: Record<string, UserStub>;
  } = {},
): {
  readonly vault: VaultStub[];
  readonly users: Record<string, UserStub>;
  readonly fetchSpy: typeof globalThis.fetch;
} {
  const vault: VaultStub[] = (input.vault ?? []).map((entry) => structuredClone(entry));
  const users: Record<string, UserStub> = { ...input.users };
  let nextId = vault.length + 1;

  const fetchSpy = (async (rawInput: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request =
      rawInput instanceof Request
        ? rawInput
        : new Request(typeof rawInput === "string" ? rawInput : rawInput.toString(), init);
    const url = new URL(request.url);

    if (url.pathname.startsWith("/vault/v1/kv")) {
      if (request.method === "POST" && url.pathname === "/vault/v1/kv") {
        const body = (await request.json()) as {
          name: string;
          value: string;
          key_context: { owner: string };
        };
        const created: VaultStub = {
          id: `vault_${nextId++}`,
          name: body.name,
          value: body.value,
          metadata: { context: body.key_context },
        };
        vault.push(created);
        return Response.json({ id: created.id, context: created.metadata.context });
      }
      if (request.method === "GET" && url.pathname.startsWith("/vault/v1/kv/")) {
        const id = decodeURIComponent(url.pathname.replace("/vault/v1/kv/", ""));
        const found = vault.find((entry) => entry.id === id);
        return found ? Response.json(found) : new Response("not found", { status: 404 });
      }
      if (request.method === "PUT" && url.pathname.startsWith("/vault/v1/kv/")) {
        const id = decodeURIComponent(url.pathname.replace("/vault/v1/kv/", ""));
        const found = vault.find((entry) => entry.id === id);
        if (!found) return new Response("not found", { status: 404 });
        const body = (await request.json()) as { value: string };
        found.value = body.value;
        return Response.json(found);
      }
      if (request.method === "DELETE" && url.pathname.startsWith("/vault/v1/kv/")) {
        const id = decodeURIComponent(url.pathname.replace("/vault/v1/kv/", ""));
        const index = vault.findIndex((entry) => entry.id === id);
        if (index >= 0) vault.splice(index, 1);
        return new Response(null, { status: 204 });
      }
      return new Response("not stubbed", { status: 500 });
    }

    if (url.pathname.startsWith("/user_management/users/")) {
      const userId = decodeURIComponent(url.pathname.replace("/user_management/users/", ""));
      if (request.method === "GET") {
        const user = users[userId] ?? { metadata: {} };
        return Response.json({ metadata: user.metadata });
      }
      if (request.method === "PUT") {
        const body = (await request.json()) as { metadata: Record<string, unknown> };
        users[userId] = { metadata: body.metadata };
        return Response.json({ metadata: body.metadata });
      }
      return new Response("not stubbed", { status: 500 });
    }

    return new Response("not stubbed", { status: 500 });
  }) as typeof globalThis.fetch;

  return { vault, users, fetchSpy };
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

function metadataSavedEnvs(users: Record<string, UserStub>, userId: string): unknown {
  const raw = users[userId]?.metadata.savedEnvs;
  if (typeof raw !== "string") return null;
  return JSON.parse(raw);
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
    it("writes the bearer to vault and the env list to user metadata", async () => {
      const { vault, users, fetchSpy } = makeStores();
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
      expect(vault).toHaveLength(1);
      expect(vault[0]?.name).toMatch(/^env-[0-9a-f-]+$/);
      expect(vault[0]?.name).not.toContain("user_test");
      expect(vault[0]?.name).not.toContain(ENV_ID);
      expect(vault[0]?.value).toBe(BEARER);
      expect(vault[0]?.metadata.context).toEqual({ owner: "user_test" });
      expect(metadataSavedEnvs(users, "user_test")).toEqual([
        { environmentId: ENV_ID, environmentUrl: ENV_URL, label: LABEL, vaultObjectId: "vault_1" },
      ]);
    });

    it("updates the existing vault object when the env is paired again", async () => {
      const { vault, users, fetchSpy } = makeStores({
        vault: [
          {
            id: "vault_1",
            name: "env-vault_1",
            value: "old-bearer",
            metadata: { context: { owner: "user_test" } },
          },
        ],
        users: {
          user_test: {
            metadata: {
              savedEnvs: JSON.stringify([
                {
                  environmentId: ENV_ID,
                  environmentUrl: ENV_URL,
                  label: "Old",
                  vaultObjectId: "vault_1",
                },
              ]),
            },
          },
        },
      });
      globalThis.fetch = fetchSpy;
      const { request, url } = makeRequest("POST", "/env", {
        environmentUrl: ENV_URL,
        environmentId: ENV_ID,
        label: LABEL,
        bearer: BEARER,
      });
      const response = await handleSavedEnvRequest(request, url, makeOptions());
      expect(response.status).toBe(201);
      expect(vault).toHaveLength(1);
      expect(vault[0]?.value).toBe(BEARER);
      expect(metadataSavedEnvs(users, "user_test")).toEqual([
        { environmentId: ENV_ID, environmentUrl: ENV_URL, label: LABEL, vaultObjectId: "vault_1" },
      ]);
    });

    it("400s on missing fields", async () => {
      const { fetchSpy } = makeStores();
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
      const { fetchSpy } = makeStores();
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
      const { fetchSpy } = makeStores();
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
    it("lists envs from user metadata", async () => {
      const { fetchSpy } = makeStores({
        users: {
          user_test: {
            metadata: {
              savedEnvs: JSON.stringify([
                {
                  environmentId: ENV_ID,
                  environmentUrl: ENV_URL,
                  label: LABEL,
                  vaultObjectId: "vault_1",
                },
              ]),
            },
          },
        },
      });
      globalThis.fetch = fetchSpy;
      const { request, url } = makeRequest("GET", "/env");
      const response = await handleSavedEnvRequest(request, url, makeOptions());
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual([
        { environmentId: ENV_ID, label: LABEL, environmentUrl: ENV_URL },
      ]);
    });

    it("returns empty list when user has none", async () => {
      const { fetchSpy } = makeStores();
      globalThis.fetch = fetchSpy;
      const { request, url } = makeRequest("GET", "/env");
      const response = await handleSavedEnvRequest(request, url, makeOptions());
      expect(await response.json()).toEqual([]);
    });
  });

  describe("GET /env/<id>", () => {
    it("returns the full record including the bearer for the owner", async () => {
      const { fetchSpy } = makeStores({
        vault: [
          {
            id: "vault_1",
            name: "env-vault_1",
            value: BEARER,
            metadata: { context: { owner: "user_test" } },
          },
        ],
        users: {
          user_test: {
            metadata: {
              savedEnvs: JSON.stringify([
                {
                  environmentId: ENV_ID,
                  environmentUrl: ENV_URL,
                  label: LABEL,
                  vaultObjectId: "vault_1",
                },
              ]),
            },
          },
        },
      });
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

    it("404s when the env is not in the user's metadata", async () => {
      const { fetchSpy } = makeStores();
      globalThis.fetch = fetchSpy;
      const { request, url } = makeRequest("GET", `/env/${ENV_ID}`);
      const response = await handleSavedEnvRequest(request, url, makeOptions());
      expect(response.status).toBe(404);
    });

    it("403s when Vault owner context doesn't match the JWT subject", async () => {
      const { fetchSpy } = makeStores({
        vault: [
          {
            id: "vault_1",
            name: "env-vault_1",
            value: BEARER,
            metadata: { context: { owner: "user_other" } },
          },
        ],
        users: {
          user_test: {
            metadata: {
              savedEnvs: JSON.stringify([
                {
                  environmentId: ENV_ID,
                  environmentUrl: ENV_URL,
                  label: LABEL,
                  vaultObjectId: "vault_1",
                },
              ]),
            },
          },
        },
      });
      globalThis.fetch = fetchSpy;
      const { request, url } = makeRequest("GET", `/env/${ENV_ID}`);
      const response = await handleSavedEnvRequest(request, url, makeOptions());
      expect(response.status).toBe(403);
    });
  });

  describe("PATCH /env/<id>", () => {
    it("updates the label in user metadata and returns the public record", async () => {
      const { users, fetchSpy } = makeStores({
        users: {
          user_test: {
            metadata: {
              savedEnvs: JSON.stringify([
                {
                  environmentId: ENV_ID,
                  environmentUrl: ENV_URL,
                  label: "Old",
                  vaultObjectId: "vault_1",
                },
              ]),
            },
          },
        },
      });
      globalThis.fetch = fetchSpy;
      const { request, url } = makeRequest("PATCH", `/env/${ENV_ID}`, { label: "New" });
      const response = await handleSavedEnvRequest(request, url, makeOptions());
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        environmentId: ENV_ID,
        label: "New",
        environmentUrl: ENV_URL,
      });
      expect(metadataSavedEnvs(users, "user_test")).toEqual([
        { environmentId: ENV_ID, environmentUrl: ENV_URL, label: "New", vaultObjectId: "vault_1" },
      ]);
    });

    it("404s when the env doesn't exist", async () => {
      const { fetchSpy } = makeStores();
      globalThis.fetch = fetchSpy;
      const { request, url } = makeRequest("PATCH", `/env/${ENV_ID}`, { label: "New" });
      const response = await handleSavedEnvRequest(request, url, makeOptions());
      expect(response.status).toBe(404);
    });
  });

  describe("DELETE /env/<id>", () => {
    it("removes both the vault entry and the metadata entry", async () => {
      const { vault, users, fetchSpy } = makeStores({
        vault: [
          {
            id: "vault_1",
            name: "env-vault_1",
            value: BEARER,
            metadata: { context: { owner: "user_test" } },
          },
        ],
        users: {
          user_test: {
            metadata: {
              savedEnvs: JSON.stringify([
                {
                  environmentId: ENV_ID,
                  environmentUrl: ENV_URL,
                  label: LABEL,
                  vaultObjectId: "vault_1",
                },
              ]),
            },
          },
        },
      });
      globalThis.fetch = fetchSpy;
      const { request, url } = makeRequest("DELETE", `/env/${ENV_ID}`);
      const response = await handleSavedEnvRequest(request, url, makeOptions());
      expect(response.status).toBe(204);
      expect(vault).toHaveLength(0);
      expect(metadataSavedEnvs(users, "user_test")).toEqual([]);
    });

    it("204s idempotently when the env is already gone", async () => {
      const { fetchSpy } = makeStores();
      globalThis.fetch = fetchSpy;
      const { request, url } = makeRequest("DELETE", `/env/${ENV_ID}`);
      const response = await handleSavedEnvRequest(request, url, makeOptions());
      expect(response.status).toBe(204);
    });
  });
});
