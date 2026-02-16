/**
 * Shared auth: require Bearer token and return 401 if missing/invalid.
 */
import { createSupabaseAdmin } from "./supabaseAdmin.ts";
import { jsonResponse } from "./cors.ts";

export async function requireAuth(req: Request): Promise<{ userId: string; supabase: ReturnType<typeof createSupabaseAdmin> } | Response> {
  const supabase = createSupabaseAdmin();
  const authHeader = req.headers.get("Authorization");
  const origin = req.headers.get("origin") ?? undefined;
  const hasAuth = !!authHeader;
  const authLen = authHeader?.length ?? 0;

  if (!authHeader?.startsWith("Bearer ")) {
    console.warn("[auth] 401: Authorization header present:", hasAuth, "length:", authLen);
    return jsonResponse({ error: "Unauthorized" }, 401, { origin });
  }
  const token = authHeader.slice(7).trim();
  if (!token) {
    console.warn("[auth] 401: Bearer present but token empty, header length:", authLen);
    return jsonResponse({ error: "Unauthorized" }, 401, { origin });
  }
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) {
    console.warn("[auth] 401: getUser failed:", error?.message ?? "no user", "header length:", authLen);
    return jsonResponse({ error: "Unauthorized" }, 401, { origin });
  }
  return { userId: user.id, supabase };
}
