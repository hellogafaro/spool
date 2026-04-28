/**
 * Browser client for the Trunk Worker's /env endpoints. The Worker is a
 * stateless Vault facade — it stores the per-user saved-env metadata
 * (env URL, label) and the T3 bearer for each one. The data path runs
 * directly from this browser to the user's T3 server.
 */

const TRUNK_API_URL = (import.meta.env.VITE_TRUNK_API_URL as string | undefined)?.trim();

export class SavedEnvApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: string | null = null,
  ) {
    super(message);
    this.name = "SavedEnvApiError";
  }
}

function getEnvUrl(pathname = "/env"): string {
  if (!TRUNK_API_URL) {
    throw new SavedEnvApiError(0, "VITE_TRUNK_API_URL is not configured", null);
  }
  return `${TRUNK_API_URL.replace(/\/$/, "")}${pathname}`;
}

async function readErrorBody(
  response: Response,
): Promise<{ readonly code: string | null; readonly message: string }> {
  const text = await response.text().catch(() => "");
  if (text.startsWith("{")) {
    try {
      const parsed = JSON.parse(text) as { code?: unknown; message?: unknown };
      const code = typeof parsed.code === "string" ? parsed.code : null;
      const message = typeof parsed.message === "string" ? parsed.message : text.trim();
      return { code, message };
    } catch {
      // Fall through to plaintext.
    }
  }
  return { code: null, message: text.trim() };
}

async function authedRequest(
  pathname: string,
  init: RequestInit,
  accessToken: string,
): Promise<Response> {
  const response = await fetch(getEnvUrl(pathname), {
    ...init,
    headers: {
      ...init.headers,
      authorization: `Bearer ${accessToken}`,
    },
  });
  if (!response.ok && response.status !== 204) {
    const { code, message } = await readErrorBody(response);
    throw new SavedEnvApiError(
      response.status,
      message || `Saved-env request failed with status ${response.status}.`,
      code,
    );
  }
  return response;
}

export interface SavedEnvRecord {
  readonly environmentId: string;
  readonly label: string;
  readonly environmentUrl: string;
}

export interface SavedEnvWithBearer extends SavedEnvRecord {
  readonly bearer: string;
}

export interface CreateSavedEnvInput {
  readonly environmentUrl: string;
  readonly environmentId: string;
  readonly label: string;
  readonly bearer: string;
  readonly accessToken: string;
}

export async function upsertSavedEnv(input: CreateSavedEnvInput): Promise<SavedEnvRecord> {
  const response = await authedRequest(
    "/env",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        environmentUrl: input.environmentUrl,
        environmentId: input.environmentId,
        label: input.label,
        bearer: input.bearer,
      }),
    },
    input.accessToken,
  );
  return (await response.json()) as SavedEnvRecord;
}

export async function getSavedEnvs(accessToken: string): Promise<ReadonlyArray<SavedEnvRecord>> {
  const response = await authedRequest("/env", { method: "GET" }, accessToken);
  return (await response.json()) as ReadonlyArray<SavedEnvRecord>;
}

export async function getSavedEnv(
  environmentId: string,
  accessToken: string,
): Promise<SavedEnvWithBearer> {
  const response = await authedRequest(
    `/env/${encodeURIComponent(environmentId)}`,
    { method: "GET" },
    accessToken,
  );
  return (await response.json()) as SavedEnvWithBearer;
}

export interface UpdateSavedEnvInput {
  readonly environmentId: string;
  readonly label: string;
  readonly accessToken: string;
}

export async function updateSavedEnv(input: UpdateSavedEnvInput): Promise<SavedEnvRecord> {
  const response = await authedRequest(
    `/env/${encodeURIComponent(input.environmentId)}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ label: input.label }),
    },
    input.accessToken,
  );
  return (await response.json()) as SavedEnvRecord;
}

export async function deleteSavedEnv(environmentId: string, accessToken: string): Promise<void> {
  await authedRequest(
    `/env/${encodeURIComponent(environmentId)}`,
    { method: "DELETE" },
    accessToken,
  );
}
