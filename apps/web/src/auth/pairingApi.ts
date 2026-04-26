/**
 * Client for the relay's /pairing and /me endpoints. /pairing appends
 * an environmentId to the authenticated user's WorkOS metadata.
 * /me returns the user's claimed environmentIds.
 */

const TRUNK_API_URL = (import.meta.env.VITE_TRUNK_API_URL as string | undefined)?.trim();

export class PairingApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "PairingApiError";
  }
}

export interface ClaimEnvironmentOptions {
  readonly environmentId: string;
  readonly accessToken: string;
}

export async function claimEnvironment({
  environmentId,
  accessToken,
}: ClaimEnvironmentOptions): Promise<void> {
  if (!TRUNK_API_URL) {
    throw new PairingApiError(0, "VITE_TRUNK_API_URL is not configured");
  }
  const response = await fetch(`${TRUNK_API_URL.replace(/\/$/, "")}/pairing`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ environmentId }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new PairingApiError(
      response.status,
      text.trim() || `Pairing failed with status ${response.status}`,
    );
  }
}

export async function unclaimEnvironment({
  environmentId,
  accessToken,
}: ClaimEnvironmentOptions): Promise<void> {
  if (!TRUNK_API_URL) {
    throw new PairingApiError(0, "VITE_TRUNK_API_URL is not configured");
  }
  const url = new URL(`${TRUNK_API_URL.replace(/\/$/, "")}/pairing`);
  url.searchParams.set("environmentId", environmentId);
  const response = await fetch(url.toString(), {
    method: "DELETE",
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new PairingApiError(
      response.status,
      text.trim() || `Unclaim failed with status ${response.status}`,
    );
  }
}

export interface ClaimedEnvironmentSummary {
  readonly environmentId: string;
  readonly online: boolean;
}

export interface ClaimedEnvironmentsSnapshot {
  readonly environmentIds: ReadonlyArray<string>;
  readonly environments: ReadonlyArray<ClaimedEnvironmentSummary>;
}

export class MeApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "MeApiError";
  }
}

export async function fetchClaimedEnvironments(
  accessToken: string,
): Promise<ClaimedEnvironmentsSnapshot> {
  if (!TRUNK_API_URL) {
    return { environmentIds: [], environments: [] };
  }
  const response = await fetch(`${TRUNK_API_URL.replace(/\/$/, "")}/me`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new MeApiError(response.status, `Failed to load environments (${response.status})`);
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
  const environments = Array.isArray(body.environments)
    ? body.environments
        .map((entry) =>
          entry && typeof entry === "object" && typeof entry.environmentId === "string"
            ? { environmentId: entry.environmentId, online: Boolean(entry.online) }
            : null,
        )
        .filter((entry): entry is ClaimedEnvironmentSummary => entry !== null)
    : environmentIds.map((environmentId) => ({ environmentId, online: false }));
  return { environmentIds, environments };
}

export async function fetchClaimedEnvironmentIds(accessToken: string): Promise<string[]> {
  const snapshot = await fetchClaimedEnvironments(accessToken).catch(() => ({
    environmentIds: [] as ReadonlyArray<string>,
  }));
  return [...snapshot.environmentIds];
}
