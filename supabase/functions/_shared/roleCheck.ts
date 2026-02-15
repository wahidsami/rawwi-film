
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
