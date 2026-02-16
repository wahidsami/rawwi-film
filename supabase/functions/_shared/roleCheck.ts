
import { createSupabaseAdmin } from "./supabaseAdmin.ts";

/**
 * Checks if a user has Admin, Super Admin, or Regulator privileges
 * by querying the user_roles table directly (Source of Truth).
 * This avoids issues with stale user_metadata.
 */
export async function isUserAdmin(
    supabase: ReturnType<typeof createSupabaseAdmin>,
    userId: string
): Promise<boolean> {
    try {
        const { data: roleRows, error } = await supabase
            .from("user_roles")
            .select("role_id, roles(key)")
            .eq("user_id", userId);

        if (error) {
            console.error("[roleCheck] Error fetching roles:", error);
            return false;
        }

        if (!roleRows || roleRows.length === 0) return false;

        // Check if any role key matches Admin/Super Admin/Regulator
        const isAdmin = roleRows.some((r: any) => {
            const key = r.roles?.key;
            return (
                key === "Admin" || key === "admin" ||
                key === "Super Admin" || key === "super_admin" ||
                key === "Regulator" || key === "regulator"
            );
        });

        return isAdmin;
    } catch (err) {
        console.error("[roleCheck] Exception checking roles:", err);
        return false;
    }
}

/**
 * Returns true if the user has only Regulator (no Admin/Super Admin).
 * Used to enforce "Regulator can decide only scripts assigned to them".
 */
export async function isRegulatorOnly(
    supabase: ReturnType<typeof createSupabaseAdmin>,
    userId: string
): Promise<boolean> {
    try {
        const { data: roleRows, error } = await supabase
            .from("user_roles")
            .select("role_id, roles(key)")
            .eq("user_id", userId);

        if (error || !roleRows || roleRows.length === 0) return false;

        const keys = (roleRows as any[]).map((r) => (r.roles?.key ?? "").toLowerCase());
        const hasRegulator = keys.some((k) => k === "regulator");
        const hasAdminOrSuper = keys.some((k) => k === "admin" || k === "super_admin");
        return hasRegulator && !hasAdminOrSuper;
    } catch (err) {
        console.error("[roleCheck] isRegulatorOnly:", err);
        return false;
    }
}

/**
 * Returns true if the user is Super Admin only (used for override: can decide on own script).
 */
export async function isSuperAdmin(
    supabase: ReturnType<typeof createSupabaseAdmin>,
    userId: string
): Promise<boolean> {
    try {
        const { data: roleRows, error } = await supabase
            .from("user_roles")
            .select("role_id, roles(key)")
            .eq("user_id", userId);

        if (error || !roleRows || roleRows.length === 0) return false;

        return (roleRows as any[]).some((r) => (r.roles?.key ?? "").toLowerCase() === "super_admin");
    } catch (err) {
        console.error("[roleCheck] isSuperAdmin:", err);
        return false;
    }
}

/**
 * Returns true if the user is Super Admin (only role that can override conflict: decide on own script).
 * Admin cannot decide on their own script; Regulator cannot; only Super Admin can.
 */
export async function canOverrideOwnScriptDecision(
    supabase: ReturnType<typeof createSupabaseAdmin>,
    userId: string
): Promise<boolean> {
    return isSuperAdmin(supabase, userId);
}
