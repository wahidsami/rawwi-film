/**
 * Permission checks for audit (view_audit) and glossary (manage_glossary).
 */
import type { createSupabaseAdmin } from "./supabaseAdmin.ts";

export async function userHasPermission(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  userId: string,
  permissionKey: string
): Promise<boolean> {
  const { data: roleRows } = await supabase.from("user_roles").select("role_id").eq("user_id", userId);
  const roleIds = (roleRows ?? []).map((r: { role_id: string }) => r.role_id);
  if (roleIds.length === 0) return false;
  const { data: permRows } = await supabase.from("role_permissions").select("permission_id").in("role_id", roleIds);
  const permIds = [...new Set((permRows ?? []).map((p: { permission_id: string }) => p.permission_id))];
  if (permIds.length === 0) return false;
  const { data: keys } = await supabase.from("permissions").select("key").in("id", permIds);
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
