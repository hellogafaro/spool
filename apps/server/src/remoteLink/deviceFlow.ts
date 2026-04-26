/**
 * WorkOS Device Authorization Flow (RFC 8628).
 *
 * The CLI uses this to claim its environmentId against the signed-in
 * user's WorkOS metadata without ever asking the user to copy/paste a
 * server id into a web form. The user just opens the printed URL in
 * any browser — the CLI polls for the resulting access token and then
 * POSTs `{ environmentId }` to /pairing.
 */

import { Data, Duration, Effect } from "effect";

const WORKOS_BASE = "https://api.workos.com";

export interface DeviceFlowConfig {
  readonly clientId: string;
  readonly trunkApiUrl: string;
}

export interface DeviceCode {
  readonly device_code: string;
  readonly user_code: string;
  readonly verification_uri: string;
  readonly verification_uri_complete?: string;
  readonly expires_in: number;
  readonly interval: number;
}

interface TokenResponse {
  readonly access_token?: string;
  readonly error?: string;
  readonly error_description?: string;
}

export class DeviceFlowError extends Data.TaggedError("DeviceFlowError")<{
  readonly message: string;
}> {}

const requestDeviceCode = (clientId: string): Effect.Effect<DeviceCode, DeviceFlowError> =>
  Effect.tryPromise({
    try: async () => {
      const response = await fetch(`${WORKOS_BASE}/user_management/authorize/device`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ client_id: clientId }),
      });
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(
          `WorkOS device authorize failed (${response.status}): ${text || "no body"}`,
        );
      }
      return (await response.json()) as DeviceCode;
    },
    catch: (cause) =>
      new DeviceFlowError({
        message: cause instanceof Error ? cause.message : "device authorize request failed",
      }),
  });

type PollOutcome =
  | { readonly _tag: "ok"; readonly accessToken: string }
  | { readonly _tag: "pending" }
  | { readonly _tag: "slow_down" }
  | { readonly _tag: "error"; readonly message: string };

const pollOnce = (clientId: string, deviceCode: string): Effect.Effect<PollOutcome> =>
  Effect.promise(async (): Promise<PollOutcome> => {
    try {
      const params = new URLSearchParams({
        client_id: clientId,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        device_code: deviceCode,
      });
      const response = await fetch(`${WORKOS_BASE}/user_management/authenticate`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });
      const body = (await response.json().catch(() => ({}))) as TokenResponse;
      if (response.ok && body.access_token) {
        return { _tag: "ok", accessToken: body.access_token };
      }
      if (body.error === "authorization_pending") return { _tag: "pending" };
      if (body.error === "slow_down") return { _tag: "slow_down" };
      return {
        _tag: "error",
        message: `WorkOS device token failed (${response.status}): ${body.error_description ?? body.error ?? "unknown error"}`,
      };
    } catch (cause) {
      return {
        _tag: "error",
        message: cause instanceof Error ? cause.message : "device token request failed",
      };
    }
  });

const pollForToken = (
  clientId: string,
  device: DeviceCode,
): Effect.Effect<string, DeviceFlowError> =>
  Effect.gen(function* () {
    const baseInterval = Math.max(1000, device.interval * 1000);
    let currentInterval = baseInterval;
    const deadline = Date.now() + device.expires_in * 1000;
    while (Date.now() < deadline) {
      const outcome = (yield* pollOnce(clientId, device.device_code)) as PollOutcome;
      if (outcome._tag === "ok") return outcome.accessToken;
      if (outcome._tag === "error") {
        return yield* Effect.fail(new DeviceFlowError({ message: outcome.message }));
      }
      if (outcome._tag === "slow_down") {
        currentInterval = Math.min(currentInterval + 5000, 30000);
      }
      yield* Effect.sleep(Duration.millis(currentInterval));
    }
    return yield* Effect.fail(new DeviceFlowError({ message: "Device authorization timed out" }));
  });

const claim = (
  trunkApiUrl: string,
  accessToken: string,
  environmentId: string,
): Effect.Effect<void, DeviceFlowError> =>
  Effect.tryPromise({
    try: async () => {
      const base = trunkApiUrl.replace(/^ws/, "http").replace(/\/$/, "");
      const response = await fetch(`${base}/pairing`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ environmentId }),
      });
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(
          `Pairing claim failed (${response.status}): ${text.trim() || "no body"}`,
        );
      }
    },
    catch: (cause) =>
      new DeviceFlowError({
        message: cause instanceof Error ? cause.message : "pairing claim failed",
      }),
  });

export const startDeviceFlow = (
  config: DeviceFlowConfig,
): Effect.Effect<DeviceCode, DeviceFlowError> => requestDeviceCode(config.clientId);

export const completeDeviceFlow = (
  config: DeviceFlowConfig,
  device: DeviceCode,
  environmentId: string,
): Effect.Effect<string, DeviceFlowError> =>
  Effect.gen(function* () {
    const accessToken = yield* pollForToken(config.clientId, device);
    yield* claim(config.trunkApiUrl, accessToken, environmentId);
    return accessToken;
  });
