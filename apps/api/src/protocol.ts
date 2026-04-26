export const API_PROTOCOL_VERSION = 1;

export const API_PATHS = {
  browser: "/ws",
  channel: "/channel",
  environment: "/environment",
  health: "/health",
  me: "/me",
  pairing: "/pairing",
  version: "/version",
} as const;

export type ApiPath = (typeof API_PATHS)[keyof typeof API_PATHS];

export interface DialSignal {
  readonly type: "dial";
  readonly channelId: string;
}

export type ControlMessage = DialSignal;

export const ENVIRONMENT_PROOF_HEADER = "x-trunk-environment-proof";
