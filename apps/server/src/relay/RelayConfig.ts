import { Effect, FileSystem, Option, Path, Schema } from "effect";
import type { PlatformError } from "effect/PlatformError";
import * as OS from "node:os";

const ENVIRONMENT_ID_PATTERN = /^[A-Z0-9]{12}$/;
// Crockford-ish: drop ambiguous chars (0/O, 1/I/L) so the value is safe to read off a console.
const ENVIRONMENT_ID_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export const EnvironmentId = Schema.String.pipe(
  Schema.check(Schema.isPattern(ENVIRONMENT_ID_PATTERN)),
);
export type EnvironmentId = typeof EnvironmentId.Type;

export const RelayConfig = Schema.Struct({
  environmentId: EnvironmentId,
  environmentSecret: Schema.String.pipe(Schema.check(Schema.isMinLength(1))),
  userId: Schema.optional(Schema.String),
});
export type RelayConfig = typeof RelayConfig.Type;

export const DEFAULT_RELAY_API_URL = "wss://api.trunk.codes";

export interface RelayRuntimeConfig {
  readonly apiUrl: URL;
  readonly local: RelayConfig;
}

export function makeRelayEnvironmentUrl(config: RelayRuntimeConfig): URL {
  const url = new URL("/environment", config.apiUrl);
  url.searchParams.set("environmentId", config.local.environmentId);
  return url;
}

export const relayConfigPath = Effect.fn(function* () {
  const path = yield* Path.Path;
  const home = process.env.TRUNK_HOME ?? OS.homedir();
  return path.join(home, ".trunk", "config.json");
});

const generateEnvironmentId = (): EnvironmentId => {
  let id = "";
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  for (let index = 0; index < 12; index += 1) {
    id += ENVIRONMENT_ID_ALPHABET[bytes[index]! % ENVIRONMENT_ID_ALPHABET.length];
  }
  return id;
};

const generateEnvironmentSecret = (): string => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
};

export const writeRelayConfig = (
  overrides: Partial<RelayConfig> = {},
): Effect.Effect<RelayConfig, PlatformError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const filePath = yield* relayConfigPath();

    const existing = yield* readRelayConfig;
    const config: RelayConfig = {
      environmentId:
        overrides.environmentId ??
        Option.match(existing, {
          onNone: () => generateEnvironmentId(),
          onSome: (current) => current.environmentId,
        }),
      environmentSecret:
        overrides.environmentSecret ??
        Option.match(existing, {
          onNone: () => generateEnvironmentSecret(),
          onSome: (current) => current.environmentSecret,
        }),
      ...(overrides.userId !== undefined
        ? { userId: overrides.userId }
        : Option.match(existing, {
            onNone: () => ({}),
            onSome: (current) => (current.userId !== undefined ? { userId: current.userId } : {}),
          })),
    };

    yield* fs
      .makeDirectory(path.dirname(filePath), { recursive: true })
      .pipe(Effect.orElseSucceed(() => undefined));
    yield* fs.writeFileString(filePath, `${JSON.stringify(config, null, 2)}\n`);
    return config;
  });

export const readRelayConfig = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const filePath = yield* relayConfigPath();
  const exists = yield* fs.exists(filePath).pipe(Effect.orElseSucceed(() => false));
  if (!exists) return Option.none<RelayConfig>();

  const raw = yield* fs.readFileString(filePath).pipe(Effect.option);
  if (Option.isNone(raw)) return Option.none<RelayConfig>();

  const parsed = yield* Effect.try({
    try: () => JSON.parse(raw.value) as unknown,
    catch: () => null,
  }).pipe(Effect.option);
  if (Option.isNone(parsed)) return Option.none<RelayConfig>();

  return yield* Schema.decodeUnknownEffect(RelayConfig)(parsed.value).pipe(
    Effect.map(Option.some),
    Effect.orElseSucceed(() => Option.none<RelayConfig>()),
  );
});
