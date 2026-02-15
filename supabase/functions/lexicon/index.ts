/**
 * Lexicon (Glossary / Slang Lexicon) Edge Function.
 * GET /lexicon/terms → list active terms from slang_lexicon
 * POST /lexicon/terms → insert term (normalized_term, severity_floor normalized)
 * PUT /lexicon/terms/:id → update or deactivate; optional last_changed_by/last_change_reason
 * GET /lexicon/history/:id → audit rows from slang_lexicon_history
 */
import { jsonResponse, optionsResponse } from "../_shared/cors.ts";
import { requireAuth } from "../_shared/auth.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { logAuditCanonical } from "../_shared/audit.ts";

const SEVERITIES = ["low", "medium", "high", "critical"] as const;
const TERM_TYPES = ["word", "phrase", "regex"] as const;
const ENFORCEMENT_MODES = ["soft_signal", "mandatory_finding"] as const;

function pathAfter(base: string, url: string): string {
  const pathname = new URL(url).pathname;
  const match = pathname.match(new RegExp(`/${base}/?(.*)$`));
  return (match?.[1] ?? "").replace(/^\/+/, "").trim();
}

function toCamel(row: Record<string, unknown>): Record<string, unknown> {
  const map: Record<string, string> = {
    id: "id",
    term: "term",
    normalized_term: "normalized_term",
    term_type: "term_type",
    category: "category",
    severity_floor: "severity_floor",
    enforcement_mode: "enforcement_mode",
    gcam_article_id: "gcam_article_id",
    gcam_atom_id: "gcam_atom_id",
    gcam_article_title_ar: "gcam_article_title_ar",
    description: "description",
    example_usage: "example_usage",
    is_active: "is_active",
    created_by: "created_by",
    created_at: "created_at",
    updated_at: "updated_at",
    last_changed_by: "last_changed_by",
    last_change_reason: "last_change_reason",
  };
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

function historyToCamel(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: row.id,
    lexicon_id: row.lexicon_id,
    operation: row.operation,
    old_data: row.old_data,
    new_data: row.new_data,
    changed_by: row.changed_by,
    changed_at: row.changed_at,
    change_reason: row.change_reason,
  };
}

function normalizeSeverity(s: unknown): string {
  if (typeof s !== "string") return "medium";
  const lower = s.trim().toLowerCase();
  return SEVERITIES.includes(lower as (typeof SEVERITIES)[number]) ? lower : "medium";
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? undefined;
  const json = (body: unknown, status = 200) => jsonResponse(body, status, { origin });
  if (req.method === "OPTIONS") return optionsResponse(req);

  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const { userId, supabase } = auth;

  const rest = pathAfter("lexicon", req.url);
  const method = req.method;

  // GET /lexicon/terms or GET /lexicon
  if (method === "GET" && (rest === "" || rest === "terms")) {
    const { data, error } = await supabase
      .from("slang_lexicon")
      .select("*")
      .order("term", { ascending: true });
    if (error) {
      console.error("[lexicon] GET terms error:", error.message);
      return json({ error: error.message }, 500);
    }
    const rows = (data ?? []).map((r) => toCamel(r as Record<string, unknown>));
    return json(rows);
  }

  // GET /lexicon/history/:id
  if (method === "GET" && rest.startsWith("history/")) {
    const id = rest.replace(/^history\/+/, "").trim();
    if (!id) return json({ error: "Missing lexicon id" }, 400);
    const { data, error } = await supabase
      .from("slang_lexicon_history")
      .select("*")
      .eq("lexicon_id", id)
      .order("changed_at", { ascending: false });
    if (error) {
      console.error("[lexicon] GET history error:", error.message);
      return json({ error: error.message }, 500);
    }
    const rows = (data ?? []).map((r) => historyToCamel(r as Record<string, unknown>));
    return json(rows);
  }

  // POST /lexicon/terms
  if (method === "POST" && (rest === "" || rest === "terms")) {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }
    const termRaw = body.term;
    if (typeof termRaw !== "string" || !termRaw.trim()) {
      return json({ error: "term is required" }, 400);
    }
    const term = termRaw.trim();
    const normalized_term = term.toLowerCase();
    const term_type = TERM_TYPES.includes((body.term_type as string) as (typeof TERM_TYPES)[number])
      ? (body.term_type as string)
      : "word";
    const category = typeof body.category === "string" && body.category.trim() ? body.category.trim() : "other";
    const severity_floor = normalizeSeverity(body.severity_floor);
    const enforcement_mode = ENFORCEMENT_MODES.includes((body.enforcement_mode as string) as (typeof ENFORCEMENT_MODES)[number])
      ? (body.enforcement_mode as string)
      : "soft_signal";
    const gcam_article_id = typeof body.gcam_article_id === "number" ? body.gcam_article_id : parseInt(String(body.gcam_article_id ?? "1"), 10) || 1;
    const gcam_atom_id = typeof body.gcam_atom_id === "string" ? body.gcam_atom_id : (body.gcam_atom_id != null ? String(body.gcam_atom_id) : null);
    const gcam_article_title_ar = typeof body.gcam_article_title_ar === "string" ? body.gcam_article_title_ar : null;
    const description = typeof body.description === "string" ? body.description : null;
    const example_usage = typeof body.example_usage === "string" ? body.example_usage : null;

    const row = {
      term,
      normalized_term,
      term_type,
      category,
      severity_floor,
      enforcement_mode,
      gcam_article_id,
      gcam_atom_id,
      gcam_article_title_ar,
      description,
      example_usage,
      is_active: true,
      created_by: userId,
    };

    const { data: inserted, error } = await supabase
      .from("slang_lexicon")
      .insert(row)
      .select("*")
      .single();

    if (error) {
      if (error.code === "23505") return json({ error: "Term already exists (duplicate normalized term)" }, 409);
      console.error("[lexicon] POST terms error:", error.message);
      return json({ error: error.message }, 500);
    }
    const ins = inserted as { id: string; term: string };
    logAuditCanonical(supabase, {
      event_type: "LEXICON_TERM_ADDED",
      actor_user_id: userId,
      target_type: "glossary",
      target_id: ins.id,
      target_label: ins.term,
      result_status: "success",
    }).catch((e) => console.warn("[lexicon] audit:", e));
    return json(toCamel((inserted as Record<string, unknown>) ?? {}));
  }

  // PUT /lexicon/terms/:id
  if (method === "PUT" && rest.startsWith("terms/")) {
    const id = rest.replace(/^terms\/+/, "").trim();
    if (!id) return json({ error: "Missing term id" }, 400);
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const updates: Record<string, unknown> = {};
    if (typeof body.term === "string" && body.term.trim()) {
      updates.term = body.term.trim();
      updates.normalized_term = body.term.trim().toLowerCase();
    }
    if (body.term_type != null && TERM_TYPES.includes((body.term_type as string) as (typeof TERM_TYPES)[number])) {
      updates.term_type = body.term_type;
    }
    if (typeof body.category === "string" && body.category.trim()) updates.category = body.category.trim();
    if (body.severity_floor != null) updates.severity_floor = normalizeSeverity(body.severity_floor);
    if (body.enforcement_mode != null && ENFORCEMENT_MODES.includes((body.enforcement_mode as string) as (typeof ENFORCEMENT_MODES)[number])) {
      updates.enforcement_mode = body.enforcement_mode;
    }
    if (typeof body.gcam_article_id === "number") updates.gcam_article_id = body.gcam_article_id;
    else if (body.gcam_article_id != null) {
      const n = parseInt(String(body.gcam_article_id), 10);
      if (!Number.isNaN(n)) updates.gcam_article_id = n;
    }
    if (body.gcam_atom_id !== undefined) updates.gcam_atom_id = body.gcam_atom_id == null ? null : String(body.gcam_atom_id);
    if (body.gcam_article_title_ar !== undefined) updates.gcam_article_title_ar = body.gcam_article_title_ar == null ? null : String(body.gcam_article_title_ar);
    if (body.description !== undefined) updates.description = body.description == null ? null : String(body.description);
    if (body.example_usage !== undefined) updates.example_usage = body.example_usage == null ? null : String(body.example_usage);
    if (typeof body.is_active === "boolean") updates.is_active = body.is_active;

    // Audit: set last_changed_by / last_change_reason if columns exist (migration 0023)
    if (userId) updates.last_changed_by = userId;
    if (typeof body.change_reason === "string") updates.last_change_reason = body.change_reason.trim() || null;

    if (Object.keys(updates).length === 0) {
      const { data: existing, error: fetchErr } = await supabase.from("slang_lexicon").select("*").eq("id", id).single();
      if (fetchErr || !existing) return json({ error: "Term not found" }, 404);
      return json(toCamel((existing as Record<string, unknown>) ?? {}));
    }

    const { data: updated, error } = await supabase
      .from("slang_lexicon")
      .update(updates)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      if (error.code === "23505") return json({ error: "Duplicate normalized term" }, 409);
      console.error("[lexicon] PUT terms error:", error.message);
      return json({ error: error.message }, 500);
    }
    if (!updated) return json({ error: "Term not found" }, 404);
    const u = updated as { id: string; term: string; is_active?: boolean };
    const eventType = updates.is_active === false ? "LEXICON_TERM_DELETED" : "LEXICON_TERM_UPDATED";
    logAuditCanonical(supabase, {
      event_type: eventType,
      actor_user_id: userId,
      target_type: "glossary",
      target_id: u.id,
      target_label: u.term,
      result_status: "success",
    }).catch((e) => console.warn("[lexicon] audit:", e));
    return json(toCamel((updated as Record<string, unknown>) ?? {}));
  }

  return json({ error: "Not Found" }, 404);
});
