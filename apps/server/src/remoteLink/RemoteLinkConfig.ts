import { Effect, FileSystem, Option, Path, Schema } from "effect";
import * as OS from "node:os";

const ServerIdPattern = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export const RemoteLinkServerId = Schema.String.pipe(
  Schema.check(Schema.isPattern(ServerIdPattern)),
);
export type RemoteLinkServerId = typeof RemoteLinkServerId.Type;

export const RemoteLinkLocalConfig = Schema.Struct({
  serverId: RemoteLinkServerId,
  serverSecret: Schema.String.pipe(Schema.check(Schema.isMinLength(1))),
  userId: Schema.optional(Schema.String),
});
export type RemoteLinkLocalConfig = typeof RemoteLinkLocalConfig.Type;

export const DEFAULT_REMOTE_LINK_API_URL = "wss://api.trunk.codes";

export interface RemoteLinkRuntimeConfig {
  readonly apiUrl: URL;
  readonly local: RemoteLinkLocalConfig;
}

export function makeRemoteLinkServerUrl(config: RemoteLinkRuntimeConfig): URL {
  const url = new URL("/server", config.apiUrl);
  url.searchParams.set("serverId", config.local.serverId);
  return url;
}

export const remoteLinkConfigPath = Effect.fn(function* () {
  const path = yield* Path.Path;
  const home = process.env.TRUNK_HOME ?? OS.homedir();
  return path.join(home, ".trunk", "config.json");
});

export const readRemoteLinkLocalConfig = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const filePath = yield* remoteLinkConfigPath();
  const exists = yield* fs.exists(filePath).pipe(Effect.orElseSucceed(() => false));
  if (!exists) return Option.none<RemoteLinkLocalConfig>();

  const raw = yield* fs.readFileString(filePath).pipe(Effect.option);
  if (Option.isNone(raw)) return Option.none<RemoteLinkLocalConfig>();

  const parsed = yield* Effect.try({
    try: () => JSON.parse(raw.value) as unknown,
    catch: () => null,
  }).pipe(Effect.option);
  if (Option.isNone(parsed)) return Option.none<RemoteLinkLocalConfig>();

  return yield* Schema.decodeUnknownEffect(RemoteLinkLocalConfig)(parsed.value).pipe(
    Effect.map(Option.some),
    Effect.orElseSucceed(() => Option.none<RemoteLinkLocalConfig>()),
  );
});
