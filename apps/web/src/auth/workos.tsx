import { AuthKitProvider, useAuth } from "@workos-inc/authkit-react";
import { useEffect, useRef, type ReactNode } from "react";

import { setAccessTokenRefresher } from "./tokenStore";

const WORKOS_CLIENT_ID = (import.meta.env.VITE_WORKOS_CLIENT_ID as string | undefined)?.trim();
const WORKOS_API_HOSTNAME = (
  import.meta.env.VITE_WORKOS_API_HOSTNAME as string | undefined
)?.trim();

export const isWorkOsConfigured = !!WORKOS_CLIENT_ID;

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

  // The WS transport reads this at connect time so each new socket
  // carries a fresh access token in its URL.
  useEffect(() => {
    setAccessTokenRefresher(() => auth.getAccessToken().then((value) => value ?? null));
    return () => setAccessTokenRefresher(null);
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
