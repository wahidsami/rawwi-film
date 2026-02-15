/**
 * Audit helper for Edge Functions.
 * Inserts into public.audit_events. Use a Supabase client with service_role for server-side logging.
 * Canonical schema (TODO #3): event_type, actor_*, occurred_at, target_*, result_*, metadata.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type AuditPayload = {
  actor_user_id: string | null;
  entity_type: string;
  action: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  meta?: Record<string, unknown> | null;
  entity_id?: string | null;
};

/** Canonical audit event (PRODUCT_BACKLOG TODO #3). */
export type AuditEventCanonical = {
  event_type: string;
  actor_user_id?: string | null;
  actor_name?: string | null;
  actor_role?: string | null;
  occurred_at?: string | null;
  target_type: string;
  target_id?: string | null;
  target_label?: string | null;
  result_status?: "success" | "failure";
  result_message?: string | null;
  metadata?: Record<string, unknown> | null;
  request_id?: string | null;
  correlation_id?: string | null;
};

export async function logAudit(
  supabase: SupabaseClient,
  payload: AuditPayload
): Promise<{ id?: string; error?: Error }> {
  const {
    actor_user_id,
    entity_type,
    action,
    before = null,
    after = null,
    meta = null,
    entity_id = null,
  } = payload;

  const { data, error } = await supabase.from("audit_events").insert({
    actor_user_id: actor_user_id ?? null,
    entity_type,
    entity_id: entity_id ?? null,
    action,
    before_state: before,
    after_state: after,
    meta,
  }).select("id").single();

  if (error) return { error };
  return { id: data?.id };
}

/** Insert canonical audit event (writes both canonical and legacy columns for compatibility). */
export async function logAuditCanonical(
  supabase: SupabaseClient,
  payload: AuditEventCanonical & { actor_user_id?: string | null }
): Promise<{ id?: string; error?: Error }> {
  const occurred = payload.occurred_at ?? new Date().toISOString();
  const uuidMatch = typeof payload.target_id === "string" && /^[0-9a-f-]{36}$/i.test(payload.target_id) ? payload.target_id : null;
  const row = {
    event_type: payload.event_type,
    actor_user_id: payload.actor_user_id ?? null,
    actor_name: payload.actor_name ?? null,
    actor_role: payload.actor_role ?? null,
    occurred_at: occurred,
    target_type: payload.target_type,
    target_id: payload.target_id ?? null,
    target_label: payload.target_label ?? null,
    result_status: payload.result_status ?? "success",
    result_message: payload.result_message ?? null,
    metadata: payload.metadata ?? null,
    request_id: payload.request_id ?? null,
    correlation_id: payload.correlation_id ?? null,
    action: payload.event_type,
    entity_type: payload.target_type,
    entity_id: uuidMatch,
    meta: payload.metadata ?? null,
  };
  const { data, error } = await supabase.from("audit_events").insert(row).select("id").single();
  if (error) return { error };
  return { id: data?.id };
}
