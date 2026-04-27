import { getEnvironments, getUserMetadata } from "./workos.ts";

export type OwnershipResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly status: 403 | 503; readonly reason: string };

export interface OwnershipChecker {
  (userId: string, environmentId: string): Promise<OwnershipResult>;
}

interface CacheEntry {
  readonly result: OwnershipResult;
  readonly expiresAt: number;
}

const DEFAULT_TTL_MS = 5 * 60 * 1000;

export interface WorkOsOwnershipOptions {
  readonly apiKey: string;
  readonly ttlMs?: number;
  readonly getMetadata?: (userId: string) => Promise<Record<string, unknown> | null>;
  readonly now?: () => number;
}

export function makeWorkOsOwnershipChecker(options: WorkOsOwnershipOptions): OwnershipChecker {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const now = options.now ?? (() => Date.now());
  const getMetadata = options.getMetadata ?? ((userId) => getUserMetadata(options.apiKey, userId));
  const cache = new Map<string, CacheEntry>();

  return async (userId, environmentId) => {
    const cacheKey = `${userId}:${environmentId}`;
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > now()) {
      return cached.result;
    }

    let metadata: Record<string, unknown> | null;
    try {
      metadata = await getMetadata(userId);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "ownership lookup failed";
      return { ok: false, status: 503, reason };
    }

    const result: OwnershipResult = getEnvironments(metadata).includes(environmentId)
      ? { ok: true }
      : { ok: false, status: 403, reason: "user is not paired with this environment" };

    cache.set(cacheKey, { result, expiresAt: now() + ttlMs });
    return result;
  };
}

export const allowAllOwnershipChecker: OwnershipChecker = async () => ({ ok: true });
