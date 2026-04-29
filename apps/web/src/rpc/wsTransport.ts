import { WS_METHODS } from "@t3tools/contracts";
import {
  Cause,
  Duration,
  Effect,
  Exit,
  Layer,
  ManagedRuntime,
  Option,
  Scope,
  Stream,
} from "effect";
import { RpcClient } from "effect/unstable/rpc";

import { ClientTracingLive } from "../observability/clientTracing";
import { clearAllTrackedRpcRequests } from "./requestLatencyState";
import {
  createWsRpcProtocolLayer,
  makeWsRpcProtocolClient,
  type WsProtocolLifecycleHandlers,
  type WsRpcProtocolClient,
  type WsRpcProtocolSocketUrlProvider,
} from "./protocol";
import { isTransportConnectionErrorMessage } from "./transportError";

export const WS_HEARTBEAT_INTERVAL_MS = 20_000;
export const WS_HEARTBEAT_TIMEOUT_MS = 10_000;

interface SubscribeOptions {
  readonly retryDelay?: Duration.Input;
  readonly onResubscribe?: () => void;
}

interface WsTransportOptions {
  readonly heartbeatIntervalMs?: number;
  readonly heartbeatTimeoutMs?: number;
}

interface RequestOptions {
  readonly timeout?: Option.Option<Duration.Input>;
}

const DEFAULT_SUBSCRIPTION_RETRY_DELAY_MS = Duration.millis(250);
const NOOP: () => void = () => undefined;

interface TransportSession {
  readonly clientPromise: Promise<WsRpcProtocolClient>;
  readonly clientScope: Scope.Closeable;
  readonly runtime: ManagedRuntime.ManagedRuntime<RpcClient.Protocol, never>;
  heartbeatInFlight: boolean;
  heartbeatTimer: ReturnType<typeof setInterval> | null;
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return String(error);
}

export class WsTransport {
  private readonly url: WsRpcProtocolSocketUrlProvider;
  private readonly lifecycleHandlers: WsProtocolLifecycleHandlers | undefined;
  private disposed = false;
  private hasReportedTransportDisconnect = false;
  private reconnectChain: Promise<void> = Promise.resolve();
  private session: TransportSession;
  private readonly heartbeatIntervalMs: number;
  private readonly heartbeatTimeoutMs: number;

  constructor(
    url: WsRpcProtocolSocketUrlProvider,
    lifecycleHandlers?: WsProtocolLifecycleHandlers,
    options?: WsTransportOptions,
  ) {
    this.url = url;
    this.lifecycleHandlers = lifecycleHandlers;
    this.heartbeatIntervalMs = options?.heartbeatIntervalMs ?? WS_HEARTBEAT_INTERVAL_MS;
    this.heartbeatTimeoutMs = options?.heartbeatTimeoutMs ?? WS_HEARTBEAT_TIMEOUT_MS;
    this.session = this.createSession();
  }

  async request<TSuccess>(
    execute: (client: WsRpcProtocolClient) => Effect.Effect<TSuccess, Error, never>,
    _options?: RequestOptions,
  ): Promise<TSuccess> {
    if (this.disposed) {
      throw new Error("Transport disposed");
    }

    const session = this.session;
    const client = await session.clientPromise;
    return await session.runtime.runPromise(Effect.suspend(() => execute(client)));
  }

  async requestStream<TValue>(
    connect: (client: WsRpcProtocolClient) => Stream.Stream<TValue, Error, never>,
    listener: (value: TValue) => void,
  ): Promise<void> {
    if (this.disposed) {
      throw new Error("Transport disposed");
    }

    const session = this.session;
    const client = await session.clientPromise;
    await session.runtime.runPromise(
      Stream.runForEach(connect(client), (value) =>
        Effect.sync(() => {
          try {
            listener(value);
          } catch {
            // Swallow listener errors so the stream can finish cleanly.
          }
        }),
      ),
    );
  }

  subscribe<TValue>(
    connect: (client: WsRpcProtocolClient) => Stream.Stream<TValue, Error, never>,
    listener: (value: TValue) => void,
    options?: SubscribeOptions,
  ): () => void {
    if (this.disposed) {
      return () => undefined;
    }

    let active = true;
    let hasReceivedValue = false;
    const retryDelayMs = Duration.toMillis(
      Duration.fromInputUnsafe(options?.retryDelay ?? DEFAULT_SUBSCRIPTION_RETRY_DELAY_MS),
    );
    let cancelCurrentStream: () => void = NOOP;

    void (async () => {
      for (;;) {
        if (!active || this.disposed) {
          return;
        }

        const session = this.session;
        try {
          if (hasReceivedValue) {
            try {
              options?.onResubscribe?.();
            } catch {
              // Swallow reconnect hook errors so the stream can recover.
            }
          }

          const runningStream = this.runStreamOnSession(
            session,
            connect,
            listener,
            () => active,
            () => {
              this.hasReportedTransportDisconnect = false;
              hasReceivedValue = true;
            },
          );
          cancelCurrentStream = runningStream.cancel;
          await runningStream.completed;
          cancelCurrentStream = NOOP;
        } catch (error) {
          cancelCurrentStream = NOOP;
          if (!active || this.disposed) {
            return;
          }

          if (session !== this.session) {
            continue;
          }

          const formattedError = formatErrorMessage(error);
          if (!isTransportConnectionErrorMessage(formattedError)) {
            console.warn("WebSocket RPC subscription failed", {
              error: formattedError,
            });
            return;
          }

          if (!this.hasReportedTransportDisconnect) {
            console.warn("WebSocket RPC subscription disconnected", {
              error: formattedError,
            });
          }
          this.hasReportedTransportDisconnect = true;
          await sleep(retryDelayMs);
        }
      }
    })();

    return () => {
      active = false;
      cancelCurrentStream();
    };
  }

  async reconnect() {
    if (this.disposed) {
      throw new Error("Transport disposed");
    }

    const reconnectOperation = this.reconnectChain.then(async () => {
      if (this.disposed) {
        throw new Error("Transport disposed");
      }

      clearAllTrackedRpcRequests();
      const previousSession = this.session;
      this.session = this.createSession();
      await this.closeSession(previousSession);
    });

    this.reconnectChain = reconnectOperation.catch(() => undefined);
    await reconnectOperation;
  }

  async dispose() {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    await this.closeSession(this.session);
  }

  private closeSession(session: TransportSession) {
    if (session.heartbeatTimer !== null) {
      clearInterval(session.heartbeatTimer);
      session.heartbeatTimer = null;
    }
    return session.runtime.runPromise(Scope.close(session.clientScope, Exit.void)).finally(() => {
      session.runtime.dispose();
    });
  }

  private createSession(): TransportSession {
    const runtime = ManagedRuntime.make(
      Layer.mergeAll(createWsRpcProtocolLayer(this.url, this.lifecycleHandlers), ClientTracingLive),
    );
    const clientScope = runtime.runSync(Scope.make());
    const session: TransportSession = {
      runtime,
      clientScope,
      clientPromise: runtime.runPromise(Scope.provide(clientScope)(makeWsRpcProtocolClient)),
      heartbeatInFlight: false,
      heartbeatTimer: null,
    };
    session.heartbeatTimer = setInterval(() => {
      void this.runHeartbeat(session);
    }, this.heartbeatIntervalMs);
    return session;
  }

  private async runHeartbeat(session: TransportSession): Promise<void> {
    if (this.disposed || session !== this.session || session.heartbeatInFlight) {
      return;
    }

    session.heartbeatInFlight = true;
    try {
      const client = await session.clientPromise;
      if (this.disposed || session !== this.session) {
        return;
      }

      await withTimeout(
        session.runtime.runPromise(Effect.suspend(() => client[WS_METHODS.serverPing]({}))),
        this.heartbeatTimeoutMs,
      );
    } catch (error) {
      if (this.disposed || session !== this.session) {
        return;
      }
      console.warn("WebSocket RPC heartbeat failed", {
        error: formatErrorMessage(error),
      });
      await this.reconnect().catch(() => undefined);
    } finally {
      session.heartbeatInFlight = false;
    }
  }

  private runStreamOnSession<TValue>(
    session: TransportSession,
    connect: (client: WsRpcProtocolClient) => Stream.Stream<TValue, Error, never>,
    listener: (value: TValue) => void,
    isActive: () => boolean,
    markValueReceived: () => void,
  ): {
    readonly cancel: () => void;
    readonly completed: Promise<void>;
  } {
    let resolveCompleted!: () => void;
    let rejectCompleted!: (error: unknown) => void;
    const completed = new Promise<void>((resolve, reject) => {
      resolveCompleted = resolve;
      rejectCompleted = reject;
    });
    const cancel = session.runtime.runCallback(
      Effect.promise(() => session.clientPromise).pipe(
        Effect.flatMap((client) =>
          Stream.runForEach(connect(client), (value) =>
            Effect.sync(() => {
              if (!isActive()) {
                return;
              }

              markValueReceived();
              try {
                listener(value);
              } catch {
                // Swallow listener errors so the stream stays live.
              }
            }),
          ),
        ),
      ),
      {
        onExit: (exit) => {
          if (Exit.isSuccess(exit)) {
            resolveCompleted();
            return;
          }

          rejectCompleted(Cause.squash(exit.cause));
        },
      },
    );

    return {
      cancel,
      completed,
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error("WebSocket heartbeat timed out."));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
  }
}
