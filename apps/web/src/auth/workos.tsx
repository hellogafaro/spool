import { AuthKitProvider, useAuth } from "@workos-inc/authkit-react";
import { useEffect, useRef, type ReactNode } from "react";

const WORKOS_CLIENT_ID = (import.meta.env.VITE_WORKOS_CLIENT_ID as string | undefined)?.trim();
const WORKOS_API_HOSTNAME = (
  import.meta.env.VITE_WORKOS_API_HOSTNAME as string | undefined
)?.trim();

export const isWorkOsConfigured = !!WORKOS_CLIENT_ID;

type TokenRefresher = () => Promise<string | null>;
let registeredRefresher: TokenRefresher | null = null;

/**
 * Returns a fresh WorkOS access token from outside the React tree.
 * AuthProvider registers the AuthKit refresher on mount; the WS transport
 * calls this at connect time so every socket carries a current token.
 */
export async function getCurrentAccessToken(): Promise<string | null> {
  if (!registeredRefresher) return null;
  try {
    return await registeredRefresher();
  } catch {
    return null;
  }
}

/**
 * Wraps the app in WorkOS AuthKit and only renders children once the
 * user is signed in. Signed-out users are auto-redirected to AuthKit's
 * sign-in page. Pass-through when WorkOS isn't configured (local dev).
 *
 * Components inside the tree should call `useAuth()` from
 * `@workos-inc/authkit-react` directly — there is no wrapper hook.
 */
export function AuthProvider({ children }: { readonly children: ReactNode }): ReactNode {
  if (!isWorkOsConfigured || !WORKOS_CLIENT_ID) {
    return <>{children}</>;
  }
  return (
    <AuthKitProvider
      clientId={WORKOS_CLIENT_ID}
      {...(WORKOS_API_HOSTNAME ? { apiHostname: WORKOS_API_HOSTNAME } : {})}
      devMode={!WORKOS_API_HOSTNAME}
    >
      <SignedInOnly>{children}</SignedInOnly>
    </AuthKitProvider>
  );
}

function SignedInOnly({ children }: { readonly children: ReactNode }) {
  const auth = useAuth();
  const redirectedRef = useRef(false);

  useEffect(() => {
    registeredRefresher = () => auth.getAccessToken().then((value) => value ?? null);
    return () => {
      registeredRefresher = null;
    };
  }, [auth]);

  useEffect(() => {
    if (!auth.isLoading && !auth.user && !redirectedRef.current) {
      redirectedRef.current = true;
      auth.signIn();
    }
  }, [auth]);

  if (auth.isLoading || !auth.user) {
    return null;
  }
  return <>{children}</>;
}
