import {
  attachEnvironmentDescriptor,
  createKnownEnvironment,
  type KnownEnvironment,
} from "@t3tools/client-runtime";
import { EnvironmentId, type ExecutionEnvironmentDescriptor } from "@t3tools/contracts";
import { create } from "zustand";

import { isWorkOsConfigured } from "../../auth/workos";
import { BootstrapHttpError, retryTransientBootstrap } from "./auth";

import { readPrimaryEnvironmentTarget, resolvePrimaryEnvironmentHttpUrl } from "./target";

const PENDING_DESCRIPTOR: ExecutionEnvironmentDescriptor = {
  environmentId: EnvironmentId.make("trunk-pending"),
  label: "Trunk",
  platform: { os: "unknown", arch: "other" },
  serverVersion: "pending",
  capabilities: { repositoryIdentity: false },
};

const SERVER_ENVIRONMENT_DESCRIPTOR_PATH = "/.well-known/t3/environment";

interface PrimaryEnvironmentBootstrapState {
  readonly descriptor: ExecutionEnvironmentDescriptor | null;
  readonly setDescriptor: (descriptor: ExecutionEnvironmentDescriptor | null) => void;
  readonly reset: () => void;
}

const usePrimaryEnvironmentBootstrapStore = create<PrimaryEnvironmentBootstrapState>()((set) => ({
  descriptor: null,
  setDescriptor: (descriptor) => set({ descriptor }),
  reset: () => set({ descriptor: null }),
}));

let primaryEnvironmentDescriptorPromise: Promise<ExecutionEnvironmentDescriptor> | null = null;

function createPrimaryKnownEnvironment(input: {
  readonly source: KnownEnvironment["source"];
  readonly target: KnownEnvironment["target"];
}): KnownEnvironment | null {
  const descriptor = readPrimaryEnvironmentDescriptor();
  if (!descriptor) {
    return null;
  }

  return attachEnvironmentDescriptor(
    createKnownEnvironment({
      id: descriptor.environmentId,
      label: descriptor.label,
      source: input.source,
      target: input.target,
    }),
    descriptor,
  );
}

async function fetchPrimaryEnvironmentDescriptor(): Promise<ExecutionEnvironmentDescriptor> {
  if (isWorkOsConfigured) {
    writePrimaryEnvironmentDescriptor(PENDING_DESCRIPTOR);
    return PENDING_DESCRIPTOR;
  }
  return retryTransientBootstrap(async () => {
    const response = await fetch(
      resolvePrimaryEnvironmentHttpUrl(SERVER_ENVIRONMENT_DESCRIPTOR_PATH),
    );
    if (!response.ok) {
      throw new BootstrapHttpError({
        message: `Failed to load server environment descriptor (${response.status}).`,
        status: response.status,
      });
    }

    const descriptor = (await response.json()) as ExecutionEnvironmentDescriptor;
    writePrimaryEnvironmentDescriptor(descriptor);
    return descriptor;
  });
}

export function readPrimaryEnvironmentDescriptor(): ExecutionEnvironmentDescriptor | null {
  return usePrimaryEnvironmentBootstrapStore.getState().descriptor;
}

export function usePrimaryEnvironmentId(): EnvironmentId | null {
  return usePrimaryEnvironmentBootstrapStore((state) => state.descriptor?.environmentId ?? null);
}

export function writePrimaryEnvironmentDescriptor(
  descriptor: ExecutionEnvironmentDescriptor | null,
): void {
  usePrimaryEnvironmentBootstrapStore.getState().setDescriptor(descriptor);
}

export function getPrimaryKnownEnvironment(): KnownEnvironment | null {
  const primaryTarget = readPrimaryEnvironmentTarget();
  if (!primaryTarget) {
    return null;
  }

  return createPrimaryKnownEnvironment({
    source: primaryTarget.source,
    target: primaryTarget.target,
  });
}

export function resolveInitialPrimaryEnvironmentDescriptor(): Promise<ExecutionEnvironmentDescriptor> {
  const descriptor = readPrimaryEnvironmentDescriptor();
  if (descriptor) {
    return Promise.resolve(descriptor);
  }

  if (primaryEnvironmentDescriptorPromise) {
    return primaryEnvironmentDescriptorPromise;
  }

  const nextPromise = fetchPrimaryEnvironmentDescriptor();
  primaryEnvironmentDescriptorPromise = nextPromise;
  return nextPromise.finally(() => {
    if (primaryEnvironmentDescriptorPromise === nextPromise) {
      primaryEnvironmentDescriptorPromise = null;
    }
  });
}

export function __resetPrimaryEnvironmentBootstrapForTests(): void {
  primaryEnvironmentDescriptorPromise = null;
  usePrimaryEnvironmentBootstrapStore.getState().reset();
}

export const resetPrimaryEnvironmentDescriptorForTests = __resetPrimaryEnvironmentBootstrapForTests;

export const __resetPrimaryEnvironmentDescriptorBootstrapForTests =
  __resetPrimaryEnvironmentBootstrapForTests;
