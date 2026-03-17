/**
 * Phase 1A.1: Scripts + ScriptVersions. Contract per api-contract.md + frontend-models.md.
 * GET /scripts → Script[]
 * POST /scripts → Script
 * POST /scripts/versions → ScriptVersion (stubs for /scripts/upload, /scripts/extract remain 501)
 */
import { jsonResponse, optionsResponse } from "../_shared/cors.ts";
import { requireAuth } from "../_shared/auth.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { getCorrelationId } from "../_shared/utils.ts";
import { canOverrideOwnScriptDecision, isRegulatorOnly, isSuperAdminOrAdmin, isUserAdmin } from "../_shared/roleCheck.ts";

function pathAfter(base: string, url: string): string {
  const pathname = new URL(url).pathname;
  const match = pathname.match(new RegExp(`/${base}/?(.*)$`));
  return (match?.[1] ?? "").replace(/^\/+/, "").trim();
}

type ScriptRow = {
  id: string;
  client_id: string;
  company_id: string | null;
  title: string;
  type: string;
  status: string;
  synopsis: string | null;
  file_url: string | null;
  created_by: string | null;
  created_at: string;
  assignee_id: string | null;
  current_version_id: string | null;
  is_quick_analysis?: boolean | null;
};

function toScriptFrontend(row: ScriptRow) {
  const type = row.type === "film" ? "Film" : row.type === "series" ? "Series" : row.type;
  return {
    id: row.id,
    companyId: row.company_id ?? row.client_id,
    title: row.title,
    type,
    synopsis: row.synopsis ?? undefined,
    fileUrl: row.file_url ?? undefined,
    status: row.status,
    createdAt: row.created_at,
    assigneeId: row.assignee_id ?? undefined,
    created_by: row.created_by ?? undefined, // NEW
    currentVersionId: row.current_version_id ?? undefined,
    isQuickAnalysis: row.is_quick_analysis ?? false,
  };
}

type ScriptVersionRow = {
  id: string;
  script_id: string;
  version_number: number;
  source_file_name: string | null;
  source_file_type: string | null;
  source_file_size: number | null;
  source_file_path: string | null;
  source_file_url: string | null;
  extracted_text: string | null;
  extraction_status: string;
  created_at: string;
};

function toVersionFrontend(row: ScriptVersionRow) {
  return {
    id: row.id,
    scriptId: row.script_id,
    versionNumber: row.version_number,
    source_file_name: row.source_file_name ?? undefined,
    source_file_type: row.source_file_type ?? undefined,
    source_file_size: row.source_file_size ?? undefined,
    source_file_url: row.source_file_url ?? undefined,
    extracted_text: row.extracted_text ?? undefined,
    extraction_status: row.extraction_status,
    createdAt: row.created_at,
  };
}

function normalizeType(t: unknown): string {
  if (t === "Film" || t === "film") return "film";
  if (t === "Series" || t === "series") return "series";
  return String(t).toLowerCase();
}

function normalizeStatus(s: unknown): string {
  const v = String(s).toLowerCase().replace(/\s+/g, "_");
  const allowed = ["draft", "in_review", "analysis_running", "review_required", "approved", "rejected"];
  return allowed.includes(v) ? v : "draft";
}

async function ensureQuickAnalysisClientId(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  uid: string,
): Promise<string> {
  const envClientId = Deno.env.get("QUICK_ANALYSIS_CLIENT_ID")?.trim();
  if (envClientId) {
    const { data: existing } = await supabase
      .from("clients")
      .select("id")
      .eq("id", envClientId)
      .maybeSingle();
    if (existing) return envClientId;
  }

  const quickNameAr = "تحليل سريع (داخلي)";
  const quickNameEn = "Quick Analysis (Internal)";

  const { data: found, error: findErr } = await supabase
    .from("clients")
    .select("id")
    .eq("name_en", quickNameEn)
    .maybeSingle();
  if (findErr) throw new Error(findErr.message);
  if (found) return (found as { id: string }).id;

  const { data: created, error: createErr } = await supabase
    .from("clients")
    .insert({
      name_ar: quickNameAr,
      name_en: quickNameEn,
      representative_name: "System",
      representative_title: "Internal",
      email: "quick-analysis@internal.local",
      created_by: uid,
    })
    .select("id")
    .single();
  if (createErr || !created) throw new Error(createErr?.message || "Failed to create quick analysis client");
  return (created as { id: string }).id;
}

async function clearScriptAnalysisArtifacts(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  scriptId: string,
  correlationId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error: highlightErr } = await supabase
    .from("user_script_highlight")
    .delete()
    .eq("script_id", scriptId);
  if (highlightErr) {
    console.error(`[scripts] correlationId=${correlationId} clear highlight preference error=`, highlightErr.message);
    return { ok: false, error: highlightErr.message };
  }

  // analysis_jobs has FK cascades to chunks/findings/reports.
  const { error: jobsErr } = await supabase
    .from("analysis_jobs")
    .delete()
    .eq("script_id", scriptId);
  if (jobsErr) {
    console.error(`[scripts] correlationId=${correlationId} clear analysis jobs error=`, jobsErr.message);
    return { ok: false, error: jobsErr.message };
  }

  return { ok: true };
}

const RESEND_API = "https://api.resend.com/emails";
const NOTIFY_FROM_EMAIL = "Raawi Film <no-reply@unifinitylab.com>";

/** Notify assignee when a script is assigned (in-app + optional email). */
async function notifyScriptAssigned(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  assigneeId: string,
  scriptId: string,
  scriptTitle: string,
  assignedByName: string
): Promise<void> {
  const title = `Script assigned: ${scriptTitle}`;
  const body = `You have been assigned to review the script "${scriptTitle}"${assignedByName ? ` by ${assignedByName}` : ""}.`;
  const metadata = { script_id: scriptId, script_title: scriptTitle, assigned_by_name: assignedByName };
  const { error: notifErr } = await supabase.from("notifications").insert({
    user_id: assigneeId,
    type: "script_assigned",
    title,
    body,
    metadata,
  });
  if (notifErr) console.error("[scripts] notify insert:", notifErr.message);

  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) return;
  const { data: profile } = await supabase.from("profiles").select("email").eq("user_id", assigneeId).maybeSingle();
  let assigneeEmail = (profile as { email?: string } | null)?.email;
  if (!assigneeEmail) {
    const { data: authUser } = await supabase.auth.admin.getUserById(assigneeId);
    assigneeEmail = authUser?.user?.email ?? null;
  }
  if (!assigneeEmail) return;
  const appUrl = Deno.env.get("APP_PUBLIC_URL") ?? "";
  const html = `<p>${body}</p>${appUrl ? `<p><a href="${appUrl}/scripts">Open Scripts</a></p>` : ""}`;
  const res = await fetch(RESEND_API, {
    method: "POST",
    headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: NOTIFY_FROM_EMAIL, to: [assigneeEmail], subject: title, html }),
  });
  if (!res.ok) console.error("[scripts] Resend error:", res.status, await res.text());
}

/** Shared predicate for script decision: used by GET .../decision/can and POST .../decision. */
async function computeScriptDecisionCan(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  uid: string,
  script: { created_by?: string | null; assignee_id?: string | null }
): Promise<{
  canApprove: boolean;
  canReject: boolean;
  reasonIfDisabled?: string;
  isCreator: boolean;
  isAssignee: boolean;
}> {
  const createdBy = script.created_by ?? null;
  const assigneeId = script.assignee_id ?? null;
  const isCreator = createdBy === uid;
  const isAssignee = assigneeId === uid;

  const [approveRpc, rejectRpc] = await Promise.all([
    supabase.rpc("user_can_approve_scripts", { p_user_id: uid }),
    supabase.rpc("user_can_reject_scripts", { p_user_id: uid }),
  ]);
  const hasApprovePerm = approveRpc.data === true && !approveRpc.error;
  const hasRejectPerm = rejectRpc.data === true && !rejectRpc.error;

  if (!hasApprovePerm && !hasRejectPerm) {
    return {
      canApprove: false,
      canReject: false,
      reasonIfDisabled: "You do not have permission to approve or reject scripts.",
      isCreator,
      isAssignee,
    };
  }

  const regulatorOnly = await isRegulatorOnly(supabase, uid);
  if (regulatorOnly && !isAssignee) {
    return {
      canApprove: false,
      canReject: false,
      reasonIfDisabled:
        "Only the assigned reviewer can approve or reject this script. This script is not assigned to you.",
      isCreator,
      isAssignee,
    };
  }

  if (isCreator) {
    const canOverride = await canOverrideOwnScriptDecision(supabase, uid);
    if (!canOverride) {
      return {
        canApprove: false,
        canReject: false,
        reasonIfDisabled:
          "Conflict of interest: You cannot approve/reject your own script. Ask an admin or the assigned reviewer to make the decision.",
        isCreator,
        isAssignee,
      };
    }
  }

  return { canApprove: hasApprovePerm, canReject: hasRejectPerm, isCreator, isAssignee };
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? undefined;
  const json = (body: unknown, status = 200) => jsonResponse(body, status, { origin });
  if (req.method === "OPTIONS") return optionsResponse(req);

  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const correlationId = getCorrelationId(req);
  const supabase = createSupabaseAdmin();
  const rest = pathAfter("scripts", req.url);
  const method = req.method;
  const uid = auth.userId;

  console.log(`[scripts] Request: ${method} ${req.url}`);
  console.log(`[scripts] Parsed rest path: '${rest}'`);

  // GET /scripts — Only Super Admin and Admin see all. Everyone else sees only scripts assigned to them.
  if (method === "GET" && rest === "") {
    let query = supabase
      .from("scripts")
      .select("id, client_id, company_id, title, type, status, synopsis, file_url, created_by, created_at, assignee_id, current_version_id, is_quick_analysis")
      .eq("is_quick_analysis", false)
      .order("created_at", { ascending: false });
    const seeAll = await isSuperAdminOrAdmin(supabase, uid);
    if (!seeAll) {
      query = query.eq("assignee_id", uid);
    }
    const { data: rows, error } = await query;
    if (error) {
      console.error(`[scripts] correlationId=${correlationId} list error=`, error.message);
      return json({ error: error.message }, 500);
    }
    const list = (rows ?? []).map((r) => toScriptFrontend(r as ScriptRow));
    const assigneeIds = [...new Set((rows ?? []).map((r: { assignee_id: string | null }) => r.assignee_id).filter(Boolean))] as string[];
    if (assigneeIds.length > 0) {
      const { data: profileRows } = await supabase.from("profiles").select("user_id, name").in("user_id", assigneeIds);
      const nameByUserId = new Map((profileRows ?? []).map((p: { user_id: string; name: string }) => [p.user_id, p.name]));
      list.forEach((s: { assigneeId?: string; assigneeName?: string }) => {
        if (s.assigneeId) s.assigneeName = nameByUserId.get(s.assigneeId) ?? undefined;
      });
    }
    return json(list);
  }

  // POST /scripts/quick — create a standalone quick-analysis script for current user.
  if (method === "POST" && rest === "quick") {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      body = {};
    }
    const titleRaw = typeof body.title === "string" ? body.title.trim() : "";
    const title = titleRaw || `Quick Analysis ${new Date().toISOString().slice(0, 19).replace("T", " ")}`;
    const typeRaw = typeof body.type === "string" ? body.type.trim() : "film";
    const statusRaw = typeof body.status === "string" ? body.status.trim() : "draft";
    const clientId = await ensureQuickAnalysisClientId(supabase, uid);

    const insert = {
      client_id: clientId,
      company_id: clientId,
      title,
      type: normalizeType(typeRaw),
      status: normalizeStatus(statusRaw),
      synopsis: typeof body.synopsis === "string" ? body.synopsis.trim() || null : null,
      file_url: null,
      created_by: uid,
      assignee_id: uid,
      is_quick_analysis: true,
    };
    const { data: row, error } = await supabase
      .from("scripts")
      .insert(insert)
      .select("id, client_id, company_id, title, type, status, synopsis, file_url, created_by, created_at, assignee_id, current_version_id, is_quick_analysis")
      .single();
    if (error || !row) {
      console.error(`[scripts] correlationId=${correlationId} quick insert error=`, error?.message);
      return json({ error: error?.message || "Failed to create quick analysis script" }, 500);
    }
    return json(toScriptFrontend(row as ScriptRow));
  }

  // GET /scripts/quick — quick-analysis history (own items only).
  if (method === "GET" && rest === "quick") {
    const { data: rows, error } = await supabase
      .from("scripts")
      .select("id, client_id, company_id, title, type, status, synopsis, file_url, created_by, created_at, assignee_id, current_version_id, is_quick_analysis")
      .eq("is_quick_analysis", true)
      .eq("created_by", uid)
      .order("created_at", { ascending: false });
    if (error) {
      console.error(`[scripts] correlationId=${correlationId} quick list error=`, error.message);
      return json({ error: error.message }, 500);
    }
    return json((rows ?? []).map((r) => toScriptFrontend(r as ScriptRow)));
  }

  // ═══════════════════════════════════════════════════════════════
  // SPECIFIC STRING ROUTES (must come before wildcard :id routes)
  // ═══════════════════════════════════════════════════════════════

  // GET /scripts/editor?scriptId=...&versionId=...
  if (method === "GET" && rest === "editor") {
    const url = new URL(req.url);
    const scriptId = url.searchParams.get("scriptId")?.trim();
    const versionId = url.searchParams.get("versionId")?.trim();
    if (!scriptId || !versionId) {
      return json({ error: "scriptId and versionId query params are required" }, 400);
    }
    const { data: script, error: scriptErr } = await supabase
      .from("scripts")
      .select("id, created_by, assignee_id")
      .eq("id", scriptId)
      .maybeSingle();
    if (scriptErr || !script) {
      return json({ error: "Script not found" }, 404);
    }
    const s = script as { created_by: string | null; assignee_id: string | null };
    const isAdmin = await isUserAdmin(supabase, uid);
    if (!isAdmin && s.created_by !== uid && s.assignee_id !== uid) {
      return json({ error: "Forbidden" }, 403);
    }
    const { data: version, error: versionErr } = await supabase
      .from("script_versions")
      .select("id, script_id")
      .eq("id", versionId)
      .eq("script_id", scriptId)
      .maybeSingle();
    if (versionErr || !version) {
      return json({ error: "Version not found or does not belong to script" }, 404);
    }
    const { data: textRow, error: textErr } = await supabase
      .from("script_text")
      .select("content, content_hash, content_html")
      .eq("version_id", versionId)
      .maybeSingle();
    if (textErr) {
      console.error(`[scripts] correlationId=${correlationId} script_text error=`, textErr.message);
      return json({ error: textErr.message }, 500);
    }
    const { data: sectionRows, error: sectionErr } = await supabase
      .from("script_sections")
      .select("id, index, title, start_offset, end_offset, meta")
      .eq("version_id", versionId)
      .order("index", { ascending: true });
    if (sectionErr) {
      console.error(`[scripts] correlationId=${correlationId} script_sections error=`, sectionErr.message);
      return json({ error: sectionErr.message }, 500);
    }
    const { data: pageRows } = await supabase
      .from("script_pages")
      .select("page_number, content, content_html")
      .eq("version_id", versionId)
      .order("page_number", { ascending: true });
    const content = textRow != null ? (textRow as { content: string }).content : "";
    const contentHash = textRow != null ? (textRow as { content_hash?: string | null }).content_hash ?? null : null;
    const contentHtml = textRow != null ? (textRow as { content_html?: string | null }).content_html ?? null : null;
    const sections = (sectionRows ?? []).map((r: Record<string, unknown>) => ({
      id: r.id,
      index: r.index,
      title: r.title,
      startOffset: r.start_offset,
      endOffset: r.end_offset,
      meta: r.meta ?? {},
    }));
    const PAGE_SEP_LEN = 2;
    let startOffsetGlobal = 0;
    const pages = (pageRows ?? []).map((row: { page_number: number; content: string; content_html?: string | null }) => {
      const out = {
        pageNumber: row.page_number,
        content: row.content,
        contentHtml: row.content_html ?? null,
        startOffsetGlobal,
      };
      startOffsetGlobal += row.content.length + PAGE_SEP_LEN;
      return out;
    });
    const response: Record<string, unknown> = { content, contentHash, contentHtml, sections };
    if (pages.length > 0) response.pages = pages;
    return json(response);
  }

  // GET /scripts/highlight-preference?scriptId=xxx → { jobId: string | null }
  if (method === "GET" && rest === "highlight-preference") {
    const url = new URL(req.url);
    const scriptId = url.searchParams.get("scriptId")?.trim();
    if (!scriptId) return json({ error: "scriptId query param is required" }, 400);
    const { data: script, error: scriptErr } = await supabase
      .from("scripts")
      .select("id, created_by, assignee_id")
      .eq("id", scriptId)
      .maybeSingle();
    if (scriptErr || !script) return json({ error: "Script not found" }, 404);
    const s = script as { created_by: string | null; assignee_id: string | null };
    const isAdminHighlight = await isUserAdmin(supabase, uid);
    if (!isAdminHighlight && s.created_by !== uid && s.assignee_id !== uid) return json({ error: "Forbidden" }, 403);
    const { data: row, error: rowErr } = await supabase
      .from("user_script_highlight")
      .select("job_id")
      .eq("user_id", uid)
      .eq("script_id", scriptId)
      .maybeSingle();
    if (rowErr) {
      console.error(`[scripts] correlationId=${correlationId} highlight-preference get error=`, rowErr.message);
      return json({ error: rowErr.message }, 500);
    }
    const jobId = (row as { job_id?: string } | null)?.job_id ?? null;
    return json({ jobId });
  }

  // PUT /scripts/highlight-preference body: { scriptId: string, jobId: string }
  if (method === "PUT" && rest === "highlight-preference") {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }
    const scriptId = typeof body.scriptId === "string" ? body.scriptId.trim() : null;
    const jobId = typeof body.jobId === "string" ? body.jobId.trim() : null;
    if (!scriptId || !jobId) return json({ error: "scriptId and jobId are required" }, 400);
    const { data: script, error: scriptErr } = await supabase
      .from("scripts")
      .select("id, created_by, assignee_id")
      .eq("id", scriptId)
      .maybeSingle();
    if (scriptErr || !script) return json({ error: "Script not found" }, 404);
    const s = script as { created_by: string | null; assignee_id: string | null };
    const isAdminPref = await isUserAdmin(supabase, uid);
    if (!isAdminPref && s.created_by !== uid && s.assignee_id !== uid) return json({ error: "Forbidden" }, 403);
    const { data: job, error: jobErr } = await supabase
      .from("analysis_jobs")
      .select("id, script_id, created_by")
      .eq("id", jobId)
      .maybeSingle();
    if (jobErr || !job) return json({ error: "Job not found" }, 404);
    const j = job as { script_id: string; created_by: string };
    if (j.script_id !== scriptId || j.created_by !== uid) return json({ error: "Forbidden" }, 403);
    const { error: upsertErr } = await supabase
      .from("user_script_highlight")
      .upsert(
        { user_id: uid, script_id: scriptId, job_id: jobId, updated_at: new Date().toISOString() },
        { onConflict: "user_id,script_id" }
      );
    if (upsertErr) {
      console.error(`[scripts] correlationId=${correlationId} highlight-preference put error=`, upsertErr.message);
      return json({ error: upsertErr.message }, 500);
    }
    return json({ jobId });
  }

  // ═══════════════════════════════════════════════════════════════
  // WILDCARD ROUTES (come after specific string routes)
  // ═══════════════════════════════════════════════════════════════

  // GET /scripts/:id — single script (for workspace when not in list)
  if (method === "GET" && rest && !rest.includes("/")) {
    const scriptId = rest.trim();
    const { data: row, error } = await supabase
      .from("scripts")
      .select("id, client_id, company_id, title, type, status, synopsis, file_url, created_by, created_at, assignee_id, current_version_id, is_quick_analysis")
      .eq("id", scriptId)
      .maybeSingle();
    if (error) return json({ error: error.message }, 500);
    if (!row) return json({ error: "Script not found" }, 404);
    const s = row as ScriptRow;
    const isAdmin = await isUserAdmin(supabase, uid);
    if (!isAdmin && s.created_by !== uid && s.assignee_id !== uid) return json({ error: "Forbidden" }, 403);
    const out = toScriptFrontend(s);
    if (s.assignee_id) {
      const { data: profile } = await supabase.from("profiles").select("name").eq("user_id", s.assignee_id).maybeSingle();
      if (profile) (out as { assigneeName?: string }).assigneeName = (profile as { name: string }).name;
    }
    return json(out);
  }

  // POST /scripts — Regulators cannot create scripts; only work on assigned ones
  if (method === "POST" && rest === "") {
    const regulatorOnly = await isRegulatorOnly(supabase, uid);
    if (regulatorOnly) {
      return json({ error: "Regulators cannot add new scripts. Only scripts assigned to you can be worked on." }, 403);
    }
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }
    const companyId = body.companyId ?? body.company_id;
    const title = body.title;
    const type = body.type;
    const status = body.status;
    if (companyId == null || typeof companyId !== "string" || !companyId.trim()) {
      return json({ error: "companyId is required" }, 400);
    }
    if (title == null || typeof title !== "string" || !title.trim()) {
      return json({ error: "title is required" }, 400);
    }
    if (type == null || typeof type !== "string" || !String(type).trim()) {
      return json({ error: "type is required" }, 400);
    }
    if (status == null || typeof status !== "string" || !String(status).trim()) {
      return json({ error: "status is required" }, 400);
    }
    const clientId = companyId.trim();
    const insert = {
      client_id: clientId,
      company_id: clientId,
      title: String(title).trim().normalize("NFC"),
      type: normalizeType(type),
      status: normalizeStatus(status),
      synopsis: typeof body.synopsis === "string" ? body.synopsis.trim() || null : null,
      file_url: typeof body.fileUrl === "string" ? body.fileUrl.trim() || null : null,
      created_by: uid,
      assignee_id: typeof body.assigneeId === "string" && body.assigneeId.trim() ? body.assigneeId.trim() : (typeof body.assignee_id === "string" && body.assignee_id.trim() ? body.assignee_id.trim() : null),
      is_quick_analysis: false,
    };
    const { data: row, error } = await supabase
      .from("scripts")
      .insert(insert)
      .select("id, client_id, company_id, title, type, status, synopsis, file_url, created_by, created_at, assignee_id, current_version_id, is_quick_analysis")
      .single();
    if (error) {
      console.error(`[scripts] correlationId=${correlationId} insert error=`, error.message);
      if (error.code === "23503") return json({ error: "companyId (client) not found" }, 400);
      return json({ error: error.message }, 500);
    }
    const created = row as ScriptRow;
    if (created.assignee_id) {
      const { data: assignerProfile } = await supabase.from("profiles").select("name").eq("user_id", uid).maybeSingle();
      const assignerName = (assignerProfile as { name?: string } | null)?.name ?? undefined;
      await notifyScriptAssigned(supabase, created.assignee_id, created.id, created.title, assignerName ?? "");
    }
    return json(toScriptFrontend(created));
  }

  // POST /scripts/versions
  if (method === "POST" && (rest === "versions" || rest.startsWith("versions/"))) {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }
    const scriptId = body.scriptId ?? body.script_id;
    if (!scriptId || typeof scriptId !== "string" || !scriptId.trim()) {
      return json({ error: "scriptId is required" }, 400);
    }
    const sid = scriptId.trim();
    const { data: script, error: scriptErr } = await supabase
      .from("scripts")
      .select("id, created_by, assignee_id, is_quick_analysis")
      .eq("id", sid)
      .single();
    if (scriptErr || !script) {
      return json({ error: "Script not found" }, 404);
    }
    const s = script as { created_by: string | null; assignee_id: string | null; is_quick_analysis?: boolean | null };
    const canAdminReplace = await isSuperAdminOrAdmin(supabase, uid);
    const isQuick = s.is_quick_analysis === true;
    const canAccessQuick = isQuick && (s.created_by === uid || s.assignee_id === uid || canAdminReplace);
    if (!canAdminReplace && !canAccessQuick) {
      return json({ error: "Only Admin/Super Admin can replace script files." }, 403);
    }
    if (body.clearAnalysisOnReplace === true && !isQuick) {
      const cleared = await clearScriptAnalysisArtifacts(supabase, sid, correlationId);
      if (!cleared.ok) return json({ error: cleared.error }, 500);
    }
    const { data: maxRow } = await supabase
      .from("script_versions")
      .select("version_number")
      .eq("script_id", sid)
      .order("version_number", { ascending: false })
      .limit(1)
      .single();
    const nextVersion = maxRow ? (maxRow as { version_number: number }).version_number + 1 : 1;
    const storagePath = typeof body.source_file_path === "string" ? body.source_file_path.trim() || null : null;
    const storageUrl = typeof body.source_file_url === "string" ? body.source_file_url.trim() || null : null;
    const pathOrUrl = storagePath ?? storageUrl;
    const rawSourceFileName = typeof body.source_file_name === "string" ? body.source_file_name.trim() || null : null;
    const sourceFileNameNfc = rawSourceFileName ? rawSourceFileName.normalize("NFC") : null;
    const versionInsert = {
      script_id: sid,
      version_number: nextVersion,
      source_file_name: sourceFileNameNfc,
      source_file_type: typeof body.source_file_type === "string" ? body.source_file_type.trim() || null : null,
      source_file_size: typeof body.source_file_size === "number" ? body.source_file_size : null,
      source_file_path: pathOrUrl,
      source_file_url: pathOrUrl,
      extraction_status: typeof body.extraction_status === "string" ? body.extraction_status.trim() || "pending" : "pending",
    };
    const { data: version, error: versionErr } = await supabase
      .from("script_versions")
      .insert(versionInsert)
      .select("id, script_id, version_number, source_file_name, source_file_type, source_file_size, source_file_path, source_file_url, extracted_text, extraction_status, created_at")
      .single();
    if (versionErr || !version) {
      console.error(`[scripts] correlationId=${correlationId} version insert error=`, versionErr?.message);
      return json({ error: versionErr?.message || "Failed to create version" }, 500);
    }
    await supabase.from("scripts").update({ current_version_id: version.id }).eq("id", sid);
    return json(toVersionFrontend(version as ScriptVersionRow));
  }

  // GET /scripts/:id/versions
  const versionsMatch = rest.match(/^([^/]+)\/versions$/);
  if (method === "GET" && versionsMatch) {
    const scriptId = versionsMatch[1];

    // Security check
    const { data: script, error: scriptErr } = await supabase
      .from("scripts")
      .select("id, created_by, assignee_id")
      .eq("id", scriptId)
      .maybeSingle();

    if (scriptErr || !script) return json({ error: "Script not found" }, 404);

    const s = script as { created_by: string | null; assignee_id: string | null };
    const isAdminVersions = await isUserAdmin(supabase, uid);
    if (!isAdminVersions && s.created_by !== uid && s.assignee_id !== uid) {
      return json({ error: "Forbidden" }, 403);
    }

    const { data: versions, error: versionsErr } = await supabase
      .from("script_versions")
      .select("*")
      .eq("script_id", scriptId)
      .order("version_number", { ascending: false });

    if (versionsErr) {
      console.error(`[scripts] correlationId=${correlationId} versions list error=`, versionsErr.message);
      return json({ error: versionsErr.message }, 500);
    }

    const list = (versions ?? []).map((v) => toVersionFrontend(v as ScriptVersionRow));
    return json(list);
  }
  // ──────────────── GET /scripts/:id/decision/can (policy predicate for UI) ────────────────
  const decisionCanMatch = rest.match(/^([^/]+)\/decision\/can$/);
  if (method === "GET" && decisionCanMatch) {
    const scriptId = decisionCanMatch[1].trim();
    const { data: script, error: findErr } = await supabase
      .from("scripts")
      .select("id, created_by, assignee_id")
      .eq("id", scriptId)
      .maybeSingle();

    if (findErr || !script) return json({ error: "Script not found" }, 404);

    const can = await computeScriptDecisionCan(supabase, uid, script as { created_by?: string | null; assignee_id?: string | null });
    console.info("[scripts] decision/can", {
      scriptId,
      uid,
      isCreator: can.isCreator,
      isAssignee: can.isAssignee,
      canApprove: can.canApprove,
      canReject: can.canReject,
    });
    return json({
      canApprove: can.canApprove,
      canReject: can.canReject,
      reason: can.reasonIfDisabled ?? undefined,
    });
  }

  // ──────────────── POST /scripts/:id/decision (Approve/Reject) ────────────────
  const decisionMatch = rest.match(/^([^/]+)\/decision$/);
  if (method === "POST" && decisionMatch) {
    const scriptId = decisionMatch[1].trim();
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    // Validate decision
    const decision = typeof body.decision === 'string' ? body.decision.trim().toLowerCase() : '';
    if (!['approve', 'reject'].includes(decision)) {
      return json({ error: "decision must be 'approve' or 'reject'" }, 400);
    }

    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (!reason) {
      return json({ error: "reason is required for approval/rejection" }, 400);
    }

    const relatedReportId = typeof body.relatedReportId === 'string' && body.relatedReportId.trim()
      ? body.relatedReportId.trim()
      : null;

    // Fetch script
    const { data: script, error: findErr } = await supabase
      .from("scripts")
      .select("id, title, status, created_by, assignee_id")
      .eq("id", scriptId)
      .maybeSingle();

    if (findErr || !script) return json({ error: "Script not found" }, 404);

    const currentStatus = (script as any).status || 'draft';
    const newStatus = decision === 'approve' ? 'approved' : 'rejected';

    const can = await computeScriptDecisionCan(supabase, uid, script as { created_by?: string | null; assignee_id?: string | null });
    console.info("[scripts] decision POST", {
      scriptId,
      uid,
      decision,
      isCreator: can.isCreator,
      isAssignee: can.isAssignee,
      canApprove: can.canApprove,
      canReject: can.canReject,
    });

    const allowed = decision === 'approve' ? can.canApprove : can.canReject;
    if (!allowed) {
      const msg = can.reasonIfDisabled ?? `You do not have permission to ${decision} this script.`;
      return json({ error: msg }, 403);
    }

    // Update script status
    const { error: updateErr } = await supabase
      .from("scripts")
      .update({ status: newStatus })
      .eq("id", scriptId);

    if (updateErr) {
      console.error(`[scripts] correlationId=${correlationId} status update error=`, updateErr.message);
      return json({ error: updateErr.message }, 500);
    }

    // Log to status history and audit events
    const { error: logErr } = await supabase.rpc('log_script_status_change', {
      p_script_id: scriptId,
      p_from_status: currentStatus,
      p_to_status: newStatus,
      p_changed_by: uid,
      p_reason: reason,
      p_related_report_id: relatedReportId,
      p_metadata: { decision, correlationId }
    });

    if (logErr) {
      console.error(`[scripts] correlationId=${correlationId} audit log error=`, logErr.message);
      // Continue anyway - status was updated successfully
    }

    // If related report, optionally update report status
    if (relatedReportId) {
      const reportStatus = decision === 'approve' ? 'approved' : 'rejected';
      await supabase
        .from("analysis_reports")
        .update({
          review_status: reportStatus,
          reviewed_by: uid,
          reviewed_at: new Date().toISOString(),
          review_notes: reason
        })
        .eq("id", relatedReportId);
      // Ignore errors - report update is secondary
    }

    // Fetch updated script
    const { data: updated } = await supabase
      .from("scripts")
      .select("id, client_id, company_id, title, type, status, synopsis, file_url, created_by, created_at, assignee_id, current_version_id")
      .eq("id", scriptId)
      .single();

    return json({
      success: true,
      script: updated ? toScriptFrontend(updated as ScriptRow) : null,
      message: decision === 'approve'
        ? `Script approved successfully`
        : `Script rejected: ${reason}`
    });
  }

  // PATCH /scripts/:id

  if (method === "PATCH" && rest && !rest.includes("/")) {
    const scriptId = rest.trim();
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const { data: script, error: findErr } = await supabase
      .from("scripts")
      .select("id, created_by, client_id, company_id")
      .eq("id", scriptId)
      .maybeSingle();

    if (findErr || !script) return json({ error: "Script not found" }, 404);

    // Authorization: Owner (created_by) or Admin/Super Admin can edit.
    const isAdmin = await isUserAdmin(supabase, uid);
    if (!isAdmin && (script as any).created_by !== uid) {
      return json({ error: "Forbidden" }, 403);
    }

    const updates: any = {};
    if (body.title && typeof body.title === 'string' && body.title.trim()) updates.title = body.title.trim();
    if (body.synopsis !== undefined) updates.synopsis = typeof body.synopsis === 'string' ? body.synopsis.trim() || null : null;
    if (body.status && typeof body.status === 'string') updates.status = normalizeStatus(body.status);

    // Handle currentVersionId (set after import/new version so workspace shows correct version).
    const versionId = body.currentVersionId ?? body.current_version_id;
    if (versionId !== undefined) {
      if (versionId === null || versionId === "") {
        updates.current_version_id = null;
      } else if (typeof versionId === 'string' && versionId.trim()) {
        updates.current_version_id = versionId.trim();
      }
    }

    // Handle assignee update
    if (body.assigneeId !== undefined) {
      if (body.assigneeId === null || body.assigneeId === "") {
        updates.assignee_id = null;
      } else if (typeof body.assigneeId === 'string' && body.assigneeId.trim()) {
        updates.assignee_id = body.assigneeId.trim();
      }
    } else if (body.assignee_id !== undefined) {
      if (body.assignee_id === null || body.assignee_id === "") {
        updates.assignee_id = null;
      } else if (typeof body.assignee_id === 'string' && body.assignee_id.trim()) {
        updates.assignee_id = body.assignee_id.trim();
      }
    }

    if (Object.keys(updates).length === 0) {
      return json({ error: "No valid updates provided" }, 400);
    }

    const { data: updated, error: updateErr } = await supabase
      .from("scripts")
      .update(updates)
      .eq("id", scriptId)
      .select("id, client_id, company_id, title, type, status, synopsis, file_url, created_by, created_at, assignee_id, current_version_id")
      .single();

    if (updateErr) {
      console.error(`[scripts] correlationId=${correlationId} update error=`, updateErr.message);
      return json({ error: updateErr.message }, 500);
    }

    const updatedRow = updated as ScriptRow;
    if (updates.assignee_id && updatedRow.assignee_id) {
      const { data: assignerProfile } = await supabase.from("profiles").select("name").eq("user_id", uid).maybeSingle();
      const assignerName = (assignerProfile as { name?: string } | null)?.name ?? undefined;
      await notifyScriptAssigned(supabase, updatedRow.assignee_id, updatedRow.id, updatedRow.title, assignerName ?? "");
    }
    return json(toScriptFrontend(updatedRow));
  }

  // DELETE /scripts/:id
  if (method === "DELETE" && rest && !rest.includes("/")) {
    const scriptId = rest.trim();
    const { data: script, error: findErr } = await supabase
      .from("scripts")
      .select("id, created_by")
      .eq("id", scriptId)
      .maybeSingle();
    if (findErr || !script) return json({ error: "Script not found" }, 404);
    if ((script as any).created_by !== uid) return json({ error: "Forbidden" }, 403);
    const { error: delErr } = await supabase
      .from("scripts")
      .delete()
      .eq("id", scriptId);
    if (delErr) {
      console.error(`[scripts] correlationId=${correlationId} delete error=`, delErr.message);
      return json({ error: delErr.message }, 500);
    }
    return json({ ok: true });
  }

  // Stubs: POST /scripts/upload, POST /scripts/extract (frontend uses top-level /upload, /extract)
  if (method === "POST" && (rest.startsWith("upload") || rest.startsWith("extract"))) {
    return json({ error: "Not implemented" }, 501);
  }

  return json({ error: "Not Found" }, 404);
});
