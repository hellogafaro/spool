#!/usr/bin/env bun
/**
 * trunk-pair — bootstrap ~/.trunk/config.json
 *
 * Generates a serverId and serverSecret if missing, writes them, and
 * prints the values needed to point a Trunk web app at this server.
 *
 * Usage: bun run apps/server/scripts/trunk-pair.ts
 */
import * as NodeServices from "@effect/platform-node/NodeServices";
import { Effect } from "effect";

import {
  remoteLinkConfigPath,
  writeRemoteLinkLocalConfig,
} from "../src/remoteLink/RemoteLinkConfig.ts";

const program = Effect.gen(function* () {
  const config = yield* writeRemoteLinkLocalConfig();
  const filePath = yield* remoteLinkConfigPath();

  console.log("");
  console.log("Trunk server pairing complete.");
  console.log("");
  console.log(`  config:    ${filePath}`);
  console.log(`  serverId:  ${config.serverId}`);
  console.log("");
  console.log("Point your Trunk web app at:");
  console.log(`  wss://api.trunk.codes/?serverId=${config.serverId}`);
  console.log("");
  console.log("Issue a bearer token with: trunk session issue --role owner");
  console.log("");
});

Effect.runPromise(program.pipe(Effect.provide(NodeServices.layer))).catch((error) => {
  console.error("trunk-pair failed:", error);
  process.exit(1);
});
