/**
 * GET /tasks — List analysis jobs for the current user (for progress UI).
 * Query: scriptId?, versionId?, limit? (default 20, max 100)
 * Returns: [{ id, scriptId, versionId, status, progressTotal, progressDone, progressPercent, createdAt, startedAt, completedAt, errorMessage }, ...]
 *
 * POST /tasks — Queue analysis (creates analysis_jobs + analysis_chunks).
 * Body: { versionId: string, forceFresh?: boolean }
 * Returns: { jobId: string }
 */
// @ts-ignore
declare const Deno: any;

import { jsonResponse, optionsResponse } from "../_shared/cors.ts";
import { requireAuth } from "../_shared/auth.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import {
  getCorrelationId,
  sha256Hash,
  normalizeText,
  chunkText,
  chunkTextByScriptPages,
  htmlToText,
  stripInvalidUnicodeForDb,
  sliceTextPreview,
} from "../_shared/utils.ts";
import { saveScriptEditorContent } from "../_shared/scriptEditor.ts";
import { logAuditCanonical } from "../_shared/audit.ts";
import { isUserAdmin } from "../_shared/roleCheck.ts";
import { offsetRangeToPageMinMax, type ScriptPageRow } from "../_shared/offsetToPage.ts";


import {
  DEFAULT_DETERMINISTIC_CONFIG,
  PROMPT_VERSIONS,
  ROUTER_SYSTEM_MSG,
  JUDGE_SYSTEM_MSG
} from "../_shared/aiConstants.ts";

type JobRow = {
  id: string;
  script_id: string;
  version_id: string;
  status: string;
  progress_total: number;
  progress_done: number;
  progress_percent: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  pause_requested?: boolean | null;
  paused_at?: string | null;
  partial_finalize_requested?: boolean | null;
  partial_finalize_requested_at?: string | null;
  config_snapshot?: {
    pipeline_version?: "v1" | "v2";
    analysis_profile?: "quality" | "balanced" | "turbo";
    analysis_engine?: "v2" | "hybrid";
    hybrid_mode?: "off" | "shadow" | "enforce";
    manual_review_context?: {
      carried_forward_count?: number;
      source_job_ids?: string[];
      items?: Array<{
        article_id: number;
        atom_id?: string | null;
        severity: string;
        evidence_snippet: string;
        manual_comment?: string | null;
        start_offset_global?: number | null;
        end_offset_global?: number | null;
        page_number?: number | null;
      }>;
    };
  } | null;
  script_content_hash?: string | null;
  canonical_length?: number | null;
};

const ANALYSIS_PROFILE_PRESETS = {
  quality: {
    analysisProfile: "quality" as const,
    mergeStrategy: "every_occurrence" as const,
    maxRouterCandidates: 10,
    deepAuditorEnabled: true,
    analysisEngine: "hybrid" as const,
    hybridMode: "enforce" as const,
  },
  balanced: {
    analysisProfile: "balanced" as const,
    mergeStrategy: "same_location_only" as const,
    maxRouterCandidates: 8,
    deepAuditorEnabled: true,
    analysisEngine: "hybrid" as const,
    hybridMode: "shadow" as const,
  },
  turbo: {
    analysisProfile: "turbo" as const,
    mergeStrategy: "same_location_only" as const,
    maxRouterCandidates: 6,
    deepAuditorEnabled: false,
    analysisEngine: "v2" as const,
    hybridMode: "off" as const,
  },
};

type ManualReviewSnapshotItem = {
  article_id: number;
  atom_id?: string | null;
  severity: string;
  evidence_snippet: string;
  manual_comment?: string | null;
  review_status?: string | null;
  review_reason?: string | null;
  start_offset_global?: number | null;
  end_offset_global?: number | null;
  start_offset_page?: number | null;
  end_offset_page?: number | null;
  page_number?: number | null;
  job_id?: string | null;
  created_by?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  reviewed_role?: string | null;
};

async function loadManualReviewSnapshot(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  scriptId: string,
  versionId: string,
): Promise<{
  carriedForwardCount: number;
  sourceJobIds: string[];
  items: ManualReviewSnapshotItem[];
}> {
  const { data, error } = await supabase
    .from("analysis_findings")
    .select(
      "job_id, article_id, atom_id, severity, evidence_snippet, manual_comment, review_status, review_reason, reviewed_by, reviewed_at, reviewed_role, start_offset_global, end_offset_global, start_offset_page, end_offset_page, page_number, created_at, created_by"
    )
    .eq("script_id", scriptId)
    .eq("version_id", versionId)
    .eq("source", "manual")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error || !data) {
    console.warn("[tasks] manual review snapshot skipped:", error?.message ?? "No data");
    return { carriedForwardCount: 0, sourceJobIds: [], items: [] };
  }

  const byKey = new Map<string, ManualReviewSnapshotItem>();
  const sourceJobIds = new Set<string>();
  for (const row of data as Array<Record<string, unknown>>) {
    const articleId = Number(row.article_id ?? 0);
    if (!Number.isFinite(articleId) || articleId <= 0) continue;
    const atomId = typeof row.atom_id === "string" && row.atom_id.trim() ? row.atom_id.trim() : null;
    const severity = typeof row.severity === "string" && row.severity.trim() ? row.severity.trim().toLowerCase() : "medium";
    const evidenceSnippet = typeof row.evidence_snippet === "string" ? row.evidence_snippet.trim() : "";
    const manualComment = typeof row.manual_comment === "string" && row.manual_comment.trim() ? row.manual_comment.trim() : null;
    const startOffsetGlobal =
      typeof row.start_offset_global === "number" ? row.start_offset_global : row.start_offset_global == null ? null : Number(row.start_offset_global);
    const endOffsetGlobal =
      typeof row.end_offset_global === "number" ? row.end_offset_global : row.end_offset_global == null ? null : Number(row.end_offset_global);
    const pageNumber =
      typeof row.page_number === "number" ? row.page_number : row.page_number == null ? null : Number(row.page_number);
    const startOffsetPage =
      typeof row.start_offset_page === "number" ? row.start_offset_page : row.start_offset_page == null ? null : Number(row.start_offset_page);
    const endOffsetPage =
      typeof row.end_offset_page === "number" ? row.end_offset_page : row.end_offset_page == null ? null : Number(row.end_offset_page);
    const jobId = typeof row.job_id === "string" && row.job_id.trim() ? row.job_id.trim() : null;
    const createdBy = typeof row.created_by === "string" && row.created_by.trim() ? row.created_by.trim() : null;
    const reviewStatus = typeof row.review_status === "string" && row.review_status.trim() ? row.review_status.trim() : "violation";
    const reviewReason = typeof row.review_reason === "string" && row.review_reason.trim() ? row.review_reason.trim() : null;
    const reviewedBy = typeof row.reviewed_by === "string" && row.reviewed_by.trim() ? row.reviewed_by.trim() : null;
    const reviewedAt = typeof row.reviewed_at === "string" && row.reviewed_at.trim() ? row.reviewed_at.trim() : null;
    const reviewedRole = typeof row.reviewed_role === "string" && row.reviewed_role.trim() ? row.reviewed_role.trim() : null;
    if (jobId) sourceJobIds.add(jobId);
    const key = [
      articleId,
      atomId ?? "",
      severity,
      reviewStatus,
      reviewReason ?? "",
      startOffsetGlobal ?? "",
      endOffsetGlobal ?? "",
      evidenceSnippet,
      manualComment ?? "",
    ].join("|");
    if (!byKey.has(key)) {
      byKey.set(key, {
        article_id: articleId,
        atom_id: atomId,
        severity,
        evidence_snippet: evidenceSnippet,
        manual_comment: manualComment,
        review_status: reviewStatus,
        review_reason: reviewReason,
        start_offset_global: Number.isFinite(startOffsetGlobal as number) ? startOffsetGlobal : null,
        end_offset_global: Number.isFinite(endOffsetGlobal as number) ? endOffsetGlobal : null,
        start_offset_page: Number.isFinite(startOffsetPage as number) ? startOffsetPage : null,
        end_offset_page: Number.isFinite(endOffsetPage as number) ? endOffsetPage : null,
        page_number: Number.isFinite(pageNumber as number) ? pageNumber : null,
        job_id: jobId,
        created_by: createdBy,
        reviewed_by: reviewedBy,
        reviewed_at: reviewedAt,
        reviewed_role: reviewedRole,
      });
    }
  }

  const items = [...byKey.values()].slice(0, 50);
  return {
    carriedForwardCount: items.length,
    sourceJobIds: [...sourceJobIds].slice(0, 20),
    items,
  };
}

async function cloneManualReviewFindingsToJob(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  jobId: string,
  scriptId: string,
  versionId: string,
  items: ManualReviewSnapshotItem[],
): Promise<number> {
  if (!items.length) return 0;

  const payload = items.map((item) => ({
    job_id: jobId,
    script_id: scriptId,
    version_id: versionId,
    source: "manual",
    created_by: item.created_by ?? null,
    article_id: item.article_id,
    atom_id: item.atom_id ?? null,
    severity: item.severity,
    confidence: 1,
    title_ar: "ملاحظة يدوية",
    description_ar: item.manual_comment || item.evidence_snippet || "—",
    evidence_snippet: item.evidence_snippet || item.manual_comment || "—",
    start_offset_global: item.start_offset_global ?? null,
    end_offset_global: item.end_offset_global ?? null,
    start_offset_page: item.start_offset_page ?? null,
    end_offset_page: item.end_offset_page ?? null,
    page_number: item.page_number ?? null,
    evidence_hash: `manual-carry-${crypto.randomUUID()}`,
    manual_comment: item.manual_comment ?? null,
    review_status: item.review_status ?? "violation",
    review_reason: item.review_reason ?? null,
    reviewed_by: item.reviewed_by ?? null,
    reviewed_at: item.reviewed_at ?? null,
    reviewed_role: item.reviewed_role ?? null,
  }));

  const { data, error } = await supabase
    .from("analysis_findings")
    .insert(payload)
    .select("id");

  if (error) {
    console.error("[tasks] failed to clone manual review findings into new job:", error.message);
    return 0;
  }

  return (data ?? []).length;
}

function toCamel(job: JobRow) {
  const normalizedStatus = String(job.status ?? "").toLowerCase();
  const isTerminal = ["completed", "failed", "done", "succeeded", "cancelled", "canceled"].includes(normalizedStatus);
  const isStopping = Boolean(job.partial_finalize_requested) && !isTerminal;
  const isPaused = !isStopping && Boolean(job.pause_requested) && !isTerminal;
  return {
    id: job.id,
    scriptId: job.script_id,
    versionId: job.version_id,
    status: isStopping ? "stopping" : (isPaused ? "paused" : job.status),
    analysisMode: job.config_snapshot?.analysis_profile ?? "balanced",
    pipelineVersion: job.config_snapshot?.pipeline_version ?? "v1",
    analysisEngine: job.config_snapshot?.analysis_engine ?? null,
    hybridMode: job.config_snapshot?.hybrid_mode ?? null,
    progressTotal: job.progress_total,
    progressDone: job.progress_done,
    progressPercent: job.progress_percent,
    createdAt: job.created_at,
    startedAt: job.started_at,
    completedAt: job.completed_at,
    pausedAt: isPaused ? (job.paused_at ?? null) : null,
    partialFinalizeRequestedAt: job.partial_finalize_requested_at ?? null,
    isPartialReport: Boolean(job.partial_finalize_requested) && isTerminal,
    manualReviewContextCount: job.config_snapshot?.manual_review_context?.carried_forward_count ?? 0,
    errorMessage: job.error_message,
    scriptContentHash: job.script_content_hash ?? null,
    canonicalLength: job.canonical_length ?? null,
  };
}

async function clearPendingChunksForPartialStop(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  jobId: string,
): Promise<void> {
  const message = "Cleared after partial report stop request";
  const { error } = await supabase
    .from("analysis_chunks")
    .update({
      status: "failed",
      processing_phase: null,
      judging_started_at: null,
      passes_completed: 0,
      last_error: message,
    })
    .eq("job_id", jobId)
    .eq("status", "pending");

  if (error) {
    console.warn("[tasks] failed to clear pending chunks for partial stop:", {
      jobId,
      error: error.message,
    });
  }
}

async function clearChunksForHardCancel(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  jobId: string,
): Promise<void> {
  const message = "Cancelled by user";
  const { error } = await supabase
    .from("analysis_chunks")
    .update({
      status: "failed",
      processing_phase: null,
      judging_started_at: null,
      passes_completed: 0,
      last_error: message,
    })
    .eq("job_id", jobId)
    .in("status", ["pending", "judging"]);

  if (error) {
    console.warn("[tasks] failed to clear chunks for hard cancel:", {
      jobId,
      error: error.message,
    });
  }
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? undefined;
  const json = (body: unknown, status = 200) => jsonResponse(body, status, { origin });
  if (req.method === "OPTIONS") return optionsResponse(req);

  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const correlationId = getCorrelationId(req);
  const uid = auth.userId;
  const supabase = createSupabaseAdmin();

  // Admin bypass check (Robust DB check)
  const isAdmin = await isUserAdmin(supabase, uid);

  if (req.method === "GET") {
    const url = new URL(req.url);
    const jobId = url.searchParams.get("jobId")?.trim() || undefined;
    const chunks = url.searchParams.get("chunks") === "true";
    const scriptId = url.searchParams.get("scriptId")?.trim() || undefined;
    const versionId = url.searchParams.get("versionId")?.trim() || undefined;
    const limitRaw = url.searchParams.get("limit");
    let limit = 20;
    if (limitRaw != null) {
      const n = parseInt(limitRaw, 10);
      if (!Number.isNaN(n)) limit = Math.min(100, Math.max(1, n));
    }



    // --- GET /tasks?jobId=...&chunks=true  → per-chunk status (debug) ---
    if (jobId && chunks) {
      // Admin can inspect any job chunks; non-admin must own the job.
      const { data: ownerCheck, error: ownerErr } = await supabase
        .from("analysis_jobs")
        .select("id, created_by")
        .eq("id", jobId)
        .maybeSingle();
      if (ownerErr || !ownerCheck) return json({ error: "Job not found or access denied" }, 404);
      if (!isAdmin && (ownerCheck as any).created_by !== uid) {
        return json({ error: "Job not found or access denied" }, 404);
      }
      const { data: chunkRows, error: chunkErr } = await supabase
        .from("analysis_chunks")
        .select(
          "chunk_index, status, last_error, page_number_min, page_number_max, processing_phase, passes_completed, passes_total, text_preview, judging_started_at"
        )
        .eq("job_id", jobId)
        .order("chunk_index", { ascending: true });
      if (chunkErr) {
        console.error(`[tasks] GET chunks correlationId=${correlationId} error=`, chunkErr.message);
        return json({ error: chunkErr.message }, 500);
      }
      return json(
        (chunkRows ?? []).map((c: any) => ({
          chunkIndex: c.chunk_index,
          status: c.status,
          lastError: c.last_error ?? null,
          pageNumberMin: c.page_number_min ?? null,
          pageNumberMax: c.page_number_max ?? null,
          processingPhase: c.processing_phase ?? null,
          passesCompleted: c.passes_completed ?? null,
          passesTotal: c.passes_total ?? null,
          judgingStartedAt: c.judging_started_at ?? null,
          textPreview:
            c.status === "judging" && c.text_preview != null && String(c.text_preview).trim() !== ""
              ? String(c.text_preview)
              : null,
        }))
      );
    }

    // --- GET /tasks?jobId=...  → single job lookup ---
    if (jobId) {
      const { data: row, error: err } = await supabase
        .from("analysis_jobs")
        .select("id, script_id, version_id, created_by, status, progress_total, progress_done, progress_percent, created_at, started_at, completed_at, paused_at, pause_requested, partial_finalize_requested, partial_finalize_requested_at, config_snapshot, error_message, script_content_hash")
        .eq("id", jobId)
        .maybeSingle();
      if (err) {
        console.error(`[tasks] GET jobId=${jobId} correlationId=${correlationId} error=`, err.message);
        return json({ error: err.message }, 500);
      }
      if (!row) return json({ error: "Job not found" }, 404);
      if (!isAdmin && (row as any).created_by !== uid) return json({ error: "Job not found" }, 404);
      return json(toCamel(row as JobRow));
    }

    // --- GET /tasks  → list jobs ---
    // --- GET /tasks  → list jobs AND assigned scripts ---

    // 1. Fetch Analysis Jobs
    let jobQuery = supabase
      .from("analysis_jobs")
      .select("id, script_id, version_id, status, progress_total, progress_done, progress_percent, created_at, started_at, completed_at, paused_at, pause_requested, partial_finalize_requested, partial_finalize_requested_at, config_snapshot, error_message")
      .order("created_at", { ascending: false })
      .limit(limit);

    // If NOT admin, filter by created_by
    // We check role from auth.role or metadata. 
    // Ideally we'd use a robust check, but for now let's assume if they have 'Admin' or 'Super Admin' role in metadata
    // The 'auth' object from requireAuth has 'role' if it's in JWT, but usually it's 'authenticated'. 
    // Let's check the user's role from the DB or metadata if possible.
    // For simpler logic here: we can fetch the user's role.

    // FAST CHECK: check if user is admin
    // Admin check is handled at top level


    if (!isAdmin) {
      jobQuery = jobQuery.eq("created_by", uid);
    }

    if (scriptId) jobQuery = jobQuery.eq("script_id", scriptId);
    if (versionId) jobQuery = jobQuery.eq("version_id", versionId);

    const { data: jobRows, error: jobError } = await jobQuery;
    if (jobError) {
      console.error(`[tasks] GET jobs error=`, jobError.message);
      return json({ error: jobError.message }, 500);
    }

    // 2. Fetch Assigned Scripts (Manual Tasks)
    let scriptQuery = supabase
      .from("scripts")
      .select("id, title, status, created_at, company_id, assignee_id")
      .order("created_at", { ascending: false })
      .limit(limit);

    // If NOT admin, filter by assignee_id
    if (!isAdmin) {
      scriptQuery = scriptQuery.eq("assignee_id", uid);
    } else {
      // For admin, maybe we only want to see assigned scripts? 
      // Or all scripts? "Tasks" usually implies things TO DO.
      // If Admin sees ALL scripts, it might be clutter.
      // But user asked "does the admin see all the tasks and what the users are doing?".
      // So yes, let's show all assigned scripts.
      scriptQuery = scriptQuery.not('assignee_id', 'is', null);
    }

    // Filter scripts if valid UUID provided (avoid invalid syntax for non-UUIDs)
    // Note: scripts.id is UUID.
    if (scriptId) scriptQuery = scriptQuery.eq("id", scriptId);

    const { data: scriptRows, error: scriptError } = await scriptQuery;
    if (scriptError) {
      console.error(`[tasks] GET scripts error=`, scriptError.message);
      // Don't fail entire request if just scripts fail, but log it
    }

    // 3. Map to common Task interface
    const jobs = (jobRows ?? []).map((r: any) => toCamel(r));

    const assignedTasks = (scriptRows ?? []).map((s: any) => ({
      id: s.id, // Use script ID as task ID
      scriptId: s.id,
      companyName: "Client", // simplified, or fetch company name if needed
      scriptTitle: s.title,
      status: s.status, // e.g. "Draft", "Ready"
      assignedBy: "System", // we don't have this easily without join
      assignedTo: uid,
      assignedAt: s.created_at, // use created_at as proxy
    }));

    // 4. Combine and Sort
    const allTasks = [...jobs, ...assignedTasks].sort((a, b) => {
      const dateA = new Date((a as any).createdAt || (a as any).assignedAt).getTime();
      const dateB = new Date((b as any).createdAt || (b as any).assignedAt).getTime();
      return dateB - dateA;
    });

    return json(allTasks.slice(0, limit));
  }

  const isControlRequest = (body: any) => {
    const jobId = typeof body?.jobId === "string" ? body.jobId.trim() : "";
    const action = typeof body?.action === "string" ? body.action.trim().toLowerCase() : "";
    return Boolean(jobId) && (action === "pause" || action === "resume" || action === "stop" || action === "cancel");
  };

  if (req.method === "PATCH" || req.method === "POST") {
    let body: any;
    try {
      body = await req.clone().json();
    } catch {
      if (req.method === "PATCH") return json({ error: "Invalid JSON body" }, 400);
      body = null;
    }

    if (isControlRequest(body)) {
      const jobId = typeof body?.jobId === "string" ? body.jobId.trim() : "";
      const action = typeof body?.action === "string" ? body.action.trim().toLowerCase() : "";

      if (!jobId) return json({ error: "jobId is required" }, 400);
      if (action !== "pause" && action !== "resume" && action !== "stop" && action !== "cancel") {
        return json({ error: "action must be pause, resume, stop, or cancel" }, 400);
      }

      const { data: jobRow, error: jobErr } = await supabase
        .from("analysis_jobs")
        .select("id, script_id, version_id, created_by, status, progress_total, progress_done, progress_percent, created_at, started_at, completed_at, paused_at, pause_requested, partial_finalize_requested, partial_finalize_requested_at, config_snapshot, error_message, script_content_hash, canonical_length")
        .eq("id", jobId)
        .maybeSingle();

      if (jobErr) return json({ error: jobErr.message }, 500);
      if (!jobRow) return json({ error: "Job not found" }, 404);
      if (!isAdmin && (jobRow as any).created_by !== uid) return json({ error: "Job not found" }, 404);

      const normalizedStatus = String((jobRow as any).status ?? "").toLowerCase();
      if (["completed", "failed", "done", "succeeded", "cancelled", "canceled"].includes(normalizedStatus)) {
        return json({ error: "Cannot control a completed job" }, 400);
      }
      if (action !== "resume" && action !== "cancel" && (jobRow as any).partial_finalize_requested) {
        return json({ error: "Partial finalization already requested" }, 400);
      }
      if (action === "pause" && (jobRow as any).partial_finalize_requested) {
        return json({ error: "Cannot pause a job that is finalizing a partial report" }, 400);
      }
      if (action === "resume" && (jobRow as any).partial_finalize_requested) {
        return json({ error: "Cannot resume a job that is finalizing a partial report" }, 400);
      }

      const patch =
        action === "pause"
          ? { pause_requested: true, paused_at: new Date().toISOString(), partial_finalize_requested: false, partial_finalize_requested_at: null }
          : action === "resume"
            ? { pause_requested: false, paused_at: null }
            : action === "cancel"
              ? {
                  status: "cancelled",
                  completed_at: new Date().toISOString(),
                  pause_requested: false,
                  paused_at: null,
                  partial_finalize_requested: false,
                  partial_finalize_requested_at: null,
                  error_message: "Analysis cancelled by user.",
                }
            : {
                pause_requested: false,
                paused_at: null,
                partial_finalize_requested: true,
                partial_finalize_requested_at: new Date().toISOString(),
              };

      const { data: updated, error: updateErr } = await supabase
        .from("analysis_jobs")
        .update(patch)
        .eq("id", jobId)
        .select("id, script_id, version_id, status, progress_total, progress_done, progress_percent, created_at, started_at, completed_at, paused_at, pause_requested, partial_finalize_requested, partial_finalize_requested_at, config_snapshot, error_message, script_content_hash, canonical_length")
        .single();

      if (updateErr || !updated) {
        return json({ error: updateErr?.message ?? "Failed to update job" }, 500);
      }

      if (action === "stop") {
        await clearPendingChunksForPartialStop(supabase, jobId);
      } else if (action === "cancel") {
        await clearChunksForHardCancel(supabase, jobId);
      }

      return json(toCamel(updated as JobRow));
    }
    if (req.method === "PATCH") {
      return json({ error: "action must be pause, resume, stop, or cancel" }, 400);
    }
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  // PATCH: Ignore manual task creation (frontend legacy call)
  // If body has 'assignedTo' or ID starts with 'TSK-', it's a manual task.
  // We just return success because the script.assignee_id is the source of truth.
  if (body.assignedTo || (body.id && String(body.id).startsWith("TSK-"))) {
    return json(body); // Echo back the task
  }

  const versionId = body?.versionId;
  const forceFresh = body?.forceFresh === true;
  const defaultPipelineVersion = (Deno.env.get("ANALYSIS_PIPELINE_VERSION") ?? "v1").toLowerCase() === "v2" ? "v2" : "v1";
  const requestedPipelineVersion = body?.pipelineVersion === "v2" || body?.pipelineVersion === "v1"
    ? body.pipelineVersion
    : defaultPipelineVersion;
  const requestedAnalysisProfile =
    body?.analysisProfile === "quality" || body?.analysisProfile === "turbo" || body?.analysisProfile === "balanced"
      ? body.analysisProfile
      : "balanced";
  const analysisProfilePreset = ANALYSIS_PROFILE_PRESETS[requestedAnalysisProfile];
  const analysisOptions = body?.analysisOptions && typeof body.analysisOptions === "object"
    ? { mergeStrategy: body.analysisOptions.mergeStrategy === "every_occurrence" ? "every_occurrence" : "same_location_only" }
    : { mergeStrategy: analysisProfilePreset.mergeStrategy };
  if (!versionId || typeof versionId !== "string" || !versionId.trim()) {
    return json({ error: "versionId is required" }, 400);
  }



  const { data: version, error: versionErr } = await supabase
    .from("script_versions")
    .select("id, script_id, extracted_text, extraction_status")
    .eq("id", versionId.trim())
    .single();

  if (versionErr || !version) {
    return json({ error: "Version not found" }, 404);
  }

  const { data: script, error: scriptErr } = await supabase
    .from("scripts")
    .select("id, created_by, assignee_id")
    .eq("id", (version as { script_id: string }).script_id)
    .single();

  if (scriptErr || !script) {
    return json({ error: "Script not found" }, 404);
  }

  const s = script as { created_by: string | null; assignee_id: string | null };
  const hasAccess =
    isAdmin || s.created_by === uid || (s.assignee_id != null && s.assignee_id === uid);
  if (!hasAccess) {
    return json({ error: "Forbidden" }, 403);
  }

  const v = version as { extracted_text: string | null; extraction_status: string };
  if (v.extraction_status !== "done") {
    return json({ error: "Extract first" }, 400);
  }
  if (v.extracted_text == null || String(v.extracted_text).trim() === "") {
    return json({ error: "Extract first" }, 400);
  }

  const scriptId = (version as { script_id: string }).script_id;
  // Use existing script_text.content as canonical; do NOT rewrite. Canonical is set at import/extract.
  const { data: scriptTextRow } = await supabase
    .from("script_text")
    .select("content, content_hash, content_html")
    .eq("version_id", versionId.trim())
    .maybeSingle();

  let normalized: string;
  let script_content_hash: string;
  const st = scriptTextRow as { content?: string | null; content_hash?: string | null; content_html?: string | null } | null;
  const existingContent = st?.content != null && String(st.content).trim() !== "";

  if (existingContent) {
    normalized = st!.content!.trim();
    const existingHash = (st!.content_hash != null && String(st!.content_hash).trim() !== "")
      ? String(st!.content_hash).trim()
      : null;
    script_content_hash = existingHash ?? await sha256Hash(normalized);
    // Backfill script_text.content_hash when missing so editor and job stay in sync for highlight check
    if (!existingHash) {
      const editorSave = await saveScriptEditorContent(
        supabase,
        versionId.trim(),
        scriptId,
        normalized,
        script_content_hash,
        (st as { content_html?: string | null }).content_html ?? undefined
      );
      if (editorSave.error) {
        console.warn(`[tasks] correlationId=${correlationId} script_text content_hash backfill failed:`, editorSave.error);
      }
    }
  } else {
    // No canonical yet: compute once from content_html or extracted_text and save (import path may have skipped script_text).
    const contentHtml = st?.content_html;
    normalized =
      contentHtml != null && contentHtml.length > 0
        ? normalizeText(htmlToText(contentHtml))
        : normalizeText(v.extracted_text);
    script_content_hash = await sha256Hash(normalized);
    const editorSave = await saveScriptEditorContent(
      supabase,
      versionId.trim(),
      scriptId,
      normalized,
      script_content_hash,
      contentHtml ?? undefined
    );
    if (editorSave.error) {
      console.warn(`[tasks] correlationId=${correlationId} script_text/sections save failed:`, editorSave.error);
    }
  }

  const normalizedBeforeClean = normalized;
  normalized = stripInvalidUnicodeForDb(normalized);
  if (normalized !== normalizedBeforeClean) {
    script_content_hash = await sha256Hash(normalized);
  }

  const canonical_length = normalized.length;

  const { data: scriptPageRows } = await supabase
    .from("script_pages")
    .select("page_number, content")
    .eq("version_id", versionId.trim())
    .order("page_number", { ascending: true });
  const pageRows: ScriptPageRow[] = (scriptPageRows ?? []) as ScriptPageRow[];

  const usePageChunks =
    (Deno.env.get("ANALYSIS_CHUNK_BY_PAGE") ?? "").toLowerCase() === "true" &&
    pageRows.length > 0;
  const chunks = usePageChunks
    ? chunkTextByScriptPages(normalized, pageRows, 12_000)
    : chunkText(normalized, 12_000, 800);
  const progress_total = chunks.length + 1;
  const manualReviewSnapshot = await loadManualReviewSnapshot(supabase, scriptId, versionId.trim());

  const { data: job, error: jobErr } = await supabase
    .from("analysis_jobs")
    .insert({
      script_id: scriptId,
      version_id: versionId.trim(),
      created_by: uid,
      status: "queued",
      progress_total,
      progress_done: 0,
      progress_percent: 0,
      normalized_text: normalized,
      script_content_hash,
      canonical_length,
      config_snapshot: {
        ...DEFAULT_DETERMINISTIC_CONFIG,
        pipeline_version: requestedPipelineVersion,
        force_fresh: forceFresh,
        analysis_profile: analysisProfilePreset.analysisProfile,
        ...(requestedPipelineVersion === "v2"
          ? {
              analysis_engine: analysisProfilePreset.analysisEngine,
              hybrid_mode: analysisProfilePreset.hybridMode,
            }
          : {}),
        max_router_candidates: analysisProfilePreset.maxRouterCandidates,
        deep_auditor_enabled: analysisProfilePreset.deepAuditorEnabled,
        router_prompt_version: PROMPT_VERSIONS.router,
        router_prompt_hash: await sha256Hash(ROUTER_SYSTEM_MSG),
        judge_prompt_version: PROMPT_VERSIONS.judge,
        judge_prompt_hash: await sha256Hash(JUDGE_SYSTEM_MSG),
        schema_version: PROMPT_VERSIONS.schema,
        ...(manualReviewSnapshot.carriedForwardCount > 0
          ? {
              manual_review_context: {
                carried_forward_count: manualReviewSnapshot.carriedForwardCount,
                source_job_ids: manualReviewSnapshot.sourceJobIds,
                items: manualReviewSnapshot.items,
              },
            }
          : {}),
        ...(analysisOptions ? { analysisOptions } : {}),
      },
    })
    .select("id")
    .single();

  if (jobErr || !job?.id) {
    console.error(`[tasks] correlationId=${correlationId} job insert error=`, jobErr?.message);
    return json({ error: jobErr?.message ?? "Failed to create analysis job" }, 500);
  }

  // Dev assertion: stored script_text.content_hash should match job hash for this version
  const { data: stCheck } = await supabase
    .from("script_text")
    .select("content_hash")
    .eq("version_id", versionId.trim())
    .maybeSingle();
  const storedHash = (stCheck as { content_hash?: string | null } | null)?.content_hash ?? null;
  if (storedHash != null && storedHash !== script_content_hash) {
    console.warn(`[tasks] correlationId=${correlationId} hash mismatch after job create: job.script_content_hash !== script_text.content_hash for version=${versionId}`);
  }
  console.log(`[tasks] job created correlationId=${correlationId} versionId=${versionId} canonical_length=${canonical_length} script_content_hash=${script_content_hash.slice(0, 16)}...`);

  const { data: scriptRow } = await supabase.from("scripts").select("title").eq("id", scriptId).maybeSingle();
  const scriptTitle = (scriptRow as { title?: string } | null)?.title ?? scriptId;
  logAuditCanonical(supabase, {
    event_type: "TASK_CREATED",
    actor_user_id: uid,
    target_type: "task",
    target_id: job.id,
    target_label: scriptTitle,
    result_status: "success",
    correlation_id: correlationId,
  }).catch((e) => console.warn("[tasks] audit log:", e));

  const chunkRows = chunks.map((c, i) => {
    const span = offsetRangeToPageMinMax(c.start_offset, c.end_offset, pageRows);
    return {
      job_id: job.id,
      chunk_index: i,
      text: c.text,
      text_preview: sliceTextPreview(c.text, 280),
      start_offset: c.start_offset,
      end_offset: c.end_offset,
      start_line: c.start_line,
      end_line: c.end_line,
      status: "pending",
      page_number_min: span.pageNumberMin,
      page_number_max: span.pageNumberMax,
    };
  });

  const { error: chunksErr } = await supabase.from("analysis_chunks").insert(chunkRows);
  if (chunksErr) {
    console.error(`[tasks] correlationId=${correlationId} chunks insert error=`, chunksErr.message);
    const { error: cleanupErr } = await supabase
      .from("analysis_jobs")
      .delete()
      .eq("id", job.id);
    if (cleanupErr) {
      console.error(`[tasks] correlationId=${correlationId} failed to clean up orphaned analysis job ${job.id}:`, cleanupErr.message);
    }
    return json({ error: chunksErr.message }, 500);
  }

  const clonedManualFindings = await cloneManualReviewFindingsToJob(
    supabase,
    job.id,
    scriptId,
    versionId.trim(),
    manualReviewSnapshot.items
  );

  return json({
    jobId: job.id,
    manualReviewContextCount: clonedManualFindings,
  });
});
