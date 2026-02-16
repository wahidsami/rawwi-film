/**
 * Edge Function: me
 * GET /me → current user profile + permissions from RBAC tables.
 * Used by frontend auth store to get permissions after login/refresh.
 */
import { optionsResponse, jsonResponse } from "../_shared/cors.ts";
import { requireAuth } from "../_shared/auth.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? undefined;
  const json = (body: unknown, status = 200) => jsonResponse(body, status, { origin });
  if (req.method === "OPTIONS") return optionsResponse(req);
  if (req.method !== "GET") {
    return json({ error: "Method not allowed" }, 405);
  }

  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const { userId, supabase } = auth;

  const { data: { user: sbUser }, error: userErr } = await supabase.auth.admin.getUserById(userId);
  if (userErr || !sbUser) {
    return json({ error: "User not found" }, 404);
  }

  const { data: rolePermRows } = await supabase
    .from("user_roles")
    .select("role_id")
    .eq("user_id", userId);
  const roleIds = (rolePermRows ?? []).map((r: { role_id: string }) => r.role_id);
  let permissionKeys: string[] = [];
  let roleFromDb: string | null = null;
  if (roleIds.length > 0) {
    const { data: roleRows } = await supabase
      .from("roles")
      .select("key, name")
      .in("id", roleIds);
    if (roleRows?.length) {
      const r = roleRows[0] as { key: string; name: string };
      roleFromDb = r.name;
    }
    const { data: permRows } = await supabase
      .from("role_permissions")
      .select("permission_id")
      .in("role_id", roleIds);
    const permIds = [...new Set((permRows ?? []).map((p: { permission_id: string }) => p.permission_id))];
    if (permIds.length > 0) {
      const { data: keys } = await supabase
        .from("permissions")
        .select("key")
        .in("id", permIds);
      permissionKeys = (keys ?? []).map((p: { key: string }) => p.key);
    }
  }

  const meta = sbUser.user_metadata ?? {};
  const name = (meta.name as string) || sbUser.email?.split("@")[0] || "User";
  const role = roleFromDb ?? (meta.role as string) || (roleIds.length ? "Admin" : "Admin");
  const normalizedRole = role === "Super Admin" || role === "super_admin" ? "Super Admin"
    : role === "Regulator" || role === "regulator" ? "Regulator"
      : role === "admin" || role === "Admin" ? "Admin" : "Admin";

  return json({
    user: {
      id: sbUser.id,
      email: sbUser.email ?? "",
      name,
      role: normalizedRole,
      permissions: permissionKeys,
      allowedSections: meta.allowedSections as string[] | undefined,
    },
  });
});
