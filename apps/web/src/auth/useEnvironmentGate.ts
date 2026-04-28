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
    const missing = ids.filter(
      (environmentId) =>
        !hydratedRef.current.has(environmentId) &&
        !getSavedEnvironmentRecord(environmentId as EnvironmentId),
    );
    if (missing.length === 0) return;

    let cancelled = false;
    void (async () => {
      const accessToken = await auth.getAccessToken();
      if (!accessToken) return;
      for (const environmentId of missing) {
        if (cancelled) return;
        try {
          const record = await getSavedEnv(environmentId, accessToken);
          const persisted = await writeSavedEnvironmentBearerToken(
            record.environmentId as EnvironmentId,
            record.bearer,
          );
          if (!persisted) continue;
          const httpBaseUrl = record.environmentUrl.endsWith("/")
            ? record.environmentUrl
            : `${record.environmentUrl}/`;
          const wsBaseUrl = httpBaseUrl
            .replace(/^http:\/\//i, "ws://")
            .replace(/^https:\/\//i, "wss://");
          const now = new Date().toISOString();
          const next = {
            environmentId: record.environmentId as EnvironmentId,
            label: record.label,
            httpBaseUrl,
            wsBaseUrl,
            createdAt: now,
            lastConnectedAt: now,
          };
          await persistSavedEnvironmentRecord(next);
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

  const registryById = useSavedEnvironmentRegistryStore((state) => state.byId);
  const hasHydratedConnection = environments.data?.some(
    (environmentId) => registryById[environmentId as EnvironmentId] !== undefined,
  );
  const isReady =
    !!environments.data &&
    (environments.data.length === 0
      ? pathname === "/onboarding"
      : hasHydratedConnection === true || pathname === "/onboarding");

  return { isReady };
}
