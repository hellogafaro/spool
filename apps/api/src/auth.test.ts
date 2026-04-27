import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { makeWorkOsBrowserAuthVerifier, presenceOnlyBrowserAuthVerifier } from "./auth.ts";

async function makeTestSetup() {
  const { publicKey, privateKey } = await generateKeyPair("RS256", { extractable: true });
  const jwk = await exportJWK(publicKey);
  jwk.kid = "test-key";
  jwk.alg = "RS256";
  jwk.use = "sig";

  const clientId = "client_test";
  const jwksUrl = new URL(`https://api.workos.com/sso/jwks/${clientId}`);

  const fetchSpy = async (input: RequestInfo | URL): Promise<Response> => {
    const requestUrl =
      input instanceof Request ? new URL(input.url) : input instanceof URL ? input : new URL(input);
    if (requestUrl.toString() === jwksUrl.toString()) {
      return Response.json({ keys: [jwk] });
    }
    return new Response("not stubbed", { status: 500 });
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetchSpy as typeof globalThis.fetch;

  const restore = () => {
    globalThis.fetch = originalFetch;
  };

  const sign = (payload: Record<string, unknown>) =>
    new SignJWT(payload)
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setIssuer(`https://api.workos.com/user_management/${clientId}`)
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(privateKey);

  return { clientId, sign, restore };
}

function makeRequest(
  headers: Record<string, string>,
  queryToken?: string,
): { request: Request; url: URL } {
  const url = new URL("https://api.test.local/ws?serverId=abc");
  if (queryToken) url.searchParams.set("token", queryToken);
  return { request: new Request(url.toString(), { headers }), url };
}

describe("presenceOnlyBrowserAuthVerifier", () => {
  it("rejects when no token present", async () => {
    const { request, url } = makeRequest({});
    const result = await presenceOnlyBrowserAuthVerifier(request, url);
    expect(result.ok).toBe(false);
  });

  it("accepts any non-empty bearer header", async () => {
    const { request, url } = makeRequest({ authorization: "Bearer xyz" });
    const result = await presenceOnlyBrowserAuthVerifier(request, url);
    expect(result.ok).toBe(true);
  });

  it("accepts query-string token", async () => {
    const { request, url } = makeRequest({}, "qstoken");
    const result = await presenceOnlyBrowserAuthVerifier(request, url);
    expect(result.ok).toBe(true);
  });
});

describe("makeWorkOsBrowserAuthVerifier", () => {
  it("verifies a valid signed token from WorkOS JWKS", async () => {
    const { clientId, sign, restore } = await makeTestSetup();
    try {
      const verifier = makeWorkOsBrowserAuthVerifier(clientId);
      const token = await sign({ sub: "user_abc", email: "user@trunk.codes" });
      const { request, url } = makeRequest({ authorization: `Bearer ${token}` });
      const result = await verifier(request, url);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.auth.userId).toBe("user_abc");
      }
    } finally {
      restore();
    }
  });

  it("rejects an unsigned/garbage token", async () => {
    const { clientId, restore } = await makeTestSetup();
    try {
      const verifier = makeWorkOsBrowserAuthVerifier(clientId);
      const { request, url } = makeRequest({ authorization: "Bearer not-a-jwt" });
      const result = await verifier(request, url);
      expect(result.ok).toBe(false);
    } finally {
      restore();
    }
  });

  it("rejects when bearer is missing entirely", async () => {
    const { clientId, restore } = await makeTestSetup();
    try {
      const verifier = makeWorkOsBrowserAuthVerifier(clientId);
      const { request, url } = makeRequest({});
      const result = await verifier(request, url);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.status).toBe(401);
    } finally {
      restore();
    }
  });

  it("rejects token with wrong issuer", async () => {
    const { clientId, restore } = await makeTestSetup();
    try {
      const verifier = makeWorkOsBrowserAuthVerifier(clientId);
      const wrong = await new SignJWT({ sub: "user_abc" })
        .setProtectedHeader({ alg: "RS256", kid: "test-key" })
        .setIssuer("https://attacker.example.com")
        .setIssuedAt()
        .setExpirationTime("1h")
        .sign((await generateKeyPair("RS256", { extractable: true })).privateKey);
      const { request, url } = makeRequest({ authorization: `Bearer ${wrong}` });
      const result = await verifier(request, url);
      expect(result.ok).toBe(false);
    } finally {
      restore();
    }
  });

  // Sec-WebSocket-Protocol fallback is exercised in workerd (real browsers
  // set it via the WebSocket constructor's protocols argument). Skipped
  // here because the Request constructor in undici strips Sec-* headers.
});
