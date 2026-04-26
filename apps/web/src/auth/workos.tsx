import { AuthKitProvider, useAuth as useAuthKit } from "@workos-inc/authkit-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

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
    if (auth.status === "signed-out" && !redirectedRef.current) {
      redirectedRef.current = true;
      auth.signIn();
    }
  }, [auth]);

  if (auth.status !== "signed-in") {
    return null;
  }
  return <>{children}</>;
}

export interface AuthState {
  readonly status: "disabled" | "loading" | "signed-out" | "signed-in";
  readonly userId: string | null;
  readonly email: string | null;
  readonly signIn: () => void;
  readonly signOut: () => void;
  readonly getAccessToken: () => Promise<string | null>;
}

const DISABLED_STATE: AuthState = {
  status: "disabled",
  userId: null,
  email: null,
  signIn: () => {
    /* no-op when WorkOS isn't configured */
  },
  signOut: () => {
    /* no-op when WorkOS isn't configured */
  },
  getAccessToken: async () => null,
};

function useAuthEnabled(): AuthState {
  const auth = useAuthKit();
  useEffect(() => {
    setAccessTokenRefresher(() => auth.getAccessToken().then((value) => value ?? null));
    return () => setAccessTokenRefresher(null);
  }, [auth]);
  return useMemo<AuthState>(
    () => ({
      status: auth.isLoading ? "loading" : auth.user ? "signed-in" : "signed-out",
      userId: auth.user?.id ?? null,
      email: auth.user?.email ?? null,
      signIn: () => auth.signIn(),
      signOut: () => auth.signOut(),
      getAccessToken: () => auth.getAccessToken(),
    }),
    [auth],
  );
}

function useAuthDisabled(): AuthState {
  return DISABLED_STATE;
}

export const useAuth: () => AuthState = isWorkOsConfigured ? useAuthEnabled : useAuthDisabled;

/**
 * Returns the current access token and refreshes it lazily. Returns null
 * when auth is disabled or the user isn't signed in. Components that need
 * to attach a token to a request should call refresh() right before they
 * fire the request so the token is fresh.
 */
export function useAccessToken(): {
  readonly token: string | null;
  readonly refresh: () => Promise<string | null>;
} {
  const { status, getAccessToken } = useAuth();
  const [token, setToken] = useState<string | null>(null);
  const inFlight = useRef<Promise<string | null> | null>(null);

  useEffect(() => {
    if (status !== "signed-in") {
      setToken(null);
      return;
    }
    let cancelled = false;
    void getAccessToken().then((next) => {
      if (!cancelled) setToken(next ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [status, getAccessToken]);

  const refresh = useMemo(() => {
    return async (): Promise<string | null> => {
      if (status !== "signed-in") return null;
      if (inFlight.current) return inFlight.current;
      const promise = getAccessToken().then((next) => {
        const value = next ?? null;
        setToken(value);
        return value;
      });
      inFlight.current = promise.finally(() => {
        inFlight.current = null;
      });
      return inFlight.current;
    };
  }, [status, getAccessToken]);

  return { token, refresh };
}
