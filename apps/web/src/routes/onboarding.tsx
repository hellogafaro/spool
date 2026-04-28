import { useAuth } from "@workos-inc/authkit-react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { CommandLineIcon, CubeTransparentIcon } from "@heroicons/react/16/solid";
import type { EnvironmentId } from "@t3tools/contracts";

import { addSavedEnvironment, removeSavedEnvironment } from "../environments/runtime";
import { upsertSavedEnv } from "../auth/savedEnvApi";
import { ensureLocalApi } from "../localApi";
import { useClaimedEnvironments } from "../auth/useClaimedEnvironments";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Spinner } from "../components/ui/spinner";
import { TrunkLogo } from "../components/ui/trunk-logo";

export const Route = createFileRoute("/onboarding")({
  component: OnboardingRouteView,
});

type InstallTab = "local" | "container";

const INSTALL_TABS: ReadonlyArray<{
  readonly value: InstallTab;
  readonly label: string;
  readonly icon: typeof CommandLineIcon;
}> = [
  { value: "local", label: "Local", icon: CommandLineIcon },
  { value: "container", label: "Container", icon: CubeTransparentIcon },
];

function OnboardingRouteView() {
  const auth = useAuth();
  const environments = useClaimedEnvironments();
  const navigate = useNavigate();

  const [installTab, setInstallTab] = useState<InstallTab>("local");
  const [environmentUrl, setEnvironmentUrl] = useState("");
  const [pairToken, setPairToken] = useState("");
  const [label, setLabel] = useState("");
  const [pairing, setPairing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pairingInFlightRef = useRef(false);

  useEffect(() => {
    if (environments.data && environments.data.length > 0) {
      void navigate({ to: "/", replace: true });
    }
  }, [environments.data, navigate]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pairingInFlightRef.current) return;
    pairingInFlightRef.current = true;
    setError(null);
    setPairing(true);
    const trimmedUrl = environmentUrl.trim();
    if (!isAcceptableEnvironmentUrl(trimmedUrl)) {
      pairingInFlightRef.current = false;
      setPairing(false);
      setError("Environment URL must start with https:// or http://localhost.");
      return;
    }
    let createdRecordId: EnvironmentId | null = null;
    try {
      const accessToken = await auth.getAccessToken();
      if (!accessToken) throw new Error("Couldn't get an access token. Try again.");
      const record = await addSavedEnvironment({
        host: trimmedUrl,
        pairingCode: pairToken.trim(),
        label: label.trim() || "Environment",
      });
      createdRecordId = record.environmentId;
      const bearer = await ensureLocalApi().persistence.getSavedEnvironmentSecret(
        record.environmentId,
      );
      if (!bearer) {
        throw new Error("Pairing succeeded locally but no bearer was issued. Try again.");
      }
      await upsertSavedEnv({
        environmentUrl: record.httpBaseUrl,
        environmentId: record.environmentId,
        label: record.label,
        bearer,
        accessToken,
      });
      createdRecordId = null;
      await environments.refetch();
    } catch (e) {
      if (createdRecordId) {
        await removeSavedEnvironment(createdRecordId).catch(() => undefined);
      }
      setError(e instanceof Error ? e.message : "Pairing failed.");
    } finally {
      pairingInFlightRef.current = false;
      setPairing(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4 text-foreground">
      <form onSubmit={(event) => void submit(event)} className="w-full max-w-md space-y-6">
        <TrunkLogo className="size-6 text-foreground" />

        <div className="space-y-1.5">
          <h1 className="text-xl font-medium">Add your first environment</h1>
          <p className="text-base text-muted-foreground">
            Trunk runs a coding agent on a machine you trust and streams the session into this app.
            Pair the machine once and start working.
          </p>
          {auth.user?.email ? (
            <Badge variant="secondary" className="mt-2">
              Signed in as {auth.user.email}
            </Badge>
          ) : null}
        </div>

        <ol className="ml-2.5 space-y-6 border-l border-border/70 pl-8 [counter-reset:step]">
          <Step title="Install Trunk on your machine">
            <div className="flex items-center gap-1">
              {INSTALL_TABS.map(({ value, label, icon: Icon }) => (
                <Button
                  key={value}
                  type="button"
                  size="sm"
                  variant={installTab === value ? "secondary" : "ghost"}
                  className="gap-1.5"
                  onClick={() => setInstallTab(value)}
                >
                  <Icon />
                  <span>{label}</span>
                </Button>
              ))}
            </div>
            {installTab === "local" ? <LocalGuide /> : <ContainerGuide />}
          </Step>

          <Step title="Paste the values it printed">
            <p className="text-sm text-muted-foreground">
              On first boot, Trunk prints a URL and a pair token in the console. Run it behind
              Tailscale, a Cloudflare tunnel, or on localhost — never expose it to the public
              internet.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="environment-url" className="text-sm">
                Environment URL
              </Label>
              <Input
                id="environment-url"
                type="url"
                value={environmentUrl}
                onChange={(event) => setEnvironmentUrl(event.target.value)}
                placeholder="https://t3.tailnet.ts.net"
                autoComplete="off"
                spellCheck={false}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pair-token" className="text-sm">
                Pair token
              </Label>
              <Input
                id="pair-token"
                value={pairToken}
                onChange={(event) => setPairToken(event.target.value)}
                placeholder="paste the token from the console"
                autoComplete="off"
                spellCheck={false}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="env-label" className="text-sm">
                Label
              </Label>
              <Input
                id="env-label"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="Laptop"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          </Step>
        </ol>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <Button type="submit" disabled={pairing} className="w-full gap-2">
          {pairing ? <Spinner className="size-4" /> : null}
          {pairing ? "Pairing…" : "Continue"}
        </Button>
      </form>
    </div>
  );
}

function CodeBlock({ children }: { readonly children: string }) {
  return (
    <pre className="overflow-x-auto rounded-md bg-card/60 px-3 py-2 font-mono text-sm">
      {children}
    </pre>
  );
}

function Step({ title, children }: { readonly title: string; readonly children?: ReactNode }) {
  return (
    <li className="relative space-y-3 [counter-increment:step] before:absolute before:top-0 before:-left-[calc(2rem+0.625rem+1px)] before:flex before:size-5 before:items-center before:justify-center before:rounded-full before:border before:border-border/70 before:bg-background before:text-[11px] before:font-semibold before:text-muted-foreground before:content-[counter(step)]">
      <h2 className="text-sm font-medium text-foreground">{title}</h2>
      {children}
    </li>
  );
}

function LocalGuide() {
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        Works on macOS, Linux, and Windows with WSL. One curl line installs it, then start it.
      </p>
      <CodeBlock>{"curl -fsSL https://app.trunk.codes/install.sh | sh"}</CodeBlock>
      <CodeBlock>{"trunk start"}</CodeBlock>
    </div>
  );
}

function isAcceptableEnvironmentUrl(value: string): boolean {
  if (value.length === 0) return false;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  if (parsed.protocol === "https:") return true;
  if (parsed.protocol === "http:") {
    return parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  }
  return false;
}

function ContainerGuide() {
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        Deploy the prebuilt template to Railway, Render, Fly.io, or any Docker host. Mount a{" "}
        <code className="rounded bg-card/60 px-1 py-0.5 font-mono text-sm">/data</code> volume so
        the Environment ID survives redeploys.
      </p>
      <CodeBlock>{"github.com/hellogafaro/trunk-environment"}</CodeBlock>
      <p className="text-sm text-muted-foreground/80">
        The container prints the pair values in its boot logs.
      </p>
    </div>
  );
}
