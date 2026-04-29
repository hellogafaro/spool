import { useAuth } from "@workos-inc/authkit-react";
import { type EnvironmentId } from "@t3tools/contracts";
import { useNavigate, useLocation } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

import { useStore } from "../store";
import { useClaimedEnvironments } from "./useClaimedEnvironments";
import { getSavedEnv } from "./savedEnvApi";
import {
  getSavedEnvironmentRecord,
  persistSavedEnvironmentRecord,
  useSavedEnvironmentRegistryStore,
  waitForSavedEnvironmentRegistryHydration,
  writeSavedEnvironmentBearerToken,
} from "../environments/runtime/catalog";

/**
 * Redirects the signed-in user to /onboarding when they have no saved
 * environments. Hydrates each Worker-backed env into the local saved-env
 * registry so the runtime can dial directly without re-pairing per device.
 */
export function useEnvironmentGate(): { isReady: boolean } {
  const auth = useAuth();
  const environments = useClaimedEnvironments();
  const navigate = useNavigate();
  const pathname = useLocation({ select: (location) => location.pathname });
  const hydratedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!environments.data) return;
    const ids = environments.data;
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

  useEffect(() => {
    if (!environments.data) return;
    const ids = environments.data;
    if (ids.length === 0) return;

    let cancelled = false;
    void (async () => {
      const accessToken = await auth.getAccessToken();
      if (!accessToken) return;
      await waitForSavedEnvironmentRegistryHydration();
      for (const environmentId of ids) {
        if (cancelled) return;
        const typedEnvironmentId = environmentId as EnvironmentId;
        if (
          hydratedRef.current.has(environmentId) ||
          getSavedEnvironmentRecord(typedEnvironmentId)
        ) {
          continue;
        }
        try {
          const record = await getSavedEnv(environmentId, accessToken);
          const recordEnvironmentId = record.environmentId as EnvironmentId;
          const httpBaseUrl = record.environmentUrl.endsWith("/")
            ? record.environmentUrl
            : `${record.environmentUrl}/`;
          const wsBaseUrl = httpBaseUrl
            .replace(/^http:\/\//i, "ws://")
            .replace(/^https:\/\//i, "wss://");
          const now = new Date().toISOString();
          const next = {
            environmentId: recordEnvironmentId,
            label: record.label,
            httpBaseUrl,
            wsBaseUrl,
            createdAt: now,
            lastConnectedAt: now,
          };
          await persistSavedEnvironmentRecord(next);
          const persisted = await writeSavedEnvironmentBearerToken(
            next.environmentId,
            record.bearer,
          );
          if (!persisted) {
            useSavedEnvironmentRegistryStore.getState().remove(next.environmentId);
            continue;
          }
          useSavedEnvironmentRegistryStore.getState().upsert(next);
          hydratedRef.current.add(environmentId);
        } catch {
          // Best-effort hydration; runtime falls back to /onboarding if missing.
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [auth, environments.data]);

  const isReady =
    !!environments.data && (environments.data.length > 0 || pathname === "/onboarding");

  return { isReady };
}
