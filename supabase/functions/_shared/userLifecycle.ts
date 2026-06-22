import { createSupabaseAdmin } from "./supabaseAdmin.ts";

export const ALL_SECTIONS = ["clients", "tasks", "glossary", "reports", "access_control", "audit"];

export function normalizeRoleKey(roleKey: string): string {
  return roleKey.toLowerCase().replace(/\s+/g, "_");
}

export function getDefaultSectionsForRoleKey(roleKey: string): string[] {
  const k = normalizeRoleKey(roleKey);
  if (k === "super_admin") return [...ALL_SECTIONS];
  if (k === "admin") return [...ALL_SECTIONS];
  if (k === "regulator") return ["clients", "reports", "glossary"];
  if (k === "client") return ["client_portal"];
  return ["clients", "reports"];
}

export function getDefaultPermissionsForRoleKey(roleKey: string): string[] {
  const k = normalizeRoleKey(roleKey);
  if (k === "super_admin") {
    return [
      "view_clients", "manage_companies",
      "view_scripts", "upload_scripts",
      "view_tasks", "assign_tasks",
      "run_analysis", "view_findings", "override_findings", "add_manual_findings",
      "view_reports", "generate_reports",
      "manage_glossary", "manage_users", "view_audit",
      "approve_scripts", "reject_scripts", "manage_script_status",
      "can_use_quick_analysis",
    ];
  }
  if (k === "admin") {
    return [
      "view_clients", "manage_companies",
      "view_scripts", "upload_scripts",
      "view_tasks", "assign_tasks",
      "run_analysis", "view_findings", "override_findings",
      "view_reports", "generate_reports",
      "manage_glossary", "view_audit",
      "approve_scripts", "reject_scripts", "manage_script_status",
      "can_use_quick_analysis",
    ];
  }
  if (k === "regulator") {
    return [
      "view_clients",
      "view_scripts",
      "view_findings",
      "view_reports",
      "view_tasks",
      "manage_glossary",
    ];
  }
  return [];
}

export function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(
    values
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .map((value) => value.trim())
  )];
}

export function buildPermissionsForRole(
  roleKey: string,
  canAcceptReject: boolean,
  canSendForReview = false,
  canUseQuickAnalysis = false,
): string[] {
  const permissions = getDefaultPermissionsForRoleKey(roleKey);
  if (normalizeRoleKey(roleKey) === "regulator" && canAcceptReject) {
    permissions.push("can_accept_reject");
  }
  if (normalizeRoleKey(roleKey) === "regulator" && canSendForReview) {
    permissions.push("can_send_for_review");
  }
  if (canUseQuickAnalysis) {
    permissions.push("can_use_quick_analysis");
  } else if (normalizeRoleKey(roleKey) === "admin" || normalizeRoleKey(roleKey) === "super_admin") {
    const idx = permissions.indexOf("can_use_quick_analysis");
    if (idx >= 0) permissions.splice(idx, 1);
  }
  return uniqueStrings(permissions);
}

export function buildPermissionMetadata(
  roleKey: string,
  canAcceptReject: boolean,
  canSendForReview = false,
  canUseQuickAnalysis = false,
): Record<string, unknown> {
  return {
    canAcceptReject: normalizeRoleKey(roleKey) === "regulator" ? canAcceptReject : false,
    canSendForReview: normalizeRoleKey(roleKey) === "regulator" ? canSendForReview : false,
    canUseQuickAnalysis,
  };
}

export function getRoleDisplayName(roleKey: string): string {
  const k = normalizeRoleKey(roleKey);
  if (k === "super_admin") return "Super Admin";
  if (k === "regulator") return "Regulator";
  if (k === "client") return "Client";
  return "Admin";
}

async function clearColumnRef(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  table: string,
  column: string,
  userId: string
): Promise<void> {
  try {
    const { error } = await supabase.from(table).update({ [column]: null }).eq(column, userId);
    if (error) {
      console.warn(`[userLifecycle] Failed clearing ${table}.${column} for ${userId}:`, error.message);
    }
  } catch (err) {
    console.warn(`[userLifecycle] Exception clearing ${table}.${column} for ${userId}:`, err);
  }
}

export async function clearUserReferencesBeforeDelete(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  userId: string
): Promise<void> {
  const cleanupSteps: Array<Promise<void>> = [
    clearColumnRef(supabase, "tasks", "assigned_to", userId),
    clearColumnRef(supabase, "tasks", "assigned_by", userId),
    clearColumnRef(supabase, "script_revision_cycles", "sent_by", userId),
    clearColumnRef(supabase, "script_recommendation_events", "recommended_by", userId),
    clearColumnRef(supabase, "scripts", "created_by", userId),
    clearColumnRef(supabase, "findings", "created_by", userId),
    clearColumnRef(supabase, "finding_override_events", "created_by", userId),
    clearColumnRef(supabase, "slang_lexicon", "created_by", userId),
    clearColumnRef(supabase, "slang_lexicon_history", "changed_by", userId),
  ];
  await Promise.all(cleanupSteps);
}
