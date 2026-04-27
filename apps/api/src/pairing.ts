import type { BrowserAuthVerifier } from "./auth.ts";
import { PAIR_ERROR_CODES, type PairErrorBody, type PairErrorCode } from "./protocol.ts";
import { getEnvironmentIds, getWorkOsUserMetadata, putWorkOsUserMetadata } from "./workos.ts";

export type PairingWriteResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly status: 502 | 503;
      readonly code: PairErrorCode;
      readonly message: string;
    };

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
      return {
        ok: false,
        status: 503,
        code: PAIR_ERROR_CODES.PAIR_METADATA_READ_FAILED,
        message:
          error instanceof Error
            ? `WorkOS metadata read failed: ${error.message}`
            : "WorkOS metadata read failed",
      };
    }
    const next = { ...(existing ?? {}), environmentIds: update(getEnvironmentIds(existing)) };
    try {
      await putMetadata(userId, next);
    } catch (error) {
      return {
        ok: false,
        status: 502,
        code: PAIR_ERROR_CODES.PAIR_METADATA_WRITE_FAILED,
        message:
          error instanceof Error
            ? `WorkOS metadata write failed: ${error.message}`
            : "WorkOS metadata write failed",
      };
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
// Pair token is 12 chars from T3 issuance. Bound the accepted size so a
// malicious payload can't waste DO storage comparisons.
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
  | {
      readonly ok: false;
      readonly status: 401 | 409 | 410 | 502;
      readonly code: PairErrorCode;
      readonly message: string;
    };

export type ClaimEnvironmentOwner = (
  environmentId: string,
  userId: string,
  token: string,
) => Promise<ClaimEnvironmentOwnerResult>;

export type ReleaseEnvironmentOwnerResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly status: 502;
      readonly code: PairErrorCode;
      readonly message: string;
    };

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
  "access-control-allow-methods": "POST, DELETE, OPTIONS",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-max-age": "86400",
};

function withCors(response: Response): Response {
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}

function errorResponse(
  status: number,
  code: PairErrorCode,
  message: string,
  extraHeaders?: Record<string, string>,
): Response {
  const body: PairErrorBody = { code, message };
  return withCors(
    new Response(JSON.stringify(body), {
      status,
      headers: {
        "content-type": "application/json; charset=utf-8",
        ...extraHeaders,
      },
    }),
  );
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
    return errorResponse(
      405,
      PAIR_ERROR_CODES.PAIR_METHOD_NOT_ALLOWED,
      `Method ${request.method} is not allowed on /pair.`,
      { allow: "POST, DELETE, OPTIONS" },
    );
  }

  const auth = await options.authVerifier(request, url);
  if (!auth.ok) {
    return errorResponse(auth.status, PAIR_ERROR_CODES.PAIR_AUTH_FAILED, auth.reason);
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return errorResponse(
      400,
      PAIR_ERROR_CODES.PAIR_INVALID_BODY,
      "Request body is not valid JSON.",
    );
  }

  const body = parsePairingBody(raw);
  if (!body) {
    return errorResponse(
      400,
      PAIR_ERROR_CODES.PAIR_INVALID_BODY,
      "Body must be { environmentId: 12-char A-Z 0-9, token: non-empty string }.",
    );
  }

  const claim = await options.claimEnvironmentOwner(
    body.environmentId,
    auth.auth.userId,
    body.token,
  );
  if (!claim.ok) {
    return errorResponse(claim.status, claim.code, claim.message);
  }

  const result = await options.writer.addEnvironmentId(auth.auth.userId, body.environmentId);
  if (!result.ok) {
    // Don't auto-release: the DO is now {userId, status: active} for this user.
    // Releasing would flip status -> disabled, which is irreversible. Leaving
    // it lets the user retry; on retry the claim is a no-op (already-by-same-user)
    // and the writer retries the WorkOS metadata write — self-heals when WorkOS
    // recovers.
    return errorResponse(result.status, result.code, result.message);
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
    return errorResponse(auth.status, PAIR_ERROR_CODES.PAIR_AUTH_FAILED, auth.reason);
  }

  const environmentId = url.searchParams.get("environmentId")?.trim();
  if (!environmentId || !ENVIRONMENT_ID_PATTERN.test(environmentId)) {
    return errorResponse(
      400,
      PAIR_ERROR_CODES.PAIR_INVALID_BODY,
      "environmentId query parameter must be a 12-char A-Z 0-9 string.",
    );
  }

  const removeResult = await options.writer.removeEnvironmentId(auth.auth.userId, environmentId);
  if (!removeResult.ok) {
    return errorResponse(removeResult.status, removeResult.code, removeResult.message);
  }

  const release = await options.releaseEnvironmentOwner(environmentId, auth.auth.userId);
  if (!release.ok) {
    return errorResponse(release.status, release.code, release.message);
  }

  return withCors(Response.json({ ok: true, environmentId }));
}
