import { type EnvironmentId, ThreadId } from "@t3tools/contracts";
import { scopeThreadRef } from "@t3tools/client-runtime";
import { useEffect, useMemo, useState } from "react";

import { createEnvironmentApi } from "~/environmentApi";
import { getPrimaryEnvironmentConnection } from "~/environments/runtime";
import { useServerConfig, useServerKeybindings } from "~/rpc/serverState";

import { TerminalViewport } from "../ThreadTerminalDrawer";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";

import { getProviderCommands } from "./providerCommands";

interface Props {
  readonly providerId: string;
  readonly providerLabel: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

const TERMINAL_ID = "default";

/**
 * Modal that runs a provider's setup command in an interactive PTY on the
 * active environment.
 *
 * Reuses T3's TerminalViewport so we get xterm wiring, history rehydrate, and
 * input fan-out for free. The dialog opens a setup PTY, writes the provider
 * command, then lets the viewport attach to the running session.
 */
export function ProviderSetupDialog({ providerId, providerLabel, open, onOpenChange }: Props) {
  const serverConfig = useServerConfig();
  const cwd = serverConfig?.cwd ?? null;
  const keybindings = useServerKeybindings();
  const commands = getProviderCommands(providerId);
  const [terminalStatus, setTerminalStatus] = useState<{
    readonly status: "idle" | "starting" | "ready" | "error";
    readonly message: string | null;
  }>({ status: "idle", message: null });

  let primaryEnvironmentId: EnvironmentId | null = null;
  try {
    primaryEnvironmentId = getPrimaryEnvironmentConnection().environmentId;
  } catch {
    primaryEnvironmentId = null;
  }

  // Timestamp the threadId per dialog open so each setup attempt gets a fresh
  // PTY and history file.
  const threadId = useMemo(
    () =>
      open
        ? ThreadId.make(`__trunk-provider-setup__${providerId}__${Date.now()}`)
        : ThreadId.make(`__trunk-provider-setup__${providerId}__inactive`),
    [open, providerId],
  );
  const threadRef = useMemo(
    () => (primaryEnvironmentId ? scopeThreadRef(primaryEnvironmentId, threadId) : null),
    [primaryEnvironmentId, threadId],
  );

  // Open and feed the setup command before the viewport attaches. The viewport
  // opens its PTY from a child effect, so waiting for its "started" event here
  // is order-dependent and can miss the event.
  useEffect(() => {
    if (!open) {
      setTerminalStatus({ status: "idle", message: null });
      return;
    }
    if (!commands) return;
    if (!cwd) {
      setTerminalStatus({ status: "error", message: "No active environment." });
      return;
    }
    let primary;
    try {
      primary = getPrimaryEnvironmentConnection();
    } catch {
      setTerminalStatus({ status: "error", message: "No active environment." });
      return;
    }
    const api = createEnvironmentApi(primary.client);
    let disposed = false;

    const closeTerminal = () =>
      api.terminal.close({ threadId, terminalId: TERMINAL_ID, deleteHistory: true });

    const startTerminal = async () => {
      setTerminalStatus({ status: "starting", message: null });
      try {
        await api.terminal.open({
          threadId,
          terminalId: TERMINAL_ID,
          cwd,
          cols: 120,
          rows: 24,
        });
        if (disposed) {
          await closeTerminal().catch(() => undefined);
          return;
        }
        await api.terminal.write({
          threadId,
          terminalId: TERMINAL_ID,
          data: `${commands.setup}\n`,
        });
        if (disposed) {
          await closeTerminal().catch(() => undefined);
          return;
        }
        setTerminalStatus({ status: "ready", message: null });
      } catch (error) {
        if (disposed) return;
        setTerminalStatus({
          status: "error",
          message: error instanceof Error ? error.message : "Failed to start setup terminal.",
        });
      }
    };

    void startTerminal();
    return () => {
      disposed = true;
      void closeTerminal().catch(() => undefined);
    };
  }, [commands, cwd, open, threadId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Set up {providerLabel}</DialogTitle>
          <DialogDescription>
            {commands?.setupHint ??
              "Follow the prompts in the terminal below to authenticate this provider."}
          </DialogDescription>
        </DialogHeader>
        <div className="px-6 pb-2">
          {!primaryEnvironmentId || !serverConfig ? (
            <div className="rounded-md border border-dashed border-border/70 bg-card/40 px-4 py-6 text-center text-sm text-muted-foreground">
              No active environment.
            </div>
          ) : !commands ? (
            <div className="rounded-md border border-dashed border-border/70 bg-card/40 px-4 py-6 text-center text-sm text-muted-foreground">
              No setup recipe for {providerLabel}.
            </div>
          ) : terminalStatus.status === "error" ? (
            <div className="rounded-md border border-dashed border-border/70 bg-card/40 px-4 py-6 text-center text-sm text-muted-foreground">
              {terminalStatus.message ?? "Failed to start setup terminal."}
            </div>
          ) : terminalStatus.status !== "ready" ? (
            <div className="rounded-md border border-dashed border-border/70 bg-card/40 px-4 py-6 text-center text-sm text-muted-foreground">
              Starting setup terminal...
            </div>
          ) : threadRef ? (
            <div className="thread-terminal-drawer h-[360px] overflow-hidden rounded-md border border-border/70 bg-background">
              <TerminalViewport
                threadRef={threadRef}
                threadId={threadId}
                terminalId={TERMINAL_ID}
                terminalLabel={`${providerLabel} setup`}
                cwd={serverConfig.cwd}
                onSessionExited={() => onOpenChange(false)}
                onAddTerminalContext={() => undefined}
                focusRequestId={open ? 1 : 0}
                autoFocus
                resizeEpoch={0}
                drawerHeight={360}
                keybindings={keybindings}
              />
            </div>
          ) : null}
        </div>
        <DialogFooter variant="bare">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
