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
    return url.toString();
  } catch {
    return rawUrl;
  }
}
