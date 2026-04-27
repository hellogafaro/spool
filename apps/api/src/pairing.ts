import type { BrowserAuthVerifier } from "./auth.ts";
import { getWorkOsUserMetadata, putWorkOsUserMetadata, getEnvironmentIds } from "./workos.ts";

export type PairingWriteResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly status: 502 | 503; readonly reason: string };

export interface PairingWriter {
  addEnvironmentId(userId: string, environmentId: string): Promise<PairingWriteResult>;
  removeEnvironmentId(userId: string, environmentId: string): Promise<PairingWriteResult>;
}

interface WorkOsPairingWriterOptions {
  readonly apiKey: string;
  readonly getMetadata?: (userId: string) => Promise<Record<string, unknown> | null>;
  readonly putMetadata?: (userId: string, metadata: Record<string, unknown>) => Promise<void>;
}

export function makeWorkOsPairingWriter(options: WorkOsPairingWriterOptions): PairingWriter {
  const getMetadata =
    options.getMetadata ?? ((userId) => getWorkOsUserMetadata(options.apiKey, userId));
  const putMetadata =
    options.putMetadata ??
    ((userId, metadata) => putWorkOsUserMetadata(options.apiKey, userId, metadata));

  const writeUpdatedIds = async (
    userId: string,
    update: (current: string[]) => string[],
  ): Promise<PairingWriteResult> => {
    let existing: Record<string, unknown> | null;
    try {
      existing = await getMetadata(userId);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "metadata fetch failed";
      return { ok: false, status: 503, reason };
    }
    const next = { ...(existing ?? {}), environmentIds: update(getEnvironmentIds(existing)) };
    try {
      await putMetadata(userId, next);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "metadata write failed";
      return { ok: false, status: 502, reason };
    }
    return { ok: true };
  };

  return {
    addEnvironmentId: (userId, environmentId) =>
      writeUpdatedIds(userId, (current) =>
        current.includes(environmentId) ? current : [...current, environmentId],
      ),
    removeEnvironmentId: (userId, environmentId) =>
      writeUpdatedIds(userId, (current) => current.filter((entry) => entry !== environmentId)),
  };
}

export interface PairingRequestBody {
  readonly environmentId: string;
  readonly token: string;
}

const ENVIRONMENT_ID_PATTERN = /^[A-Z0-9]{12}$/;
// Environment secret is 32 random bytes hex-encoded by the CLI. Bound the
// accepted size so a malicious payload can't waste DO storage comparisons.
const PAIR_TOKEN_MAX_LENGTH = 256;

function parsePairingBody(raw: unknown): PairingRequestBody | null {
  if (!raw || typeof raw !== "object") return null;
  const body = raw as { environmentId?: unknown; token?: unknown };
  if (typeof body.environmentId !== "string") return null;
  if (!ENVIRONMENT_ID_PATTERN.test(body.environmentId)) return null;
  if (typeof body.token !== "string") return null;
  const token = body.token.trim();
  if (token.length === 0 || token.length > PAIR_TOKEN_MAX_LENGTH) return null;
  return { environmentId: body.environmentId, token };
}

export type ClaimEnvironmentOwnerResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly status: 401 | 409 | 502; readonly reason: string };

export type ClaimEnvironmentOwner = (
  environmentId: string,
  userId: string,
  token: string,
) => Promise<ClaimEnvironmentOwnerResult>;

export type ReleaseEnvironmentOwnerResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly status: 502; readonly reason: string };

export type ReleaseEnvironmentOwner = (
  environmentId: string,
  userId: string,
) => Promise<ReleaseEnvironmentOwnerResult>;

export interface PairingHandlerOptions {
  readonly authVerifier: BrowserAuthVerifier;
  readonly writer: PairingWriter;
  readonly claimEnvironmentOwner: ClaimEnvironmentOwner;
  readonly releaseEnvironmentOwner: ReleaseEnvironmentOwner;
}

const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-max-age": "86400",
};

function withCors(response: Response): Response {
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}

export async function handlePairingRequest(
  request: Request,
  url: URL,
  options: PairingHandlerOptions,
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return withCors(new Response(null, { status: 204 }));
  }

  if (request.method === "DELETE") {
    return handleDelete(request, url, options);
  }

  if (request.method !== "POST") {
    return withCors(
      new Response("method not allowed\n", {
        status: 405,
        headers: { allow: "POST, DELETE, OPTIONS" },
      }),
    );
  }

  const auth = await options.authVerifier(request, url);
  if (!auth.ok) {
    return withCors(new Response(`${auth.reason}\n`, { status: auth.status }));
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return withCors(new Response("invalid json body\n", { status: 400 }));
  }

  const body = parsePairingBody(raw);
  if (!body) {
    return withCors(new Response("environmentId required\n", { status: 400 }));
  }

  const claim = await options.claimEnvironmentOwner(
    body.environmentId,
    auth.auth.userId,
    body.token,
  );
  if (!claim.ok) {
    return withCors(new Response(`${claim.reason}\n`, { status: claim.status }));
  }

  const result = await options.writer.addEnvironmentId(auth.auth.userId, body.environmentId);
  if (!result.ok) {
    // Best-effort: roll back the DO claim so the env isn't permanently locked
    // to a user whose metadata write failed.
    await options.releaseEnvironmentOwner(body.environmentId, auth.auth.userId).catch(() => {});
    return withCors(new Response(`${result.reason}\n`, { status: result.status }));
  }

  return withCors(Response.json({ ok: true, environmentId: body.environmentId }));
}

async function handleDelete(
  request: Request,
  url: URL,
  options: PairingHandlerOptions,
): Promise<Response> {
  const auth = await options.authVerifier(request, url);
  if (!auth.ok) {
    return withCors(new Response(`${auth.reason}\n`, { status: auth.status }));
  }

  const environmentId = url.searchParams.get("environmentId")?.trim();
  if (!environmentId || !ENVIRONMENT_ID_PATTERN.test(environmentId)) {
    return withCors(new Response("environmentId required\n", { status: 400 }));
  }

  const removeResult = await options.writer.removeEnvironmentId(auth.auth.userId, environmentId);
  if (!removeResult.ok) {
    return withCors(new Response(`${removeResult.reason}\n`, { status: removeResult.status }));
  }

  const release = await options.releaseEnvironmentOwner(environmentId, auth.auth.userId);
  if (!release.ok) {
    return withCors(new Response(`${release.reason}\n`, { status: release.status }));
  }

  return withCors(Response.json({ ok: true, environmentId }));
}
