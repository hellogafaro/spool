/**
 * RemoteLink - Outbound link from a Trunk environment to the hosted API.
 *
 * Reads `~/.trunk/config.json`. If absent the layer is a no-op and
 * snapshot stays "disabled" — keeps the local-only path untouched.
 *
 * When configured:
 * 1. Maintains a single outbound "control" WebSocket to
 *    `${TRUNK_API_URL}/environment` with backoff reconnect.
 * 2. On `{ type: "dial", channelId }` from the API, opens a new
 *    outbound WebSocket to `${TRUNK_API_URL}/channel?channelId=X`
 *    and bridges it to a loopback WebSocket against the local server's
 *    own `/ws` endpoint, so each remote browser becomes a normal local
 *    HTTP upgrade for T3's existing multi-session handler.
 */
import { Context, Duration, Effect, Layer, Option, Ref, Schedule } from "effect";

import { LOOPBACK_TRUST_HEADER, setLoopbackTrustToken } from "../auth/loopbackTrust.ts";
import { ServerConfig } from "../config.ts";
import {
  DEFAULT_REMOTE_LINK_API_URL,
  readRemoteLinkLocalConfig,
  type RemoteLinkLocalConfig,
} from "./RemoteLinkConfig.ts";
import {
  DISABLED_REMOTE_LINK_SNAPSHOT,
  type RemoteLinkSnapshot,
  type RemoteLinkStatus,
} from "./RemoteLinkState.ts";

export interface RemoteLinkShape {
  readonly snapshot: Effect.Effect<RemoteLinkSnapshot>;
}

export class RemoteLink extends Context.Service<RemoteLink, RemoteLinkShape>()(
  "trunk/remoteLink/RemoteLink",
) {}

const PROOF_HEADER = "x-trunk-environment-proof";
const CONTROL_PATH = "/environment";
const CHANNEL_PATH = "/channel";

interface DialSignal {
  readonly type: "dial";
  readonly channelId: string;
}

const resolveApiUrl = (): URL => new URL(process.env.TRUNK_API_URL ?? DEFAULT_REMOTE_LINK_API_URL);

const buildChannelUrl = (apiUrl: URL, environmentId: string, channelId: string): URL => {
  const url = new URL(CHANNEL_PATH, apiUrl);
  url.searchParams.set("environmentId", environmentId);
  url.searchParams.set("channelId", channelId);
  return url;
};

const openWithProof = (url: URL, secret: string): WebSocket =>
  new WebSocket(url, {
    headers: { [PROOF_HEADER]: secret },
  } as unknown as string[]);

const openLoopback = (loopbackUrl: string, trustToken: string): WebSocket =>
  new WebSocket(loopbackUrl, {
    headers: { [LOOPBACK_TRUST_HEADER]: trustToken },
  } as unknown as string[]);

const bridgeChannel = (
  remote: WebSocket,
  loopback: WebSocket,
): Effect.Effect<void> =>
  Effect.callback<void>((resume) => {
    let settled = false;
    const teardown = (code: number, reason: string) => {
      if (settled) return;
      settled = true;
      try {
        remote.close(code, reason);
      } catch {
        // ignore: remote already closing
      }
      try {
        loopback.close(code, reason);
      } catch {
        // ignore: loopback already closing
      }
      resume(Effect.void);
    };

    remote.addEventListener("message", (event) => {
      if (loopback.readyState === WebSocket.OPEN) {
        loopback.send(event.data);
      }
    });
    loopback.addEventListener("message", (event) => {
      if (remote.readyState === WebSocket.OPEN) {
        remote.send(event.data);
      }
    });

    remote.addEventListener("close", () => teardown(1000, "remote closed"));
    remote.addEventListener("error", () => teardown(1011, "remote error"));
    loopback.addEventListener("close", () => teardown(1000, "loopback closed"));
    loopback.addEventListener("error", () => teardown(1011, "loopback error"));

    return Effect.sync(() => teardown(1001, "scope closed"));
  });

const handleDial = (
  apiUrl: URL,
  local: RemoteLinkLocalConfig,
  loopbackUrl: string,
  trustToken: string,
  channelId: string,
): Effect.Effect<void> =>
  Effect.gen(function* () {
    const remote = openWithProof(
      buildChannelUrl(apiUrl, local.environmentId, channelId),
      local.environmentSecret,
    );
    const loopback = openLoopback(loopbackUrl, trustToken);
    yield* bridgeChannel(remote, loopback);
  }).pipe(Effect.ignoreCause({ log: true }));

const connectControl = (
  ref: Ref.Ref<RemoteLinkSnapshot>,
  local: RemoteLinkLocalConfig,
  apiUrl: URL,
  loopbackUrl: string,
  trustToken: string,
): Effect.Effect<void> =>
  Effect.callback<void>((resume) => {
    const setStatus = (
      patch: Partial<RemoteLinkSnapshot> & { readonly status: RemoteLinkStatus },
    ) => Ref.update(ref, (current) => ({ ...current, ...patch }));

    const controlUrl = new URL(CONTROL_PATH, apiUrl);
    controlUrl.searchParams.set("environmentId", local.environmentId);
    const socket = openWithProof(controlUrl, local.environmentSecret);

    Effect.runFork(
      setStatus({ status: "connecting", environmentId: local.environmentId, lastError: null }),
    );

    socket.addEventListener("open", () => {
      Effect.runFork(
        setStatus({
          status: "connected",
          environmentId: local.environmentId,
          lastConnectedAt: new Date(),
          lastError: null,
        }),
      );
    });

    socket.addEventListener("message", (event) => {
      let signal: DialSignal | undefined;
      try {
        const parsed = JSON.parse(String(event.data)) as { type?: unknown; channelId?: unknown };
        if (parsed.type === "dial" && typeof parsed.channelId === "string") {
          signal = { type: "dial", channelId: parsed.channelId };
        }
      } catch {
        // ignore non-JSON or malformed control frames
      }
      if (signal) {
        Effect.runFork(handleDial(apiUrl, local, loopbackUrl, trustToken, signal.channelId));
      }
    });

    const finish = (error: string | null) => {
      Effect.runFork(
        setStatus({
          status: "disconnected",
          environmentId: local.environmentId,
          lastDisconnectedAt: new Date(),
          lastError: error,
        }),
      );
      resume(Effect.void);
    };

    socket.addEventListener("close", (event) => {
      finish(event.reason ? `${event.code}: ${event.reason}` : null);
    });
    socket.addEventListener("error", () => {
      finish("websocket error");
    });

    return Effect.sync(() => {
      try {
        socket.close();
      } catch {
        // ignore: socket already closing
      }
    });
  });

const reconnectSchedule = Schedule.exponential(Duration.seconds(1), 2.0).pipe(
  Schedule.either(Schedule.spaced(Duration.seconds(30))),
);

const buildLoopbackUrl = (port: number): string => `ws://127.0.0.1:${port}/ws`;

export const RemoteLinkLive = Layer.effect(
  RemoteLink,
  Effect.gen(function* () {
    const config = yield* ServerConfig;
    const ref = yield* Ref.make<RemoteLinkSnapshot>(DISABLED_REMOTE_LINK_SNAPSHOT);
    const localOption = yield* readRemoteLinkLocalConfig;

    if (Option.isSome(localOption) && config.port > 0) {
      const local = localOption.value;
      const apiUrl = resolveApiUrl();
      const loopbackUrl = buildLoopbackUrl(config.port);
      const trustToken = crypto.randomUUID();
      setLoopbackTrustToken(trustToken);
      const loop = connectControl(ref, local, apiUrl, loopbackUrl, trustToken).pipe(
        Effect.andThen(Effect.sleep(Duration.seconds(1))),
        Effect.repeat(reconnectSchedule),
        Effect.asVoid,
      );
      yield* Effect.forkScoped(loop);
    }

    return RemoteLink.of({
      snapshot: Ref.get(ref),
    });
  }),
);
