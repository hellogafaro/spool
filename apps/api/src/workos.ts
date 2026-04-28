/**
 * WorkOS helpers used by the saved-env Worker.
 *
 * Two stores per user:
 *   Vault:         encrypted T3 bearer per env. key_context.owner gates reads.
 *   User metadata: `savedEnvs` JSON array of {environmentId, environmentUrl, label}.
 *                  WorkOS metadata values reject URL characters in key_context, so
 *                  the public-ish env list lives here while bearers stay in Vault.
 */

const WORKOS_API = "https://api.workos.com";
const WORKOS_VAULT_URL = `${WORKOS_API}/vault/v1/kv`;
const WORKOS_USERS_URL = `${WORKOS_API}/user_management/users`;
const SAVED_ENVS_METADATA_KEY = "savedEnvs";

export interface VaultKeyContext {
  readonly owner: string;
}

export interface VaultEntry {
  readonly name: string;
  readonly value: string;
  readonly keyContext: VaultKeyContext;
}

interface VaultObjectResponse {
  readonly id: string;
  readonly name: string;
  readonly value: string;
  readonly key_context?: Record<string, string>;
}

function toVaultEntry(raw: VaultObjectResponse): VaultEntry | null {
  const kc = raw.key_context ?? {};
  if (typeof raw.value !== "string" || typeof kc.owner !== "string") return null;
  return { name: raw.name, value: raw.value, keyContext: { owner: kc.owner } };
}

export function getVaultName(userId: string, environmentId: string): string {
  return `env-${userId}-${environmentId}`;
}

export async function upsertVault(
  apiKey: string,
  name: string,
  value: string,
  keyContext: VaultKeyContext,
): Promise<void> {
  const response = await fetch(WORKOS_VAULT_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ name, value, key_context: keyContext }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Vault upsert failed: ${response.status} ${text}`.trim());
  }
}

export async function getVaultByName(apiKey: string, name: string): Promise<VaultEntry | null> {
  const url = `${WORKOS_VAULT_URL}/name/${encodeURIComponent(name)}`;
  const response = await fetch(url, { headers: { authorization: `Bearer ${apiKey}` } });
  if (response.status === 404) return null;
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Vault read failed: ${response.status} ${text}`.trim());
  }
  const body = (await response.json()) as VaultObjectResponse;
  return toVaultEntry(body);
}

export async function deleteVaultByName(apiKey: string, name: string): Promise<void> {
  const lookupUrl = `${WORKOS_VAULT_URL}/name/${encodeURIComponent(name)}`;
  const lookup = await fetch(lookupUrl, { headers: { authorization: `Bearer ${apiKey}` } });
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

export interface SavedEnvEntry {
  readonly environmentId: string;
  readonly environmentUrl: string;
  readonly label: string;
}

interface UserResponse {
  readonly metadata?: Record<string, unknown> | null;
}

async function getUserMetadata(
  apiKey: string,
  userId: string,
): Promise<Record<string, unknown> | null> {
  const response = await fetch(`${WORKOS_USERS_URL}/${userId}`, {
    headers: { authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`User metadata read failed: ${response.status} ${text}`.trim());
  }
  const body = (await response.json()) as UserResponse;
  return body.metadata ?? null;
}

async function putUserMetadata(
  apiKey: string,
  userId: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  const response = await fetch(`${WORKOS_USERS_URL}/${userId}`, {
    method: "PUT",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ metadata }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`User metadata write failed: ${response.status} ${text}`.trim());
  }
}

function parseSavedEnvs(metadata: Record<string, unknown> | null): SavedEnvEntry[] {
  if (!metadata) return [];
  const raw = metadata[SAVED_ENVS_METADATA_KEY];
  if (typeof raw !== "string" || raw.length === 0) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((entry): SavedEnvEntry[] => {
    if (!entry || typeof entry !== "object") return [];
    const candidate = entry as Record<string, unknown>;
    if (
      typeof candidate.environmentId !== "string" ||
      typeof candidate.environmentUrl !== "string" ||
      typeof candidate.label !== "string"
    ) {
      return [];
    }
    return [
      {
        environmentId: candidate.environmentId,
        environmentUrl: candidate.environmentUrl,
        label: candidate.label,
      },
    ];
  });
}

export async function getSavedEnvs(
  apiKey: string,
  userId: string,
): Promise<ReadonlyArray<SavedEnvEntry>> {
  const metadata = await getUserMetadata(apiKey, userId);
  return parseSavedEnvs(metadata);
}

export async function upsertSavedEnv(
  apiKey: string,
  userId: string,
  entry: SavedEnvEntry,
): Promise<ReadonlyArray<SavedEnvEntry>> {
  const metadata = await getUserMetadata(apiKey, userId);
  const current = parseSavedEnvs(metadata);
  const next = [
    ...current.filter((existing) => existing.environmentId !== entry.environmentId),
    entry,
  ];
  await putUserMetadata(apiKey, userId, {
    ...metadata,
    [SAVED_ENVS_METADATA_KEY]: JSON.stringify(next),
  });
  return next;
}

export async function deleteSavedEnv(
  apiKey: string,
  userId: string,
  environmentId: string,
): Promise<ReadonlyArray<SavedEnvEntry>> {
  const metadata = await getUserMetadata(apiKey, userId);
  const current = parseSavedEnvs(metadata);
  const next = current.filter((entry) => entry.environmentId !== environmentId);
  if (next.length === current.length) return current;
  await putUserMetadata(apiKey, userId, {
    ...metadata,
    [SAVED_ENVS_METADATA_KEY]: JSON.stringify(next),
  });
  return next;
}
