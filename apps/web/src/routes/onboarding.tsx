import { useAuth } from "@workos-inc/authkit-react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { CommandLineIcon, CubeTransparentIcon, KeyIcon } from "@heroicons/react/16/solid";

import { updateActiveEnvironmentId } from "../auth/activeEnvironment";
import { claimEnvironment } from "../auth/pairing";
import { useClaimedEnvironments } from "../auth/useClaimedEnvironments";
import { TrunkLogo } from "../components/TrunkLogo";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Spinner } from "../components/ui/spinner";

export const Route = createFileRoute("/onboarding")({
  component: OnboardingRouteView,
});

type Tab = "local" | "container" | "manual";

const TABS: ReadonlyArray<{
  readonly value: Tab;
  readonly label: string;
  readonly icon: typeof CommandLineIcon;
}> = [
  { value: "local", label: "Local", icon: CommandLineIcon },
  { value: "container", label: "Container", icon: CubeTransparentIcon },
  { value: "manual", label: "Manual", icon: KeyIcon },
];

function OnboardingRouteView() {
  const auth = useAuth();
  const environments = useClaimedEnvironments();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("local");

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
    <div className="flex min-h-screen items-center justify-center bg-background p-4 text-foreground">
      <div className="w-full max-w-md space-y-6">
        <TrunkLogo />

        <div className="space-y-1.5">
          <h1 className="text-xl font-semibold">Add your first environment</h1>
          <p className="text-base text-muted-foreground">
            Pair the machine where Trunk runs. Sessions stream from there to here.
          </p>
          {auth.user?.email ? (
            <Badge variant="secondary" className="mt-2">
              Signed in as {auth.user.email}
            </Badge>
          ) : null}
        </div>

        <div className="flex items-center gap-1">
          {TABS.map(({ value, label, icon: Icon }) => (
            <Button
              key={value}
              type="button"
              size="sm"
              variant={tab === value ? "secondary" : "ghost"}
              className="gap-1.5"
              onClick={() => setTab(value)}
            >
              <Icon />
              <span>{label}</span>
            </Button>
          ))}
        </div>

        {tab === "local" ? <LocalGuide /> : null}
        {tab === "container" ? <ContainerGuide /> : null}
        {tab === "manual" ? <ManualPairForm onPaired={() => void environments.refetch()} /> : null}

        {tab !== "manual" ? (
          <Button disabled className="w-full cursor-wait gap-2">
            <Spinner className="size-4" />
            Watching for your environment…
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function CodeBlock({ children }: { readonly children: string }) {
  return (
    <pre className="overflow-x-auto rounded-md bg-card/60 px-3 py-2 font-mono text-xs">
      {children}
    </pre>
  );
}

function StepList({ children }: { readonly children: ReactNode }) {
  return <ol className="space-y-2">{children}</ol>;
}

function Step({
  index,
  title,
  children,
}: {
  readonly index: number;
  readonly title: string;
  readonly children?: ReactNode;
}) {
  return (
    <li className="flex items-start gap-3 rounded-md border border-border/70 p-2">
      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-card text-[11px] font-semibold text-muted-foreground">
        {index}
      </span>
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {children}
      </div>
    </li>
  );
}

function LocalGuide() {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">macOS, Linux, or Windows (WSL).</p>
      <StepList>
        <Step index={1} title="Install Trunk">
          <CodeBlock>{"curl -fsSL https://app.trunk.codes/install.sh | sh"}</CodeBlock>
        </Step>
        <Step index={2} title="Pair and run">
          <CodeBlock>{"trunk pair && trunk start"}</CodeBlock>
          <p className="text-xs text-muted-foreground/80">
            <code>trunk pair</code> opens a sign-in URL. Click it, sign in, done.
          </p>
        </Step>
      </StepList>
    </div>
  );
}

function ContainerGuide() {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Railway, Render, Fly, or any Docker host.</p>
      <StepList>
        <Step index={1} title="Fork the template">
          <CodeBlock>{"github.com/hellogafaro/trunk-environment"}</CodeBlock>
          <p className="text-xs text-muted-foreground/80">
            Mount a <code>/data</code> volume so the environmentId survives redeploys.
          </p>
        </Step>
        <Step index={2} title="Watch the logs on first boot">
          <p className="text-xs text-muted-foreground/80">
            The container prints a sign-in URL. Open it on any device — the env claims itself.
          </p>
        </Step>
      </StepList>
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
    <form onSubmit={(event) => void submit(event)} className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Paste the Environment ID and Token printed by the env on first boot.
      </p>
      <div className="space-y-1.5">
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
          required
        />
      </div>
      <div className="space-y-1.5">
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
          required
        />
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      <Button type="submit" disabled={pairing} className="w-full gap-2">
        {pairing ? <Spinner className="size-4" /> : null}
        {pairing ? "Pairing…" : "Pair environment"}
      </Button>
    </form>
  );
}
