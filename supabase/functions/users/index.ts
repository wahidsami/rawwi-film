/**
 * Edge Function: users (access-control)
 * GET /users → list users (profiles + roles). Requires manage_users or access_control:manage.
 * POST /users → create user (invite in PROD, temp password in DEV). Same permission.
 */
import { optionsResponse, jsonResponse } from "../_shared/cors.ts";
import { requireAuth } from "../_shared/auth.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";

const PROD = Deno.env.get("PROD") === "true" || Deno.env.get("SUPABASE_ENV") === "production";

function generateTempPassword(length = 20): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%";
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => chars[b % chars.length]).join("");
}

async function callerHasAdminPermission(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  userId: string
): Promise<boolean> {
  const { data: roleRows } = await supabase
    .from("user_roles")
    .select("role_id")
    .eq("user_id", userId);
  const roleIds = (roleRows ?? []).map((r: { role_id: string }) => r.role_id);
  if (roleIds.length === 0) return false;
  const { data: permRows } = await supabase
    .from("role_permissions")
    .select("permission_id")
    .in("role_id", roleIds);
  const permIds = [...new Set((permRows ?? []).map((p: { permission_id: string }) => p.permission_id))];
  if (permIds.length === 0) return false;
  const { data: keys } = await supabase
    .from("permissions")
    .select("key")
    .in("id", permIds);
  const keysList = (keys ?? []).map((p: { key: string }) => p.key);
  return keysList.includes("manage_users") || keysList.includes("access_control:manage");
}

function upsertProfile(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  userId: string,
  name: string,
  email: string
): Promise<void> {
  return supabase
    .from("profiles")
    .upsert(
      { user_id: userId, name, email, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    )
    .then(({ error }) => {
      if (error) console.error("[users] profiles upsert:", error.message);
    });
}

function ensureUserRole(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  userId: string,
  roleKey: string
): Promise<void> {
  return supabase
    .from("roles")
    .select("id")
    .eq("key", roleKey)
    .maybeSingle()
    .then(({ data: role, error: roleErr }) => {
      if (roleErr || !role) {
        console.error("[users] role not found:", roleKey, roleErr?.message);
        return;
      }
      return supabase
        .from("user_roles")
        .upsert(
          { user_id: userId, role_id: role.id },
          { onConflict: "user_id,role_id" }
        )
        .then(({ error }) => {
          if (error) console.error("[users] user_roles upsert:", error.message);
        });
    });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return optionsResponse(req);

  const origin = req.headers.get("origin") ?? undefined;
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const { userId: callerId, supabase } = auth;

  const hasPermission = await callerHasAdminPermission(supabase, callerId);
  if (!hasPermission) {
    return jsonResponse({ error: "Forbidden: manage_users or access_control:manage required" }, 403, { origin });
  }

  const method = req.method;

  if (method === "GET") {
    const { data: listData, error: listErr } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const authUsers = listData?.users ?? [];
    if (listErr) {
      console.error("[users] listUsers:", listErr.message);
      return jsonResponse({ error: listErr.message }, 500, { origin });
    }
    const userIds = authUsers.map((u) => u.id);
    const { data: profileRows } = await supabase.from("profiles").select("user_id, name, email").in("user_id", userIds);
    const profileByUserId = new Map((profileRows ?? []).map((p: { user_id: string; name: string; email: string }) => [p.user_id, p]));
    const { data: urRows } = await supabase.from("user_roles").select("user_id, role_id").in("user_id", userIds);
    const { data: roles } = await supabase.from("roles").select("id, key, name");
    const roleById = new Map((roles ?? []).map((r: { id: string; key: string; name: string }) => [r.id, r]));
    const userRoleKey = new Map<string, string>();
    (urRows ?? []).forEach((ur: { user_id: string; role_id: string }) => {
      const r = roleById.get(ur.role_id);
      if (r) userRoleKey.set(ur.user_id, r.key);
    });
    const list = authUsers.map((u) => {
      const profile = profileByUserId.get(u.id);
      const name = profile?.name ?? (u.user_metadata?.name as string) ?? u.email?.split("@")[0] ?? "";
      const email = profile?.email ?? u.email ?? "";
      // NEW: Return allowedSections
      const allowedSections = (u.user_metadata?.allowedSections as string[]) ?? [];
      return {
        id: u.id,
        email,
        name,
        roleKey: userRoleKey.get(u.id) ?? null,
        status: u.banned_until ? "disabled" : "active",
        allowedSections, // Return this
      };
    });
    return jsonResponse(list, 200, { origin });
  }

  if (method === "POST") {
    let body: { name?: string; email?: string; roleKey?: string; permissions?: string[]; mode?: string; tempPassword?: string };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400, { origin });
    }
    const name = (body.name ?? "").trim();
    const email = (body.email ?? "").trim().toLowerCase();
    const roleKey = (body.roleKey ?? "admin").trim() || "admin";
    const mode = (body.mode === "invite" || body.mode === "temp_password") ? body.mode : "temp_password";
    const tempPassword = typeof body.tempPassword === "string" ? body.tempPassword.trim() : undefined;

    if (!email) return jsonResponse({ error: "email is required" }, 400, { origin });

    if (PROD && mode !== "invite") {
      return jsonResponse({ error: "In production only invite mode is allowed" }, 400, { origin });
    }

    let targetUserId: string;
    let invited = false;
    let returnedTempPassword: string | undefined;

    const { data: listData } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const existingUser = (listData?.users ?? []).find((u) => u.email?.toLowerCase() === email);
    if (existingUser) {
      targetUserId = existingUser.id;
      const displayName = name || (existingUser.email?.split("@")[0] ?? "User");
      const finalEmail = email || (existingUser.email ?? "");
      await upsertProfile(supabase, targetUserId, displayName, finalEmail);
      await ensureUserRole(supabase, targetUserId, roleKey);
      return jsonResponse({ userId: targetUserId, invited: false, existing: true }, 200, { origin });
    }

    if (mode === "invite") {
      const { data: inviteData, error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(email, {
        data: { name: name || email.split("@")[0] },
      });
      if (inviteErr) {
        console.error("[users] inviteUserByEmail:", inviteErr.message);
        return jsonResponse({ error: inviteErr.message }, 400, { origin });
      }
      const user = inviteData?.user;
      if (!user?.id) return jsonResponse({ error: "Invite did not return user" }, 500, { origin });
      targetUserId = user.id;
      invited = true;
      const displayName = name || (user.email?.split("@")[0] ?? "User");
      const finalEmail = email || (user.email ?? "");
      await upsertProfile(supabase, targetUserId, displayName, finalEmail);
      await ensureUserRole(supabase, targetUserId, roleKey);
      return jsonResponse({ userId: targetUserId, invited: true }, 200, { origin });
    }

    const password = tempPassword && tempPassword.length >= 12 ? tempPassword : generateTempPassword(16);
    const { data: createData, error: createErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name: name || email.split("@")[0] },
    });
    if (createErr) {
      console.error("[users] createUser:", createErr.message);
      return jsonResponse({ error: createErr.message }, 400, { origin });
    }
    const user = createData?.user;
    if (!user?.id) return jsonResponse({ error: "Create user failed" }, 500, { origin });
    targetUserId = user.id;
    const displayName = name || (user.email?.split("@")[0] ?? "User");
    const finalEmail = email || (user.email ?? "");
    await upsertProfile(supabase, targetUserId, displayName, finalEmail);
    await ensureUserRole(supabase, targetUserId, roleKey);
    if (!PROD) returnedTempPassword = password;
    return jsonResponse({ userId: targetUserId, invited: false, tempPassword: returnedTempPassword }, 200, { origin });
  }

  if (method === "PATCH") {
    let body: { userId?: string; name?: string; roleKey?: string; status?: string };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400, { origin });
    }
    const targetUserId = (body.userId ?? "").trim();
    if (!targetUserId) return jsonResponse({ error: "userId is required" }, 400, { origin });
    if (targetUserId === callerId) {
      return jsonResponse({ error: "Cannot update your own user from this endpoint" }, 400, { origin });
    }
    const name = typeof body.name === "string" ? body.name.trim() : undefined;
    const roleKey = typeof body.roleKey === "string" ? (body.roleKey.trim() || "admin") : undefined;
    const status = body.status === "disabled" || body.status === "active" ? body.status : undefined;

    const { data: targetUser, error: getUserErr } = await supabase.auth.admin.getUserById(targetUserId);
    if (getUserErr || !targetUser?.user) {
      console.error("[users] getUserById:", getUserErr?.message);
      return jsonResponse({ error: "User not found" }, 404, { origin });
    }
    const authUser = targetUser.user;
    const currentEmail = authUser.email ?? "";
    const existingName = (authUser.user_metadata?.name as string) ?? currentEmail.split("@")[0] ?? "User";

    if (status !== undefined) {
      const banDuration = status === "disabled" ? "876000h" : "none";
      const { error: updateAuthErr } = await supabase.auth.admin.updateUserById(targetUserId, {
        ban_duration: banDuration,
      });
      if (updateAuthErr) {
        console.error("[users] updateUserById ban:", updateAuthErr.message);
        return jsonResponse({ error: updateAuthErr.message }, 400, { origin });
      }
    }
    const finalName = name !== undefined ? name : existingName;

    // NEW: Handle allowedSections update
    const allowedSections = Array.isArray((body as any).allowedSections) ? (body as any).allowedSections : undefined;

    // Update profile (name, email)
    await upsertProfile(supabase, targetUserId, finalName, currentEmail);

    // Update role if changed
    if (roleKey !== undefined) await ensureUserRole(supabase, targetUserId, roleKey);

    // Update user_metadata if name or allowedSections changed
    const metadataUpdates: any = {};
    if (name !== undefined) metadataUpdates.name = name;
    if (allowedSections !== undefined) metadataUpdates.allowedSections = allowedSections;

    if (Object.keys(metadataUpdates).length > 0) {
      const { error: metaErr } = await supabase.auth.admin.updateUserById(targetUserId, {
        user_metadata: metadataUpdates
      });
      if (metaErr) {
        console.error("[users] updateUserById metadata:", metaErr.message);
        return jsonResponse({ error: metaErr.message }, 400, { origin });
      }
    }

    return jsonResponse({ userId: targetUserId, updated: true }, 200, { origin });
  }

  if (method === "DELETE") {
    const url = new URL(req.url);
    let targetUserId = url.searchParams.get("userId")?.trim();

    // If not in query, try body (legacy support)
    if (!targetUserId) {
      try {
        const body: { userId?: string } = await req.json();
        targetUserId = (body.userId ?? "").trim();
      } catch {
        // Body parsing failed or empty, and no query param
        return jsonResponse({ error: "userId is required (via query param 'userId' or JSON body)" }, 400, { origin });
      }
    }

    if (!targetUserId) return jsonResponse({ error: "userId is required" }, 400, { origin });
    if (targetUserId === callerId) {
      return jsonResponse({ error: "Cannot delete your own account" }, 400, { origin });
    }

    // Attempt delete
    const { error: deleteErr } = await supabase.auth.admin.deleteUser(targetUserId);
    if (deleteErr) {
      console.error("[users] deleteUser:", targetUserId, deleteErr.message);
      return jsonResponse({ error: deleteErr.message }, 400, { origin });
    }
    return jsonResponse({ userId: targetUserId, deleted: true }, 200, { origin });
  }

  return jsonResponse({ error: "Method not allowed" }, 405, { origin });
});
