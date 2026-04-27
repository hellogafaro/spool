/**
 * WorkOS API helpers used by the relay:
 *   - User metadata (`environmentIds[]`) for the public list of envs a
 *     user owns.
 *   - Vault objects for each paired env's auth credentials. The relay
 *     persists nothing sensitive itself — Vault is the system of record.
 */

const WORKOS_API = "https://api.workos.com";
const WORKOS_USERS_URL = `${WORKOS_API}/user_management/users`;
const WORKOS_VAULT_URL = `${WORKOS_API}/vault/v1/kv`;

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

/**
 * WorkOS user metadata only accepts string values (max 600 chars, ASCII).
 * We store the env-id list as a comma-separated string under the
 * `environments` key so the WorkOS JWT template can drop it into a
 * session claim verbatim — `[A-Z0-9]{12}` ids can never contain commas,
 * so a plain split round-trips losslessly.
 */
const ENVIRONMENTS_METADATA_KEY = "environments";

export function getEnvironmentIds(metadata: Record<string, unknown> | null): string[] {
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

export function encodeEnvironmentIds(ids: ReadonlyArray<string>): string {
  return ids.join(",");
}

export const ENVIRONMENTS_METADATA_FIELD = ENVIRONMENTS_METADATA_KEY;

/**
 * Build the Vault object name for an env's credentials. We namespace
 * `trunk:env:` so Vault listings stay scannable and the global key space
 * stays partitioned.
 */
export function envVaultObjectName(environmentId: string): string {
  return `trunk:env:${environmentId}`;
}

export interface EnvVaultEntry {
  readonly userId: string;
  readonly secret: string;
}

interface VaultObjectResponse {
  readonly id: string;
  readonly name: string;
  readonly value: string;
}

/**
 * Stores an env's auth credentials under a Vault object keyed by env name.
 * The value is the JSON-serialized `EnvVaultEntry`. Vault encrypts each
 * object with a unique data-encryption key derived from the supplied
 * key-context, so two envs never share an encryption key.
 */
export async function createEnvVaultObject(
  apiKey: string,
  environmentId: string,
  entry: EnvVaultEntry,
): Promise<void> {
  const response = await fetch(WORKOS_VAULT_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      name: envVaultObjectName(environmentId),
      value: JSON.stringify(entry),
      key_context: { environmentId },
    }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Vault create failed: ${response.status} ${text}`.trim());
  }
}

/**
 * Reads back the env's vault entry by name. Returns null on 404 so callers
 * can distinguish "no record" from transient errors.
 */
export async function readEnvVaultObject(
  apiKey: string,
  environmentId: string,
): Promise<EnvVaultEntry | null> {
  const url = `${WORKOS_VAULT_URL}/name/${encodeURIComponent(envVaultObjectName(environmentId))}`;
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${apiKey}` },
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Vault read failed: ${response.status} ${text}`.trim());
  }
  const body = (await response.json()) as VaultObjectResponse;
  try {
    const parsed = JSON.parse(body.value) as { userId?: unknown; secret?: unknown };
    if (typeof parsed.userId !== "string" || typeof parsed.secret !== "string") return null;
    return { userId: parsed.userId, secret: parsed.secret };
  } catch {
    return null;
  }
}

/**
 * Deletes the env's Vault object. WorkOS Vault deletes by object id, so we
 * resolve name → id first. Idempotent: missing entries are treated as
 * already-deleted.
 */
export async function deleteEnvVaultObject(apiKey: string, environmentId: string): Promise<void> {
  const lookupUrl = `${WORKOS_VAULT_URL}/name/${encodeURIComponent(
    envVaultObjectName(environmentId),
  )}`;
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
