/**
 * Browser client for the relay's /pairing and /me endpoints. /pairing
 * binds an environmentId to the signed-in user (DO + WorkOS metadata).
 * /me returns the user's claimed environments with live status.
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

function pairingUrl(): string {
  if (!TRUNK_API_URL) {
    throw new ApiError(0, "VITE_TRUNK_API_URL is not configured");
  }
  return `${TRUNK_API_URL.replace(/\/$/, "")}/pairing`;
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
  const response = await fetch(pairingUrl(), {
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
  const url = new URL(pairingUrl());
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

export interface ClaimedEnvironmentSummary {
  readonly environmentId: string;
  readonly online: boolean;
  readonly lastSeenAt?: string | null;
}

export interface ClaimedEnvironmentsSnapshot {
  readonly environmentIds: ReadonlyArray<string>;
  readonly environments: ReadonlyArray<ClaimedEnvironmentSummary>;
}

export async function getClaimedEnvironments(
  accessToken: string,
): Promise<ClaimedEnvironmentsSnapshot> {
  if (!TRUNK_API_URL) {
    return { environmentIds: [], environments: [] };
  }
  const response = await fetch(`${TRUNK_API_URL.replace(/\/$/, "")}/me`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new ApiError(response.status, `Failed to load environments (${response.status})`);
  }
  const body = (await response.json()) as {
    environmentIds?: ReadonlyArray<string>;
    environments?: ReadonlyArray<ClaimedEnvironmentSummary>;
  };
  const environmentIds = Array.isArray(body.environmentIds)
    ? body.environmentIds.filter(
        (entry): entry is string => typeof entry === "string" && entry.length > 0,
      )
    : [];
  const environments: ClaimedEnvironmentSummary[] = Array.isArray(body.environments)
    ? body.environments.flatMap((entry): ClaimedEnvironmentSummary[] => {
        if (!entry || typeof entry !== "object" || typeof entry.environmentId !== "string") {
          return [];
        }
        const lastSeenAt =
          typeof (entry as { lastSeenAt?: unknown }).lastSeenAt === "string"
            ? (entry as { lastSeenAt: string }).lastSeenAt
            : null;
        return [{ environmentId: entry.environmentId, online: Boolean(entry.online), lastSeenAt }];
      })
    : environmentIds.map((environmentId) => ({
        environmentId,
        online: false,
        lastSeenAt: null,
      }));
  return { environmentIds, environments };
}
