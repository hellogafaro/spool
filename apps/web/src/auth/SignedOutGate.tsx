import { useEffect, useRef, type ReactNode } from "react";

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

  useEffect(() => {
    if (auth.status === "signed-out" && !redirectedRef.current) {
      redirectedRef.current = true;
      auth.signIn();
    }
  }, [auth]);

  if (auth.status === "signed-in") {
    return <>{children}</>;
  }

  return null;
}
