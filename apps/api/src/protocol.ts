export const API_PROTOCOL_VERSION = 1;

export const API_PATHS = {
  browser: "/browser",
  health: "/health",
  server: "/server",
  version: "/version",
} as const;

export type ApiPath = (typeof API_PATHS)[keyof typeof API_PATHS];
