import { type EnvironmentId, ThreadId } from "@t3tools/contracts";
import { useCallback, useEffect, useRef, useState } from "react";

import { createEnvironmentApi } from "~/environmentApi";
import { getPrimaryEnvironmentConnection } from "~/environments/runtime";
import { applyProvidersUpdated, useServerConfig } from "~/rpc/serverState";

import { getProviderCommands } from "./providerCommands";

export type InstallStatus = "idle" | "installing" | "done" | "error";

export interface UseProviderInstallResult {
  readonly status: InstallStatus;
  readonly errorMessage: string | null;
  readonly install: () => void;
}

/**
 * Drives the "Install" button on the providers settings card.
 *
 * Opens a hidden terminal on the active environment, writes
 * `<install-cmd> && exit\n`, and resolves when the shell exits. On exit code 0
 * the button shows "Installed ✓" for ~2.5s before settling — provider polling
 * picks up the new CLI state shortly after.
 *
 * Reuses the existing `terminal.*` RPCs so we don't bolt a new exec channel
 * onto T3.
 */
export function useProviderInstall(providerId: string): UseProviderInstallResult {
  const serverConfig = useServerConfig();
  const [status, setStatus] = useState<InstallStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const inFlightRef = useRef(false);
  // Track active session so we can clean up on unmount.
  const activeSessionRef = useRef<{
    environmentId: EnvironmentId;
    threadId: ThreadId;
    terminalId: string;
    unsubscribe: () => void;
  } | null>(null);
  const doneTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const install = useCallback(() => {
    if (inFlightRef.current) return;
    if (!serverConfig) {
      setStatus("error");
      setErrorMessage("Environment is offline.");
      return;
    }
    let primary;
    try {
      primary = getPrimaryEnvironmentConnection();
    } catch {
      setStatus("error");
      setErrorMessage("Environment is offline.");
      return;
    }
    const api = createEnvironmentApi(primary.client);
    const envId = primary.environmentId;
    const commands = getProviderCommands(providerId);
    if (!commands) {
      setStatus("error");
      setErrorMessage(`No install recipe for ${providerId}.`);
      return;
    }

    // Suffix with timestamp so each click gets a fresh PTY. Reusing the same
    // threadId after a previous install exited would not re-fire "started" and
    // we'd hang in "installing" forever.
    const threadId = ThreadId.make(`__trunk-provider-install__${providerId}__${Date.now()}`);
    const terminalId = "default";
    const cwd = serverConfig.cwd;

    inFlightRef.current = true;
    setStatus("installing");
    setErrorMessage(null);

    let unsubscribe: (() => void) | null = null;
    let settled = false;

    const finish = (next: InstallStatus, message: string | null) => {
      if (settled) return;
      settled = true;
      unsubscribe?.();
      activeSessionRef.current = null;
      void api.terminal.close({ threadId, terminalId, deleteHistory: true }).catch(() => undefined);
      inFlightRef.current = false;
      setErrorMessage(message);
      setStatus(next);
      if (next === "done") {
        // Settle back to idle so the button is ready for re-install if needed.
        doneTimeoutRef.current = setTimeout(() => {
          setStatus("idle");
        }, 2_500);
      }
    };

    const sessionUnsubscribe = api.terminal.onEvent((event) => {
      if (event.threadId !== threadId || event.terminalId !== terminalId) return;
      if (event.type === "started") {
        void api.terminal
          .write({ threadId, terminalId, data: `${commands.install} && exit\r` })
          .catch((error: unknown) => {
            finish("error", error instanceof Error ? error.message : "Install write failed.");
          });
        return;
      }
      if (event.type === "exited") {
        if (event.exitCode === 0) {
          finish("done", null);
          void primary.client.server
            .refreshProviders()
            .then((payload) => applyProvidersUpdated(payload))
            .catch(() => undefined);
        } else {
          finish("error", `Install exited with code ${event.exitCode ?? "?"}.`);
        }
        return;
      }
      if (event.type === "error") {
        finish("error", event.message);
      }
    });
    unsubscribe = sessionUnsubscribe;
    activeSessionRef.current = {
      environmentId: envId,
      threadId,
      terminalId,
      unsubscribe: sessionUnsubscribe,
    };

    api.terminal
      .open({
        threadId,
        terminalId,
        cwd,
        cols: 120,
        rows: 24,
      })
      .catch((error: unknown) => {
        finish("error", error instanceof Error ? error.message : "Could not open install shell.");
      });
  }, [providerId, serverConfig]);

  // Tear down on unmount: cancel the settle timer, drop the subscription,
  // close the PTY. Without this a navigation mid-install leaves a shell
  // running on the env until the env reaps it.
  useEffect(() => {
    return () => {
      if (doneTimeoutRef.current) clearTimeout(doneTimeoutRef.current);
      const session = activeSessionRef.current;
      if (!session) return;
      session.unsubscribe();
      activeSessionRef.current = null;
      try {
        const primary = getPrimaryEnvironmentConnection();
        void createEnvironmentApi(primary.client)
          .terminal.close({
            threadId: session.threadId,
            terminalId: session.terminalId,
            deleteHistory: true,
          })
          .catch(() => undefined);
      } catch {
        // Primary connection gone — env will reap the PTY itself.
      }
    };
  }, []);

  return { status, errorMessage, install };
}
