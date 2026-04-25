import { Effect, FileSystem, Option, Path, Schema } from "effect";
import type { PlatformError } from "effect/PlatformError";
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

const SERVER_ID_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

const generateServerId = (): RemoteLinkServerId => {
  const adjectives = ["happy", "swift", "calm", "bright", "bold", "clever", "kind", "lively"];
  const nouns = ["coffee", "ocean", "garden", "river", "forest", "summit", "harbor", "meadow"];
  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)] ?? "happy";
  const noun = nouns[Math.floor(Math.random() * nouns.length)] ?? "coffee";
  let suffix = "";
  for (let index = 0; index < 4; index += 1) {
    suffix += SERVER_ID_ALPHABET[Math.floor(Math.random() * SERVER_ID_ALPHABET.length)];
  }
  return `${adjective}-${noun}-${suffix}`;
};

const generateServerSecret = (): string => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
};

export const writeRemoteLinkLocalConfig = (
  overrides: Partial<RemoteLinkLocalConfig> = {},
): Effect.Effect<RemoteLinkLocalConfig, PlatformError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const filePath = yield* remoteLinkConfigPath();

    const existing = yield* readRemoteLinkLocalConfig;
    const config: RemoteLinkLocalConfig = {
      serverId: overrides.serverId ?? Option.match(existing, {
        onNone: () => generateServerId(),
        onSome: (current) => current.serverId,
      }),
      serverSecret: overrides.serverSecret ?? Option.match(existing, {
        onNone: () => generateServerSecret(),
        onSome: (current) => current.serverSecret,
      }),
      ...(overrides.userId !== undefined
        ? { userId: overrides.userId }
        : Option.match(existing, {
            onNone: () => ({}),
            onSome: (current) =>
              current.userId !== undefined ? { userId: current.userId } : {},
          })),
    };

    yield* fs.makeDirectory(path.dirname(filePath), { recursive: true }).pipe(
      Effect.orElseSucceed(() => undefined),
    );
    yield* fs.writeFileString(filePath, `${JSON.stringify(config, null, 2)}\n`);
    return config;
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
