/**
 * Edge Function: invites-consume
 * POST /invites-consume → validate token, set password, mark invite used, ensure profile + role.
 * No auth required (invitee has only the token). Rate-limited by IP; audit logged on success.
 *
 * Body: { token: string, password: string, name?: string }
 */
import { optionsResponse, jsonResponse } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { logAudit } from "../_shared/audit.ts";

const MIN_PASSWORD_LENGTH = 8;
const RATE_LIMIT_WINDOW_MINUTES = 5;
const RATE_LIMIT_MAX_ATTEMPTS = 15;

function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

async function sha256Hex(message: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(message));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function validatePassword(password: string): { ok: boolean; error?: string } {
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` };
  }
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /\d/.test(password);
  if (!hasLetter || !hasNumber) {
    return { ok: false, error: "Password must contain at least one letter and one number" };
  }
  return { ok: true };
}

type InviteRow = {
  id: string;
  email: string;
  role_id: string;
  auth_user_id: string | null;
};

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? undefined;
  const json = (body: unknown, status = 200) => jsonResponse(body, status, { origin });
  if (req.method === "OPTIONS") return optionsResponse(req);

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  let body: { token?: string; password?: string; name?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const token = typeof body.token === "string" ? body.token.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";

  if (!token) return json({ error: "token is required" }, 400);
  if (!password) return json({ error: "password is required" }, 400);

  const pwdCheck = validatePassword(password);
  if (!pwdCheck.ok) {
    return json({ error: pwdCheck.error }, 400);
  }

  const supabase = createSupabaseAdmin();
  const clientIp = getClientIp(req);
  const now = new Date().toISOString();
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60 * 1000).toISOString();

  const { count, error: countErr } = await supabase
    .from("invite_consume_attempts")
    .select("*", { count: "exact", head: true })
    .eq("ip_address", clientIp)
    .gte("attempted_at", windowStart);

  if (!countErr && (count ?? 0) >= RATE_LIMIT_MAX_ATTEMPTS) {
    return json(
      { error: "Too many attempts. Please try again later." },
      429
    );
  }

  await supabase.from("invite_consume_attempts").insert({
    ip_address: clientIp,
    attempted_at: now,
  });

  const tokenHash = await sha256Hex(token);

  const { data: invite, error: inviteErr } = await supabase
    .from("user_invites")
    .select("id, email, role_id, auth_user_id")
    .eq("token_hash", tokenHash)
    .is("used_at", null)
    .gt("expires_at", now)
    .maybeSingle();

  if (inviteErr) {
    console.error("[invites-consume] lookup:", inviteErr.message);
    return json({ error: "Invalid or expired invite" }, 400);
  }
  if (!invite) {
    return json({ error: "Invalid or expired invite" }, 400);
  }

  const row = invite as InviteRow;
  const authUserId = row.auth_user_id;
  if (!authUserId) {
    console.error("[invites-consume] invite has no auth_user_id:", row.id);
    return json({ error: "Invalid or expired invite" }, 400);
  }

  const { error: updateAuthErr } = await supabase.auth.admin.updateUserById(authUserId, { password });
  if (updateAuthErr) {
    console.error("[invites-consume] STEP:update_auth_password FAILED");
    console.error("[invites-consume] Error details:", JSON.stringify({
      message: updateAuthErr.message,
      // @ts-ignore
      code: updateAuthErr.code,
      // @ts-ignore
      status: updateAuthErr.status,
    }, null, 2));
    return json({ error: updateAuthErr.message }, 500);
  }

  const { error: markUsedErr } = await supabase
    .from("user_invites")
    .update({ used_at: now })
    .eq("id", row.id);

  if (markUsedErr) {
    console.error("[invites-consume] STEP:mark_invite_used FAILED");
    console.error("[invites-consume] Error details:", JSON.stringify({
      message: markUsedErr.message,
      code: markUsedErr.code,
      details: markUsedErr.details,
      hint: markUsedErr.hint,
    }, null, 2));
    return json({ error: "Failed to mark invite as used" }, 500);
  }

  const displayName = name || row.email.split("@")[0] || "User";
  const { error: profileErr } = await supabase
    .from("profiles")
    .upsert(
      {
        user_id: authUserId,
        email: row.email,
        name: displayName,
        updated_at: now,
      },
      { onConflict: "user_id" }
    );

  if (profileErr) {
    console.error("[invites-consume] STEP:upsert_profile FAILED");
    console.error("[invites-consume] Error details:", JSON.stringify({
      message: profileErr.message,
      code: profileErr.code,
      details: profileErr.details,
      hint: profileErr.hint,
    }, null, 2));
    return json({ error: "Failed to create/update profile" }, 500);
  }

  const { error: roleErr } = await supabase
    .from("user_roles")
    .upsert(
      { user_id: authUserId, role_id: row.role_id },
      { onConflict: "user_id,role_id" }
    );

  if (roleErr) {
    console.error("[invites-consume] STEP:upsert_user_role FAILED");
    console.error("[invites-consume] Error details:", JSON.stringify({
      message: roleErr.message,
      code: roleErr.code,
      details: roleErr.details,
      hint: roleErr.hint,
    }, null, 2));
    return json({ error: "Failed to assign role" }, 500);
  }

  await logAudit(supabase, {
    actor_user_id: null,
    entity_type: "user_invite",
    action: "invite.consume",
    entity_id: row.id,
    meta: { auth_user_id: authUserId, email: row.email },
  }).catch((e) => console.error("[invites-consume] audit:", e));

  return json({ ok: true });
});
