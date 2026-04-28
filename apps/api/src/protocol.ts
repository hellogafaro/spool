export const API_PROTOCOL_VERSION = 2;

export const API_PATHS = {
  env: "/env",
  health: "/health",
  version: "/version",
} as const;

export type ApiPath = (typeof API_PATHS)[keyof typeof API_PATHS];
