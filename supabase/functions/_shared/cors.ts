/**
 * CORS headers and OPTIONS handling for Edge Functions.
 * Use a single origin in local dev (e.g. http://localhost:5173) so the browser
 * and API (e.g. http://localhost:54321) align and preflight succeeds.
 * Production: set APP_PUBLIC_URL or CORS_ALLOWED_ORIGINS.
 */
const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
];

function getAllowedOrigins(): string[] {
  const appUrl = Deno.env.get("APP_PUBLIC_URL");
  const list = [...ALLOWED_ORIGINS];
  if (appUrl) {
    const trimmed = appUrl.replace(/\/$/, "");
    if (trimmed && !list.includes(trimmed)) list.push(trimmed);
  }
  const extra = Deno.env.get("CORS_ALLOWED_ORIGINS");
  if (extra) {
    extra.split(",").forEach((o) => {
      const t = o.trim().replace(/\/$/, "");
      if (t && !list.includes(t)) list.push(t);
    });
  }
  return list;
}

/**
 * Returns CORS headers. If origin is provided and in the allowlist, use it for Allow-Origin;
 * otherwise use * (so preflight and responses work from any allowed origin).
 */
export function corsHeaders(origin?: string | null): Record<string, string> {
  const allowed = getAllowedOrigins();
  const allowOrigin =
    origin && allowed.includes(origin) ? origin : "*";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, apikey, content-type, x-client-info, Accept",
    "Access-Control-Max-Age": "86400",
  };
}

export function jsonResponse(
  body: unknown,
  status = 200,
  init: ResponseInit & { origin?: string | null } = {}
): Response {
  const { origin, ...restInit } = init;
  const headers = {
    "Content-Type": "application/json",
    ...corsHeaders(origin),
    ...(restInit.headers as Record<string, string>),
  };
  return new Response(JSON.stringify(body), {
    status,
    ...restInit,
    headers,
  });
}

/** OPTIONS preflight: return 200 OK with CORS headers (no body). Required by some clients for preflight. */
export function optionsResponse(req?: Request): Response {
  const origin = req?.headers.get("origin") ?? undefined;
  return new Response(null, {
    status: 200,
    headers: corsHeaders(origin),
  });
}
