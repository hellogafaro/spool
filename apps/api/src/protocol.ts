export const API_PROTOCOL_VERSION = 1;

export const API_PATHS = {
  browser: "/ws",
  health: "/health",
  pairing: "/pairing",
  server: "/server",
  serverChannel: "/server-channel",
  version: "/version",
} as const;

export type ApiPath = (typeof API_PATHS)[keyof typeof API_PATHS];

export interface DialSignal {
  readonly type: "dial";
  readonly channelId: string;
}

export type ControlMessage = DialSignal;
