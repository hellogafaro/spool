import type { BrowserAuthVerifier } from "./auth.ts";

export type PairingWriteResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly status: 502 | 503; readonly reason: string };

export interface PairingWriter {
  setServerId(userId: string, serverId: string): Promise<PairingWriteResult>;
}

interface WorkOsPairingWriterOptions {
  readonly apiKey: string;
  readonly fetchMetadata?: (userId: string) => Promise<Record<string, unknown> | null>;
  readonly putMetadata?: (
    userId: string,
    metadata: Record<string, unknown>,
  ) => Promise<void>;
}

async function defaultFetchMetadata(
  apiKey: string,
  userId: string,
): Promise<Record<string, unknown> | null> {
  const response = await fetch(`https://api.workos.com/user_management/users/${userId}`, {
    headers: { authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) {
    throw new Error(`WorkOS user fetch failed: ${response.status}`);
  }
  const body = (await response.json()) as { metadata?: Record<string, unknown> | null };
  return body.metadata ?? null;
}

async function defaultPutMetadata(
  apiKey: string,
  userId: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  const response = await fetch(`https://api.workos.com/user_management/users/${userId}`, {
    method: "PUT",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ metadata }),
  });
  if (!response.ok) {
    throw new Error(`WorkOS user update failed: ${response.status}`);
  }
}

export function makeWorkOsPairingWriter(options: WorkOsPairingWriterOptions): PairingWriter {
  const fetchMetadata =
    options.fetchMetadata ?? ((userId) => defaultFetchMetadata(options.apiKey, userId));
  const putMetadata =
    options.putMetadata ??
    ((userId, metadata) => defaultPutMetadata(options.apiKey, userId, metadata));

  return {
    async setServerId(userId, serverId) {
      let existing: Record<string, unknown> | null;
      try {
        existing = await fetchMetadata(userId);
      } catch (error) {
        const reason = error instanceof Error ? error.message : "metadata fetch failed";
        return { ok: false, status: 503, reason };
      }

      const next = { ...(existing ?? {}), serverId };
      try {
        await putMetadata(userId, next);
      } catch (error) {
        const reason = error instanceof Error ? error.message : "metadata write failed";
        return { ok: false, status: 502, reason };
      }
      return { ok: true };
    },
  };
}

export interface PairingRequestBody {
  readonly serverId: string;
}

const SERVER_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

function parsePairingBody(raw: unknown): PairingRequestBody | null {
  if (!raw || typeof raw !== "object") return null;
  const body = raw as { serverId?: unknown };
  if (typeof body.serverId !== "string") return null;
  if (!SERVER_ID_PATTERN.test(body.serverId)) return null;
  return { serverId: body.serverId };
}

export interface PairingHandlerOptions {
  readonly authVerifier: BrowserAuthVerifier;
  readonly writer: PairingWriter;
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

  if (request.method !== "POST") {
    return withCors(
      new Response("method not allowed\n", {
        status: 405,
        headers: { allow: "POST, OPTIONS" },
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
    return withCors(new Response("serverId required\n", { status: 400 }));
  }

  const result = await options.writer.setServerId(auth.auth.userId, body.serverId);
  if (!result.ok) {
    return withCors(new Response(`${result.reason}\n`, { status: result.status }));
  }

  return withCors(Response.json({ ok: true, serverId: body.serverId }));
}
