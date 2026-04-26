import { useWsConnectionStatus, getWsConnectionUiState } from "../rpc/wsConnectionState";

/**
 * Top-of-app banner shown when the relay WS isn't connected. Hidden when
 * the connection is healthy or while we're still doing the initial dial
 * (so we don't flash "Reconnecting…" on first load).
 */
export function EnvironmentConnectionBanner() {
  const status = useWsConnectionStatus();
  const ui = getWsConnectionUiState(status);

  if (ui === "connected") return null;
  if (!status.hasConnected && ui === "connecting") return null;

  const { label, detail } = describeBanner(ui, status.online);

  return (
    <div
      role="status"
      aria-live="polite"
      className="border-b border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-center text-xs text-amber-700 dark:text-amber-300"
    >
      <span className="font-medium">{label}</span>
      {detail ? <span className="ml-2 text-amber-700/80 dark:text-amber-300/80">{detail}</span> : null}
    </div>
  );
}

function describeBanner(
  ui: ReturnType<typeof getWsConnectionUiState>,
  online: boolean,
): { label: string; detail: string | null } {
  if (!online) {
    return { label: "Offline", detail: "Your browser has lost its network connection." };
  }
  switch (ui) {
    case "reconnecting":
      return {
        label: "Reconnecting…",
        detail: "Trying to reach your environment. Make sure the trunk-server is still running.",
      };
    case "offline":
      return {
        label: "Environment offline",
        detail: "We can't reach your environment. Check the container or laptop running it.",
      };
    case "error":
      return {
        label: "Connection error",
        detail: "We couldn't connect to your environment. We'll retry automatically.",
      };
    case "connecting":
      return { label: "Connecting…", detail: null };
    default:
      return { label: "Disconnected", detail: null };
  }
}
