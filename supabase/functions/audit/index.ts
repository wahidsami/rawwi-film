/**
 * Audit log API — admin-only.
 * GET /audit → list with filters + pagination.
 * GET /audit/export?format=csv → CSV export for current filters.
 */
import { corsHeaders, jsonResponse, optionsResponse } from "../_shared/cors.ts";
import { requireAuth } from "../_shared/auth.ts";
import { userHasViewAudit } from "../_shared/auditPermissions.ts";
import { getUserInfo } from "../_shared/userInfo.ts";

const DEFAULT_RETENTION_DAYS = 180;
const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 20;

function pathAfter(base: string, url: string): string {
  const pathname = new URL(url).pathname;
  const match = pathname.match(new RegExp(`/${base}/?(.*)$`));
  return (match?.[1] ?? "").replace(/^\/+/, "").trim();
}

function toCamel(row: Record<string, unknown>): Record<string, unknown> {
  const map: Record<string, string> = {
    id: "id",
    event_type: "eventType",
    actor_user_id: "actorUserId",
    actor_name: "actorName",
    actor_role: "actorRole",
    occurred_at: "occurredAt",
    target_type: "targetType",
    target_id: "targetId",
    target_label: "targetLabel",
    result_status: "resultStatus",
    result_message: "resultMessage",
    metadata: "metadata",
    request_id: "requestId",
    correlation_id: "correlationId",
    created_at: "createdAt",
  };
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    const key = map[k] ?? k;
    out[key] = v;
  }
  return out;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? undefined;
  const json = (body: unknown, status = 200) => jsonResponse(body, status, { origin });
  if (req.method === "OPTIONS") return optionsResponse(req);
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const { userId, supabase } = auth;

  const hasAudit = await userHasViewAudit(supabase, userId);
  if (!hasAudit) return json({ error: "Forbidden: view_audit required" }, 403);

  const url = new URL(req.url);
  const rest = pathAfter("audit", req.url);
  const retentionDays = parseInt(Deno.env.get("AUDIT_RETENTION_DAYS") ?? String(DEFAULT_RETENTION_DAYS), 10) || DEFAULT_RETENTION_DAYS;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);
  const cutoffIso = cutoff.toISOString();

  const dateFrom = url.searchParams.get("dateFrom")?.trim() || cutoffIso;
  const dateTo = url.searchParams.get("dateTo")?.trim() || "";
  const actorUserId = url.searchParams.get("userId")?.trim() || "";
  const eventType = url.searchParams.get("eventType")?.trim() || "";
  const targetType = url.searchParams.get("targetType")?.trim() || "";
  const resultStatus = url.searchParams.get("resultStatus")?.trim() || "";
  const q = url.searchParams.get("q")?.trim() || "";
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(url.searchParams.get("pageSize") ?? String(DEFAULT_PAGE_SIZE), 10)));

  let query = supabase
    .from("audit_events")
    .select("id, event_type, actor_user_id, actor_name, actor_role, occurred_at, target_type, target_id, target_label, result_status, result_message, metadata, request_id, correlation_id, created_at", { count: "exact" })
    .gte("occurred_at", dateFrom);

  if (dateTo) query = query.lte("occurred_at", dateTo);
  if (actorUserId) query = query.eq("actor_user_id", actorUserId);
  if (eventType) query = query.eq("event_type", eventType);
  if (targetType) query = query.eq("target_type", targetType);
  if (resultStatus) query = query.eq("result_status", resultStatus);
  if (q) {
    query = query.or(`target_label.ilike.%${q}%,actor_name.ilike.%${q}%,result_message.ilike.%${q}%`);
  }

  // Export CSV
  if (rest === "export") {
    const format = url.searchParams.get("format")?.toLowerCase() || "csv";
    if (format !== "csv") return json({ error: "Only format=csv supported" }, 400);
    const { data: exportRows, error } = await query.order("occurred_at", { ascending: false }).limit(10000);
    if (error) {
      console.error("[audit] export error:", error.message);
      return json({ error: error.message }, 500);
    }
    const rows = exportRows ?? [];
    const exportActorIds = [...new Set((rows as { actor_user_id?: string | null; actor_name?: string | null }[])
      .filter((r) => r.actor_user_id && !r.actor_name)
      .map((r) => r.actor_user_id as string))];
    const exportActorMap: Record<string, { name: string | null; role: string | null }> = {};
    for (const aid of exportActorIds) {
      const info = await getUserInfo(supabase, aid);
      exportActorMap[aid] = { name: info.name, role: info.role };
    }
    for (const row of rows as { actor_user_id?: string | null; actor_name?: string | null; actor_role?: string | null }[]) {
      if (row.actor_user_id && !row.actor_name && exportActorMap[row.actor_user_id]) {
        row.actor_name = exportActorMap[row.actor_user_id].name;
        row.actor_role = exportActorMap[row.actor_user_id].role;
      }
    }
    const headers = ["id", "event_type", "actor_name", "actor_role", "occurred_at", "target_type", "target_id", "target_label", "result_status", "result_message"];
    const escape = (v: unknown) => (v == null ? "" : String(v).replace(/"/g, '""'));
    const csvLines = [headers.join(",")];
    for (const r of rows) {
      const row = r as Record<string, unknown>;
      csvLines.push(headers.map((h) => `"${escape(row[h])}"`).join(","));
    }
    const csv = csvLines.join("\r\n");
    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="audit-${new Date().toISOString().slice(0, 10)}.csv"`,
        ...corsHeaders(origin),
      },
    });
  }

  // List with pagination
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const { data: rows, error, count } = await query
    .order("occurred_at", { ascending: false })
    .range(from, to);

  if (error) {
    console.error("[audit] list error:", error.message);
    return json({ error: error.message }, 500);
  }

  const list = (rows ?? []).map((r) => toCamel(r as Record<string, unknown>));
  // Enrich actor display: when actor_user_id is set but actor_name is null (e.g. worker-logged events), resolve to email/role
  const actorIds = [...new Set((list as { actorUserId?: string | null; actorName?: string | null }[])
    .filter((r) => r.actorUserId && !r.actorName)
    .map((r) => r.actorUserId as string))];
  const actorMap: Record<string, { name: string | null; role: string | null }> = {};
  for (const aid of actorIds) {
    const info = await getUserInfo(supabase, aid);
    actorMap[aid] = { name: info.name, role: info.role };
  }
  for (const row of list as { actorUserId?: string | null; actorName?: string | null; actorRole?: string | null }[]) {
    if (row.actorUserId && !row.actorName && actorMap[row.actorUserId]) {
      row.actorName = actorMap[row.actorUserId].name;
      row.actorRole = actorMap[row.actorUserId].role;
    }
  }

  return json({
    data: list,
    total: count ?? 0,
    page,
    pageSize,
  });
});
