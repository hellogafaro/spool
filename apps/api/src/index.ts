import {
  makeWorkOsClientAuthVerifier,
  presenceOnlyClientAuthVerifier,
  type ClientAuthVerifier,
} from "./auth.ts";
import { withCors } from "./cors.ts";
import { API_PATHS, API_PROTOCOL_VERSION } from "./protocol.ts";
import { handleSavedEnvRequest } from "./saved-env.ts";

interface Env {
  WORKOS_CLIENT_ID?: string;
  WORKOS_API_KEY?: string;
}

const VERSION_PAYLOAD = {
  product: "trunk-api" as const,
  version: "0.0.0",
  protocolVersion: API_PROTOCOL_VERSION,
};

const textHeaders = { "content-type": "text/plain; charset=utf-8" };
const jsonHeaders = { "content-type": "application/json; charset=utf-8" };

function getClientAuthVerifier(env: Env): ClientAuthVerifier {
  if (env.WORKOS_CLIENT_ID && env.WORKOS_CLIENT_ID.length > 0) {
    return makeWorkOsClientAuthVerifier(env.WORKOS_CLIENT_ID);
  }
  return presenceOnlyClientAuthVerifier;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === API_PATHS.health) {
      return new Response("ok\n", { headers: textHeaders });
    }

    if (url.pathname === API_PATHS.version) {
      return Response.json(VERSION_PAYLOAD, { headers: jsonHeaders });
    }

    if (url.pathname === "/api/observability/v1/traces") {
      const methods = "POST, OPTIONS";
      if (request.method === "OPTIONS" || request.method === "POST") {
        return withCors(request, new Response(null, { status: 204 }), methods);
      }
      return withCors(
        request,
        new Response("method not allowed\n", { status: 405, headers: textHeaders }),
        methods,
      );
    }

    if (url.pathname === API_PATHS.env || url.pathname.startsWith(`${API_PATHS.env}/`)) {
      if (!env.WORKOS_API_KEY || env.WORKOS_API_KEY.length === 0) {
        return Response.json(
          {
            code: "ENV_NOT_CONFIGURED",
            message: "Saved environments aren't configured (missing WORKOS_API_KEY).",
          },
          { status: 503 },
        );
      }
      return handleSavedEnvRequest(request, url, {
        authVerifier: getClientAuthVerifier(env),
        workosApiKey: env.WORKOS_API_KEY,
      });
    }

    return new Response("not found\n", { status: 404, headers: textHeaders });
  },
};
