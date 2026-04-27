import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";

import { isWorkOsConfigured } from "../auth/workos";
import { PairingPendingSurface, PairingRouteSurface } from "../components/auth/PairingRouteSurface";

/**
 * /pair belongs to T3's local LAN pair flow. SaaS users never land here —
 * we redirect them to /onboarding which owns the WorkOS-bound form.
 */
export const Route = createFileRoute("/pair")({
  beforeLoad: async ({ context }) => {
    if (isWorkOsConfigured) {
      throw redirect({ to: "/onboarding", replace: true });
    }
    const { authGateState } = context;
    if (authGateState.status === "authenticated") {
      throw redirect({ to: "/", replace: true });
    }
    return {};
  },
  component: LegacyT3PairView,
  pendingComponent: PairingPendingSurface,
});

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
