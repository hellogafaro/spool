import { ThreadId } from "@t3tools/contracts";

export const SETTINGS_TERMINAL_THREAD_ID = ThreadId.make("__trunk-settings-terminal__");

export function isSettingsTerminalThreadId(threadId: string): boolean {
  return threadId === SETTINGS_TERMINAL_THREAD_ID;
}

export function resolveSettingsTerminalRootCwd(cwd: string | null | undefined): string {
  if (cwd && /^[A-Za-z]:[\\/]/.test(cwd)) {
    return `${cwd.slice(0, 2)}\\`;
  }
  return "/";
}
