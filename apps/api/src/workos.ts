/**
 * Shared WorkOS user-metadata helpers used by /me, /pairing, and the
 * ownership checker. WorkOS stores each user's claimed `environmentIds`
 * here; we treat it as the canonical list and the relay DO as the
 * race-safe source of first-claim ownership.
 */

const WORKOS_USERS_URL = "https://api.workos.com/user_management/users";

export async function getWorkOsUserMetadata(
  apiKey: string,
  userId: string,
): Promise<Record<string, unknown> | null> {
  const response = await fetch(`${WORKOS_USERS_URL}/${userId}`, {
    headers: { authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) {
    throw new Error(`WorkOS user fetch failed: ${response.status}`);
  }
  const body = (await response.json()) as { metadata?: Record<string, unknown> | null };
  return body.metadata ?? null;
}

export async function putWorkOsUserMetadata(
  apiKey: string,
  userId: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  const response = await fetch(`${WORKOS_USERS_URL}/${userId}`, {
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

export function getEnvironmentIds(metadata: Record<string, unknown> | null): string[] {
  if (!metadata) return [];
  const value = metadata.environmentIds;
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
}
