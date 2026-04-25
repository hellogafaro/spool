import { Schema } from "effect";

const ServerIdPattern = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export const RemoteLinkServerId = Schema.String.pipe(
  Schema.check(Schema.isPattern(ServerIdPattern)),
);
export type RemoteLinkServerId = typeof RemoteLinkServerId.Type;

export interface RemoteLinkConfig {
  readonly apiUrl: URL;
  readonly serverId: RemoteLinkServerId;
}

export function makeRemoteLinkServerUrl(config: RemoteLinkConfig): URL {
  const url = new URL("/server", config.apiUrl);
  url.searchParams.set("serverId", config.serverId);
  return url;
}
