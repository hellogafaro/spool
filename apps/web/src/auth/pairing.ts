/**
 * Browser client for the relay's /pair and /me endpoints. /pair binds an
 * environmentId to the signed-in user. /me returns the user's claimed
 * environments with live status.
 */

const TRUNK_API_URL = (import.meta.env.VITE_TRUNK_API_URL as string | undefined)?.trim();

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: string | null = null,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function pairUrl(): string {
  if (!TRUNK_API_URL) {
    throw new ApiError(0, "VITE_TRUNK_API_URL is not configured", null);
  }
  return `${TRUNK_API_URL.replace(/\/$/, "")}/pair`;
}

async function readErrorBody(
  response: Response,
): Promise<{ readonly code: string | null; readonly message: string }> {
  const text = await response.text().catch(() => "");
  if (text.startsWith("{")) {
    try {
      const parsed = JSON.parse(text) as { code?: unknown; message?: unknown };
      const code = typeof parsed.code === "string" ? parsed.code : null;
      const message = typeof parsed.message === "string" ? parsed.message : text.trim();
      return { code, message };
    } catch {
      // Fall through to plaintext.
    }
  }
  return { code: null, message: text.trim() };
}

export interface ClaimEnvironmentOptions {
  readonly environmentId: string;
  readonly token: string;
  readonly accessToken: string;
}

export async function claimEnvironment({
  environmentId,
  token,
  accessToken,
}: ClaimEnvironmentOptions): Promise<void> {
  const response = await fetch(pairUrl(), {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ environmentId, token }),
  });
  if (!response.ok) {
    const { code, message } = await readErrorBody(response);
    throw new ApiError(
      response.status,
      message || `Pairing failed with status ${response.status}.`,
      code,
    );
  }
}

export interface UnclaimEnvironmentOptions {
  readonly environmentId: string;
  readonly accessToken: string;
}

export async function unclaimEnvironment({
  environmentId,
  accessToken,
}: UnclaimEnvironmentOptions): Promise<void> {
  const url = new URL(pairUrl());
  url.searchParams.set("environmentId", environmentId);
  const response = await fetch(url.toString(), {
    method: "DELETE",
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    const { code, message } = await readErrorBody(response);
    throw new ApiError(
      response.status,
      message || `Unclaim failed with status ${response.status}.`,
      code,
    );
  }
}

export interface ClaimedEnvironment {
  readonly environmentId: string;
  readonly online: boolean;
  readonly lastSeenAt: string | null;
}

export async function getClaimedEnvironments(
  accessToken: string,
): Promise<ReadonlyArray<ClaimedEnvironment>> {
  if (!TRUNK_API_URL) return [];
  const response = await fetch(`${TRUNK_API_URL.replace(/\/$/, "")}/me`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    const { code, message } = await readErrorBody(response);
    throw new ApiError(
      response.status,
      message || `Failed to load environments (${response.status}).`,
      code,
    );
  }
  const body = (await response.json()) as {
    environments?: ReadonlyArray<{
      environmentId?: unknown;
      online?: unknown;
      lastSeenAt?: unknown;
    }>;
  };
  if (!Array.isArray(body.environments)) return [];
  return body.environments.flatMap((entry): ClaimedEnvironment[] => {
    if (!entry || typeof entry.environmentId !== "string") return [];
    return [
      {
        environmentId: entry.environmentId,
        online: Boolean(entry.online),
        lastSeenAt: typeof entry.lastSeenAt === "string" ? entry.lastSeenAt : null,
      },
    ];
  });
}
