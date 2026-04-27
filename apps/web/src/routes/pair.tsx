import { useAuth } from "@workos-inc/authkit-react";
import { createFileRoute, redirect, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { claimEnvironment } from "../auth/pairing";
import { updateActiveEnvironmentId } from "../auth/activeEnvironment";
import { useClaimedEnvironments } from "../auth/useClaimedEnvironments";
import { isWorkOsConfigured } from "../auth/workos";
import { PairingPendingSurface, PairingRouteSurface } from "../components/auth/PairingRouteSurface";
import { TrunkLogo } from "../components/TrunkLogo";
import { Button } from "../components/ui/button";
import { Spinner } from "../components/ui/spinner";

type PairSearch = Partial<{ readonly environmentId: string }>;

export const Route = createFileRoute("/pair")({
  validateSearch: (raw): PairSearch => {
    if (typeof raw.environmentId === "string" && raw.environmentId.length > 0) {
      return { environmentId: raw.environmentId };
    }
    return {};
  },
  beforeLoad: async ({ context, search }) => {
    if (isWorkOsConfigured) {
      // SaaS mode: /pair always renders the env-pair flow. WorkOS sign-in
      // already gated us into the app, so we don't need T3's authGateState here.
      return {};
    }
    const { authGateState } = context;
    if (!search.environmentId && authGateState.status === "authenticated") {
      throw redirect({ to: "/", replace: true });
    }
    return {};
  },
  component: PairRouteView,
  pendingComponent: PairRoutePendingView,
});

function PairRouteView() {
  if (isWorkOsConfigured) {
    return <EnvironmentPairView />;
  }
  return <LegacyT3PairView />;
}

function PairRoutePendingView() {
  return <PairingPendingSurface />;
}

function LegacyT3PairView() {
  const parentContext = Route.useRouteContext();
  const authGateState = (parentContext as { authGateState?: unknown }).authGateState as
    | {
        readonly status: "authenticated" | "requires-auth";
        readonly auth?: Parameters<typeof PairingRouteSurface>[0]["auth"];
        readonly errorMessage?: string;
      }
    | undefined;
  const navigate = useNavigate();

  if (!authGateState || authGateState.status === "authenticated" || !authGateState.auth) {
    return null;
  }

  return (
    <PairingRouteSurface
      auth={authGateState.auth}
      onAuthenticated={() => {
        void navigate({ to: "/", replace: true });
      }}
      {...(authGateState.errorMessage ? { initialErrorMessage: authGateState.errorMessage } : {})}
    />
  );
}

type Status =
  | { kind: "idle" }
  | { kind: "claiming" }
  | { kind: "claimed" }
  | { kind: "error"; message: string };

function EnvironmentPairView() {
  const auth = useAuth();
  const search = useSearch({ from: "/pair" });
  const navigate = useNavigate();
  const environments = useClaimedEnvironments();

  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const triggeredRef = useRef(false);

  const environmentId = search.environmentId;
  // The CLI prints a URL like /pair?environmentId=X#token=Y. Token rides in
  // the fragment so HTTP referrers never leak it. Read it once on mount;
  // the value isn't reactive.
  const pairTokenRef = useRef<string | null>(null);
  if (pairTokenRef.current === null) {
    pairTokenRef.current = readPairTokenFromHash();
  }

  useEffect(() => {
    if (!environmentId || !auth.user || triggeredRef.current) return;
    const pairToken = pairTokenRef.current;
    if (!pairToken) {
      setStatus({
        kind: "error",
        message: "This pair link is missing its token. Open the URL the environment printed.",
      });
      return;
    }
    triggeredRef.current = true;
    setStatus({ kind: "claiming" });
    void (async () => {
      try {
        const accessToken = await auth.getAccessToken();
        if (!accessToken) {
          setStatus({ kind: "error", message: "Couldn't get an access token. Try again." });
          return;
        }
        await claimEnvironment({ environmentId, token: pairToken, accessToken });
        updateActiveEnvironmentId(environmentId);
        await environments.refetch();
        setStatus({ kind: "claimed" });
      } catch (error) {
        setStatus({
          kind: "error",
          message: error instanceof Error ? error.message : "Couldn't pair that environment.",
        });
      }
    })();
  }, [environmentId, auth, environments]);

  useEffect(() => {
    if (status.kind === "claimed") {
      const timer = window.setTimeout(() => void navigate({ to: "/", replace: true }), 800);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [status, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4 text-foreground">
      <div className="w-full max-w-md space-y-6">
        <TrunkLogo />

        <div className="space-y-1.5">
          <h1 className="text-xl font-semibold">Pair environment</h1>
          <p className="text-base text-muted-foreground">
            {environmentId ? (
              <span className="font-mono text-foreground">{environmentId}</span>
            ) : (
              "Open the link your environment printed."
            )}
          </p>
        </div>

        <Body status={status} environmentId={environmentId} />
      </div>
    </div>
  );
}

function Body({ status, environmentId }: { status: Status; environmentId: string | undefined }) {
  if (!environmentId) return null;

  if (status.kind === "claiming" || status.kind === "idle") {
    return (
      <Button size="default" disabled className="w-full gap-2 cursor-wait">
        <Spinner className="size-4" />
        Pairing…
      </Button>
    );
  }

  if (status.kind === "claimed") {
    return <p className="text-sm text-foreground">Done. Taking you to the chat…</p>;
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-destructive">{status.message}</p>
      <Button onClick={() => window.location.reload()} size="default" className="w-full">
        Try again
      </Button>
    </div>
  );
}

function readPairTokenFromHash(): string | null {
  if (typeof window === "undefined") return null;
  const raw = window.location.hash;
  if (!raw || raw.length <= 1) return null;
  const params = new URLSearchParams(raw.startsWith("#") ? raw.slice(1) : raw);
  const token = params.get("token")?.trim() ?? "";
  return token.length > 0 ? token : null;
}
