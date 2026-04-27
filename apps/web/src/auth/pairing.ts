/**
 * Browser client for the relay's /pair endpoint. The list of envs the
 * user owns isn't fetched separately — it ships as the `environments`
 * custom claim on the WorkOS access token (configured via JWT template
 * in the WorkOS Dashboard), so we decode it from the token directly.
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

/**
 * Reads the user's paired environment IDs out of the WorkOS access token.
 * The `environments` claim is a comma-separated string (set via the JWT
 * template in the WorkOS Dashboard, sourced from user metadata that only
 * accepts string values). Env IDs are `[A-Z0-9]{12}` so they can't ever
 * contain commas — split round-trips losslessly.
 *
 * Returns an empty array on any decode failure: the worst case is the
 * user lands on /onboarding for a moment until a fresh session token
 * carries the correct claim.
 */
export function getClaimedEnvironmentIds(accessToken: string): ReadonlyArray<string> {
  const payload = decodeJwtPayload(accessToken);
  if (!payload) return [];
  const raw = payload.environments;
  if (typeof raw !== "string" || raw.length === 0) return [];
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  const parts = jwt.split(".");
  if (parts.length !== 3) return null;
  try {
    const padded = parts[1]!.replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));
    const parsed = JSON.parse(json) as unknown;
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Fall through.
  }
  return null;
}
