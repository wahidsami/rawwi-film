/**
 * Edge Function: invites
 * POST /invites → create invite (token + hash), create auth user, upsert user_roles, insert user_invites, send email via Resend.
 * Requires manage_users. Single-use invite links; token stored as hash only.
 * Profile is created by DB trigger handle_new_user on auth.users INSERT — this function does not insert into public.profiles.
 *
 * Env: SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, APP_PUBLIC_URL (e.g. http://localhost:5173 or https://raawifilm.unifinitylab.com)
 */
import { optionsResponse, jsonResponse } from "../_shared/cors.ts";
import { requireAuth } from "../_shared/auth.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { logAudit } from "../_shared/audit.ts";

const INVITE_EXPIRY_HOURS = 48;
const RESEND_API = "https://api.resend.com/emails";
const FROM_EMAIL = "Raawi Film <no-reply@unifinitylab.com>";

async function callerHasManageUsers(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  userId: string
): Promise<boolean> {
  const { data: roleRows } = await supabase.from("user_roles").select("role_id").eq("user_id", userId);
  const roleIds = (roleRows ?? []).map((r: { role_id: string }) => r.role_id);
  if (roleIds.length === 0) return false;
  const { data: permRows } = await supabase
    .from("role_permissions")
    .select("permission_id")
    .in("role_id", roleIds);
  const permIds = [...new Set((permRows ?? []).map((p: { permission_id: string }) => p.permission_id))];
  if (permIds.length === 0) return false;
  const { data: keys } = await supabase.from("permissions").select("key").in("id", permIds);
  const keysList = (keys ?? []).map((p: { key: string }) => p.key);
  return keysList.includes("manage_users") || keysList.includes("access_control:manage");
}

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const base64 = btoa(binary);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256Hex(message: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(message));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function generateTempPassword(length = 24): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => chars[b % chars.length]).join("");
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? undefined;
  const json = (body: unknown, status = 200) => jsonResponse(body, status, { origin });
  if (req.method === "OPTIONS") return optionsResponse(req);

  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const { userId: callerId, supabase } = auth;

  const hasPermission = await callerHasManageUsers(supabase, callerId);
  if (!hasPermission) {
    return json({ error: "Forbidden: manage_users or access_control:manage required" }, 403);
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  let body: {
    email?: string;
    name?: string;
    role?: string;
    permissions?: Record<string, boolean>;
    allowedSections?: string[]; // NEW: Section-based permissions
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  // Service role key required for auth.admin.createUser (and createSupabaseAdmin already uses it)
  if (!Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
    console.error("[invites] SUPABASE_SERVICE_ROLE_KEY is not set");
    return json(
      { error: "Server configuration error: SUPABASE_SERVICE_ROLE_KEY is required for invites. Set it in Edge Function secrets." },
      500
    );
  }

  const email = (body.email ?? "").trim().toLowerCase();
  if (!email) return json({ error: "email is required" }, 400);

  const roleKey = (body.role ?? "admin").trim() || "admin";
  const { data: roleRow, error: roleErr } = await supabase.from("roles").select("id").eq("key", roleKey).maybeSingle();
  if (roleErr || !roleRow) {
    return json({ error: `Unknown role: ${roleKey}` }, 400);
  }
  const roleId = roleRow.id;

  const permissions = body.permissions != null && typeof body.permissions === "object" ? body.permissions : {};
  const allowedSections = Array.isArray(body.allowedSections) ? body.allowedSections : undefined;

  const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
  const token = base64url(tokenBytes);
  const tokenHash = await sha256Hex(token);

  const expiresAt = new Date(Date.now() + INVITE_EXPIRY_HOURS * 60 * 60 * 1000);
  const expiresAtIso = expiresAt.toISOString();

  let authUserId: string;

  // Step 0: Pre-check for existing user by email (avoid duplicate auth.users → trigger would duplicate profile)
  console.log(`[invites] STEP:pre_check - Checking for ${email}`);
  const { data: getUserData, error: getUserErr } = await supabase.auth.admin.listUsers({
    perPage: 1000,
  });
  if (getUserErr) {
    console.error("[invites] STEP:pre_check FAILED");
    console.error("[invites] Error details:", JSON.stringify({ step: "pre_check", message: getUserErr.message, raw: getUserErr }, null, 2));
    return json({ error: "pre_check_failed", message: getUserErr.message }, 500);
  }
  const existingInAuth = (getUserData?.users ?? []).find(u => u.email?.toLowerCase() === email);

  if (existingInAuth) {
    console.log(`[invites] STEP:pre_check - User already exists: ${email}`);
    return json({ error: "user_already_exists", email }, 409);
  }

  // Step 1: Create auth user
  const tempPassword = generateTempPassword(20);
  const userMetadata: Record<string, unknown> = {
    name: (body.name ?? "").trim() || email.split("@")[0]
  };
  if (allowedSections) {
    userMetadata.allowedSections = allowedSections;
  }

  console.log(`[invites] STEP:auth_create_user - Creating auth user for ${email}`);
  const { data: createData, error: createErr } = await supabase.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: userMetadata,
  });

  if (createErr) {
    console.error("[invites] STEP:auth_create_user FAILED");
    console.error("[invites] Error details:", JSON.stringify({
      step: "auth_create_user",
      message: createErr.message,
      status: (createErr as any).status,
      code: (createErr as any).code,
      name: (createErr as any).name,
      details: (createErr as any).details,
      hint: (createErr as any).hint,
      stack: (createErr as any).stack,
      raw: createErr
    }, null, 2));
    return json({
      error: "auth_create_user_failed",
      step: "auth_create_user",
      code: (createErr as any).code,
      message: createErr.message
    }, 500);
  }

  const user = createData?.user;
  if (!user?.id) {
    console.error("[invites] STEP:auth_create_user FAILED - no user ID returned");
    return json({ error: "auth_create_user_failed", message: "No user ID returned from Supabase Auth" }, 500);
  }
  authUserId = user.id;
  console.log(`[invites] STEP:auth_create_user SUCCESS - user_id=${authUserId}`);

  // Profile is created by DB trigger handle_new_user on auth.users INSERT — do not insert into profiles.

  // Step 2: Assign role (user_roles; does not depend on profiles)
  console.log(`[invites] STEP:upsert_user_role - Assigning role ${roleId} to ${authUserId}`);
  const { error: upsertRoleErr } = await supabase.from("user_roles").upsert(
    { user_id: authUserId, role_id: roleId },
    { onConflict: "user_id,role_id" }
  );

  if (upsertRoleErr) {
    console.error("[invites] STEP:upsert_user_role FAILED");
    console.error("[invites] Role error details:", JSON.stringify({
      step: "upsert_user_role",
      message: upsertRoleErr.message,
      code: upsertRoleErr.code,
      details: upsertRoleErr.details,
      hint: upsertRoleErr.hint,
      raw: upsertRoleErr,
    }, null, 2));
    return json({
      error: "auth_create_user_failed",
      step: "upsert_user_role",
      code: upsertRoleErr.code,
      message: upsertRoleErr.message
    }, 500);
  }
  console.log(`[invites] STEP:upsert_user_role SUCCESS`);

  // Step 3: Record invite
  console.log(`[invites] STEP:insert_user_invite - Recording invite for ${email}`);
  const { data: insertedRow, error: insertErr } = await supabase.from("user_invites").insert({
    email,
    role_id: roleId,
    permissions,
    invited_by: callerId,
    token_hash: tokenHash,
    expires_at: expiresAtIso,
    auth_user_id: authUserId,
  }).select("id").single();

  if (insertErr) {
    console.error("[invites] STEP:insert_user_invite FAILED");
    console.error("[invites] Error details:", JSON.stringify({ step: "insert_user_invite", message: insertErr.message, code: insertErr.code, details: insertErr.details, hint: insertErr.hint, raw: insertErr }, null, 2));
    return json({ error: "invite_record_failed", step: "insert_user_invite", message: insertErr.message }, 500);
  }
  const inviteId = insertedRow?.id;
  console.log(`[invites] STEP:insert_user_invite SUCCESS - invite_id=${inviteId}`);

  const appPublicUrlRaw = Deno.env.get("APP_PUBLIC_URL");
  const isCloud = !!Deno.env.get("DENO_REGION");

  if (isCloud && !appPublicUrlRaw) {
    throw new Error("APP_PUBLIC_URL is required in production");
  }

  const appPublicUrl = (appPublicUrlRaw ?? "http://localhost:5173").replace(/\/$/, "");
  const setPasswordLink = `${appPublicUrl}/set-password?token=${encodeURIComponent(token)}`;

  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) {
    console.error("[invites] RESEND_API_KEY not set");
    return json({ error: "Email service not configured" }, 500);
  }

  const emailBody = {
    from: FROM_EMAIL,
    to: [email],
    subject: "Set your password – Raawi Film",
    html: `
      <p>You've been invited to Raawi Film.</p>
      <p><a href="${setPasswordLink}">Set your password</a></p>
      <p>This link expires in ${INVITE_EXPIRY_HOURS} hours. If you didn't request this, you can ignore this email.</p>
    `.trim(),
  };

  const res = await fetch(RESEND_API, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(emailBody),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("[invites] Resend API error:", res.status, errText);
    return json(
      { error: "Failed to send invite email. Invite was created; you can resend or try again." },
      500
    );
  }

  await logAudit(supabase, {
    actor_user_id: callerId,
    entity_type: "user_invite",
    action: "invite.create",
    entity_id: inviteId ?? null,
    after: { email, role_key: roleKey, expires_at: expiresAtIso },
    meta: { auth_user_id: authUserId },
  }).catch((e) => console.error("[invites] audit:", e));

  return json({
    ok: true,
    expiresAt: expiresAtIso,
    email,
  });
});
