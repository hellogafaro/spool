/**
 * WorkOS API helpers used by the relay:
 *   - User metadata (`environments`) for the public list of envs a user owns.
 *   - Vault objects holding each env's auth secret. Owner identity lives in
 *     `key_context.owner` so the value stays a pure secret.
 */

const WORKOS_API = "https://api.workos.com";
const WORKOS_USERS_URL = `${WORKOS_API}/user_management/users`;
const WORKOS_VAULT_URL = `${WORKOS_API}/vault/v1/kv`;

export async function getUserMetadata(
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

export async function updateUserMetadata(
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

/**
 * WorkOS user metadata only accepts string values (max 600 chars, ASCII).
 * The env-id list is stored as a comma-separated string under `environments`
 * so the WorkOS JWT template drops it into a session claim verbatim.
 * `[A-Z0-9]{12}` ids never contain commas — split round-trips losslessly.
 */
const ENVIRONMENTS_METADATA_KEY = "environments";

export function getEnvironments(metadata: Record<string, unknown> | null): string[] {
  if (!metadata) return [];
  const value = metadata[ENVIRONMENTS_METADATA_KEY];
  if (typeof value === "string" && value.length > 0) {
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }
  return [];
}

export function encodeEnvironments(ids: ReadonlyArray<string>): string {
  return ids.join(",");
}

export function getVaultName(environmentId: string): string {
  return `env:${environmentId}`;
}

export interface VaultEntry {
  readonly secret: string;
  readonly owner: string;
}

interface VaultObjectResponse {
  readonly id: string;
  readonly name: string;
  readonly value: string;
  readonly key_context?: Record<string, string>;
}

/**
 * Stores an env's auth secret. Value is the raw secret string. Owner identity
 * lives in `key_context.owner` (server-stored, returned on read) so the
 * encrypted value stays a single-purpose secret. `key_context.environment`
 * binds the DEK uniquely per env.
 */
export async function upsertVault(
  apiKey: string,
  environmentId: string,
  secret: string,
  owner: string,
): Promise<void> {
  const response = await fetch(WORKOS_VAULT_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      name: getVaultName(environmentId),
      value: secret,
      key_context: { environment: environmentId, owner },
    }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Vault create failed: ${response.status} ${text}`.trim());
  }
}

/**
 * Reads back the env's vault entry. Returns null on 404 so callers can
 * distinguish "no record" from transient errors.
 */
export async function getVault(apiKey: string, environmentId: string): Promise<VaultEntry | null> {
  const url = `${WORKOS_VAULT_URL}/name/${encodeURIComponent(getVaultName(environmentId))}`;
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${apiKey}` },
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Vault read failed: ${response.status} ${text}`.trim());
  }
  const body = (await response.json()) as VaultObjectResponse;
  const owner = body.key_context?.owner;
  if (typeof body.value !== "string" || typeof owner !== "string") return null;
  return { secret: body.value, owner };
}

/**
 * Deletes the env's Vault object. Vault deletes by id, so we resolve
 * name → id first. Idempotent: missing entries are treated as already-deleted.
 */
export async function deleteVault(apiKey: string, environmentId: string): Promise<void> {
  const lookupUrl = `${WORKOS_VAULT_URL}/name/${encodeURIComponent(getVaultName(environmentId))}`;
  const lookup = await fetch(lookupUrl, {
    headers: { authorization: `Bearer ${apiKey}` },
  });
  if (lookup.status === 404) return;
  if (!lookup.ok) {
    const text = await lookup.text().catch(() => "");
    throw new Error(`Vault lookup failed: ${lookup.status} ${text}`.trim());
  }
  const meta = (await lookup.json()) as VaultObjectResponse;
  const deleteUrl = `${WORKOS_VAULT_URL}/${encodeURIComponent(meta.id)}`;
  const response = await fetch(deleteUrl, {
    method: "DELETE",
    headers: { authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok && response.status !== 404) {
    const text = await response.text().catch(() => "");
    throw new Error(`Vault delete failed: ${response.status} ${text}`.trim());
  }
}
