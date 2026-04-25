export type OwnershipResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly status: 403 | 503; readonly reason: string };

export interface OwnershipChecker {
  (userId: string, serverId: string): Promise<OwnershipResult>;
}

interface CacheEntry {
  readonly result: OwnershipResult;
  readonly expiresAt: number;
}

const DEFAULT_TTL_MS = 5 * 60 * 1000;

interface WorkOsUserResponse {
  readonly id?: string;
  readonly metadata?: Record<string, unknown> | null;
}

async function fetchWorkOsUserMetadata(
  apiKey: string,
  userId: string,
): Promise<Record<string, unknown> | null> {
  const response = await fetch(`https://api.workos.com/user_management/users/${userId}`, {
    headers: { authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) {
    throw new Error(`WorkOS user fetch failed: ${response.status}`);
  }
  const body = (await response.json()) as WorkOsUserResponse;
  return body.metadata ?? null;
}

export interface WorkOsOwnershipOptions {
  readonly apiKey: string;
  readonly ttlMs?: number;
  readonly fetchMetadata?: (userId: string) => Promise<Record<string, unknown> | null>;
  readonly now?: () => number;
}

export function makeWorkOsOwnershipChecker(options: WorkOsOwnershipOptions): OwnershipChecker {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const now = options.now ?? (() => Date.now());
  const fetchMetadata =
    options.fetchMetadata ?? ((userId) => fetchWorkOsUserMetadata(options.apiKey, userId));
  const cache = new Map<string, CacheEntry>();

  return async (userId, serverId) => {
    const cacheKey = `${userId}:${serverId}`;
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > now()) {
      return cached.result;
    }

    let metadata: Record<string, unknown> | null;
    try {
      metadata = await fetchMetadata(userId);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "ownership lookup failed";
      return { ok: false, status: 503, reason };
    }

    const userServerId = typeof metadata?.serverId === "string" ? metadata.serverId : null;
    const result: OwnershipResult =
      userServerId === serverId
        ? { ok: true }
        : { ok: false, status: 403, reason: "user is not paired with this server" };

    cache.set(cacheKey, { result, expiresAt: now() + ttlMs });
    return result;
  };
}

export const allowAllOwnershipChecker: OwnershipChecker = async () => ({ ok: true });
