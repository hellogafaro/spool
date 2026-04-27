/**
 * Origins allowed to call the API from a browser. Production points at
 * app.trunk.codes. The Cloudflare Pages preview pattern is whitelisted so
 * branch deploys keep working. Self-hosted forks fork the worker too and
 * extend this list.
 */
const ALLOWED_ORIGINS = new Set<string>(["https://app.trunk.codes"]);
const PREVIEW_ORIGIN_PATTERN = /^https:\/\/[a-z0-9-]+\.trunk-app\.pages\.dev$/;

function isAllowedOrigin(origin: string | null): origin is string {
  if (!origin) return false;
  return ALLOWED_ORIGINS.has(origin) || PREVIEW_ORIGIN_PATTERN.test(origin);
}

export function getCorsHeaders(request: Request, methods: string): Record<string, string> {
  const origin = request.headers.get("origin");
  return {
    "access-control-allow-origin": isAllowedOrigin(origin) ? origin : "https://app.trunk.codes",
    "access-control-allow-methods": methods,
    "access-control-allow-headers": "authorization, content-type",
    "access-control-max-age": "86400",
    vary: "Origin",
  };
}

export function withCors(request: Request, response: Response, methods: string): Response {
  for (const [key, value] of Object.entries(getCorsHeaders(request, methods))) {
    response.headers.set(key, value);
  }
  return response;
}
