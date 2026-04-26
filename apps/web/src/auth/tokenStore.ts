/**
 * Module-level holder for the current WorkOS access token resolver.
 *
 * The auth provider registers a refresher (which delegates to AuthKit's
 * useAuth().getAccessToken) and the WS transport reads from here at
 * connect time so each new socket carries a fresh token in its URL.
 */

type TokenRefresher = () => Promise<string | null>;

let registeredRefresher: TokenRefresher | null = null;

export function setAccessTokenRefresher(refresher: TokenRefresher | null): void {
  registeredRefresher = refresher;
}

export async function getCurrentAccessToken(): Promise<string | null> {
  if (!registeredRefresher) return null;
  try {
    return await registeredRefresher();
  } catch {
    return null;
  }
}

/**
 * Returns the URL with `?token=<accessToken>&environmentId=<id>` appended
 * when both are available, otherwise returns the original URL unchanged.
 * Existing query params are preserved.
 */
export async function attachAccessTokenToUrl(rawUrl: string): Promise<string> {
  const token = await getCurrentAccessToken();
  if (!token) return rawUrl;
  try {
    const url = new URL(rawUrl);
    url.searchParams.set("token", token);
    const environmentId = readActiveEnvironmentId();
    if (environmentId) {
      url.searchParams.set("environmentId", environmentId);
    }
    return url.toString();
  } catch {
    return rawUrl;
  }
}

const ACTIVE_ENVIRONMENT_ID_KEY = "trunk:activeEnvironmentId";

export function readActiveEnvironmentId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(ACTIVE_ENVIRONMENT_ID_KEY);
  } catch {
    return null;
  }
}

export function writeActiveEnvironmentId(environmentId: string | null): void {
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
