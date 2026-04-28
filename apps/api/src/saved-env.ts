/**
 * /env REST endpoints. Each handler verifies the WorkOS JWT, derives the userId,
 * and reads/writes WorkOS Vault (bearer) and user metadata (env list).
 */

import type { ClientAuthVerifier } from "./auth.ts";
import { withCors } from "./cors.ts";
import {
  deleteSavedEnv,
  deleteVaultByName,
  getSavedEnvs,
  getVaultByName,
  getVaultName,
  upsertSavedEnv,
  upsertVault,
  type SavedEnvEntry,
} from "./workos.ts";

export const ENV_ERROR_CODES = {
  ENV_AUTH_FAILED: "ENV_AUTH_FAILED",
  ENV_INVALID_BODY: "ENV_INVALID_BODY",
  ENV_NOT_FOUND: "ENV_NOT_FOUND",
  ENV_FORBIDDEN: "ENV_FORBIDDEN",
  ENV_METHOD_NOT_ALLOWED: "ENV_METHOD_NOT_ALLOWED",
  ENV_NOT_CONFIGURED: "ENV_NOT_CONFIGURED",
  ENV_VAULT_UNAVAILABLE: "ENV_VAULT_UNAVAILABLE",
  ENV_METADATA_UNAVAILABLE: "ENV_METADATA_UNAVAILABLE",
} as const;

export type EnvErrorCode = (typeof ENV_ERROR_CODES)[keyof typeof ENV_ERROR_CODES];

export interface EnvErrorBody {
  readonly code: EnvErrorCode;
  readonly message: string;
}

const ENV_ALLOWED_METHODS = "GET, POST, PATCH, DELETE, OPTIONS";
const ENVIRONMENT_ID_MAX_LENGTH = 64;
const LABEL_MAX_LENGTH = 80;
const BEARER_MAX_LENGTH = 4096;
const URL_MAX_LENGTH = 2048;

export interface SavedEnvHandlerOptions {
  readonly authVerifier: ClientAuthVerifier;
  readonly workosApiKey: string;
}

export interface CreateEnvBody {
  readonly environmentUrl: string;
  readonly environmentId: string;
  readonly label: string;
  readonly bearer: string;
}

export interface UpdateEnvBody {
  readonly label?: string;
}

export interface PublicEnvRecord {
  readonly environmentId: string;
  readonly label: string;
  readonly environmentUrl: string;
}

export interface FullEnvRecord extends PublicEnvRecord {
  readonly bearer: string;
}

function errorResponse(
  request: Request,
  status: number,
  code: EnvErrorCode,
  message: string,
): Response {
  const body: EnvErrorBody = { code, message };
  return withCors(
    request,
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json; charset=utf-8" },
    }),
    ENV_ALLOWED_METHODS,
  );
}

function isValidEnvironmentUrl(value: string): boolean {
  if (value.length === 0 || value.length > URL_MAX_LENGTH) return false;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  if (parsed.protocol === "https:") return true;
  if (parsed.protocol === "http:") {
    return parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  }
  return false;
}

function parseCreateBody(raw: unknown): CreateEnvBody | null {
  if (!raw || typeof raw !== "object") return null;
  const body = raw as Record<string, unknown>;
  if (typeof body.environmentUrl !== "string" || !isValidEnvironmentUrl(body.environmentUrl)) {
    return null;
  }
  if (typeof body.environmentId !== "string") return null;
  const environmentId = body.environmentId.trim();
  if (environmentId.length === 0 || environmentId.length > ENVIRONMENT_ID_MAX_LENGTH) return null;
  if (typeof body.label !== "string") return null;
  const label = body.label.trim();
  if (label.length === 0 || label.length > LABEL_MAX_LENGTH) return null;
  if (typeof body.bearer !== "string") return null;
  const bearer = body.bearer.trim();
  if (bearer.length === 0 || bearer.length > BEARER_MAX_LENGTH) return null;
  return { environmentUrl: body.environmentUrl, environmentId, label, bearer };
}

function parseUpdateBody(raw: unknown): UpdateEnvBody | null {
  if (!raw || typeof raw !== "object") return null;
  const body = raw as Record<string, unknown>;
  if (body.label === undefined) return {};
  if (typeof body.label !== "string") return null;
  const label = body.label.trim();
  if (label.length === 0 || label.length > LABEL_MAX_LENGTH) return null;
  return { label };
}

function readEnvironmentIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/env\/([^/]+)\/?$/);
  if (!match) return null;
  const id = decodeURIComponent(match[1] ?? "").trim();
  if (id.length === 0 || id.length > ENVIRONMENT_ID_MAX_LENGTH) return null;
  return id;
}

function isValidEnvironmentIdShape(id: string): boolean {
  if (id.length === 0 || id.length > ENVIRONMENT_ID_MAX_LENGTH) return false;
  return /^[A-Za-z0-9._-]+$/.test(id);
}

function toPublicRecord(entry: SavedEnvEntry): PublicEnvRecord {
  return {
    environmentId: entry.environmentId,
    label: entry.label,
    environmentUrl: entry.environmentUrl,
  };
}

export async function handleSavedEnvRequest(
  request: Request,
  url: URL,
  options: SavedEnvHandlerOptions,
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return withCors(request, new Response(null, { status: 204 }), ENV_ALLOWED_METHODS);
  }

  const auth = await options.authVerifier(request, url);
  if (!auth.ok) {
    return errorResponse(request, auth.status, ENV_ERROR_CODES.ENV_AUTH_FAILED, auth.reason);
  }
  const userId = auth.auth.userId;

  const collectionPath = url.pathname === "/env" || url.pathname === "/env/";
  if (collectionPath) {
    if (request.method === "POST") return handleCreate(request, userId, options);
    if (request.method === "GET") return handleList(request, userId, options);
    return errorResponse(
      request,
      405,
      ENV_ERROR_CODES.ENV_METHOD_NOT_ALLOWED,
      `Method ${request.method} is not allowed on /env.`,
    );
  }

  const environmentId = readEnvironmentIdFromPath(url.pathname);
  if (!environmentId || !isValidEnvironmentIdShape(environmentId)) {
    return errorResponse(
      request,
      400,
      ENV_ERROR_CODES.ENV_INVALID_BODY,
      "Path must be /env or /env/<environmentId>.",
    );
  }

  if (request.method === "GET") return handleRead(request, environmentId, userId, options);
  if (request.method === "PATCH") return handleUpdate(request, environmentId, userId, options);
  if (request.method === "DELETE") return handleDelete(request, environmentId, userId, options);

  return errorResponse(
    request,
    405,
    ENV_ERROR_CODES.ENV_METHOD_NOT_ALLOWED,
    `Method ${request.method} is not allowed on /env/<environmentId>.`,
  );
}

async function handleCreate(
  request: Request,
  userId: string,
  options: SavedEnvHandlerOptions,
): Promise<Response> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return errorResponse(
      request,
      400,
      ENV_ERROR_CODES.ENV_INVALID_BODY,
      "Request body is not valid JSON.",
    );
  }
  const body = parseCreateBody(raw);
  if (!body) {
    return errorResponse(
      request,
      400,
      ENV_ERROR_CODES.ENV_INVALID_BODY,
      "Body must be { environmentUrl: https-or-localhost, environmentId, label, bearer }.",
    );
  }
  if (!isValidEnvironmentIdShape(body.environmentId)) {
    return errorResponse(
      request,
      400,
      ENV_ERROR_CODES.ENV_INVALID_BODY,
      "environmentId may contain only A-Z, a-z, 0-9, '.', '_', '-'.",
    );
  }

  try {
    await upsertVault(options.workosApiKey, getVaultName(userId, body.environmentId), body.bearer, {
      owner: userId,
    });
  } catch (error) {
    return errorResponse(
      request,
      502,
      ENV_ERROR_CODES.ENV_VAULT_UNAVAILABLE,
      error instanceof Error ? error.message : "Vault write failed.",
    );
  }

  try {
    await upsertSavedEnv(options.workosApiKey, userId, {
      environmentId: body.environmentId,
      environmentUrl: body.environmentUrl,
      label: body.label,
    });
  } catch (error) {
    return errorResponse(
      request,
      502,
      ENV_ERROR_CODES.ENV_METADATA_UNAVAILABLE,
      error instanceof Error ? error.message : "User metadata write failed.",
    );
  }

  const publicRecord: PublicEnvRecord = {
    environmentId: body.environmentId,
    label: body.label,
    environmentUrl: body.environmentUrl,
  };
  return withCors(request, Response.json(publicRecord, { status: 201 }), ENV_ALLOWED_METHODS);
}

async function handleList(
  request: Request,
  userId: string,
  options: SavedEnvHandlerOptions,
): Promise<Response> {
  let entries: ReadonlyArray<SavedEnvEntry>;
  try {
    entries = await getSavedEnvs(options.workosApiKey, userId);
  } catch (error) {
    return errorResponse(
      request,
      502,
      ENV_ERROR_CODES.ENV_METADATA_UNAVAILABLE,
      error instanceof Error ? error.message : "User metadata read failed.",
    );
  }
  return withCors(
    request,
    Response.json(entries.map((entry) => toPublicRecord(entry))),
    ENV_ALLOWED_METHODS,
  );
}

async function handleRead(
  request: Request,
  environmentId: string,
  userId: string,
  options: SavedEnvHandlerOptions,
): Promise<Response> {
  let entries: ReadonlyArray<SavedEnvEntry>;
  try {
    entries = await getSavedEnvs(options.workosApiKey, userId);
  } catch (error) {
    return errorResponse(
      request,
      502,
      ENV_ERROR_CODES.ENV_METADATA_UNAVAILABLE,
      error instanceof Error ? error.message : "User metadata read failed.",
    );
  }
  const entry = entries.find((candidate) => candidate.environmentId === environmentId);
  if (!entry) {
    return errorResponse(
      request,
      404,
      ENV_ERROR_CODES.ENV_NOT_FOUND,
      "No saved environment with that id.",
    );
  }

  let bearerEntry;
  try {
    bearerEntry = await getVaultByName(options.workosApiKey, getVaultName(userId, environmentId));
  } catch (error) {
    return errorResponse(
      request,
      502,
      ENV_ERROR_CODES.ENV_VAULT_UNAVAILABLE,
      error instanceof Error ? error.message : "Vault read failed.",
    );
  }
  if (!bearerEntry) {
    return errorResponse(
      request,
      404,
      ENV_ERROR_CODES.ENV_NOT_FOUND,
      "No bearer is stored for that environment. Re-pair from this device.",
    );
  }
  if (bearerEntry.keyContext.owner !== userId) {
    return errorResponse(
      request,
      403,
      ENV_ERROR_CODES.ENV_FORBIDDEN,
      "You don't own this saved environment.",
    );
  }
  const record: FullEnvRecord = {
    ...toPublicRecord(entry),
    bearer: bearerEntry.value,
  };
  return withCors(request, Response.json(record), ENV_ALLOWED_METHODS);
}

async function handleUpdate(
  request: Request,
  environmentId: string,
  userId: string,
  options: SavedEnvHandlerOptions,
): Promise<Response> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return errorResponse(
      request,
      400,
      ENV_ERROR_CODES.ENV_INVALID_BODY,
      "Request body is not valid JSON.",
    );
  }
  const body = parseUpdateBody(raw);
  if (!body) {
    return errorResponse(
      request,
      400,
      ENV_ERROR_CODES.ENV_INVALID_BODY,
      "Body must be { label?: string }.",
    );
  }

  let entries: ReadonlyArray<SavedEnvEntry>;
  try {
    entries = await getSavedEnvs(options.workosApiKey, userId);
  } catch (error) {
    return errorResponse(
      request,
      502,
      ENV_ERROR_CODES.ENV_METADATA_UNAVAILABLE,
      error instanceof Error ? error.message : "User metadata read failed.",
    );
  }
  const existing = entries.find((entry) => entry.environmentId === environmentId);
  if (!existing) {
    return errorResponse(
      request,
      404,
      ENV_ERROR_CODES.ENV_NOT_FOUND,
      "No saved environment with that id.",
    );
  }

  if (body.label === undefined) {
    return withCors(request, Response.json(toPublicRecord(existing)), ENV_ALLOWED_METHODS);
  }

  const updated: SavedEnvEntry = { ...existing, label: body.label };
  try {
    await upsertSavedEnv(options.workosApiKey, userId, updated);
  } catch (error) {
    return errorResponse(
      request,
      502,
      ENV_ERROR_CODES.ENV_METADATA_UNAVAILABLE,
      error instanceof Error ? error.message : "User metadata write failed.",
    );
  }
  return withCors(request, Response.json(toPublicRecord(updated)), ENV_ALLOWED_METHODS);
}

async function handleDelete(
  request: Request,
  environmentId: string,
  userId: string,
  options: SavedEnvHandlerOptions,
): Promise<Response> {
  try {
    await deleteVaultByName(options.workosApiKey, getVaultName(userId, environmentId));
  } catch (error) {
    return errorResponse(
      request,
      502,
      ENV_ERROR_CODES.ENV_VAULT_UNAVAILABLE,
      error instanceof Error ? error.message : "Vault delete failed.",
    );
  }
  try {
    await deleteSavedEnv(options.workosApiKey, userId, environmentId);
  } catch (error) {
    return errorResponse(
      request,
      502,
      ENV_ERROR_CODES.ENV_METADATA_UNAVAILABLE,
      error instanceof Error ? error.message : "User metadata write failed.",
    );
  }
  return withCors(request, new Response(null, { status: 204 }), ENV_ALLOWED_METHODS);
}
