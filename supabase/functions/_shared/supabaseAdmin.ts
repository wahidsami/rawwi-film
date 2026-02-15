/**
 * Supabase Admin client (service_role) for Edge Functions.
 * Use for server-side operations that bypass RLS.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export function createSupabaseAdmin() {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!url) {
    throw new Error("Missing environment variable: SUPABASE_URL");
  }
  if (!serviceRoleKey) {
    throw new Error("Missing environment variable: SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(url, serviceRoleKey, { auth: { persistSession: false } });
}
