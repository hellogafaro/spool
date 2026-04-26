/**
 * Client for the relay's /pairing endpoint. Writes
 * `metadata.serverId = <serverId>` to the authenticated user's WorkOS
 * record so subsequent WS upgrades pass the ownership check.
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

export interface ClaimServerOptions {
  readonly serverId: string;
  readonly accessToken: string;
}

export async function claimServer({ serverId, accessToken }: ClaimServerOptions): Promise<void> {
  if (!TRUNK_API_URL) {
    throw new PairingApiError(0, "VITE_TRUNK_API_URL is not configured");
  }
  const response = await fetch(`${TRUNK_API_URL.replace(/\/$/, "")}/pairing`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ serverId }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new PairingApiError(
      response.status,
      text.trim() || `Pairing failed with status ${response.status}`,
    );
  }
}

export async function fetchClaimedServerId(accessToken: string): Promise<string | null> {
  if (!TRUNK_API_URL) {
    return null;
  }
  const response = await fetch(`${TRUNK_API_URL.replace(/\/$/, "")}/me`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    return null;
  }
  const body = (await response.json()) as { serverId?: string | null };
  return typeof body.serverId === "string" && body.serverId.length > 0 ? body.serverId : null;
}
