/**
 * Permission checks for audit (view_audit) and glossary (manage_glossary).
 */
import type { createSupabaseAdmin } from "./supabaseAdmin.ts";
import { traceEdgeStep } from "./trace.ts";

export async function userHasPermission(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  userId: string,
  permissionKey: string
): Promise<boolean> {
  const { data: roleRows } = await traceEdgeStep(
    "auditPermissions",
    "user_roles.lookup",
    { userId, permissionKey },
    () => supabase.from("user_roles").select("role_id").eq("user_id", userId),
  );
  const roleIds = (roleRows ?? []).map((r: { role_id: string }) => r.role_id);
  if (roleIds.length === 0) return false;
  const { data: permRows } = await traceEdgeStep(
    "auditPermissions",
    "role_permissions.lookup",
    { userId, permissionKey, roleIdsCount: roleIds.length },
    () => supabase.from("role_permissions").select("permission_id").in("role_id", roleIds),
  );
  const permIds = [...new Set((permRows ?? []).map((p: { permission_id: string }) => p.permission_id))];
  if (permIds.length === 0) return false;
  const { data: keys } = await traceEdgeStep(
    "auditPermissions",
    "permissions.lookup",
    { userId, permissionKey, permIdsCount: permIds.length },
    () => supabase.from("permissions").select("key").in("id", permIds),
  );
  return (keys ?? []).some((p: { key: string }) => p.key === permissionKey);
}

export async function userHasViewAudit(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  userId: string
): Promise<boolean> {
  return userHasPermission(supabase, userId, "view_audit");
}

export async function userHasManageGlossary(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  userId: string
): Promise<boolean> {
  return userHasPermission(supabase, userId, "manage_glossary");
}

export async function userHasManageCompanies(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  userId: string
): Promise<boolean> {
  return userHasPermission(supabase, userId, "manage_companies");
}
