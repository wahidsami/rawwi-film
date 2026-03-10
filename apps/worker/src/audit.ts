/**
 * Append-only audit log for worker (ANALYSIS_STARTED, ANALYSIS_COMPLETED).
 * Pass actor_user_id (e.g. job.created_by) so audit log shows who triggered the action.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export async function logAuditEvent(
  supabase: SupabaseClient,
  payload: {
    event_type: string;
    target_type: string;
    target_id: string;
    target_label?: string | null;
    result_status?: "success" | "failure";
    result_message?: string | null;
    /** User who triggered the action (e.g. job created_by); displayed in audit log. */
    actor_user_id?: string | null;
  }
): Promise<void> {
  const { error } = await supabase.from("audit_events").insert({
    event_type: payload.event_type,
    actor_user_id: payload.actor_user_id ?? null,
    actor_name: null,
    actor_role: null,
    occurred_at: new Date().toISOString(),
    target_type: payload.target_type,
    target_id: payload.target_id,
    target_label: payload.target_label ?? null,
    result_status: payload.result_status ?? "success",
    result_message: payload.result_message ?? null,
    action: payload.event_type,
    entity_type: payload.target_type,
    entity_id: /^[0-9a-f-]{36}$/i.test(payload.target_id) ? payload.target_id : null,
    meta: null,
  });
  if (error) {
    console.warn("[audit] insert failed:", error.message);
  }
}
