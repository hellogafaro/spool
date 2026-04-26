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

export async function fetchClaimedEnvironmentIds(accessToken: string): Promise<string[]> {
  if (!TRUNK_API_URL) {
    return [];
  }
  const response = await fetch(`${TRUNK_API_URL.replace(/\/$/, "")}/me`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    return [];
  }
  const body = (await response.json()) as { environmentIds?: string[] };
  return Array.isArray(body.environmentIds)
    ? body.environmentIds.filter(
        (entry): entry is string => typeof entry === "string" && entry.length > 0,
      )
    : [];
}
