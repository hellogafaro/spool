/**
 * WorkOS Vault helpers used by the saved-env Worker.
 *
 * Vault is the sole source of truth for a user's saved envs. Each entry's
 * value is the T3 bearer; key_context carries the ownership and metadata.
 *
 * Schema:
 *   name:    env-<userId>-<environmentId>
 *   value:   <T3 bearer session token>
 *   key_context:
 *     owner:           <workos-user-id>
 *     environmentUrl:  https://t3.example.com
 *     label:           Laptop
 */

const WORKOS_API = "https://api.workos.com";
const WORKOS_VAULT_URL = `${WORKOS_API}/vault/v1/kv`;

export interface VaultKeyContext {
  readonly owner: string;
  readonly environmentUrl: string;
  readonly label: string;
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

interface VaultListResponse {
  readonly data: ReadonlyArray<VaultObjectResponse>;
  readonly list_metadata?: { readonly after?: string };
}

function toVaultEntry(raw: VaultObjectResponse): VaultEntry | null {
  const kc = raw.key_context ?? {};
  if (
    typeof raw.value !== "string" ||
    typeof kc.owner !== "string" ||
    typeof kc.environmentUrl !== "string" ||
    typeof kc.label !== "string"
  ) {
    return null;
  }
  return {
    name: raw.name,
    value: raw.value,
    keyContext: { owner: kc.owner, environmentUrl: kc.environmentUrl, label: kc.label },
  };
}

export function getVaultName(userId: string, environmentId: string): string {
  return `env-${userId}-${environmentId}`;
}

export function parseEnvironmentIdFromName(name: string, userId: string): string | null {
  const prefix = `env-${userId}-`;
  if (!name.startsWith(prefix)) return null;
  const id = name.slice(prefix.length);
  return id.length > 0 ? id : null;
}

export async function upsertVault(
  apiKey: string,
  name: string,
  value: string,
  keyContext: VaultKeyContext,
): Promise<void> {
  const response = await fetch(WORKOS_VAULT_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
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

const VAULT_LIST_PAGE_SIZE = 100;
const VAULT_LIST_MAX_PAGES = 10;

export async function getVaultsByPrefix(
  apiKey: string,
  prefix: string,
): Promise<ReadonlyArray<VaultEntry>> {
  const out: VaultEntry[] = [];
  let after: string | null = null;
  for (let page = 0; page < VAULT_LIST_MAX_PAGES; page += 1) {
    const url = new URL(WORKOS_VAULT_URL);
    url.searchParams.set("limit", String(VAULT_LIST_PAGE_SIZE));
    if (after) url.searchParams.set("after", after);
    const response = await fetch(url.toString(), {
      headers: { authorization: `Bearer ${apiKey}` },
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Vault list failed: ${response.status} ${text}`.trim());
    }
    const body = (await response.json()) as VaultListResponse;
    for (const raw of body.data) {
      if (!raw.name.startsWith(prefix)) continue;
      const entry = toVaultEntry(raw);
      if (entry) out.push(entry);
    }
    after = body.list_metadata?.after ?? null;
    if (!after) break;
  }
  return out;
}

export async function patchVaultKeyContext(
  apiKey: string,
  name: string,
  patch: Partial<VaultKeyContext>,
): Promise<VaultEntry | null> {
  const existing = await getVaultByName(apiKey, name);
  if (!existing) return null;
  const nextKeyContext: VaultKeyContext = {
    owner: existing.keyContext.owner,
    environmentUrl: patch.environmentUrl ?? existing.keyContext.environmentUrl,
    label: patch.label ?? existing.keyContext.label,
  };
  await upsertVault(apiKey, name, existing.value, nextKeyContext);
  return { name, value: existing.value, keyContext: nextKeyContext };
}
