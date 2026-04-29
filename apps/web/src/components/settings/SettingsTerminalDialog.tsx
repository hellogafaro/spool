import { scopeThreadRef } from "@t3tools/client-runtime";
import { type EnvironmentId, ThreadId } from "@t3tools/contracts";
import { useEffect, useMemo } from "react";

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

interface Props {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

const TERMINAL_ID = "default";

export function SettingsTerminalDialog({ open, onOpenChange }: Props) {
  const serverConfig = useServerConfig();
  const keybindings = useServerKeybindings();

  let primaryEnvironmentId: EnvironmentId | null = null;
  try {
    primaryEnvironmentId = getPrimaryEnvironmentConnection().environmentId;
  } catch {
    primaryEnvironmentId = null;
  }

  const threadId = useMemo(
    () =>
      open
        ? ThreadId.make(`__trunk-settings-terminal__${Date.now()}`)
        : ThreadId.make("__trunk-settings-terminal__inactive"),
    [open],
  );
  const threadRef = useMemo(
    () => (primaryEnvironmentId ? scopeThreadRef(primaryEnvironmentId, threadId) : null),
    [primaryEnvironmentId, threadId],
  );

  useEffect(() => {
    if (!open) return;
    return () => {
      let primary;
      try {
        primary = getPrimaryEnvironmentConnection();
      } catch {
        return;
      }
      const api = createEnvironmentApi(primary.client);
      void api.terminal
        .close({ threadId, terminalId: TERMINAL_ID, deleteHistory: true })
        .catch(() => undefined);
    };
  }, [open, threadId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Environment terminal</DialogTitle>
          <DialogDescription>
            Use this terminal to install CLIs and complete provider authentication on the active
            environment.
          </DialogDescription>
        </DialogHeader>
        <div className="px-6 pb-2">
          {!primaryEnvironmentId || !serverConfig || !threadRef ? (
            <div className="rounded-md border border-dashed border-border/70 bg-card/40 px-4 py-6 text-center text-sm text-muted-foreground">
              No active environment.
            </div>
          ) : (
            <div className="thread-terminal-drawer h-[360px] overflow-hidden rounded-md border border-border/70 bg-background">
              <TerminalViewport
                threadRef={threadRef}
                threadId={threadId}
                terminalId={TERMINAL_ID}
                terminalLabel="Settings terminal"
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
          )}
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
