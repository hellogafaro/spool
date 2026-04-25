/**
 * RemoteLink - Outbound link to the Trunk hosted API.
 *
 * Reads `~/.trunk/config.json`. If absent the layer is a no-op and
 * snapshot stays "disabled" — keeps the local-only path untouched.
 *
 * When configured, a scoped fiber maintains a single WebSocket to
 * `${TRUNK_API_URL}/server`, reconnecting with backoff. Frames are
 * not parsed; E2E transport lands in Phase 4.
 */
import { Context, Duration, Effect, Layer, Option, Ref, Schedule } from "effect";

import {
  DEFAULT_REMOTE_LINK_API_URL,
  makeRemoteLinkServerUrl,
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

const PROOF_HEADER = "x-trunk-server-proof";

const resolveApiUrl = (): URL => new URL(process.env.TRUNK_API_URL ?? DEFAULT_REMOTE_LINK_API_URL);

const connectOnce = (
  ref: Ref.Ref<RemoteLinkSnapshot>,
  local: RemoteLinkLocalConfig,
  url: URL,
): Effect.Effect<void> =>
  Effect.callback<void>((resume) => {
    const setStatus = (
      patch: Partial<RemoteLinkSnapshot> & { readonly status: RemoteLinkStatus },
    ) => Ref.update(ref, (current) => ({ ...current, ...patch }));

    const socket = new WebSocket(url, {
      headers: { [PROOF_HEADER]: local.serverSecret },
    } as unknown as string[]);

    Effect.runFork(setStatus({ status: "connecting", serverId: local.serverId, lastError: null }));

    socket.addEventListener("open", () => {
      Effect.runFork(
        setStatus({
          status: "connected",
          serverId: local.serverId,
          lastConnectedAt: new Date(),
          lastError: null,
        }),
      );
    });

    const finish = (error: string | null) => {
      Effect.runFork(
        setStatus({
          status: "disconnected",
          serverId: local.serverId,
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
        // socket already closing; ignore
      }
    });
  });

const reconnectSchedule = Schedule.exponential(Duration.seconds(1), 2.0).pipe(
  Schedule.either(Schedule.spaced(Duration.seconds(30))),
);

export const RemoteLinkLive = Layer.effect(
  RemoteLink,
  Effect.gen(function* () {
    const ref = yield* Ref.make<RemoteLinkSnapshot>(DISABLED_REMOTE_LINK_SNAPSHOT);
    const localOption = yield* readRemoteLinkLocalConfig;

    if (Option.isSome(localOption)) {
      const local = localOption.value;
      const url = makeRemoteLinkServerUrl({ apiUrl: resolveApiUrl(), local });
      const loop = connectOnce(ref, local, url).pipe(
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
