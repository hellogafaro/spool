export const API_PROTOCOL_VERSION = 1;

export const API_PATHS = {
  browser: "/ws",
  channel: "/channel",
  environment: "/environment",
  health: "/health",
  me: "/me",
  pair: "/pair",
  version: "/version",
} as const;

export type ApiPath = (typeof API_PATHS)[keyof typeof API_PATHS];

export interface DialSignal {
  readonly type: "dial";
  readonly channelId: string;
}

/** Env→relay handshake. Carries the ephemeral pair token so the DO can
 * accept a SaaS claim that matches it. Sent on every env connect; cleared
 * by the DO after a successful claim. */
export interface PairTokenSignal {
  readonly type: "pair-token";
  readonly token: string;
}

export type ControlMessage = DialSignal;
export type EnvironmentSignal = PairTokenSignal;

export const ENVIRONMENT_PROOF_HEADER = "x-trunk-environment-proof";
