import { describe, expect, it } from "vitest";

import { getProviderEnvironmentState } from "./provider-environment-state";

describe("getProviderEnvironmentState", () => {
  it("uses server config for local environments", () => {
    expect(
      getProviderEnvironmentState({
        workOsConfigured: false,
        hasServerConfig: true,
        runtimeStates: [],
      }),
    ).toBe("connected");
    expect(
      getProviderEnvironmentState({
        workOsConfigured: false,
        hasServerConfig: false,
        runtimeStates: [{ connectionState: "connected" }],
      }),
    ).toBe("offline");
  });

  it("treats a server config snapshot as connected for saved environments", () => {
    expect(
      getProviderEnvironmentState({
        workOsConfigured: true,
        hasServerConfig: true,
        runtimeStates: [{ connectionState: "disconnected" }],
      }),
    ).toBe("connected");
  });

  it("uses runtime connection state before saved environment config loads", () => {
    expect(
      getProviderEnvironmentState({
        workOsConfigured: true,
        hasServerConfig: false,
        runtimeStates: [{ connectionState: "connecting" }],
      }),
    ).toBe("connecting");
    expect(
      getProviderEnvironmentState({
        workOsConfigured: true,
        hasServerConfig: false,
        runtimeStates: [{ connectionState: "connected" }],
      }),
    ).toBe("connected");
  });
});
