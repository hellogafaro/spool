export const API_PROTOCOL_VERSION = 1;

export const API_PATHS = {
  client: "/ws",
  channel: "/channel",
  environment: "/environment",
  health: "/health",
  pair: "/pair",
  version: "/version",
} as const;

export type ApiPath = (typeof API_PATHS)[keyof typeof API_PATHS];

export interface DialSignal {
  readonly type: "dial";
  readonly channelId: string;
}

/** Relay→env handshake reply. Sent once the env's WS handshake is accepted,
 * carries the vault-recorded owner so the env can suppress its pair banner
 * when already claimed (and clear it when released). */
export interface PairStatusSignal {
  readonly type: "pair-status";
  readonly owner: string | null;
}

/** Machine-readable error codes returned by the /pair endpoint. UI maps
 * these to user-facing copy; logs key off the code, not the message. */
export const PAIR_ERROR_CODES = {
  /** Request body is missing or malformed. */
  PAIR_INVALID_BODY: "PAIR_INVALID_BODY",
  /** WorkOS bearer is missing/expired/invalid. */
  PAIR_AUTH_FAILED: "PAIR_AUTH_FAILED",
  /** No pending pair record (env never reported, or 15-min TTL expired). */
  PAIR_PENDING_NOT_FOUND: "PAIR_PENDING_NOT_FOUND",
  /** Token in request doesn't match the env's pending pair token. */
  PAIR_TOKEN_MISMATCH: "PAIR_TOKEN_MISMATCH",
  /** Env is already claimed by a different user. */
  PAIR_ALREADY_CLAIMED: "PAIR_ALREADY_CLAIMED",
  /** WorkOS metadata read failed (transient). */
  PAIR_METADATA_READ_FAILED: "PAIR_METADATA_READ_FAILED",
  /** WorkOS metadata write failed (transient). */
  PAIR_METADATA_WRITE_FAILED: "PAIR_METADATA_WRITE_FAILED",
  /** Cloudflare Worker couldn't reach the room DO. */
  PAIR_DO_UNAVAILABLE: "PAIR_DO_UNAVAILABLE",
  /** WorkOS Vault read/write/delete failed. */
  PAIR_VAULT_UNAVAILABLE: "PAIR_VAULT_UNAVAILABLE",
  /** Pairing isn't configured on this deployment (no WorkOS API key). */
  PAIR_NOT_CONFIGURED: "PAIR_NOT_CONFIGURED",
  /** HTTP method isn't allowed. */
  PAIR_METHOD_NOT_ALLOWED: "PAIR_METHOD_NOT_ALLOWED",
} as const;

export type PairErrorCode = (typeof PAIR_ERROR_CODES)[keyof typeof PAIR_ERROR_CODES];

export interface PairErrorBody {
  readonly code: PairErrorCode;
  readonly message: string;
}

/** Env→relay handshake. Carries the ephemeral pair token so the DO can
 * accept a SaaS claim that matches it. Sent on every env connect; cleared
 * by the DO after a successful claim. */
export interface PairTokenSignal {
  readonly type: "pair-token";
  readonly token: string;
}

export type ControlMessage = DialSignal | PairStatusSignal;
export type EnvironmentSignal = PairTokenSignal;

export const ENVIRONMENT_PROOF_HEADER = "x-trunk-environment-proof";
