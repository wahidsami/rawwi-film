/**
 * Phase 1A.1: Scripts + ScriptVersions. Contract per api-contract.md + frontend-models.md.
 * GET /scripts → Script[]
 * POST /scripts → Script
 * POST /scripts/versions → ScriptVersion (stubs for /scripts/upload, /scripts/extract remain 501)
 */
import { jsonResponse, optionsResponse } from "../_shared/cors.ts";
import { requireAuth } from "../_shared/auth.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { getCorrelationId, normalizeText } from "../_shared/utils.ts";
import { canOverrideOwnScriptDecision, isClientUser, isRegulatorOnly, isSuperAdminOrAdmin, isUserAdmin } from "../_shared/roleCheck.ts";
import { logAuditCanonical } from "../_shared/audit.ts";
import fontkit from "npm:@pdf-lib/fontkit@1.1.1";
import { PDFDocument, rgb } from "npm:pdf-lib@1.17.1";
import { getFontBytes } from "../_shared/pdfVfs.ts";

const CERTIFICATE_FILES_BUCKET = "script-certificates";

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
  work_classification: string | null;
  episode_count: number | null;
  received_at: string | null;
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
    workClassification: row.work_classification ?? undefined,
    episodeCount: row.episode_count ?? null,
    receivedAt: row.received_at ?? null,
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
  extraction_progress?: Record<string, unknown> | null;
  extraction_error?: string | null;
  created_at: string;
};

type DuplicateMatchRow = {
  scriptId: string;
  versionId: string;
  versionNumber: number;
  scriptTitle: string;
  scriptStatus: string;
  sourceFileName: string | null;
  createdAt: string;
  companyName: string | null;
  importedByName: string | null;
  contextType: "client" | "quick_analysis";
  contextLabel: string | null;
  sameScript: boolean;
  isCurrentVersion: boolean;
  analyzedBefore: boolean;
  latestAnalysisAt: string | null;
  latestReviewerName: string | null;
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
    extraction_progress: row.extraction_progress ?? undefined,
    extraction_error: row.extraction_error ?? undefined,
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
  const allowed = ["draft", "in_review", "analysis_running", "review_required", "approved", "rejected", "canceled", "cancelled"];
  return allowed.includes(v) ? v : "draft";
}

function normalizeWorkClassification(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().normalize("NFC");
  return trimmed ? trimmed.slice(0, 120) : null;
}

async function isAllowedWorkClassification(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  value: string,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const normalized = normalizeWorkClassification(value);
  if (!normalized) {
    return { ok: false, status: 400, error: "workClassification is required" };
  }

  const { data, error } = await supabase
    .from("script_classification_options")
    .select("id")
    .eq("label_ar", normalized)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    console.error("[scripts] failed to validate work classification:", error.message);
    return { ok: false, status: 500, error: error.message };
  }

  if (!data) {
    return { ok: false, status: 400, error: "Invalid workClassification" };
  }

  return { ok: true };
}

function normalizeEpisodeCount(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value.trim(), 10)
        : Number.NaN;
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) return null;
  return parsed >= 0 ? parsed : null;
}

function normalizeReceivedAt(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

function normalizeScriptTitleComparable(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().normalize("NFC").replace(/\s+/g, " ").toLowerCase();
}

function normalizeUuidList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const unique = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (!trimmed) continue;
    if (!uuidRegex.test(trimmed)) continue;
    unique.add(trimmed);
  }
  return [...unique];
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

async function notifyAdminsOnClientSubmission(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  payload: {
    scriptId: string;
    scriptTitle: string;
    companyId: string;
    submittedByUserId: string;
  },
): Promise<void> {
  const [{ data: roles }, { data: adminUserRoles }, { data: company }, { data: profile }] = await Promise.all([
    supabase.from("roles").select("id, key").in("key", ["super_admin", "admin", "regulator"]),
    supabase.from("user_roles").select("user_id, role_id"),
    supabase.from("clients").select("id, name_ar, name_en").eq("id", payload.companyId).maybeSingle(),
    supabase.from("profiles").select("name").eq("user_id", payload.submittedByUserId).maybeSingle(),
  ]);

  const adminRoleIds = new Set((roles ?? []).map((r: { id: string }) => r.id));
  const adminUserIds = [...new Set((adminUserRoles ?? [])
    .filter((row: { role_id: string; user_id: string }) => adminRoleIds.has(row.role_id))
    .map((row: { user_id: string }) => row.user_id))];

  if (adminUserIds.length === 0) return;

  const companyName =
    ((company as { name_ar?: string | null; name_en?: string | null } | null)?.name_ar ??
      (company as { name_ar?: string | null; name_en?: string | null } | null)?.name_en ??
      "Client").trim() || "Client";
  const submitterName =
    ((profile as { name?: string | null } | null)?.name ?? "Client").trim() || "Client";

  const title = `Client submission: ${payload.scriptTitle}`;
  const body = `A new script was submitted by ${companyName} (${submitterName}).`;
  const metadata = {
    script_id: payload.scriptId,
    script_title: payload.scriptTitle,
    company_id: payload.companyId,
    company_name: companyName,
    submitted_by: payload.submittedByUserId,
    submitted_by_name: submitterName,
  };

  const notifications = adminUserIds.map((adminUserId) => ({
    user_id: adminUserId,
    type: "client_submission",
    title,
    body,
    metadata,
  }));

  const { error } = await supabase.from("notifications").insert(notifications);
  if (error) {
    console.error("[scripts] notify admins on client submission:", error.message);
  }
}

async function notifyAdminsOnClientScriptCanceled(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  payload: { scriptId: string; scriptTitle: string; companyId: string; canceledByUserId: string }
) {
  const { scriptId, scriptTitle, companyId, canceledByUserId } = payload;
  const { data: admins } = await supabase
    .from("profiles")
    .select("user_id")
    .in("role", ["Super Admin", "Admin"]);
  const adminUserIds = (admins ?? [])
    .map((row: { user_id?: string | null }) => row.user_id)
    .filter((value): value is string => Boolean(value));
  if (adminUserIds.length === 0) return;

  const notifications = adminUserIds.map((adminUserId) => ({
    user_id: adminUserId,
    type: "client_script_deleted",
    title: "Client canceled a script",
    message: `Client canceled script "${scriptTitle}".`,
    link: `/workspace/${scriptId}`,
    data: {
      scriptId,
      scriptTitle,
      companyId,
      canceledByUserId,
      eventType: "client_script_deleted",
    },
  }));

  const { error } = await supabase.from("notifications").insert(notifications);
  if (error) {
    console.error("[scripts] notify admins on client script cancel:", error.message);
  }
}

async function ensureCertificateGeneratedOnApproval(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  params: {
    scriptId: string;
    scriptTitle: string;
    companyId: string;
    approvedByUserId: string;
  },
): Promise<void> {
  const existing = await supabase
    .from("script_certificates")
    .select("id, certificate_number, certificate_data")
    .eq("script_id", params.scriptId)
    .maybeSingle();
  const certificateNumber = existing.data?.certificate_number
    ? String(existing.data.certificate_number)
    : await (async () => {
      const { data, error } = await supabase.rpc("generate_script_certificate_number");
      if (error || !data) throw new Error(error?.message || "Failed to generate certificate number");
      return String(data);
    })();

  const { data: company } = await supabase
    .from("clients")
    .select("id, name_ar, name_en, logo_url")
    .eq("id", params.companyId)
    .maybeSingle();

  const approvedAt = new Date().toISOString();
  const certificatePayload = {
    script_id: params.scriptId,
    script_title: params.scriptTitle,
    company_id: params.companyId,
    company_name_ar: (company as any)?.name_ar ?? null,
    company_name_en: (company as any)?.name_en ?? null,
    company_logo_url: (company as any)?.logo_url ?? null,
    approved_at: approvedAt,
    issued_at: approvedAt,
    certificate_number: certificateNumber,
    amount_paid: 0,
    currency: "SAR",
    generated_on_approval: true,
  };

  // Generate deterministic PDF on approval in backend and store once.
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  const page = pdfDoc.addPage([841.89, 595.28]); // A4 landscape
  const cairoRegular = getFontBytes("Cairo-Regular.ttf");
  const cairoBold = getFontBytes("Cairo-Bold.ttf");
  if (!cairoRegular || !cairoBold) {
    throw new Error("Arabic certificate fonts are missing");
  }
  const font = await pdfDoc.embedFont(cairoRegular);
  const boldFont = await pdfDoc.embedFont(cairoBold);
  const titleSize = 28;
  const textSize = 14;
  page.drawRectangle({
    x: 20,
    y: 20,
    width: 801.89,
    height: 555.28,
    borderColor: rgb(0.46, 0.2, 0.4),
    borderWidth: 2,
  });
  page.drawText("Script Approval Certificate", { x: 230, y: 520, size: titleSize, font: boldFont, color: rgb(0.12, 0.12, 0.2) });
  page.drawText(`Certificate Number: ${certificateNumber}`, { x: 60, y: 470, size: textSize, font });
  page.drawText(`Script Title: ${params.scriptTitle || "-"}`, { x: 60, y: 440, size: textSize, font });
  page.drawText(`Company: ${((company as any)?.name_en ?? (company as any)?.name_ar ?? "-").toString()}`, { x: 60, y: 410, size: textSize, font });
  page.drawText(`Script ID: ${params.scriptId}`, { x: 60, y: 380, size: 11, font, color: rgb(0.35, 0.35, 0.45) });
  page.drawText(`Approved At: ${approvedAt}`, { x: 60, y: 355, size: 11, font, color: rgb(0.35, 0.35, 0.45) });
  page.drawText("Generated automatically on admin approval.", { x: 60, y: 110, size: 11, font, color: rgb(0.35, 0.35, 0.45) });
  const pdfBytes = await pdfDoc.save();

  const storagePath = `${params.scriptId}/${certificateNumber}.pdf`;
  const { error: uploadError } = await supabase
    .storage
    .from(CERTIFICATE_FILES_BUCKET)
    .upload(storagePath, pdfBytes, {
      contentType: "application/pdf",
      upsert: true,
    });
  if (uploadError) throw new Error(`Failed to upload certificate PDF: ${uploadError.message}`);

  const mergedPayload = {
    ...(existing.data?.certificate_data && typeof existing.data.certificate_data === "object" ? existing.data.certificate_data : {}),
    ...certificatePayload,
    file_bucket: CERTIFICATE_FILES_BUCKET,
    file_path: storagePath,
    generated_at: approvedAt,
  };

  if (existing.data?.id) {
    const { error } = await supabase
      .from("script_certificates")
      .update({
        issued_by: params.approvedByUserId,
        certificate_status: "issued",
        issued_at: approvedAt,
        certificate_data: mergedPayload,
      })
      .eq("id", existing.data.id);
    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await supabase
    .from("script_certificates")
    .insert({
      script_id: params.scriptId,
      payment_id: null,
      owner_user_id: null,
      certificate_number: certificateNumber,
      issued_by: params.approvedByUserId,
      certificate_status: "issued",
      certificate_data: mergedPayload,
    });
  if (error) throw new Error(error.message);
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

  // GET /scripts
  // - Super Admin/Admin: see all
  // - Regulator-only: assigned scripts only
  // - Other users (including client portal users): own scripts + assigned scripts
  if (method === "GET" && rest === "") {
    let query = supabase
      .from("scripts")
      .select("id, client_id, company_id, title, type, work_classification, episode_count, received_at, status, synopsis, file_url, created_by, created_at, assignee_id, current_version_id, is_quick_analysis")
      .eq("is_quick_analysis", false)
      .order("created_at", { ascending: false });
    const seeAll = await isSuperAdminOrAdmin(supabase, uid);
    if (!seeAll) {
      const regulatorOnly = await isRegulatorOnly(supabase, uid);
      if (regulatorOnly) {
        query = query.eq("assignee_id", uid);
      } else {
        query = query.or(`created_by.eq.${uid},assignee_id.eq.${uid}`);
      }
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
      work_classification: normalizeWorkClassification(body.workClassification ?? body.work_classification),
      episode_count: normalizeEpisodeCount(body.episodeCount ?? body.episode_count),
      received_at: normalizeReceivedAt(body.receivedAt ?? body.received_at),
      file_url: null,
      created_by: uid,
      assignee_id: uid,
      is_quick_analysis: true,
    };
    const { data: row, error } = await supabase
      .from("scripts")
      .insert(insert)
      .select("id, client_id, company_id, title, type, work_classification, episode_count, received_at, status, synopsis, file_url, created_by, created_at, assignee_id, current_version_id, is_quick_analysis")
      .single();
    if (error || !row) {
      console.error(`[scripts] correlationId=${correlationId} quick insert error=`, error?.message);
      return json({ error: error?.message || "Failed to create quick analysis script" }, 500);
    }
    const quickRow = row as ScriptRow;
    logAuditCanonical(supabase, {
      event_type: "SCRIPT_CREATED_QUICK",
      actor_user_id: uid,
      target_type: "script",
      target_id: quickRow.id,
      target_label: quickRow.title,
      result_status: "success",
      correlation_id: correlationId,
      metadata: { is_quick_analysis: true },
    }).catch((e) => console.warn("[scripts] audit SCRIPT_CREATED_QUICK:", e));
    return json(toScriptFrontend(quickRow));
  }

  // GET /scripts/quick — quick-analysis history (own items only).
  if (method === "GET" && rest === "quick") {
    const { data: rows, error } = await supabase
      .from("scripts")
      .select("id, client_id, company_id, title, type, work_classification, episode_count, received_at, status, synopsis, file_url, created_by, created_at, assignee_id, current_version_id, is_quick_analysis")
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
      .select("page_number, content, content_html, start_offset_global, end_offset_global, display_font_stack, meta")
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
    const pr = (pageRows ?? []) as Array<{
      page_number: number;
      content: string;
      content_html?: string | null;
      start_offset_global?: number | null;
      end_offset_global?: number | null;
      display_font_stack?: string | null;
      meta?: Record<string, unknown> | null;
    }>;
    let derivedCursor = 0;
    const pages = pr.map((row, i) => {
      const len = (row.content ?? "").length;
      const g0 =
        row.start_offset_global != null && typeof row.start_offset_global === "number"
          ? row.start_offset_global
          : derivedCursor;
      const endEx =
        row.end_offset_global != null && typeof row.end_offset_global === "number"
          ? row.end_offset_global
          : g0 + len;
      derivedCursor = endEx + (i < pr.length - 1 ? PAGE_SEP_LEN : 0);
      return {
        pageNumber: row.page_number,
        content: row.content,
        contentHtml: row.content_html ?? null,
        startOffsetGlobal: g0,
        displayFontStack: row.display_font_stack ?? null,
        meta: row.meta ?? {},
      };
    });
    const { data: verMeta } = await supabase
      .from("script_versions")
      .select("source_file_type, source_file_path")
      .eq("id", versionId)
      .maybeSingle();
    const vm = verMeta as { source_file_type?: string | null; source_file_path?: string | null } | null;
    let sourcePdfSignedUrl: string | null = null;
    if (vm?.source_file_path && String(vm.source_file_type ?? "").toLowerCase().includes("pdf")) {
      const { data: su } = await supabase.storage.from("scripts").createSignedUrl(vm.source_file_path.trim(), 3600);
      sourcePdfSignedUrl = su?.signedUrl ?? null;
    }

    const response: Record<string, unknown> = {
      content,
      contentHash,
      contentHtml,
      sections,
      sourcePdfSignedUrl,
    };
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

  // GET /scripts/duplicates?versionId=...
  if (method === "GET" && rest === "duplicates") {
    const url = new URL(req.url);
    const versionId = url.searchParams.get("versionId")?.trim();
    if (!versionId) return json({ error: "versionId query param is required" }, 400);

    const { data: version, error: versionErr } = await supabase
      .from("script_versions")
      .select("id, script_id, extracted_text_hash")
      .eq("id", versionId)
      .maybeSingle();
    if (versionErr || !version) return json({ error: "Version not found" }, 404);

    const versionRow = version as { id: string; script_id: string; extracted_text_hash?: string | null };
    const { data: currentScript, error: currentScriptErr } = await supabase
      .from("scripts")
      .select("id, created_by, assignee_id")
      .eq("id", versionRow.script_id)
      .maybeSingle();
    if (currentScriptErr || !currentScript) return json({ error: "Script not found" }, 404);

    const currentScriptRow = currentScript as { id: string; created_by: string | null; assignee_id: string | null };
    const isAdmin = await isUserAdmin(supabase, uid);
    if (!isAdmin && currentScriptRow.created_by !== uid && currentScriptRow.assignee_id !== uid) {
      return json({ error: "Forbidden" }, 403);
    }

    const { data: textRow } = await supabase
      .from("script_text")
      .select("content_hash, content")
      .eq("version_id", versionId)
      .maybeSingle();
    const currentTextRow = textRow as { content_hash?: string | null; content?: string | null } | null;
    const contentHash = currentTextRow?.content_hash
      ?? versionRow.extracted_text_hash
      ?? null;
    const normalizedCurrentContent =
      currentTextRow?.content != null && String(currentTextRow.content).trim() !== ""
        ? normalizeText(String(currentTextRow.content))
        : null;

    if (!contentHash && !normalizedCurrentContent) {
      return json({
        exactMatch: false,
        contentHash: null,
        duplicateCount: 0,
        matches: [],
      });
    }

    const versionRowShape = (row: unknown) => row as {
      id: string;
      script_id: string;
      version_number: number;
      source_file_name: string | null;
      created_at: string;
    };
    const scriptRowShape = (row: unknown) => row as {
      id: string;
      title: string;
      status: string;
      client_id: string | null;
      company_id: string | null;
      current_version_id: string | null;
      created_by: string | null;
      assignee_id: string | null;
      is_quick_analysis?: boolean | null;
    };

    let exactDuplicateVersionIds: string[] = [];
    if (contentHash) {
      const { data: duplicateTextRows, error: duplicateTextErr } = await supabase
        .from("script_text")
        .select("version_id")
        .eq("content_hash", contentHash)
        .neq("version_id", versionId)
        .limit(50);
      if (duplicateTextErr) return json({ error: duplicateTextErr.message }, 500);
      exactDuplicateVersionIds = [...new Set((duplicateTextRows ?? []).map((row) => (row as { version_id?: string | null }).version_id).filter((value): value is string => typeof value === "string" && value.length > 0))];
    }

    let versionRows: Array<{
      id: string;
      script_id: string;
      version_number: number;
      source_file_name: string | null;
      created_at: string;
    }> = [];
    let visibleScripts: Array<{
      id: string;
      title: string;
      status: string;
      client_id: string | null;
      company_id: string | null;
      current_version_id: string | null;
      created_by: string | null;
      assignee_id: string | null;
    }> = [];

    if (exactDuplicateVersionIds.length > 0) {
      const { data: duplicateVersions, error: duplicateVersionsErr } = await supabase
        .from("script_versions")
        .select("id, script_id, version_number, source_file_name, created_at")
        .in("id", exactDuplicateVersionIds);
      if (duplicateVersionsErr) return json({ error: duplicateVersionsErr.message }, 500);

      versionRows = (duplicateVersions ?? []).map(versionRowShape);
      const duplicateScriptIds = [...new Set(versionRows.map((row) => row.script_id))];
      if (duplicateScriptIds.length > 0) {
        const { data: duplicateScripts, error: duplicateScriptsErr } = await supabase
          .from("scripts")
          .select("id, title, status, client_id, company_id, current_version_id, created_by, assignee_id, is_quick_analysis")
          .in("id", duplicateScriptIds);
        if (duplicateScriptsErr) return json({ error: duplicateScriptsErr.message }, 500);
        visibleScripts = (duplicateScripts ?? []).map(scriptRowShape).filter((row) => isAdmin || row.created_by === uid || row.assignee_id === uid);
      }
    }

    if (versionRows.length === 0 && normalizedCurrentContent) {
      let visibleScriptsQuery = supabase
        .from("scripts")
        .select("id, title, status, client_id, company_id, current_version_id, created_by, assignee_id, is_quick_analysis");
      if (!isAdmin) {
        visibleScriptsQuery = visibleScriptsQuery.or(`created_by.eq.${uid},assignee_id.eq.${uid}`);
      }
      const { data: accessibleScripts, error: accessibleScriptsErr } = await visibleScriptsQuery.limit(500);
      if (accessibleScriptsErr) return json({ error: accessibleScriptsErr.message }, 500);

      visibleScripts = (accessibleScripts ?? []).map(scriptRowShape).filter((row) => isAdmin || row.created_by === uid || row.assignee_id === uid);
      const accessibleScriptIds = [...new Set(visibleScripts.map((row) => row.id))];
      if (accessibleScriptIds.length === 0) {
        return json({
          exactMatch: false,
          contentHash,
          duplicateCount: 0,
          matches: [],
        });
      }

      const { data: candidateVersions, error: candidateVersionsErr } = await supabase
        .from("script_versions")
        .select("id, script_id, version_number, source_file_name, created_at")
        .in("script_id", accessibleScriptIds)
        .neq("id", versionId)
        .limit(500);
      if (candidateVersionsErr) return json({ error: candidateVersionsErr.message }, 500);

      const candidateVersionRows = (candidateVersions ?? []).map(versionRowShape);
      const candidateVersionIds = [...new Set(candidateVersionRows.map((row) => row.id))];
      if (candidateVersionIds.length > 0) {
        const { data: candidateTexts, error: candidateTextsErr } = await supabase
          .from("script_text")
          .select("version_id, content")
          .in("version_id", candidateVersionIds);
        if (candidateTextsErr) return json({ error: candidateTextsErr.message }, 500);

        const normalizedDuplicateIds = new Set(
          (candidateTexts ?? [])
            .map((row) => row as { version_id?: string | null; content?: string | null })
            .filter((row) => typeof row.version_id === "string" && typeof row.content === "string" && normalizeText(row.content) === normalizedCurrentContent)
            .map((row) => row.version_id as string),
        );
        versionRows = candidateVersionRows.filter((row) => normalizedDuplicateIds.has(row.id));
      }
    }

    if (versionRows.length === 0) {
      return json({
        exactMatch: false,
        contentHash,
        duplicateCount: 0,
        matches: [],
      });
    }

    const visibleScriptById = new Map(visibleScripts.map((row) => [row.id, row]));
    const visibleVersions = versionRows.filter((row) => visibleScriptById.has(row.script_id));
    if (visibleVersions.length === 0) {
      return json({
        exactMatch: true,
        contentHash,
        duplicateCount: versionRows.length,
        matches: [],
      });
    }

    const clientIds = [...new Set(visibleScripts.map((row) => row.company_id ?? row.client_id).filter((value): value is string => typeof value === "string" && value.length > 0))];
    const { data: clients } = clientIds.length > 0
      ? await supabase
          .from("clients")
          .select("id, name_ar, name_en")
          .in("id", clientIds)
      : { data: [], error: null };
    const clientNameById = new Map(
      ((clients ?? []) as Array<{ id: string; name_ar?: string | null; name_en?: string | null }>).map((row) => [
        row.id,
        row.name_ar?.trim() || row.name_en?.trim() || null,
      ]),
    );

    const versionIds = visibleVersions.map((row) => row.id);
    const { data: versionAuditRows } = versionIds.length > 0
      ? await supabase
          .from("audit_events")
          .select("target_id, actor_user_id, actor_name, occurred_at, created_at, event_type")
          .eq("target_type", "script_version")
          .eq("event_type", "SCRIPT_VERSION_CREATED")
          .in("target_id", versionIds)
      : { data: [], error: null };
    const versionAuditById = new Map<string, { actor_user_id: string | null; actor_name: string | null; occurred_at: string | null }>();
    for (const row of (versionAuditRows ?? []) as Array<{ target_id?: string | null; actor_user_id?: string | null; actor_name?: string | null; occurred_at?: string | null; created_at?: string | null }>) {
      if (!row.target_id) continue;
      const timestamp = row.occurred_at ?? row.created_at ?? null;
      const existing = versionAuditById.get(row.target_id);
      const nextTime = timestamp ? new Date(timestamp).getTime() : 0;
      const existingTime = existing?.occurred_at ? new Date(existing.occurred_at).getTime() : 0;
      if (!existing || nextTime > existingTime) {
        versionAuditById.set(row.target_id, {
          actor_user_id: row.actor_user_id ?? null,
          actor_name: row.actor_name?.trim() || null,
          occurred_at: timestamp,
        });
      }
    }

    const profileLookupIds = [...new Set([
      ...visibleScripts.map((row) => row.created_by),
      ...Array.from(versionAuditById.values()).map((row) => row.actor_user_id),
    ].filter((value): value is string => typeof value === "string" && value.length > 0))];
    const { data: creatorProfiles } = profileLookupIds.length > 0
      ? await supabase
          .from("profiles")
          .select("user_id, name")
          .in("user_id", profileLookupIds)
      : { data: [], error: null };
    const creatorNameById = new Map(
      ((creatorProfiles ?? []) as Array<{ user_id: string; name?: string | null }>).map((row) => [row.user_id, row.name?.trim() || null]),
    );

    const { data: jobs } = await supabase
      .from("analysis_jobs")
      .select("script_id, completed_at, created_by, status")
      .in("script_id", [...visibleScriptById.keys()])
      .in("status", ["completed"]);
    const latestJobByScript = new Map<string, { completed_at: string | null; created_by: string | null }>();
    for (const row of (jobs ?? []) as Array<{ script_id: string; completed_at: string | null; created_by: string | null }>) {
      const existing = latestJobByScript.get(row.script_id);
      const nextTime = row.completed_at ? new Date(row.completed_at).getTime() : 0;
      const existingTime = existing?.completed_at ? new Date(existing.completed_at).getTime() : 0;
      if (!existing || nextTime > existingTime) {
        latestJobByScript.set(row.script_id, { completed_at: row.completed_at, created_by: row.created_by });
      }
    }

    const reviewerIds = [...new Set([...latestJobByScript.values()].map((row) => row.created_by).filter((value): value is string => typeof value === "string" && value.length > 0))];
    const { data: reviewerProfiles } = reviewerIds.length > 0
      ? await supabase
          .from("profiles")
          .select("user_id, name")
          .in("user_id", reviewerIds)
      : { data: [], error: null };
    const reviewerNameById = new Map(
      ((reviewerProfiles ?? []) as Array<{ user_id: string; name?: string | null }>).map((row) => [row.user_id, row.name?.trim() || null]),
    );

    const matches: DuplicateMatchRow[] = visibleVersions
      .map((row) => {
        const scriptRow = visibleScriptById.get(row.script_id)!;
        const latestJob = latestJobByScript.get(row.script_id);
        const companyId = scriptRow.company_id ?? scriptRow.client_id ?? null;
        const versionAudit = versionAuditById.get(row.id);
        const importedByName =
          versionAudit?.actor_name
          ?? (versionAudit?.actor_user_id ? creatorNameById.get(versionAudit.actor_user_id) ?? null : null)
          ?? (scriptRow.created_by ? creatorNameById.get(scriptRow.created_by) ?? null : null);
        const isQuickAnalysis = scriptRow.is_quick_analysis === true;
        return {
          scriptId: row.script_id,
          versionId: row.id,
          versionNumber: row.version_number,
          scriptTitle: scriptRow.title,
          scriptStatus: scriptRow.status,
          sourceFileName: row.source_file_name ?? null,
          createdAt: row.created_at,
          companyName: companyId ? clientNameById.get(companyId) ?? null : null,
          importedByName,
          contextType: isQuickAnalysis ? "quick_analysis" : "client",
          contextLabel: isQuickAnalysis
            ? "Quick Analysis"
            : (companyId ? clientNameById.get(companyId) ?? null : null),
          sameScript: row.script_id === versionRow.script_id,
          isCurrentVersion: scriptRow.current_version_id === row.id,
          analyzedBefore: latestJob?.completed_at != null,
          latestAnalysisAt: latestJob?.completed_at ?? null,
          latestReviewerName: latestJob?.created_by ? reviewerNameById.get(latestJob.created_by) ?? null : null,
        };
      })
      .sort((a, b) => {
        if (a.sameScript !== b.sameScript) return a.sameScript ? -1 : 1;
        if (a.analyzedBefore !== b.analyzedBefore) return a.analyzedBefore ? -1 : 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

    return json({
      exactMatch: matches.length > 0,
      contentHash,
      duplicateCount: matches.length,
      matches,
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // WILDCARD ROUTES (come after specific string routes)
  // ═══════════════════════════════════════════════════════════════

  // GET /scripts/:id — single script (for workspace when not in list)
  if (method === "GET" && rest && !rest.includes("/")) {
    const scriptId = rest.trim();
    const { data: row, error } = await supabase
      .from("scripts")
      .select("id, client_id, company_id, title, type, work_classification, episode_count, received_at, status, synopsis, file_url, created_by, created_at, assignee_id, current_version_id, is_quick_analysis")
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
    const workClassification = normalizeWorkClassification(body.workClassification ?? body.work_classification);
    if (companyId == null || typeof companyId !== "string" || !companyId.trim()) {
      return json({ error: "companyId is required" }, 400);
    }
    if (title == null || typeof title !== "string" || !title.trim()) {
      return json({ error: "title is required" }, 400);
    }
    if (type == null || typeof type !== "string" || !String(type).trim()) {
      return json({ error: "type is required" }, 400);
    }
    if (!workClassification) {
      return json({ error: "workClassification is required" }, 400);
    }
    const workClassificationValidation = await isAllowedWorkClassification(supabase, workClassification);
    if (!workClassificationValidation.ok) {
      return json({ error: workClassificationValidation.error }, workClassificationValidation.status);
    }
    if (status == null || typeof status !== "string" || !String(status).trim()) {
      return json({ error: "status is required" }, 400);
    }
    const clientId = companyId.trim();
    const normalizedTitle = String(title).trim().normalize("NFC");
    const comparableTitle = normalizeScriptTitleComparable(normalizedTitle);
    const { data: duplicateTitleRows, error: duplicateTitleErr } = await supabase
      .from("scripts")
      .select("id, title, created_at, client_id, company_id, is_quick_analysis")
      .ilike("title", normalizedTitle)
      .limit(20);
    if (duplicateTitleErr) return json({ error: duplicateTitleErr.message }, 500);
    const duplicateTitleMatches = ((duplicateTitleRows ?? []) as Array<{
      id: string;
      title: string;
      created_at: string;
      client_id?: string | null;
      company_id?: string | null;
      is_quick_analysis?: boolean | null;
    }>).filter((row) => normalizeScriptTitleComparable(row.title) === comparableTitle);
    if (duplicateTitleMatches.length > 0) {
      const duplicateClientIds = [...new Set(duplicateTitleMatches.map((row) => row.company_id ?? row.client_id).filter((value): value is string => typeof value === "string" && value.length > 0))];
      const { data: duplicateClients } = duplicateClientIds.length > 0
        ? await supabase.from("clients").select("id, name_ar, name_en").in("id", duplicateClientIds)
        : { data: [], error: null };
      const duplicateClientNameById = new Map(
        ((duplicateClients ?? []) as Array<{ id: string; name_ar?: string | null; name_en?: string | null }>).map((row) => [
          row.id,
          row.name_ar?.trim() || row.name_en?.trim() || null,
        ]),
      );
      const matches = duplicateTitleMatches.map((row) => {
        const duplicateCompanyId = row.company_id ?? row.client_id ?? null;
        return {
          scriptId: row.id,
          scriptTitle: row.title,
          createdAt: row.created_at,
          contextType: row.is_quick_analysis === true ? "quick_analysis" : "client",
          contextLabel: row.is_quick_analysis === true
            ? "Quick Analysis"
            : (duplicateCompanyId ? duplicateClientNameById.get(duplicateCompanyId) ?? null : null),
        };
      });
      return json({ error: "title already exists", matches }, 409);
    }
    const insert = {
      client_id: clientId,
      company_id: clientId,
      title: normalizedTitle,
      type: normalizeType(type),
      work_classification: workClassification,
      episode_count: normalizeEpisodeCount(body.episodeCount ?? body.episode_count),
      received_at: normalizeReceivedAt(body.receivedAt ?? body.received_at),
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
      .select("id, client_id, company_id, title, type, work_classification, episode_count, received_at, status, synopsis, file_url, created_by, created_at, assignee_id, current_version_id, is_quick_analysis")
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
    const createdByClient = await isClientUser(supabase, uid);
    if (createdByClient) {
      await notifyAdminsOnClientSubmission(supabase, {
        scriptId: created.id,
        scriptTitle: created.title,
        companyId: created.company_id ?? created.client_id,
        submittedByUserId: uid,
      });
    }
    logAuditCanonical(supabase, {
      event_type: "SCRIPT_CREATED",
      actor_user_id: uid,
      target_type: "script",
      target_id: created.id,
      target_label: created.title,
      result_status: "success",
      correlation_id: correlationId,
      metadata: { company_id: created.company_id ?? created.client_id, type: created.type },
    }).catch((e) => console.warn("[scripts] audit SCRIPT_CREATED:", e));
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
    const rawSourceFilePath = typeof body.source_file_path === "string" ? body.source_file_path.trim() || null : null;
    const rawSourceFileUrl = typeof body.source_file_url === "string" ? body.source_file_url.trim() || null : null;
    const pathOrUrl = rawSourceFilePath ?? rawSourceFileUrl;
    const rawSourceFileName = typeof body.source_file_name === "string" ? body.source_file_name.trim() || null : null;
    const sourceFileNameNfc = rawSourceFileName ? rawSourceFileName.normalize("NFC") : null;
    const sourceFileType = typeof body.source_file_type === "string" ? body.source_file_type.trim() || null : null;
    const extractionStatus = typeof body.extraction_status === "string" ? body.extraction_status.trim() || "pending" : "pending";
    const isManualTextVersion =
      !pathOrUrl &&
      (!sourceFileType ||
        sourceFileType === "text/plain" ||
        sourceFileType === "text/html" ||
        sourceFileType === "text/markdown" ||
        sourceFileType === "application/x-raawi-editor");
    const clientCanCreateManualVersion = !isQuick && s.created_by === uid && isManualTextVersion;

    if (!canAdminReplace && !canAccessQuick && !clientCanCreateManualVersion) {
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
    const versionInsert = {
      script_id: sid,
      version_number: nextVersion,
      source_file_name: sourceFileNameNfc,
      source_file_type: sourceFileType,
      source_file_size: typeof body.source_file_size === "number" ? body.source_file_size : null,
      source_file_path: pathOrUrl,
      source_file_url: pathOrUrl,
      extraction_status: extractionStatus,
    };
    const { data: version, error: versionErr } = await supabase
      .from("script_versions")
      .insert(versionInsert)
      .select("id, script_id, version_number, source_file_name, source_file_type, source_file_size, source_file_path, source_file_url, extracted_text, extraction_status, extraction_progress, extraction_error, created_at")
      .single();
    if (versionErr || !version) {
      console.error(`[scripts] correlationId=${correlationId} version insert error=`, versionErr?.message);
      return json({ error: versionErr?.message || "Failed to create version" }, 500);
    }
    await supabase.from("scripts").update({ current_version_id: version.id }).eq("id", sid);
    const vRow = version as ScriptVersionRow;
    logAuditCanonical(supabase, {
      event_type: "SCRIPT_VERSION_CREATED",
      actor_user_id: uid,
      target_type: "script_version",
      target_id: vRow.id,
      target_label: `${sid} v${vRow.version_number}`,
      result_status: "success",
      correlation_id: correlationId,
      metadata: { script_id: sid, source_file_name: vRow.source_file_name },
    }).catch((e) => console.warn("[scripts] audit SCRIPT_VERSION_CREATED:", e));
    return json(toVersionFrontend(vRow));
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
    const clientComment = typeof body.clientComment === 'string' ? body.clientComment.trim().slice(0, 5000) : '';
    const shareReportsToClient = body.shareReportsToClient === true;
    const requestedShareReportIds = normalizeUuidList(body.shareReportIds);

    // Fetch script
    const { data: script, error: findErr } = await supabase
      .from("scripts")
      .select("id, title, status, created_by, assignee_id, company_id, client_id")
      .eq("id", scriptId)
      .maybeSingle();

    if (findErr || !script) return json({ error: "Script not found" }, 404);

    const currentStatus = (script as any).status || 'draft';
    const newStatus = decision === 'approve' ? 'approved' : 'rejected';
    let sharedReportIds: string[] = [];

    if (decision === 'reject' && shareReportsToClient) {
      const candidateIds = [
        ...new Set<string>([
          ...requestedShareReportIds,
          ...(relatedReportId ? [relatedReportId] : []),
        ]),
      ];

      if (candidateIds.length > 0) {
        const { data: reportsForScript } = await supabase
          .from("analysis_reports")
          .select("id")
          .eq("script_id", scriptId)
          .in("id", candidateIds);
        const allowedSet = new Set((reportsForScript ?? []).map((row: { id: string }) => row.id));
        sharedReportIds = candidateIds.filter((id) => allowedSet.has(id));
      } else {
        const { data: latestReport } = await supabase
          .from("analysis_reports")
          .select("id")
          .eq("script_id", scriptId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (latestReport?.id) sharedReportIds = [latestReport.id as string];
      }
    }

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
      p_metadata: {
        decision,
        correlationId,
        client_comment: clientComment || null,
        share_reports_to_client: decision === 'reject' ? shareReportsToClient : false,
        shared_report_ids: decision === 'reject' ? sharedReportIds : [],
      }
    });

    if (logErr) {
      console.error(`[scripts] correlationId=${correlationId} audit log error=`, logErr.message);
      // Continue anyway - status was updated successfully
    }

    if (decision === "approve") {
      const ownerCompanyId = ((script as any).company_id ?? (script as any).client_id ?? "").toString();
      if (ownerCompanyId) {
        try {
          await ensureCertificateGeneratedOnApproval(supabase, {
            scriptId,
            scriptTitle: (script as any).title,
            companyId: ownerCompanyId,
            approvedByUserId: uid,
          });
        } catch (certificateError) {
          console.error(
            `[scripts] correlationId=${correlationId} approval-time certificate generation error=`,
            certificateError instanceof Error ? certificateError.message : certificateError,
          );
        }
      }
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
      .select("id, client_id, company_id, title, type, work_classification, episode_count, received_at, status, synopsis, file_url, created_by, created_at, assignee_id, current_version_id")
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
    if (body.workClassification !== undefined || body.work_classification !== undefined) {
      updates.work_classification = normalizeWorkClassification(body.workClassification ?? body.work_classification);
      if (updates.work_classification) {
        const workClassificationValidation = await isAllowedWorkClassification(supabase, updates.work_classification);
        if (!workClassificationValidation.ok) {
          return json({ error: workClassificationValidation.error }, workClassificationValidation.status);
        }
      }
    }
    if (body.episodeCount !== undefined || body.episode_count !== undefined) {
      updates.episode_count = normalizeEpisodeCount(body.episodeCount ?? body.episode_count);
    }
    if (body.receivedAt !== undefined || body.received_at !== undefined) {
      updates.received_at = normalizeReceivedAt(body.receivedAt ?? body.received_at);
    }
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
      .select("id, client_id, company_id, title, type, work_classification, episode_count, received_at, status, synopsis, file_url, created_by, created_at, assignee_id, current_version_id")
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
      .select("id, created_by, title, company_id, client_id, status")
      .eq("id", scriptId)
      .maybeSingle();
    if (findErr || !script) return json({ error: "Script not found" }, 404);
    if ((script as any).created_by !== uid) return json({ error: "Forbidden" }, 403);

    const currentStatus = String((script as any).status ?? "").toLowerCase();
    if (currentStatus === "canceled" || currentStatus === "cancelled") {
      return json({ ok: true, alreadyCanceled: true });
    }

    const { data: updated, error: updateErr } = await supabase
      .from("scripts")
      .update({ status: "canceled" })
      .eq("id", scriptId)
      .select("id, client_id, company_id, title, type, work_classification, episode_count, received_at, status, synopsis, file_url, created_by, created_at, assignee_id, current_version_id, is_quick_analysis")
      .single();
    if (updateErr || !updated) {
      console.error(`[scripts] correlationId=${correlationId} soft-cancel error=`, updateErr?.message);
      return json({ error: updateErr?.message || "Failed to cancel script" }, 500);
    }

    const scriptRow = updated as ScriptRow;
    const createdByClient = await isClientUser(supabase, uid);
    if (createdByClient) {
      await notifyAdminsOnClientScriptCanceled(supabase, {
        scriptId: scriptRow.id,
        scriptTitle: scriptRow.title,
        companyId: scriptRow.company_id ?? scriptRow.client_id,
        canceledByUserId: uid,
      });
    }
    return json({ ok: true, script: toScriptFrontend(scriptRow) });
  }

  // Stubs: POST /scripts/upload, POST /scripts/extract (frontend uses top-level /upload, /extract)
  if (method === "POST" && (rest.startsWith("upload") || rest.startsWith("extract"))) {
    return json({ error: "Not implemented" }, 501);
  }

  return json({ error: "Not Found" }, 404);
});
