import { useEffect, useRef, type ReactNode } from "react";

import { APP_DISPLAY_NAME } from "../branding";
import { InstallationGuide } from "../components/onboarding/InstallationGuide";
import { Button } from "../components/ui/button";
import { Spinner } from "../components/ui/spinner";
import { readActiveEnvironmentId, writeActiveEnvironmentId } from "./tokenStore";
import { useClaimedEnvironments } from "./useClaimedEnvironments";
import { isWorkOsConfigured, useTrunkAuth } from "./workos";

export interface SignedOutGateProps {
  readonly children: ReactNode;
}

/**
 * Renders authenticated content when WorkOS is configured and the user is
 * signed in AND has at least one claimed environment. Redirects to AuthKit
 * when signed out. Shows an "add an environment" splash when signed in but
 * no environment has been claimed yet. Pass-through when WorkOS isn't
 * configured (local dev).
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

  if (auth.status !== "signed-in") {
    return null;
  }

  return <EnvironmentRequiredGate>{children}</EnvironmentRequiredGate>;
}

function EnvironmentRequiredGate({ children }: SignedOutGateProps) {
  const environments = useClaimedEnvironments();

  useEffect(() => {
    if (!environments.data) return;
    const ids = environments.data.environmentIds;
    if (ids.length === 0) {
      writeActiveEnvironmentId(null);
      return;
    }
    const stored = readActiveEnvironmentId();
    if (!stored || !ids.includes(stored)) {
      writeActiveEnvironmentId(ids[0] ?? null);
    }
  }, [environments.data]);

  if (environments.isLoading || (!environments.data && !environments.error)) {
    return (
      <CenteredCard>
        <Spinner className="size-4" />
        <p className="text-sm text-muted-foreground">Loading your environments…</p>
      </CenteredCard>
    );
  }

  if (environments.error) {
    return (
      <CenteredCard>
        <p className="text-sm font-medium text-foreground">Couldn't reach Trunk</p>
        <p className="text-xs text-muted-foreground">
          {environments.error.message}. Retrying automatically.
        </p>
        <Button size="sm" variant="outline" onClick={() => void environments.refetch()}>
          Retry now
        </Button>
      </CenteredCard>
    );
  }

  if (!environments.data || environments.data.environmentIds.length === 0) {
    return <NoEnvironmentSplash onRefresh={() => void environments.refetch()} />;
  }

  return <>{children}</>;
}

function NoEnvironmentSplash({ onRefresh }: { onRefresh: () => void }) {
  useEffect(() => {
    const interval = window.setInterval(() => onRefresh(), 5000);
    return () => window.clearInterval(interval);
  }, [onRefresh]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10 text-foreground">
      <section className="w-full max-w-2xl space-y-5 rounded-2xl border border-border/80 bg-card/90 p-6 shadow-xl shadow-black/10 backdrop-blur-md">
        <header className="space-y-1">
          <p className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
            {APP_DISPLAY_NAME}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Add your first environment</h1>
          <p className="text-sm text-muted-foreground">
            Trunk runs on a machine you control and streams here. Pick where you want to install
            it.
          </p>
        </header>

        <InstallationGuide
          footer={
            <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-3">
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Spinner className="size-3" />
                Watching for your environment…
              </p>
              <Button size="sm" variant="outline" onClick={onRefresh}>
                Refresh now
              </Button>
            </div>
          }
        />
      </section>
    </div>
  );
}

function CenteredCard({ children }: { readonly children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10 text-foreground">
      <div className="flex w-full max-w-sm flex-col items-center gap-3 rounded-2xl border border-border/80 bg-card/90 p-6 text-center shadow-xl shadow-black/10 backdrop-blur-md">
        {children}
      </div>
    </div>
  );
}
