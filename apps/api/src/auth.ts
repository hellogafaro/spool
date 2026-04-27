import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyResult } from "jose";

const JWKS_CACHE = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJwks(clientId: string): ReturnType<typeof createRemoteJWKSet> {
  let jwks = JWKS_CACHE.get(clientId);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`https://api.workos.com/sso/jwks/${clientId}`));
    JWKS_CACHE.set(clientId, jwks);
  }
  return jwks;
}

export interface VerifiedClientAuth {
  readonly userId: string;
  readonly payload: JWTPayload;
}

export type ClientAuthResult =
  | { readonly ok: true; readonly auth: VerifiedClientAuth }
  | { readonly ok: false; readonly status: 401 | 503; readonly reason: string };

export interface ClientAuthVerifier {
  (request: Request, url: URL): Promise<ClientAuthResult>;
}

function readBearer(request: Request, url: URL): string | null {
  const header = request.headers.get("authorization");
  if (header) {
    const match = header.match(/^Bearer\s+(.+)$/i);
    if (match?.[1]) return match[1].trim();
  }
  const queryToken = url.searchParams.get("token")?.trim();
  if (queryToken) return queryToken;
  const protocol = request.headers.get("sec-websocket-protocol");
  if (protocol) {
    const tokenEntry = protocol
      .split(",")
      .map((part) => part.trim())
      .find((part) => part.startsWith("trunk-token."));
    if (tokenEntry) return tokenEntry.slice("trunk-token.".length);
  }
  return null;
}

export function makeWorkOsClientAuthVerifier(clientId: string): ClientAuthVerifier {
  return async (request, url) => {
    const token = readBearer(request, url);
    if (!token) {
      return { ok: false, status: 401, reason: "missing bearer token" };
    }

    let result: JWTVerifyResult<JWTPayload>;
    try {
      result = await jwtVerify(token, getJwks(clientId), {
        issuer: `https://api.workos.com/user_management/${clientId}`,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "verification failed";
      return { ok: false, status: 401, reason };
    }

    const userId = typeof result.payload.sub === "string" ? result.payload.sub : null;
    if (!userId) {
      return { ok: false, status: 401, reason: "token has no subject" };
    }

    return { ok: true, auth: { userId, payload: result.payload } };
  };
}

export const presenceOnlyClientAuthVerifier: ClientAuthVerifier = async (request, url) => {
  const token = readBearer(request, url);
  if (!token) {
    return { ok: false, status: 401, reason: "missing bearer token" };
  }
  return { ok: true, auth: { userId: "presence-only", payload: { sub: "presence-only" } } };
};
