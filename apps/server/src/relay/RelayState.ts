export type RelayStatus = "disabled" | "connecting" | "connected" | "disconnected";

export interface RelaySnapshot {
  readonly status: RelayStatus;
  readonly environmentId: string | null;
  readonly lastConnectedAt: Date | null;
  readonly lastDisconnectedAt: Date | null;
  readonly lastError: string | null;
}

export const DISABLED_RELAY_SNAPSHOT: RelaySnapshot = {
  status: "disabled",
  environmentId: null,
  lastConnectedAt: null,
  lastDisconnectedAt: null,
  lastError: null,
};
