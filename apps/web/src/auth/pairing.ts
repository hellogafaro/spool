/**
 * Compatibility shims for the legacy /pair API. The data path now runs
 * directly between this browser and the user's T3 server; saved-env
 * metadata lives on the Trunk Worker via savedEnvApi.ts.
 */

import { deleteSavedEnv } from "./savedEnvApi";

export { SavedEnvApiError as ApiError } from "./savedEnvApi";

export interface UnclaimEnvironmentOptions {
  readonly environmentId: string;
  readonly accessToken: string;
}

export async function unclaimEnvironment(input: UnclaimEnvironmentOptions): Promise<void> {
  await deleteSavedEnv(input.environmentId, input.accessToken);
}
