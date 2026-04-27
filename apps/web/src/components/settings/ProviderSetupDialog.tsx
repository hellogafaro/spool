import { ThreadId } from "@t3tools/contracts";
import { scopeThreadRef } from "@t3tools/client-runtime";
import { useEffect, useMemo, useRef } from "react";

import { readEnvironmentApi } from "~/environmentApi";
import { useStore } from "~/store";
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
 * input fan-out for free. We layer a small auto-feed: once the shell prints
 * its first prompt ("started" event) we write the setup command + Enter so
 * the user lands directly in OAuth without typing anything.
 */
export function ProviderSetupDialog({ providerId, providerLabel, open, onOpenChange }: Props) {
  const activeEnvironmentId = useStore((s) => s.activeEnvironmentId);
  const serverConfig = useServerConfig();
  const keybindings = useServerKeybindings();
  const commands = getProviderCommands(providerId);

  // Timestamp the threadId per dialog open. Reusing a fixed threadId after a
  // previous setup closed would not re-fire the "started" event (T3's terminal
  // RPC keeps the closed PTY's record), and the dialog would render an empty
  // black viewport. Same pattern as ProviderInstallButton.
  const threadId = useMemo(
    () =>
      open
        ? ThreadId.make(`__trunk-provider-setup__${providerId}__${Date.now()}`)
        : ThreadId.make(`__trunk-provider-setup__${providerId}__inactive`),
    [open, providerId],
  );
  const threadRef = useMemo(
    () => (activeEnvironmentId ? scopeThreadRef(activeEnvironmentId, threadId) : null),
    [activeEnvironmentId, threadId],
  );
  const autoFedRef = useRef(false);

  // Auto-feed the setup command once the shell session is up, and tear
  // down the PTY when the dialog closes OR when the component unmounts
  // while still open (e.g. parent navigates away). One effect covers both
  // so we can never leak a shell that we set up.
  useEffect(() => {
    if (!open) {
      autoFedRef.current = false;
      return;
    }
    if (!activeEnvironmentId || !commands) return;
    const api = readEnvironmentApi(activeEnvironmentId);
    if (!api) return;

    const unsubscribe = api.terminal.onEvent((event) => {
      if (event.threadId !== threadId || event.terminalId !== TERMINAL_ID) return;
      if (event.type === "started" && !autoFedRef.current) {
        autoFedRef.current = true;
        void api.terminal
          .write({ threadId, terminalId: TERMINAL_ID, data: `${commands.setup}\n` })
          .catch(() => undefined);
      }
    });
    return () => {
      unsubscribe();
      void api.terminal
        .close({ threadId, terminalId: TERMINAL_ID, deleteHistory: true })
        .catch(() => undefined);
    };
  }, [activeEnvironmentId, commands, open, threadId]);

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
          {!activeEnvironmentId || !serverConfig ? (
            <div className="rounded-md border border-dashed border-border/70 bg-card/40 px-4 py-6 text-center text-sm text-muted-foreground">
              No active environment.
            </div>
          ) : !commands ? (
            <div className="rounded-md border border-dashed border-border/70 bg-card/40 px-4 py-6 text-center text-sm text-muted-foreground">
              No setup recipe for {providerLabel}.
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
