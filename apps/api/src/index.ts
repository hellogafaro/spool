import {
  makeWorkOsBrowserAuthVerifier,
  presenceOnlyBrowserAuthVerifier,
  type BrowserAuthVerifier,
} from "./auth.ts";
import {
  allowAllOwnershipChecker,
  makeWorkOsOwnershipChecker,
  type OwnershipChecker,
} from "./ownership.ts";
import {
  handlePairingRequest,
  makeWorkOsPairingWriter,
  type PairingWriter,
} from "./pairing.ts";
import {
  API_PATHS,
  API_PROTOCOL_VERSION,
  ENVIRONMENT_PROOF_HEADER,
  type ControlMessage,
} from "./protocol.ts";

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

const WS_PATHS = new Set<string>([
  API_PATHS.browser,
  API_PATHS.channel,
  API_PATHS.environment,
]);

function resolveBrowserAuthVerifier(env: Env): BrowserAuthVerifier {
  if (env.WORKOS_CLIENT_ID && env.WORKOS_CLIENT_ID.length > 0) {
    return makeWorkOsBrowserAuthVerifier(env.WORKOS_CLIENT_ID);
  }
  return presenceOnlyBrowserAuthVerifier;
}

let cachedOwnershipChecker: { apiKey: string; checker: OwnershipChecker } | null = null;
let cachedPairingWriter: { apiKey: string; writer: PairingWriter } | null = null;

function resolveOwnershipChecker(env: Env): OwnershipChecker {
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

const ME_CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-max-age": "86400",
};

function withMeCors(response: Response): Response {
  for (const [key, value] of Object.entries(ME_CORS)) {
    response.headers.set(key, value);
  }
  return response;
}

function readEnvironmentIdsFromMetadata(metadata: Record<string, unknown> | null): string[] {
  if (!metadata) return [];
  const value = metadata.environmentIds;
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
}

async function handleMeRequest(request: Request, url: URL, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return withMeCors(new Response(null, { status: 204 }));
  }
  if (request.method !== "GET") {
    return withMeCors(
      new Response("method not allowed\n", {
        status: 405,
        headers: { allow: "GET, OPTIONS" },
      }),
    );
  }
  const verify = resolveBrowserAuthVerifier(env);
  const auth = await verify(request, url);
  if (!auth.ok) {
    return withMeCors(new Response(`${auth.reason}\n`, { status: auth.status }));
  }
  if (!env.WORKOS_API_KEY || env.WORKOS_API_KEY.length === 0) {
    return withMeCors(Response.json({ userId: auth.auth.userId, environmentIds: [] }));
  }
  let metadata: Record<string, unknown> | null = null;
  try {
    const workosResponse = await fetch(
      `https://api.workos.com/user_management/users/${auth.auth.userId}`,
      { headers: { authorization: `Bearer ${env.WORKOS_API_KEY}` } },
    );
    if (!workosResponse.ok) {
      return withMeCors(
        new Response(`workos lookup failed (${workosResponse.status})`, { status: 502 }),
      );
    }
    const body = (await workosResponse.json()) as { metadata?: Record<string, unknown> | null };
    metadata = body.metadata ?? null;
  } catch (error) {
    const reason = error instanceof Error ? error.message : "workos lookup failed";
    return withMeCors(new Response(reason, { status: 503 }));
  }
  return withMeCors(
    Response.json({
      userId: auth.auth.userId,
      environmentIds: readEnvironmentIdsFromMetadata(metadata),
    }),
  );
}

function resolvePairingWriter(env: Env): PairingWriter | null {
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

    if (url.pathname === API_PATHS.me) {
      return handleMeRequest(request, url, env);
    }

    if (url.pathname === API_PATHS.pairing) {
      const writer = resolvePairingWriter(env);
      if (!writer) {
        return new Response("pairing not configured\n", {
          status: 503,
          headers: textHeaders,
        });
      }
      return handlePairingRequest(request, url, {
        authVerifier: resolveBrowserAuthVerifier(env),
        writer,
        claimEnvironmentOwner: async (environmentId, userId) => {
          const id = env.ENVIRONMENT_ROOMS.idFromName(environmentId);
          const stub = env.ENVIRONMENT_ROOMS.get(id);
          const claimUrl = new URL(`http://do/internal/claim?userId=${encodeURIComponent(userId)}`);
          const response = await stub.fetch(claimUrl.toString(), { method: "POST" });
          if (response.ok) return { ok: true } as const;
          if (response.status === 409) {
            return { ok: false, status: 409, reason: "environment already claimed" } as const;
          }
          const text = await response.text().catch(() => "");
          return {
            ok: false,
            status: 502 as const,
            reason: text.trim() || `claim check failed (${response.status})`,
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

    if (
      (url.pathname === API_PATHS.environment || url.pathname === API_PATHS.channel) &&
      !request.headers.get(ENVIRONMENT_PROOF_HEADER)
    ) {
      return new Response("environment proof required\n", { status: 401, headers: textHeaders });
    }

    if (url.pathname === API_PATHS.browser) {
      const verify = resolveBrowserAuthVerifier(env);
      const authResult = await verify(request, url);
      if (!authResult.ok) {
        return new Response(`${authResult.reason}\n`, {
          status: authResult.status,
          headers: textHeaders,
        });
      }
      const ownership = resolveOwnershipChecker(env);
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

interface PendingBrowser {
  readonly socket: WebSocket;
  readonly buffered: Array<string | ArrayBuffer>;
}

export class EnvironmentRoom implements DurableObject {
  private environmentSocket: WebSocket | null = null;
  private readonly pendingBrowsers = new Map<string, PendingBrowser>();

  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Env,
  ) {
    void this.state;
    void this.env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/internal/claim") {
      return this.handleClaim(url);
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    server.accept();

    if (url.pathname === API_PATHS.environment) {
      this.acceptEnvironment(server);
    } else if (url.pathname === API_PATHS.browser) {
      this.acceptBrowser(server);
    } else if (url.pathname === API_PATHS.channel) {
      const channelId = url.searchParams.get("channelId")?.trim() ?? "";
      this.acceptChannel(server, channelId);
    } else {
      server.close(1008, "unsupported route");
    }

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  private async handleClaim(url: URL): Promise<Response> {
    const userId = url.searchParams.get("userId")?.trim();
    if (!userId) return new Response("userId required\n", { status: 400 });
    const existing = (await this.state.storage.get<string>("ownerUserId")) ?? null;
    if (existing && existing !== userId) {
      return new Response("environment already claimed\n", { status: 409 });
    }
    if (!existing) {
      await this.state.storage.put("ownerUserId", userId);
    }
    return new Response("ok\n", { status: 200 });
  }

  private acceptEnvironment(socket: WebSocket): void {
    this.environmentSocket?.close(1012, "environment replaced");
    this.environmentSocket = socket;

    socket.addEventListener("close", () => {
      if (this.environmentSocket !== socket) {
        return;
      }
      this.environmentSocket = null;
      for (const pending of this.pendingBrowsers.values()) {
        pending.socket.close(1013, "environment offline");
      }
      this.pendingBrowsers.clear();
    });

    socket.addEventListener("error", () => {
      socket.close(1011, "environment error");
    });
  }

  private acceptBrowser(socket: WebSocket): void {
    const environmentSocket = this.environmentSocket;
    if (!environmentSocket || environmentSocket.readyState !== WebSocket.OPEN) {
      socket.close(1013, "environment offline");
      return;
    }

    const channelId = crypto.randomUUID();
    const pending: PendingBrowser = { socket, buffered: [] };
    this.pendingBrowsers.set(channelId, pending);

    socket.addEventListener("message", (event) => {
      const current = this.pendingBrowsers.get(channelId);
      if (current === pending) {
        pending.buffered.push(event.data as string | ArrayBuffer);
      }
    });

    socket.addEventListener("close", () => {
      if (this.pendingBrowsers.get(channelId) === pending) {
        this.pendingBrowsers.delete(channelId);
      }
    });

    socket.addEventListener("error", () => {
      if (this.pendingBrowsers.get(channelId) === pending) {
        this.pendingBrowsers.delete(channelId);
      }
      socket.close(1011, "browser error");
    });

    const signal: ControlMessage = { type: "dial", channelId };
    try {
      environmentSocket.send(JSON.stringify(signal));
    } catch {
      this.pendingBrowsers.delete(channelId);
      socket.close(1011, "failed to signal environment");
    }
  }

  private acceptChannel(channel: WebSocket, channelId: string): void {
    const pending = this.pendingBrowsers.get(channelId);
    if (!pending) {
      channel.close(4404, "unknown channel");
      return;
    }
    this.pendingBrowsers.delete(channelId);

    const browser = pending.socket;
    if (browser.readyState !== WebSocket.OPEN) {
      channel.close(1013, "browser gone");
      return;
    }

    const removeBrowserBuffer = () => {
      pending.buffered.length = 0;
    };

    bridge(browser, channel, () => {
      removeBrowserBuffer();
    });

    for (const frame of pending.buffered) {
      try {
        channel.send(frame);
      } catch {
        // channel closed mid-flush; bridge cleanup will handle the rest.
        break;
      }
    }
    removeBrowserBuffer();
  }
}

function bridge(a: WebSocket, b: WebSocket, onClose: () => void): void {
  const forward = (from: WebSocket, to: WebSocket) => {
    from.addEventListener("message", (event) => {
      if (to.readyState === WebSocket.OPEN) {
        to.send(event.data);
      }
    });
  };

  let closed = false;
  const closeBoth = (code: number, reason: string) => {
    if (closed) return;
    closed = true;
    onClose();
    if (a.readyState === WebSocket.OPEN) a.close(code, reason);
    if (b.readyState === WebSocket.OPEN) b.close(code, reason);
  };

  forward(a, b);
  forward(b, a);
  a.addEventListener("close", () => closeBoth(1001, "peer closed"));
  b.addEventListener("close", () => closeBoth(1001, "peer closed"));
  a.addEventListener("error", () => closeBoth(1011, "peer error"));
  b.addEventListener("error", () => closeBoth(1011, "peer error"));
}
