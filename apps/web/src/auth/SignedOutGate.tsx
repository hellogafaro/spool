import { useEffect, useRef, type ReactNode } from "react";

import { APP_DISPLAY_NAME } from "../branding";
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
    if (environments.data.length === 0) {
      writeActiveEnvironmentId(null);
      return;
    }
    const stored = readActiveEnvironmentId();
    if (!stored || !environments.data.includes(stored)) {
      writeActiveEnvironmentId(environments.data[0] ?? null);
    }
  }, [environments.data]);

  if (environments.isLoading || !environments.data) {
    return (
      <CenteredCard>
        <Spinner className="size-4" />
        <p className="text-sm text-muted-foreground">Loading your environments…</p>
      </CenteredCard>
    );
  }

  if (environments.data.length === 0) {
    return <NoEnvironmentSplash onRefresh={() => void environments.refetch()} />;
  }

  return <>{children}</>;
}

function NoEnvironmentSplash({ onRefresh }: { onRefresh: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10 text-foreground">
      <section className="w-full max-w-lg space-y-5 rounded-2xl border border-border/80 bg-card/90 p-6 shadow-xl shadow-black/10 backdrop-blur-md">
        <header className="space-y-1">
          <p className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
            {APP_DISPLAY_NAME}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Add your first environment</h1>
          <p className="text-sm text-muted-foreground">
            Trunk runs on your machine and streams here. Run the installer on a laptop or VPS, or
            deploy the container template — it'll prompt you to claim it against this account.
          </p>
        </header>

        <section className="space-y-2 rounded-lg border border-border/70 bg-background/40 p-3">
          <p className="text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            Laptop
          </p>
          <pre className="overflow-x-auto rounded-md bg-card/60 px-3 py-2 font-mono text-xs">
            curl -fsSL https://app.trunk.codes/install.sh | sh
          </pre>
        </section>

        <section className="space-y-2 rounded-lg border border-border/70 bg-background/40 p-3">
          <p className="text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            Container
          </p>
          <p className="text-sm text-muted-foreground">
            Deploy{" "}
            <a
              className="text-primary hover:underline"
              href="https://github.com/hellogafaro/trunk-server"
              target="_blank"
              rel="noreferrer"
            >
              hellogafaro/trunk-server
            </a>{" "}
            on Railway / Render / Fly. Add a <code>/data</code> volume and watch the logs for the
            sign-in URL.
          </p>
        </section>

        <div className="flex items-center justify-between gap-2 pt-1">
          <p className="text-xs text-muted-foreground">
            Already ran it? This page refreshes automatically.
          </p>
          <Button size="sm" variant="outline" onClick={onRefresh}>
            Refresh
          </Button>
        </div>
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
