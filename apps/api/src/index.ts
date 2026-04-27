import { DurableObject } from "cloudflare:workers";

import {
  makeWorkOsClientAuthVerifier,
  presenceOnlyClientAuthVerifier,
  type ClientAuthVerifier,
} from "./auth.ts";
import { withCors } from "./cors.ts";
import {
  allowAllOwnershipChecker,
  makeWorkOsOwnershipChecker,
  type OwnershipChecker,
} from "./ownership.ts";
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

const VERSION_PAYLOAD = {
  product: "trunk-api" as const,
  version: "0.0.0",
  protocolVersion: API_PROTOCOL_VERSION,
};

const textHeaders = { "content-type": "text/plain; charset=utf-8" };
const jsonHeaders = { "content-type": "application/json; charset=utf-8" };

const WS_PATHS = new Set<string>([API_PATHS.client, API_PATHS.channel, API_PATHS.environment]);

const PENDING_TTL_MS = 15 * 60 * 1000;
const PAIR_TOKEN_MIN_LENGTH = 8;
const PAIR_TOKEN_MAX_LENGTH = 256;

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
    // primary env URL. In SaaS mode that resolves to api.trunk.codes; accept
    // and drop so the browser doesn't surface CORS errors.
    if (url.pathname === "/api/observability/v1/traces") {
      const methods = "POST, OPTIONS";
      if (request.method === "OPTIONS" || request.method === "POST") {
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
          const response = await callDo(env, environmentId, "claim", {
            userId,
            token,
            environmentId,
          });
          if (response.ok) return { ok: true } as const;
          const status = [401, 404, 409, 502, 503].includes(response.status)
            ? (response.status as 401 | 404 | 409 | 502 | 503)
            : 502;
          return { ok: false, status, code: response.code, message: response.message } as const;
        },
        releaseEnvironmentOwner: async (environmentId, userId) => {
          const response = await callDo(env, environmentId, "release", {
            userId,
            environmentId,
          });
          if (response.ok) return { ok: true } as const;
          return {
            ok: false,
            status: 502 as const,
            code: response.code,
            message: response.message,
          };
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
      if (!request.headers.get(ENVIRONMENT_PROOF_HEADER)) {
        return new Response("environment proof required\n", {
          status: 401,
          headers: textHeaders,
        });
      }
    }

    if (url.pathname === API_PATHS.client) {
      const verify = getClientAuthVerifier(env);
      const auth = await verify(request, url);
      if (!auth.ok) {
        return new Response(`${auth.reason}\n`, { status: auth.status, headers: textHeaders });
      }
      const ownership = await getOwnershipChecker(env)(auth.auth.userId, environmentId);
      if (!ownership.ok) {
        return new Response(`${ownership.reason}\n`, {
          status: ownership.status,
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

async function callDo(
  env: Env,
  environmentId: string,
  op: "claim" | "release",
  params: Record<string, string>,
): Promise<
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly status: number;
      readonly code: PairErrorCode;
      readonly message: string;
    }
> {
  const id = env.ENVIRONMENT_ROOMS.idFromName(environmentId);
  const stub = env.ENVIRONMENT_ROOMS.get(id);
  const search = new URLSearchParams(params).toString();
  let response: Response;
  try {
    response = await stub.fetch(`http://do/internal/${op}?${search}`, { method: "POST" });
  } catch (error) {
    return {
      ok: false,
      status: 502,
      code: PAIR_ERROR_CODES.PAIR_DO_UNAVAILABLE,
      message:
        error instanceof Error
          ? `Relay couldn't reach the room: ${error.message}`
          : "Relay couldn't reach the room.",
    };
  }
  if (response.ok) return { ok: true };
  const parsed = await getDoError(response);
  return {
    ok: false,
    status: response.status,
    code: parsed.code ?? PAIR_ERROR_CODES.PAIR_DO_UNAVAILABLE,
    message: parsed.message || `Relay returned ${response.status}.`,
  };
}

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

// One DO per environmentId. Identity is implicit, so attachments only carry
// the role and (for bridges) the channelId. Hibernation-safe per CF docs:
// https://developers.cloudflare.com/durable-objects/best-practices/websockets/
type WsAttachment =
  | { readonly role: "env"; readonly environmentId: string }
  | { readonly role: "client"; readonly channelId: string }
  | { readonly role: "channel"; readonly channelId: string };

export class EnvironmentRoom extends DurableObject<Env> {
  // Buffer for client→channel messages received before the channel WS opens.
  // Per-isolate; resets if the DO hibernates between client open and channel
  // open. The race window is microseconds in practice (env dials immediately
  // on receiving the dial signal), so the buffer is best-effort.
  private readonly dialBuffers = new Map<string, Array<string | ArrayBuffer>>();

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/internal/claim") return this.handleClaim(url);
    if (url.pathname === "/internal/release") return this.handleRelease(url);

    const environmentId = url.searchParams.get("environmentId")?.trim() ?? "";
    const proof = request.headers.get(ENVIRONMENT_PROOF_HEADER) ?? "";

    if (url.pathname === API_PATHS.environment || url.pathname === API_PATHS.channel) {
      const ok = await this.verifyProof(environmentId, proof);
      if (!ok) return new Response("environment proof mismatch\n", { status: 401 });
    }

    const pair = new WebSocketPair();
    const [clientEnd, server] = [pair[0], pair[1]];

    if (url.pathname === API_PATHS.environment) {
      this.acceptEnvSocket(server, environmentId);
    } else if (url.pathname === API_PATHS.client) {
      this.acceptClientSocket(server);
    } else if (url.pathname === API_PATHS.channel) {
      const channelId = url.searchParams.get("channelId")?.trim() ?? "";
      this.acceptChannelSocket(server, channelId);
    } else {
      server.close(1008, "unsupported route");
    }

    return new Response(null, { status: 101, webSocket: clientEnd });
  }

  // ── WebSocket accept handlers ─────────────────────────────────

  private acceptEnvSocket(socket: WebSocket, environmentId: string): void {
    for (const existing of this.getByRole("env")) {
      try {
        existing.close(1012, "environment replaced");
      } catch {
        // already closing
      }
    }
    this.ctx.acceptWebSocket(socket);
    socket.serializeAttachment({ role: "env", environmentId } satisfies WsAttachment);
    void this.getVault(environmentId).then((vault) => {
      this.sendPairStatus(socket, vault?.owner ?? null);
    });
  }

  private acceptClientSocket(socket: WebSocket): void {
    this.ctx.acceptWebSocket(socket);
    const env = this.getByRole("env")[0];
    if (!env) {
      socket.close(1013, "environment offline");
      return;
    }
    const channelId = crypto.randomUUID();
    socket.serializeAttachment({ role: "client", channelId } satisfies WsAttachment);
    const dial: ControlMessage = { type: "dial", channelId };
    try {
      env.send(JSON.stringify(dial));
    } catch {
      socket.close(1011, "failed to signal environment");
    }
  }

  private acceptChannelSocket(socket: WebSocket, channelId: string): void {
    this.ctx.acceptWebSocket(socket);
    const client = this.getChannelPeer("client", channelId);
    if (!client) {
      socket.close(4404, "unknown channel");
      return;
    }
    if (client.readyState !== WebSocket.OPEN) {
      socket.close(1013, "client gone");
      return;
    }
    socket.serializeAttachment({ role: "channel", channelId } satisfies WsAttachment);
    const buffer = this.dialBuffers.get(channelId);
    if (buffer) {
      for (const frame of buffer) {
        try {
          socket.send(frame);
        } catch {
          break;
        }
      }
      this.dialBuffers.delete(channelId);
    }
  }

  // ── Hibernation handlers ──────────────────────────────────────

  override async webSocketMessage(ws: WebSocket, msg: string | ArrayBuffer): Promise<void> {
    const attachment = ws.deserializeAttachment() as WsAttachment | null;
    if (!attachment) return;

    if (attachment.role === "env") {
      if (typeof msg !== "string") return;
      let parsed: { type?: unknown; token?: unknown };
      try {
        parsed = JSON.parse(msg) as typeof parsed;
      } catch {
        return;
      }
      if (parsed.type === "pair-token" && typeof parsed.token === "string") {
        await this.onPairToken(attachment.environmentId, parsed.token);
      }
      return;
    }

    if (attachment.role === "client") {
      const channel = this.getChannelPeer("channel", attachment.channelId);
      if (channel && channel.readyState === WebSocket.OPEN) {
        try {
          channel.send(msg);
        } catch {
          // channel racing close — drop frame
        }
        return;
      }
      const list = this.dialBuffers.get(attachment.channelId) ?? [];
      list.push(msg);
      this.dialBuffers.set(attachment.channelId, list);
      return;
    }

    if (attachment.role === "channel") {
      const client = this.getChannelPeer("client", attachment.channelId);
      if (client && client.readyState === WebSocket.OPEN) {
        try {
          client.send(msg);
        } catch {
          // client racing close — drop frame
        }
      }
    }
  }

  override async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    const attachment = ws.deserializeAttachment() as WsAttachment | null;
    if (!attachment) return;

    if (attachment.role === "env") {
      for (const client of this.getByRole("client")) {
        try {
          client.close(1013, "environment offline");
        } catch {
          // already closing
        }
      }
      this.dialBuffers.clear();
      return;
    }

    if (attachment.role === "client") {
      this.dialBuffers.delete(attachment.channelId);
      const channel = this.getChannelPeer("channel", attachment.channelId);
      if (channel) {
        try {
          channel.close(1001, "peer closed");
        } catch {
          // already closing
        }
      }
      return;
    }

    if (attachment.role === "channel") {
      const client = this.getChannelPeer("client", attachment.channelId);
      if (client) {
        try {
          client.close(1001, "peer closed");
        } catch {
          // already closing
        }
      }
    }
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    try {
      ws.close(1011, "peer error");
    } catch {
      // already closing
    }
  }

  // ── Internal claim/release endpoints ──────────────────────────

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

    const claimed = await this.getVault(environmentId);
    if (claimed) {
      if (claimed.owner === userId) return new Response("ok\n", { status: 200 });
      return doError(
        409,
        PAIR_ERROR_CODES.PAIR_ALREADY_CLAIMED,
        "This environment is already paired with another account. Sign in with that account, or release it from settings and re-pair.",
      );
    }

    const storedToken = (await this.ctx.storage.get<string>("token")) ?? null;
    const storedSecret = (await this.ctx.storage.get<string>("secret")) ?? null;
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

    await this.ctx.storage.deleteAll();
    await this.ctx.storage.deleteAlarm();
    this.broadcastPairStatus(userId);
    return new Response("ok\n", { status: 200 });
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
    const claimed = await this.getVault(environmentId);
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
    await this.ctx.storage.deleteAll();
    await this.ctx.storage.deleteAlarm();
    this.broadcastPairStatus(null);
    // Force the env to reconnect so its next handshake re-TOFUs into the
    // wiped DO storage. Without this, env keeps its old WS open and we
    // can't re-pair until the env restarts.
    for (const env of this.getByRole("env")) {
      try {
        env.close(1000, "released");
      } catch {
        // already closing
      }
    }
    return new Response("ok\n", { status: 200 });
  }

  /** Wipes the unclaimed-pending row 15 min after first write. */
  override async alarm(): Promise<void> {
    await this.ctx.storage.deleteAll();
  }

  // ── Helpers ──────────────────────────────────────────────────

  private async getVault(environmentId: string): Promise<VaultEntry | null> {
    if (!this.env.WORKOS_API_KEY) return null;
    try {
      return await getVault(this.env.WORKOS_API_KEY, environmentId);
    } catch {
      return null;
    }
  }

  private async verifyProof(environmentId: string, proof: string): Promise<boolean> {
    if (!proof || !environmentId) return false;
    const claimed = await this.getVault(environmentId);
    if (claimed) return isEqualConstantTime(claimed.secret, proof);
    const stored = (await this.ctx.storage.get<string>("secret")) ?? null;
    if (stored != null) return isEqualConstantTime(stored, proof);
    await this.ctx.storage.put("secret", proof);
    await this.ctx.storage.put("createdAt", new Date().toISOString());
    await this.ctx.storage.setAlarm(Date.now() + PENDING_TTL_MS);
    return true;
  }

  private async onPairToken(environmentId: string, token: string): Promise<void> {
    const trimmed = token.trim();
    if (trimmed.length < PAIR_TOKEN_MIN_LENGTH || trimmed.length > PAIR_TOKEN_MAX_LENGTH) return;
    if (await this.getVault(environmentId)) return;
    await this.ctx.storage.put("token", trimmed);
    if ((await this.ctx.storage.get<string>("createdAt")) == null) {
      await this.ctx.storage.put("createdAt", new Date().toISOString());
    }
    if ((await this.ctx.storage.getAlarm()) == null) {
      await this.ctx.storage.setAlarm(Date.now() + PENDING_TTL_MS);
    }
  }

  private sendPairStatus(socket: WebSocket, owner: string | null): void {
    if (socket.readyState !== WebSocket.OPEN) return;
    const signal: ControlMessage = { type: "pair-status", owner };
    try {
      socket.send(JSON.stringify(signal));
    } catch {
      // env will pick up state on its next reconnect
    }
  }

  private broadcastPairStatus(owner: string | null): void {
    for (const env of this.getByRole("env")) {
      this.sendPairStatus(env, owner);
    }
  }

  private getByRole(role: WsAttachment["role"]): WebSocket[] {
    const matches: WebSocket[] = [];
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() as WsAttachment | null;
      if (a?.role === role) matches.push(ws);
    }
    return matches;
  }

  private getChannelPeer(role: "client" | "channel", channelId: string): WebSocket | null {
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() as WsAttachment | null;
      if (a?.role === role && a.channelId === channelId) return ws;
    }
    return null;
  }
}
