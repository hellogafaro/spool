import type { ReactNode } from "react";

import { APP_DISPLAY_NAME } from "../branding";
import { Button } from "../components/ui/button";
import { isWorkOsConfigured, useTrunkAuth } from "./workos";

export interface SignedOutGateProps {
  readonly children: ReactNode;
}

/**
 * Renders a sign-in surface when WorkOS is configured and the user is
 * signed out. Pass-through when WorkOS isn't configured (local dev).
 *
 * Place this at the root so every authenticated route is gated.
 */
export function SignedOutGate({ children }: SignedOutGateProps) {
  if (!isWorkOsConfigured) {
    return <>{children}</>;
  }
  return <SignedOutGateInner>{children}</SignedOutGateInner>;
}

function SignedOutGateInner({ children }: SignedOutGateProps) {
  const auth = useTrunkAuth();

  if (auth.status === "loading") {
    return <CenteredCard>Loading…</CenteredCard>;
  }

  if (auth.status === "signed-out") {
    return (
      <CenteredCard>
        <h1 className="text-2xl font-semibold tracking-tight">{APP_DISPLAY_NAME}</h1>
        <p className="text-sm text-muted-foreground">
          Sign in with your account to access your servers.
        </p>
        <Button onClick={auth.signIn}>Sign in</Button>
      </CenteredCard>
    );
  }

  return <>{children}</>;
}

function CenteredCard({ children }: { readonly children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10 text-foreground">
      <div className="w-full max-w-sm space-y-4 rounded-2xl border border-border/80 bg-card/90 p-6 text-center shadow-xl shadow-black/10 backdrop-blur-md">
        {children}
      </div>
    </div>
  );
}
