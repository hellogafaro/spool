/**
 * Persists the user's currently selected environmentId in localStorage so
 * the WS transport (which runs outside the React tree) can read it at
 * connect time and tag each socket with the right tenant.
 */

const ACTIVE_ENVIRONMENT_ID_KEY = "trunk:activeEnvironmentId";

export function getActiveEnvironmentId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(ACTIVE_ENVIRONMENT_ID_KEY);
  } catch {
    return null;
  }
}

export function updateActiveEnvironmentId(environmentId: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (environmentId) {
      window.localStorage.setItem(ACTIVE_ENVIRONMENT_ID_KEY, environmentId);
    } else {
      window.localStorage.removeItem(ACTIVE_ENVIRONMENT_ID_KEY);
    }
  } catch {
    // ignore: storage unavailable / quota exceeded
  }
}
