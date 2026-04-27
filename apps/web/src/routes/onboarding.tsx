import { useAuth } from "@workos-inc/authkit-react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";

import { updateActiveEnvironmentId } from "../auth/activeEnvironment";
import { claimEnvironment } from "../auth/pairing";
import { useClaimedEnvironments } from "../auth/useClaimedEnvironments";
import { APP_DISPLAY_NAME } from "../branding";
import { InstallationGuide } from "../components/onboarding/InstallationGuide";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Spinner } from "../components/ui/spinner";

export const Route = createFileRoute("/onboarding")({
  component: OnboardingRouteView,
});

function OnboardingRouteView() {
  const auth = useAuth();
  const environments = useClaimedEnvironments();
  const navigate = useNavigate();

  useEffect(() => {
    if (environments.data && environments.data.length > 0) {
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
          {auth.user?.email ? (
            <p className="pt-1 text-xs text-muted-foreground">
              Signed in as <span className="font-medium text-foreground">{auth.user.email}</span>.
              If your CLI claimed against a different account, sign out and try again.
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

        <ManualPairForm onPaired={() => void environments.refetch()} />
      </section>
    </div>
  );
}

function ManualPairForm({ onPaired }: { readonly onPaired: () => void }) {
  const auth = useAuth();
  const [environmentId, setEnvironmentId] = useState("");
  const [token, setToken] = useState("");
  const [pairing, setPairing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pairing) return;
    setError(null);
    setPairing(true);
    try {
      const accessToken = await auth.getAccessToken();
      if (!accessToken) throw new Error("Couldn't get an access token. Try again.");
      await claimEnvironment({
        environmentId: environmentId.trim(),
        token: token.trim(),
        accessToken,
      });
      updateActiveEnvironmentId(environmentId.trim());
      onPaired();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Pairing failed.");
    } finally {
      setPairing(false);
    }
  };

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="space-y-3 rounded-xl border border-border/70 bg-background/40 p-4"
    >
      <div className="space-y-1">
        <h2 className="text-sm font-medium text-foreground">Or paste your environment details</h2>
        <p className="text-xs text-muted-foreground">
          Use the Environment ID and Token printed by the env on its first boot.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="manual-env-id" className="text-xs">
          Environment ID
        </Label>
        <Input
          id="manual-env-id"
          value={environmentId}
          onChange={(event) => setEnvironmentId(event.target.value)}
          placeholder="abcdefghjk23"
          autoComplete="off"
          spellCheck={false}
          className="font-mono text-sm"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="manual-token" className="text-xs">
          Token
        </Label>
        <Input
          id="manual-token"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          placeholder="64-char hex string from the env console"
          autoComplete="off"
          spellCheck={false}
          className="font-mono text-sm"
          required
        />
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      <Button type="submit" size="sm" disabled={pairing}>
        {pairing ? "Pairing…" : "Pair environment"}
      </Button>
    </form>
  );
}
