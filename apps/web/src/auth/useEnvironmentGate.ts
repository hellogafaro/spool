import { useNavigate, useLocation } from "@tanstack/react-router";
import { useEffect } from "react";

import { getActiveEnvironmentId, updateActiveEnvironmentId } from "./activeEnvironment";
import { useClaimedEnvironments } from "./useClaimedEnvironments";

/**
 * Redirects to /onboarding when the signed-in user has no claimed
 * environments. Also keeps the active environmentId in localStorage
 * in sync with the user's actual list.
 *
 * Lives inside the router so it can use the router's QueryClient and
 * navigate via react-router. Mount it once near the route root.
 */
export function useEnvironmentGate(): { isReady: boolean } {
  const environments = useClaimedEnvironments();
  const navigate = useNavigate();
  const pathname = useLocation({ select: (location) => location.pathname });

  useEffect(() => {
    if (!environments.data) return;
    const ids = environments.data.environmentIds;
    if (ids.length === 0) {
      updateActiveEnvironmentId(null);
      if (pathname !== "/onboarding" && pathname !== "/pair") {
        void navigate({ to: "/onboarding", replace: true });
      }
      return;
    }
    const stored = getActiveEnvironmentId();
    if (!stored || !ids.includes(stored)) {
      updateActiveEnvironmentId(ids[0] ?? null);
    }
  }, [environments.data, navigate, pathname]);

  const isReady =
    !!environments.data &&
    (environments.data.environmentIds.length > 0 || pathname === "/onboarding");

  return { isReady };
}
