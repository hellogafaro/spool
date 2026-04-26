export type RemoteLinkStatus = "disabled" | "connecting" | "connected" | "disconnected";

export interface RemoteLinkSnapshot {
  readonly status: RemoteLinkStatus;
  readonly environmentId: string | null;
  readonly lastConnectedAt: Date | null;
  readonly lastDisconnectedAt: Date | null;
  readonly lastError: string | null;
}

export const DISABLED_REMOTE_LINK_SNAPSHOT: RemoteLinkSnapshot = {
  status: "disabled",
  environmentId: null,
  lastConnectedAt: null,
  lastDisconnectedAt: null,
  lastError: null,
};
