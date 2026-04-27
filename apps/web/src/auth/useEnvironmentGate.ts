import { type EnvironmentId } from "@t3tools/contracts";
import { useNavigate, useLocation } from "@tanstack/react-router";
import { useEffect } from "react";

import { useStore } from "../store";
import { useClaimedEnvironments } from "./useClaimedEnvironments";

/**
 * Redirects the signed-in user to /onboarding when they have no claimed
 * environments. Also seeds T3's `activeEnvironmentId` from /me so the WS
 * layer has something to dial against on cold boot.
 */
export function useEnvironmentGate(): { isReady: boolean } {
  const environments = useClaimedEnvironments();
  const navigate = useNavigate();
  const pathname = useLocation({ select: (location) => location.pathname });

  useEffect(() => {
    if (!environments.data) return;
    const ids = environments.data.map((entry) => entry.environmentId);
    if (ids.length === 0) {
      if (pathname !== "/onboarding" && pathname !== "/pair") {
        void navigate({ to: "/onboarding", replace: true });
      }
      return;
    }
    const store = useStore.getState();
    const next = ids[0];
    if (next && (!store.activeEnvironmentId || !ids.includes(store.activeEnvironmentId))) {
      store.setActiveEnvironmentId(next as EnvironmentId);
    }
  }, [environments.data, navigate, pathname]);

  const isReady =
    !!environments.data && (environments.data.length > 0 || pathname === "/onboarding");

  return { isReady };
}
