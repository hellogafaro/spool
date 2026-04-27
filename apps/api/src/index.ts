import {
  makeWorkOsClientAuthVerifier,
  presenceOnlyClientAuthVerifier,
  type ClientAuthVerifier,
} from "./auth.ts";
import {
  allowAllOwnershipChecker,
  makeWorkOsOwnershipChecker,
  type OwnershipChecker,
} from "./ownership.ts";
import { withCors } from "./cors.ts";
import { handlePairingRequest, makeWorkOsPairingWriter, type PairingWriter } from "./pairing.ts";
import {
  API_PATHS,
  API_PROTOCOL_VERSION,
  ENVIRONMENT_PROOF_HEADER,
  PAIR_ERROR_CODES,
  type ControlMessage,
  type PairErrorCode,
} from "./protocol.ts";
import { deleteVault, getVault, upsertVault, type VaultEntry } from "./workos.ts";

interface Env {
  ENVIRONMENT_ROOMS: DurableObjectNamespace;
  WORKOS_CLIENT_ID?: string;
  WORKOS_API_KEY?: string;
}

interface VersionPayload {
  product: "trunk-api";
  version: string;
  protocolVersion: number;
}

const VERSION_PAYLOAD: VersionPayload = {
  product: "trunk-api",
  version: "0.0.0",
  protocolVersion: API_PROTOCOL_VERSION,
};

const textHeaders = {
  "content-type": "text/plain; charset=utf-8",
};

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
};

const WS_PATHS = new Set<string>([API_PATHS.client, API_PATHS.channel, API_PATHS.environment]);

function getClientAuthVerifier(env: Env): ClientAuthVerifier {
  if (env.WORKOS_CLIENT_ID && env.WORKOS_CLIENT_ID.length > 0) {
    return makeWorkOsClientAuthVerifier(env.WORKOS_CLIENT_ID);
  }
  return presenceOnlyClientAuthVerifier;
}

let cachedOwnershipChecker: { apiKey: string; checker: OwnershipChecker } | null = null;
let cachedPairingWriter: { apiKey: string; writer: PairingWriter } | null = null;

function getOwnershipChecker(env: Env): OwnershipChecker {
  if (!env.WORKOS_API_KEY || env.WORKOS_API_KEY.length === 0) {
    return allowAllOwnershipChecker;
  }
  if (!cachedOwnershipChecker || cachedOwnershipChecker.apiKey !== env.WORKOS_API_KEY) {
    cachedOwnershipChecker = {
      apiKey: env.WORKOS_API_KEY,
      checker: makeWorkOsOwnershipChecker({ apiKey: env.WORKOS_API_KEY }),
    };
  }
  return cachedOwnershipChecker.checker;
}

function getPairingWriter(env: Env): PairingWriter | null {
  if (!env.WORKOS_API_KEY || env.WORKOS_API_KEY.length === 0) return null;
  if (!cachedPairingWriter || cachedPairingWriter.apiKey !== env.WORKOS_API_KEY) {
    cachedPairingWriter = {
      apiKey: env.WORKOS_API_KEY,
      writer: makeWorkOsPairingWriter({ apiKey: env.WORKOS_API_KEY }),
    };
  }
  return cachedPairingWriter.writer;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === API_PATHS.health) {
      return new Response("ok\n", { headers: textHeaders });
    }

    if (url.pathname === API_PATHS.version) {
      return Response.json(VERSION_PAYLOAD, { headers: jsonHeaders });
    }

    // T3's web tracer posts OTLP traces to /api/observability/v1/traces on the
    // primary env URL. In SaaS mode that resolves to api.trunk.codes; we
    // accept-and-drop so the browser doesn't surface CORS errors. No traces
    // are stored.
    if (url.pathname === "/api/observability/v1/traces") {
      const methods = "POST, OPTIONS";
      if (request.method === "OPTIONS") {
        return withCors(request, new Response(null, { status: 204 }), methods);
      }
      if (request.method === "POST") {
        return withCors(request, new Response(null, { status: 204 }), methods);
      }
      return withCors(
        request,
        new Response("method not allowed\n", { status: 405, headers: textHeaders }),
        methods,
      );
    }

    if (url.pathname === API_PATHS.pair) {
      const writer = getPairingWriter(env);
      if (!writer) {
        return Response.json(
          {
            code: PAIR_ERROR_CODES.PAIR_NOT_CONFIGURED,
            message: "Pairing isn't configured on this deployment (missing WORKOS_API_KEY).",
          },
          { status: 503 },
        );
      }
      return handlePairingRequest(request, url, {
        authVerifier: getClientAuthVerifier(env),
        writer,
        claimEnvironmentOwner: async (environmentId, userId, token) => {
          const id = env.ENVIRONMENT_ROOMS.idFromName(environmentId);
          const stub = env.ENVIRONMENT_ROOMS.get(id);
          const claimUrl = new URL(
            `http://do/internal/claim?userId=${encodeURIComponent(userId)}&token=${encodeURIComponent(
              token,
            )}&environmentId=${encodeURIComponent(environmentId)}`,
          );
          let response: Response;
          try {
            response = await stub.fetch(claimUrl.toString(), { method: "POST" });
          } catch (error) {
            return {
              ok: false,
              status: 502,
              code: PAIR_ERROR_CODES.PAIR_DO_UNAVAILABLE,
              message:
                error instanceof Error
                  ? `Relay couldn't reach the room: ${error.message}`
                  : "Relay couldn't reach the room.",
            } as const;
          }
          if (response.ok) return { ok: true } as const;
          const parsed = await getDoError(response);
          if (
            response.status === 401 ||
            response.status === 404 ||
            response.status === 409 ||
            response.status === 502 ||
            response.status === 503
          ) {
            return {
              ok: false,
              status: response.status,
              code: parsed.code ?? PAIR_ERROR_CODES.PAIR_DO_UNAVAILABLE,
              message: parsed.message,
            } as const;
          }
          return {
            ok: false,
            status: 502,
            code: PAIR_ERROR_CODES.PAIR_DO_UNAVAILABLE,
            message: parsed.message || `Relay returned ${response.status}.`,
          } as const;
        },
        releaseEnvironmentOwner: async (environmentId, userId) => {
          const id = env.ENVIRONMENT_ROOMS.idFromName(environmentId);
          const stub = env.ENVIRONMENT_ROOMS.get(id);
          const releaseUrl = new URL(
            `http://do/internal/release?userId=${encodeURIComponent(
              userId,
            )}&environmentId=${encodeURIComponent(environmentId)}`,
          );
          let response: Response;
          try {
            response = await stub.fetch(releaseUrl.toString(), { method: "POST" });
          } catch (error) {
            return {
              ok: false,
              status: 502,
              code: PAIR_ERROR_CODES.PAIR_DO_UNAVAILABLE,
              message:
                error instanceof Error
                  ? `Relay couldn't reach the room: ${error.message}`
                  : "Relay couldn't reach the room.",
            } as const;
          }
          if (response.ok) return { ok: true } as const;
          const parsed = await getDoError(response);
          return {
            ok: false,
            status: 502,
            code: parsed.code ?? PAIR_ERROR_CODES.PAIR_DO_UNAVAILABLE,
            message: parsed.message || `Release returned ${response.status}.`,
          } as const;
        },
      });
    }

    if (!WS_PATHS.has(url.pathname)) {
      return new Response("not found\n", { status: 404, headers: textHeaders });
    }

    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return new Response("websocket upgrade required\n", { status: 426, headers: textHeaders });
    }

    const environmentId = url.searchParams.get("environmentId")?.trim();
    if (!environmentId) {
      return new Response("environmentId required\n", { status: 400, headers: textHeaders });
    }

    if (url.pathname === API_PATHS.environment || url.pathname === API_PATHS.channel) {
      const proof = request.headers.get(ENVIRONMENT_PROOF_HEADER);
      if (!proof) {
        return new Response("environment proof required\n", {
          status: 401,
          headers: textHeaders,
        });
      }
    }

    if (url.pathname === API_PATHS.client) {
      const verify = getClientAuthVerifier(env);
      const authResult = await verify(request, url);
      if (!authResult.ok) {
        return new Response(`${authResult.reason}\n`, {
          status: authResult.status,
          headers: textHeaders,
        });
      }
      const ownership = getOwnershipChecker(env);
      const ownershipResult = await ownership(authResult.auth.userId, environmentId);
      if (!ownershipResult.ok) {
        return new Response(`${ownershipResult.reason}\n`, {
          status: ownershipResult.status,
          headers: textHeaders,
        });
      }
    }

    if (url.pathname === API_PATHS.channel && !url.searchParams.get("channelId")?.trim()) {
      return new Response("channelId required\n", { status: 400, headers: textHeaders });
    }

    const id = env.ENVIRONMENT_ROOMS.idFromName(environmentId);
    return env.ENVIRONMENT_ROOMS.get(id).fetch(request);
  },
};

function doError(status: number, code: PairErrorCode, message: string): Response {
  return Response.json({ code, message }, { status });
}

function isEqualConstantTime(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function getDoError(
  response: Response,
): Promise<{ readonly code: PairErrorCode | null; readonly message: string }> {
  const text = await response.text().catch(() => "");
  if (text.startsWith("{")) {
    try {
      const parsed = JSON.parse(text) as { code?: unknown; message?: unknown };
      const code =
        typeof parsed.code === "string" && parsed.code in PAIR_ERROR_CODES
          ? (parsed.code as PairErrorCode)
          : null;
      const message = typeof parsed.message === "string" ? parsed.message : text.trim();
      return { code, message };
    } catch {
      // fall through
    }
  }
  return { code: null, message: text.trim() };
}

interface DialingClient {
  readonly socket: WebSocket;
  readonly buffered: Array<string | ArrayBuffer>;
}

interface VaultCacheEntry {
  readonly entry: VaultEntry | null;
  readonly expiresAt: number;
}

const VAULT_CACHE_TTL_MS = 60_000;
const PENDING_TTL_MS = 15 * 60 * 1000;
const PAIR_TOKEN_MIN_LENGTH = 8;
const PAIR_TOKEN_MAX_LENGTH = 256;

export class EnvironmentRoom implements DurableObject {
  private environmentSocket: WebSocket | null = null;
  private readonly dialingClients = new Map<string, DialingClient>();
  // Per-isolate cache for the env's Vault entry. Survives across requests
  // landing on the same DO instance, evicts on isolate restart. Reduces
  // env→relay reconnect chatter against the WorkOS Vault API.
  private vaultCache: VaultCacheEntry | null = null;

  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Env,
  ) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/internal/claim") {
      return this.handleClaim(url);
    }
    if (url.pathname === "/internal/release") {
      return this.handleRelease(url);
    }

    if (url.pathname === API_PATHS.environment || url.pathname === API_PATHS.channel) {
      const environmentId = url.searchParams.get("environmentId")?.trim() ?? "";
      const proof = request.headers.get(ENVIRONMENT_PROOF_HEADER) ?? "";
      const proofOk = await this.verifyProof(environmentId, proof);
      if (!proofOk) {
        return new Response("environment proof mismatch\n", { status: 401 });
      }
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    server.accept();

    if (url.pathname === API_PATHS.environment) {
      const environmentId = url.searchParams.get("environmentId")?.trim() ?? "";
      this.handleEnvironmentSocket(server, environmentId);
    } else if (url.pathname === API_PATHS.client) {
      this.handleClientSocket(server);
    } else if (url.pathname === API_PATHS.channel) {
      const channelId = url.searchParams.get("channelId")?.trim() ?? "";
      this.handleChannelSocket(server, channelId);
    } else {
      server.close(1008, "unsupported route");
    }

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  // DO storage is purely the env→relay TOFU material before claim:
  //   secret, token, createdAt
  // Once a claim succeeds, the secret lives in WorkOS Vault (with owner
  // recorded in key_context) and the DO row is wiped. The alarm() evicts
  // unclaimed rows after PENDING_TTL_MS.

  private async getCachedVault(environmentId: string): Promise<VaultEntry | null> {
    if (this.vaultCache && this.vaultCache.expiresAt > Date.now()) {
      return this.vaultCache.entry;
    }
    if (!this.env.WORKOS_API_KEY) return null;
    let entry: VaultEntry | null;
    try {
      entry = await getVault(this.env.WORKOS_API_KEY, environmentId);
    } catch {
      // Don't cache failures — let the next call retry.
      return null;
    }
    this.vaultCache = { entry, expiresAt: Date.now() + VAULT_CACHE_TTL_MS };
    return entry;
  }

  private clearVaultCache(): void {
    this.vaultCache = null;
  }

  private async verifyProof(environmentId: string, proof: string): Promise<boolean> {
    if (!proof || !environmentId) return false;
    const claimed = await this.getCachedVault(environmentId);
    if (claimed) return isEqualConstantTime(claimed.secret, proof);
    const stored = (await this.state.storage.get<string>("secret")) ?? null;
    if (stored != null) return isEqualConstantTime(stored, proof);
    await this.state.storage.put("secret", proof);
    await this.state.storage.put("createdAt", new Date().toISOString());
    await this.state.storage.setAlarm(Date.now() + PENDING_TTL_MS);
    return true;
  }

  private async handleClaim(url: URL): Promise<Response> {
    const userId = url.searchParams.get("userId")?.trim();
    const token = url.searchParams.get("token")?.trim();
    const environmentId = url.searchParams.get("environmentId")?.trim();
    if (!userId || !token || !environmentId) {
      return doError(400, PAIR_ERROR_CODES.PAIR_INVALID_BODY, "Missing required claim parameters.");
    }
    if (!this.env.WORKOS_API_KEY) {
      return doError(
        503,
        PAIR_ERROR_CODES.PAIR_NOT_CONFIGURED,
        "Pairing isn't enabled on this deployment. Contact support.",
      );
    }

    const claimed = await this.getCachedVault(environmentId);
    if (claimed) {
      if (claimed.owner === userId) return new Response("ok\n", { status: 200 });
      return doError(
        409,
        PAIR_ERROR_CODES.PAIR_ALREADY_CLAIMED,
        "This environment is already paired with another account. Sign in with that account, or release it from settings and re-pair.",
      );
    }

    const storedToken = (await this.state.storage.get<string>("token")) ?? null;
    const storedSecret = (await this.state.storage.get<string>("secret")) ?? null;
    if (!storedToken || !storedSecret) {
      return doError(
        404,
        PAIR_ERROR_CODES.PAIR_PENDING_NOT_FOUND,
        "Couldn't find a pending pair for this environment. The environment may not have started yet, or the pair attempt expired (15 min). Check the env console and copy a fresh Environment ID and Token.",
      );
    }
    if (!isEqualConstantTime(storedToken, token)) {
      return doError(
        401,
        PAIR_ERROR_CODES.PAIR_TOKEN_MISMATCH,
        "Pair values are out of date. Copy a fresh Environment ID and Token from the env console and try again.",
      );
    }

    try {
      await upsertVault(this.env.WORKOS_API_KEY, environmentId, storedSecret, userId);
    } catch (error) {
      return doError(
        502,
        PAIR_ERROR_CODES.PAIR_VAULT_UNAVAILABLE,
        error instanceof Error
          ? `Vault couldn't store the pair: ${error.message}`
          : "Vault couldn't store the pair. Try again in a minute.",
      );
    }

    // Claim succeeded — the DO's pending state is now redundant. Wipe it
    // and cancel the pending-eviction alarm.
    await this.state.storage.deleteAll();
    await this.state.storage.deleteAlarm();
    this.clearVaultCache();
    return new Response("ok\n", { status: 200 });
  }

  private async onPairToken(environmentId: string, token: string): Promise<void> {
    const trimmed = token.trim();
    if (trimmed.length < PAIR_TOKEN_MIN_LENGTH || trimmed.length > PAIR_TOKEN_MAX_LENGTH) return;
    const claimed = await this.getCachedVault(environmentId);
    if (claimed) return; // already paired — ignore further pair-token pushes
    await this.state.storage.put("token", trimmed);
    if ((await this.state.storage.get<string>("createdAt")) == null) {
      await this.state.storage.put("createdAt", new Date().toISOString());
    }
    if ((await this.state.storage.getAlarm()) == null) {
      await this.state.storage.setAlarm(Date.now() + PENDING_TTL_MS);
    }
  }

  private async handleRelease(url: URL): Promise<Response> {
    const userId = url.searchParams.get("userId")?.trim();
    const environmentId = url.searchParams.get("environmentId")?.trim();
    if (!userId || !environmentId) {
      return doError(
        400,
        PAIR_ERROR_CODES.PAIR_INVALID_BODY,
        "Missing required release parameters.",
      );
    }
    if (!this.env.WORKOS_API_KEY) {
      return doError(
        503,
        PAIR_ERROR_CODES.PAIR_NOT_CONFIGURED,
        "Pairing isn't enabled on this deployment.",
      );
    }
    const claimed = await this.getCachedVault(environmentId);
    if (claimed && claimed.owner !== userId) {
      return doError(
        409,
        PAIR_ERROR_CODES.PAIR_ALREADY_CLAIMED,
        "Only the env's owner can release it.",
      );
    }
    try {
      await deleteVault(this.env.WORKOS_API_KEY, environmentId);
    } catch (error) {
      return doError(
        502,
        PAIR_ERROR_CODES.PAIR_VAULT_UNAVAILABLE,
        error instanceof Error
          ? `Vault delete failed: ${error.message}`
          : "Vault delete failed. Try again in a minute.",
      );
    }
    this.clearVaultCache();
    await this.state.storage.deleteAll();
    await this.state.storage.deleteAlarm();
    return new Response("ok\n", { status: 200 });
  }

  /** Fires PENDING_TTL_MS after the pending row was created. Drops it so a
   *  user who never finished pairing doesn't leave stale data on the DO. */
  async alarm(): Promise<void> {
    await this.state.storage.deleteAll();
  }

  private handleEnvironmentSocket(socket: WebSocket, environmentId: string): void {
    this.environmentSocket?.close(1012, "environment replaced");
    this.environmentSocket = socket;

    socket.addEventListener("message", (event) => {
      if (typeof event.data !== "string") return;
      let parsed: { type?: unknown; token?: unknown };
      try {
        parsed = JSON.parse(event.data) as { type?: unknown; token?: unknown };
      } catch {
        return;
      }
      if (parsed.type === "pair-token" && typeof parsed.token === "string") {
        void this.onPairToken(environmentId, parsed.token);
      }
    });

    socket.addEventListener("close", () => {
      if (this.environmentSocket !== socket) {
        return;
      }
      this.environmentSocket = null;
      for (const pending of this.dialingClients.values()) {
        pending.socket.close(1013, "environment offline");
      }
      this.dialingClients.clear();
    });

    socket.addEventListener("error", () => {
      socket.close(1011, "environment error");
    });
  }

  private handleClientSocket(socket: WebSocket): void {
    const environmentSocket = this.environmentSocket;
    if (!environmentSocket || environmentSocket.readyState !== WebSocket.OPEN) {
      socket.close(1013, "environment offline");
      return;
    }

    const channelId = crypto.randomUUID();
    const pending: DialingClient = { socket, buffered: [] };
    this.dialingClients.set(channelId, pending);

    socket.addEventListener("message", (event) => {
      const current = this.dialingClients.get(channelId);
      if (current === pending) {
        pending.buffered.push(event.data as string | ArrayBuffer);
      }
    });

    socket.addEventListener("close", () => {
      if (this.dialingClients.get(channelId) === pending) {
        this.dialingClients.delete(channelId);
      }
    });

    socket.addEventListener("error", () => {
      if (this.dialingClients.get(channelId) === pending) {
        this.dialingClients.delete(channelId);
      }
      socket.close(1011, "client error");
    });

    const signal: ControlMessage = { type: "dial", channelId };
    try {
      environmentSocket.send(JSON.stringify(signal));
    } catch {
      this.dialingClients.delete(channelId);
      socket.close(1011, "failed to signal environment");
    }
  }

  private handleChannelSocket(channel: WebSocket, channelId: string): void {
    const pending = this.dialingClients.get(channelId);
    if (!pending) {
      channel.close(4404, "unknown channel");
      return;
    }
    this.dialingClients.delete(channelId);

    const clientSocket = pending.socket;
    if (clientSocket.readyState !== WebSocket.OPEN) {
      channel.close(1013, "client gone");
      return;
    }

    const clearBuffer = () => {
      pending.buffered.length = 0;
    };

    bridgeSockets(clientSocket, channel, clearBuffer);

    for (const frame of pending.buffered) {
      try {
        channel.send(frame);
      } catch {
        break;
      }
    }
    clearBuffer();
  }
}

function forwardMessages(from: WebSocket, to: WebSocket): void {
  from.addEventListener("message", (event) => {
    if (to.readyState === WebSocket.OPEN) {
      to.send(event.data);
    }
  });
}

function bridgeSockets(a: WebSocket, b: WebSocket, onClose: () => void): void {
  let closed = false;
  const closeBoth = (code: number, reason: string) => {
    if (closed) return;
    closed = true;
    onClose();
    if (a.readyState === WebSocket.OPEN) a.close(code, reason);
    if (b.readyState === WebSocket.OPEN) b.close(code, reason);
  };

  forwardMessages(a, b);
  forwardMessages(b, a);
  a.addEventListener("close", () => closeBoth(1001, "peer closed"));
  b.addEventListener("close", () => closeBoth(1001, "peer closed"));
  a.addEventListener("error", () => closeBoth(1011, "peer error"));
  b.addEventListener("error", () => closeBoth(1011, "peer error"));
}
