/**
 * Minimal audit insert for heavy Edge bundles (e.g. extract + pdfjs).
 * Avoids getUserInfo / auth.admin lookups to keep the deploy graph smaller.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export async function insertAuditEventMinimal(
  supabase: SupabaseClient,
  payload: {
    event_type: string;
    actor_user_id: string;
    target_type: string;
    target_id: string;
    target_label?: string | null;
    correlation_id?: string | null;
    metadata?: Record<string, unknown> | null;
  },
): Promise<void> {
  const event_type = payload.event_type;
  const uuidMatch =
    typeof payload.target_id === "string" && /^[0-9a-f-]{36}$/i.test(payload.target_id)
      ? payload.target_id
      : null;

  const row = {
    event_type,
    actor_user_id: payload.actor_user_id,
    actor_name: null as string | null,
    actor_role: null as string | null,
    occurred_at: new Date().toISOString(),
    target_type: payload.target_type,
    target_id: payload.target_id,
    target_label: payload.target_label ?? null,
    result_status: "success" as const,
    result_message: null as string | null,
    metadata: payload.metadata ?? null,
    correlation_id: payload.correlation_id ?? null,
    action: event_type,
    entity_type: payload.target_type,
    entity_id: uuidMatch,
    meta: payload.metadata ?? null,
  };

  const { error } = await supabase.from("audit_events").insert(row);
  if (error) {
    console.warn(`[auditInsertMinimal] ${event_type} failed:`, error.message);
  }
}
