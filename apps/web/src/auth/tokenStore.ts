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
 * Returns the URL with `?token=<accessToken>` appended when a token is
 * available, otherwise returns the original URL unchanged. Existing
 * query params on the input URL are preserved.
 */
export async function attachAccessTokenToUrl(rawUrl: string): Promise<string> {
  const token = await getCurrentAccessToken();
  if (!token) return rawUrl;
  try {
    const url = new URL(rawUrl);
    url.searchParams.set("token", token);
    const serverId = readClaimedServerId();
    if (serverId) {
      url.searchParams.set("serverId", serverId);
    }
    return url.toString();
  } catch {
    return rawUrl;
  }
}

const CLAIMED_SERVER_ID_KEY = "trunk:claimedServerId";

export function readClaimedServerId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(CLAIMED_SERVER_ID_KEY);
  } catch {
    return null;
  }
}

export function writeClaimedServerId(serverId: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (serverId) {
      window.localStorage.setItem(CLAIMED_SERVER_ID_KEY, serverId);
    } else {
      window.localStorage.removeItem(CLAIMED_SERVER_ID_KEY);
    }
  } catch {
    // ignore: storage unavailable / quota exceeded
  }
}
