import { AuthKitProvider, useAuth } from "@workos-inc/authkit-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

const WORKOS_CLIENT_ID = (import.meta.env.VITE_WORKOS_CLIENT_ID as string | undefined)?.trim();
const WORKOS_API_HOSTNAME = (
  import.meta.env.VITE_WORKOS_API_HOSTNAME as string | undefined
)?.trim();

export const isWorkOsConfigured = !!WORKOS_CLIENT_ID;

interface TrunkAuthProviderProps {
  readonly children: ReactNode;
}

export function TrunkAuthProvider({ children }: TrunkAuthProviderProps): ReactNode {
  if (!isWorkOsConfigured || !WORKOS_CLIENT_ID) {
    return <>{children}</>;
  }
  return (
    <AuthKitProvider
      clientId={WORKOS_CLIENT_ID}
      {...(WORKOS_API_HOSTNAME ? { apiHostname: WORKOS_API_HOSTNAME } : {})}
      devMode={!WORKOS_API_HOSTNAME}
    >
      {children}
    </AuthKitProvider>
  );
}

export interface TrunkAuthState {
  readonly status: "disabled" | "loading" | "signed-out" | "signed-in";
  readonly userId: string | null;
  readonly email: string | null;
  readonly signIn: () => void;
  readonly signOut: () => void;
  readonly getAccessToken: () => Promise<string | null>;
}

const DISABLED_STATE: TrunkAuthState = {
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

function useTrunkAuthEnabled(): TrunkAuthState {
  const auth = useAuth();
  return useMemo<TrunkAuthState>(
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

function useTrunkAuthDisabled(): TrunkAuthState {
  return DISABLED_STATE;
}

export const useTrunkAuth: () => TrunkAuthState = isWorkOsConfigured
  ? useTrunkAuthEnabled
  : useTrunkAuthDisabled;

/**
 * Returns the current access token and refreshes it lazily. Returns null
 * when auth is disabled or the user isn't signed in. Components that need
 * to attach a token to a request should call refresh() right before they
 * fire the request so the token is fresh.
 */
export function useTrunkAccessToken(): {
  readonly token: string | null;
  readonly refresh: () => Promise<string | null>;
} {
  const { status, getAccessToken } = useTrunkAuth();
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
