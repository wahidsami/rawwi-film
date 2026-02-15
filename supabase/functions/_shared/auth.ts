/**
 * Shared auth: require Bearer token and return 401 if missing/invalid.
 */
import { createSupabaseAdmin } from "./supabaseAdmin.ts";
import { jsonResponse } from "./cors.ts";

export async function requireAuth(req: Request): Promise<{ userId: string; supabase: ReturnType<typeof createSupabaseAdmin> } | Response> {
  const supabase = createSupabaseAdmin();
  const authHeader = req.headers.get("Authorization");
  const origin = req.headers.get("origin") ?? undefined;
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Unauthorized" }, 401, { origin });
  }
  const token = authHeader.slice(7).trim();
  if (!token) {
    return jsonResponse({ error: "Unauthorized" }, 401, { origin });
  }
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) {
    return jsonResponse({ error: "Unauthorized" }, 401, { origin });
  }
  return { userId: user.id, supabase };
}
