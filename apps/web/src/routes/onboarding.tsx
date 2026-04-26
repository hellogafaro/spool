import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { useClaimedEnvironments } from "../auth/useClaimedEnvironments";
import { useAuth } from "../auth/workos";
import { APP_DISPLAY_NAME } from "../branding";
import { InstallationGuide } from "../components/onboarding/InstallationGuide";
import { Button } from "../components/ui/button";
import { Spinner } from "../components/ui/spinner";

export const Route = createFileRoute("/onboarding")({
  component: OnboardingRouteView,
});

function OnboardingRouteView() {
  const auth = useAuth();
  const environments = useClaimedEnvironments();
  const navigate = useNavigate();

  useEffect(() => {
    if (environments.data && environments.data.environmentIds.length > 0) {
      void navigate({ to: "/", replace: true });
    }
  }, [environments.data, navigate]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void environments.refetch();
    }, 5000);
    return () => window.clearInterval(interval);
  }, [environments]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10 text-foreground">
      <section className="w-full max-w-2xl space-y-5 rounded-2xl border border-border/80 bg-card/90 p-6 shadow-xl shadow-black/10 backdrop-blur-md">
        <header className="space-y-1">
          <p className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
            {APP_DISPLAY_NAME}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Add your first environment</h1>
          <p className="text-sm text-muted-foreground">
            Trunk runs on a machine you control and streams here.
          </p>
          {auth.email ? (
            <p className="pt-1 text-xs text-muted-foreground">
              Signed in as <span className="font-medium text-foreground">{auth.email}</span>. If
              your CLI claimed against a different account, sign out and try again.
            </p>
          ) : null}
        </header>

        <InstallationGuide
          footer={
            <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-3">
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Spinner className="size-3" />
                Watching for your environment…
              </p>
              <Button size="sm" variant="outline" onClick={() => void environments.refetch()}>
                Refresh now
              </Button>
            </div>
          }
        />
      </section>
    </div>
  );
}
