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
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function pairUrl(): string {
  if (!TRUNK_API_URL) {
    throw new ApiError(0, "VITE_TRUNK_API_URL is not configured");
  }
  return `${TRUNK_API_URL.replace(/\/$/, "")}/pair`;
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
    const text = await response.text().catch(() => "");
    throw new ApiError(
      response.status,
      text.trim() || `Pairing failed with status ${response.status}`,
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
    const text = await response.text().catch(() => "");
    throw new ApiError(
      response.status,
      text.trim() || `Unclaim failed with status ${response.status}`,
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
    throw new ApiError(response.status, `Failed to load environments (${response.status})`);
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
