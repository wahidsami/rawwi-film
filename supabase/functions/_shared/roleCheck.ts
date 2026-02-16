
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
 * Returns true if the user is Admin or Super Admin (not Regulator).
 * Use for "override" rules where only Admin/Super Admin can bypass (e.g. decide on own script).
 */
export async function canOverrideOwnScriptDecision(
    supabase: ReturnType<typeof createSupabaseAdmin>,
    userId: string
): Promise<boolean> {
    try {
        const { data: roleRows, error } = await supabase
            .from("user_roles")
            .select("role_id, roles(key)")
            .eq("user_id", userId);

        if (error || !roleRows || roleRows.length === 0) return false;

        return roleRows.some((r: any) => {
            const key = (r.roles?.key ?? "").toLowerCase();
            return key === "admin" || key === "super_admin";
        });
    } catch (err) {
        console.error("[roleCheck] canOverrideOwnScriptDecision:", err);
        return false;
    }
}
