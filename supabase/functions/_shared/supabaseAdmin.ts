/**
 * Supabase Admin client (service_role) for Edge Functions.
 * Use for server-side operations that bypass RLS (e.g. auth.admin, invites).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export function createSupabaseAdmin() {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!url) {
    throw new Error("Missing SUPABASE_URL. Set it in Supabase Dashboard → Project Settings → API, or in Edge Function secrets.");
  }
  if (!serviceRoleKey) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY. Required for Edge Functions that use auth.admin or bypass RLS. " +
      "Set it in Supabase Dashboard → Project Settings → Edge Functions → Secrets."
    );
  }

  return createClient(url, serviceRoleKey, { auth: { persistSession: false } });
}
