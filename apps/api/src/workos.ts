/**
 * WorkOS helpers used by the saved-env Worker.
 *
 * Two stores per user:
 *   Vault:         encrypted T3 bearer per env. key context owner gates reads.
 *   User metadata: `savedEnvs` JSON array of public env fields plus Vault object id.
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

interface VaultObjectMetadataResponse {
  readonly id: string;
  readonly context?: Record<string, string>;
}

interface VaultObjectResponse {
  readonly id: string;
  readonly name: string;
  readonly value: string;
  readonly metadata?: {
    readonly context?: Record<string, string>;
  };
}

function toVaultEntry(raw: VaultObjectResponse): VaultEntry | null {
  const kc = raw.metadata?.context ?? {};
  if (typeof raw.value !== "string" || typeof kc.owner !== "string") return null;
  return { name: raw.name, value: raw.value, keyContext: { owner: kc.owner } };
}

function toVaultObjectId(raw: VaultObjectMetadataResponse): string {
  return raw.id;
}

export async function createVaultObject(
  apiKey: string,
  value: string,
  keyContext: VaultKeyContext,
): Promise<string> {
  const response = await fetch(WORKOS_VAULT_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ name: `env-${crypto.randomUUID()}`, value, key_context: keyContext }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Vault create failed: ${response.status} ${text}`.trim());
  }
  const body = (await response.json()) as VaultObjectMetadataResponse;
  return toVaultObjectId(body);
}

export async function updateVaultObject(
  apiKey: string,
  objectId: string,
  value: string,
): Promise<boolean> {
  const response = await fetch(`${WORKOS_VAULT_URL}/${encodeURIComponent(objectId)}`, {
    method: "PUT",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ value }),
  });
  if (response.status === 404) return false;
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Vault update failed: ${response.status} ${text}`.trim());
  }
  return true;
}

export async function getVaultObject(apiKey: string, objectId: string): Promise<VaultEntry | null> {
  const url = `${WORKOS_VAULT_URL}/${encodeURIComponent(objectId)}`;
  const response = await fetch(url, { headers: { authorization: `Bearer ${apiKey}` } });
  if (response.status === 404) return null;
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Vault read failed: ${response.status} ${text}`.trim());
  }
  const body = (await response.json()) as VaultObjectResponse;
  return toVaultEntry(body);
}

export async function deleteVaultObject(apiKey: string, objectId: string): Promise<void> {
  const response = await fetch(`${WORKOS_VAULT_URL}/${encodeURIComponent(objectId)}`, {
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
  readonly vaultObjectId: string;
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
      typeof candidate.label !== "string" ||
      typeof candidate.vaultObjectId !== "string"
    ) {
      return [];
    }
    return [
      {
        environmentId: candidate.environmentId,
        environmentUrl: candidate.environmentUrl,
        label: candidate.label,
        vaultObjectId: candidate.vaultObjectId,
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
