import * as NodeServices from "@effect/platform-node/NodeServices";
import { Effect, FileSystem, Layer, Path } from "effect";
import * as OS from "node:os";
import * as NFS from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ServerConfig } from "../config.ts";
import { RemoteLink, RemoteLinkLive } from "./RemoteLink.ts";

const baseLayer = Layer.provideMerge(
  RemoteLinkLive,
  Layer.provideMerge(
    ServerConfig.layerTest(process.cwd(), { prefix: "trunk-remote-link-test-config-" }),
    NodeServices.layer,
  ),
);

const readSnapshot = Effect.gen(function* () {
  const link = yield* RemoteLink;
  return yield* link.snapshot;
}).pipe(Effect.provide(baseLayer), Effect.scoped);

describe("RemoteLink", () => {
  let tempHome: string;
  let previousHome: string | undefined;

  beforeEach(async () => {
    tempHome = await NFS.mkdtemp(`${OS.tmpdir()}/trunk-remote-link-test-`);
    previousHome = process.env.TRUNK_HOME;
    process.env.TRUNK_HOME = tempHome;
  });

  afterEach(async () => {
    if (previousHome === undefined) delete process.env.TRUNK_HOME;
    else process.env.TRUNK_HOME = previousHome;
    await NFS.rm(tempHome, { recursive: true, force: true });
  });

  it("disabled when no config file exists", async () => {
    const snapshot = await Effect.runPromise(readSnapshot);
    expect(snapshot.status).toBe("disabled");
    expect(snapshot.serverId).toBeNull();
  });

  it("disabled when config file is malformed", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        yield* fs.makeDirectory(path.join(tempHome, ".trunk"), { recursive: true });
        yield* fs.writeFileString(path.join(tempHome, ".trunk", "config.json"), "not json");
      }).pipe(Effect.provide(NodeServices.layer)),
    );

    const snapshot = await Effect.runPromise(readSnapshot);
    expect(snapshot.status).toBe("disabled");
  });
});
