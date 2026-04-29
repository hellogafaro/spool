export type ProviderEnvironmentState = "connected" | "connecting" | "offline";

interface RuntimeStateLike {
  readonly connectionState: string;
}

export function getProviderEnvironmentState(input: {
  readonly workOsConfigured: boolean;
  readonly hasServerConfig: boolean;
  readonly runtimeStates: ReadonlyArray<RuntimeStateLike>;
}): ProviderEnvironmentState {
  if (!input.workOsConfigured) {
    return input.hasServerConfig ? "connected" : "offline";
  }

  if (input.runtimeStates.some((state) => state.connectionState === "connected")) {
    return "connected";
  }
  if (input.runtimeStates.some((state) => state.connectionState === "connecting")) {
    return "connecting";
  }
  return "offline";
}

export function getProviderEnvironmentUnavailableMessage(state: ProviderEnvironmentState): string {
  if (state === "connecting") {
    return "Environment is reconnecting. Provider actions will unlock when it is online.";
  }
  return "No online environment. Provider state shows up here once an environment is connected.";
}
