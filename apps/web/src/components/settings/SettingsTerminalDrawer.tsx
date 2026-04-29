import { scopeThreadRef } from "@t3tools/client-runtime";
import { type ScopedThreadRef } from "@t3tools/contracts";
import { CommandLineIcon } from "@heroicons/react/16/solid";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useCommandPaletteStore } from "~/commandPaletteStore";
import { usePrimaryEnvironmentId } from "~/environments/primary";
import { readEnvironmentApi } from "~/environmentApi";
import { resolveShortcutCommand } from "~/keybindings";
import { isTerminalFocused } from "~/lib/terminalFocus";
import { cn, randomUUID } from "~/lib/utils";
import { useServerConfig, useServerKeybindings } from "~/rpc/serverState";
import { SETTINGS_TERMINAL_THREAD_ID, resolveSettingsTerminalRootCwd } from "~/settings-terminal";
import { useStore } from "~/store";
import { selectThreadTerminalState, useTerminalStateStore } from "~/terminalStateStore";
import { DEFAULT_THREAD_TERMINAL_ID, MAX_TERMINALS_PER_GROUP } from "~/types";

import ThreadTerminalDrawer from "../ThreadTerminalDrawer";
import { Button } from "../ui/button";

function useSettingsTerminalThreadRef(): ScopedThreadRef | null {
  const activeEnvironmentId = useStore((state) => state.activeEnvironmentId);
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const environmentId = activeEnvironmentId ?? primaryEnvironmentId;

  return useMemo(
    () => (environmentId ? scopeThreadRef(environmentId, SETTINGS_TERMINAL_THREAD_ID) : null),
    [environmentId],
  );
}

export function SettingsTerminalButton({ className }: { className?: string }) {
  const threadRef = useSettingsTerminalThreadRef();
  const setTerminalOpen = useTerminalStateStore((state) => state.setTerminalOpen);
  const terminalOpen = useTerminalStateStore((state) =>
    threadRef
      ? selectThreadTerminalState(state.terminalStateByThreadKey, threadRef).terminalOpen
      : false,
  );

  return (
    <Button
      size="xs"
      variant={terminalOpen ? "secondary" : "outline"}
      disabled={!threadRef}
      className={cn("shrink-0", className)}
      aria-pressed={terminalOpen}
      onClick={() => {
        if (!threadRef) return;
        setTerminalOpen(threadRef, !terminalOpen);
      }}
    >
      <CommandLineIcon className="size-3.5" />
      Terminal
    </Button>
  );
}

export function SettingsTerminalDrawer() {
  const serverConfig = useServerConfig();
  const keybindings = useServerKeybindings();
  const threadRef = useSettingsTerminalThreadRef();
  const terminalState = useTerminalStateStore((state) =>
    threadRef ? selectThreadTerminalState(state.terminalStateByThreadKey, threadRef) : null,
  );
  const storeSetTerminalOpen = useTerminalStateStore((state) => state.setTerminalOpen);
  const storeSetTerminalHeight = useTerminalStateStore((state) => state.setTerminalHeight);
  const storeSplitTerminal = useTerminalStateStore((state) => state.splitTerminal);
  const storeNewTerminal = useTerminalStateStore((state) => state.newTerminal);
  const storeSetActiveTerminal = useTerminalStateStore((state) => state.setActiveTerminal);
  const storeCloseTerminal = useTerminalStateStore((state) => state.closeTerminal);
  const [focusRequestId, setFocusRequestId] = useState(0);

  const cwd = useMemo(() => resolveSettingsTerminalRootCwd(serverConfig?.cwd), [serverConfig?.cwd]);
  const activeGroupTerminalCount = useMemo(() => {
    if (!terminalState) return 0;
    return (
      terminalState.terminalGroups.find((group) => group.id === terminalState.activeTerminalGroupId)
        ?.terminalIds.length ?? 1
    );
  }, [terminalState]);

  const bumpFocusRequestId = useCallback(() => {
    setFocusRequestId((value) => value + 1);
  }, []);

  const setTerminalHeight = useCallback(
    (height: number) => {
      if (!threadRef) return;
      storeSetTerminalHeight(threadRef, height);
    },
    [storeSetTerminalHeight, threadRef],
  );

  const splitTerminal = useCallback(() => {
    if (!threadRef) return;
    if (activeGroupTerminalCount >= MAX_TERMINALS_PER_GROUP) return;
    storeSplitTerminal(threadRef, `terminal-${randomUUID()}`);
    bumpFocusRequestId();
  }, [activeGroupTerminalCount, bumpFocusRequestId, storeSplitTerminal, threadRef]);

  const createNewTerminal = useCallback(() => {
    if (!threadRef) return;
    storeNewTerminal(threadRef, `terminal-${randomUUID()}`);
    bumpFocusRequestId();
  }, [bumpFocusRequestId, storeNewTerminal, threadRef]);

  const activateTerminal = useCallback(
    (terminalId: string) => {
      if (!threadRef) return;
      storeSetActiveTerminal(threadRef, terminalId);
      bumpFocusRequestId();
    },
    [bumpFocusRequestId, storeSetActiveTerminal, threadRef],
  );

  const closeTerminal = useCallback(
    (terminalId: string) => {
      if (!threadRef || !terminalState) return;
      const api = readEnvironmentApi(threadRef.environmentId);
      if (!api) return;
      const isFinalTerminal = terminalState.terminalIds.length <= 1;
      const fallbackExitWrite = () =>
        api.terminal
          .write({ threadId: threadRef.threadId, terminalId, data: "exit\n" })
          .catch(() => undefined);

      if ("close" in api.terminal && typeof api.terminal.close === "function") {
        void (async () => {
          if (isFinalTerminal) {
            await api.terminal
              .clear({ threadId: threadRef.threadId, terminalId })
              .catch(() => undefined);
          }
          await api.terminal.close({
            threadId: threadRef.threadId,
            terminalId,
            deleteHistory: true,
          });
        })().catch(() => fallbackExitWrite());
      } else {
        void fallbackExitWrite();
      }

      storeCloseTerminal(threadRef, terminalId);
      bumpFocusRequestId();
    },
    [bumpFocusRequestId, storeCloseTerminal, terminalState, threadRef],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!threadRef || event.defaultPrevented || useCommandPaletteStore.getState().open) {
        return;
      }

      const terminalOpen = Boolean(terminalState?.terminalOpen);
      const command = resolveShortcutCommand(event, keybindings, {
        context: {
          terminalFocus: isTerminalFocused(),
          terminalOpen,
        },
      });

      if (command === "terminal.toggle") {
        event.preventDefault();
        event.stopPropagation();
        storeSetTerminalOpen(threadRef, !terminalOpen);
        return;
      }

      if (command === "terminal.split") {
        event.preventDefault();
        event.stopPropagation();
        if (!terminalOpen) {
          storeSetTerminalOpen(threadRef, true);
        }
        splitTerminal();
        return;
      }

      if (command === "terminal.new") {
        event.preventDefault();
        event.stopPropagation();
        if (!terminalOpen) {
          storeSetTerminalOpen(threadRef, true);
        }
        createNewTerminal();
        return;
      }

      if (command === "terminal.close") {
        event.preventDefault();
        event.stopPropagation();
        if (!terminalOpen || !terminalState) return;
        closeTerminal(terminalState.activeTerminalId);
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [
    closeTerminal,
    createNewTerminal,
    keybindings,
    splitTerminal,
    storeSetTerminalOpen,
    terminalState,
    threadRef,
  ]);

  if (!threadRef || !terminalState?.terminalOpen) {
    return null;
  }

  return (
    <ThreadTerminalDrawer
      threadRef={threadRef}
      threadId={threadRef.threadId}
      cwd={cwd}
      visible
      height={terminalState.terminalHeight}
      terminalIds={terminalState.terminalIds}
      activeTerminalId={terminalState.activeTerminalId || DEFAULT_THREAD_TERMINAL_ID}
      terminalGroups={terminalState.terminalGroups}
      activeTerminalGroupId={terminalState.activeTerminalGroupId}
      focusRequestId={focusRequestId + 1}
      onSplitTerminal={splitTerminal}
      onNewTerminal={createNewTerminal}
      onActiveTerminalChange={activateTerminal}
      onCloseTerminal={closeTerminal}
      onHeightChange={setTerminalHeight}
      onAddTerminalContext={() => undefined}
      keybindings={keybindings}
    />
  );
}
