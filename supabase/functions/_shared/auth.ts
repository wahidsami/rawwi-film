/**
 * Shared auth: require Bearer token and return 401 if missing/invalid.
 */
import { createSupabaseAdmin } from "./supabaseAdmin.ts";
import { jsonResponse } from "./cors.ts";
import { traceEdgeStep } from "./trace.ts";

type RequireAuthUser = Readonly<{
  id: string;
  email: string | null;
  user_metadata: Record<string, unknown>;
  app_metadata: Record<string, unknown>;
}>;

export async function requireAuth(req: Request): Promise<{ userId: string; user: RequireAuthUser; supabase: ReturnType<typeof createSupabaseAdmin> } | Response> {
  console.log("[auth] ENTER requireAuth", {
    method: req.method,
    path: new URL(req.url).pathname,
  });
  const supabase = createSupabaseAdmin();
  const authHeader = req.headers.get("Authorization");
  const origin = req.headers.get("origin") ?? undefined;
  const hasAuth = !!authHeader;
  const authLen = authHeader?.length ?? 0;
  console.log("[auth] request auth snapshot", {
    path: new URL(req.url).pathname,
    hasAuth,
    authLen,
    bearerPrefix: authHeader?.startsWith("Bearer ") ?? false,
  });

  if (!authHeader?.startsWith("Bearer ")) {
    console.warn("[auth] 401: missing_bearer", {
      path: new URL(req.url).pathname,
      hasAuth,
      authLen,
    });
    return jsonResponse({ error: "Unauthorized" }, 401, { origin });
  }
  const token = authHeader.slice(7).trim();
  if (!token) {
    console.warn("[auth] 401: empty_bearer_token", {
      path: new URL(req.url).pathname,
      hasAuth,
      authLen,
    });
    return jsonResponse({ error: "Unauthorized" }, 401, { origin });
  }
  const { data: { user }, error } = await traceEdgeStep(
    "auth",
    "supabase.auth.getUser",
    { authLen, path: new URL(req.url).pathname },
    () => supabase.auth.getUser(token),
  );
  if (error || !user) {
    console.warn("[auth] 401: getUser_failed", {
      path: new URL(req.url).pathname,
      hasAuth,
      authLen,
      errorMessage: error?.message ?? null,
      errorStatus: (error as { status?: number } | null | undefined)?.status ?? null,
      errorCode: (error as { code?: string | null } | null | undefined)?.code ?? null,
      userId: user?.id ?? null,
      email: user?.email ?? null,
    });
    return jsonResponse({ error: "Unauthorized" }, 401, { origin });
  }
  console.log("[auth] EXIT requireAuth", {
    userId: user.id,
    path: new URL(req.url).pathname,
  });
  return {
    userId: user.id,
    user: Object.freeze({
      id: user.id,
      email: user.email ?? null,
      user_metadata: Object.freeze({ ...(user.user_metadata ?? {}) }),
      app_metadata: Object.freeze({ ...(user.app_metadata ?? {}) }),
    }),
    supabase,
  };
}
