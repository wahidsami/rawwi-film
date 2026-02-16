/**
 * User info helper for Edge Functions.
 * Fetches user email and role from user_id.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface UserInfo {
    name: string | null;  // email or display name
    role: string | null;  // role name
}

/**
 * Fetch user name (email) and role from user_id.
 * Returns { name, role } or { name: null, role: null } if not found.
 * Requires service_role access (admin operations).
 */
export async function getUserInfo(
    supabase: SupabaseClient,
    userId: string | null
): Promise<UserInfo> {
    if (!userId) return { name: null, role: null };

    try {
        // 1. Fetch user email from auth.users
        const { data: authUser } = await supabase.auth.admin.getUserById(userId);
        const userEmail = authUser?.user?.email ?? null;

        // 2. Fetch user roles from user_roles table
        const { data: userRoles } = await supabase
            .from("user_roles")
            .select("role:roles(name)")
            .eq("user_id", userId)
            .limit(1)
            .maybeSingle();

        const roleName = (userRoles as any)?.role?.name ?? null;

        return {
            name: userEmail,
            role: roleName,
        };
    } catch (error) {
        console.warn(`[userInfo] Failed to fetch user info for ${userId}:`, error);
        return { name: null, role: null };
    }
}
