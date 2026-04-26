import { useEffect, useRef, type ReactNode } from "react";

import { fetchClaimedEnvironmentIds } from "./pairingApi";
import { readActiveEnvironmentId, writeActiveEnvironmentId } from "./tokenStore";
import { isWorkOsConfigured, useTrunkAuth } from "./workos";

export interface SignedOutGateProps {
  readonly children: ReactNode;
}

/**
 * Renders authenticated content when WorkOS is configured and the user is
 * signed in. Redirects to AuthKit when signed out. Pass-through when WorkOS
 * isn't configured (local dev).
 */
export function SignedOutGate({ children }: SignedOutGateProps) {
  if (!isWorkOsConfigured) {
    return <>{children}</>;
  }
  return <SignedOutGateInner>{children}</SignedOutGateInner>;
}

function SignedOutGateInner({ children }: SignedOutGateProps) {
  const auth = useTrunkAuth();
  const redirectedRef = useRef(false);
  const fetchedServerIdRef = useRef(false);

  useEffect(() => {
    if (auth.status === "signed-out" && !redirectedRef.current) {
      redirectedRef.current = true;
      auth.signIn();
    }
  }, [auth]);

  useEffect(() => {
    if (auth.status !== "signed-in" || fetchedServerIdRef.current) return;
    fetchedServerIdRef.current = true;
    void auth.getAccessToken().then((token) => {
      if (!token) return;
      void fetchClaimedEnvironmentIds(token).then((environmentIds) => {
        if (environmentIds.length === 0) {
          writeActiveEnvironmentId(null);
          return;
        }
        const current = readActiveEnvironmentId();
        const next = current && environmentIds.includes(current) ? current : environmentIds[0]!;
        writeActiveEnvironmentId(next);
      });
    });
  }, [auth]);

  if (auth.status === "signed-in") {
    return <>{children}</>;
  }

  return null;
}
