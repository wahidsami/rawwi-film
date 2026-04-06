/**
 * Findings Edge Function
 *
 * GET  /findings?jobId=<uuid>   → list findings for a job (with review_status)
 * GET  /findings                → [] (backward compat)
 * POST /findings/review         → approve/revert a finding + recompute report aggregates
 * POST /findings/reclassify     → edit article/atom/severity/manual note + recompute report aggregates
 */
import { jsonResponse, optionsResponse } from "../_shared/cors.ts";
import { requireAuth } from "../_shared/auth.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { isUserAdmin } from "../_shared/roleCheck.ts";
import { logAuditCanonical } from "../_shared/audit.ts";
import { validateArticleAtomLink } from "../_shared/policyValidation.ts";

function pathAfter(base: string, url: string): string {
  const pathname = new URL(url).pathname;
  const match = pathname.match(new RegExp(`/${base}/?(.*)$`));
  return (match?.[1] ?? "").replace(/^\/+/, "").trim();
}

const FINDING_COLS =
  "id, job_id, script_id, version_id, source, article_id, atom_id, severity, confidence, title_ar, description_ar, rationale_ar, evidence_snippet, start_offset_global, end_offset_global, start_offset_page, end_offset_page, start_line_chunk, end_line_chunk, location, evidence_hash, page_number, anchor_status, anchor_method, anchor_page_number, anchor_start_offset_page, anchor_end_offset_page, anchor_start_offset_global, anchor_end_offset_global, anchor_text, anchor_confidence, anchor_updated_at, created_at, created_by, manual_comment";
const REVIEW_FINDING_COLS =
  "id, job_id, report_id, script_id, version_id, canonical_finding_id, source_kind, primary_article_id, primary_atom_id, severity, review_status, title_ar, description_ar, rationale_ar, evidence_snippet, manual_comment, page_number, start_offset_global, end_offset_global, start_offset_page, end_offset_page, anchor_status, anchor_method, anchor_text, anchor_confidence, is_manual, is_hidden, include_in_report, approved_reason, reviewed_by, reviewed_at, edited_by, edited_at, created_from_job_id, supersedes_review_finding_id, created_at, updated_at";

async function selectFindings(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  jobId: string
) {
  const extCols = FINDING_COLS + ", review_status, review_reason, reviewed_by, reviewed_at, reviewed_role";
  const { data, error } = await supabase
    .from("analysis_findings")
    .select(extCols)
    .eq("job_id", jobId)
    .order("article_id", { ascending: true });
  if (!error) return { data, error: null };
  const fb = await supabase
    .from("analysis_findings")
    .select(FINDING_COLS)
    .eq("job_id", jobId)
    .order("article_id", { ascending: true });
  return fb;
}

async function selectReviewFindings(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  jobId: string,
) {
  return await supabase
    .from("analysis_review_findings")
    .select(REVIEW_FINDING_COLS)
    .eq("job_id", jobId)
    .eq("is_hidden", false)
    .order("created_at", { ascending: true });
}

function camelFinding(r: Record<string, unknown>, createdBy: string | null = null) {
  return {
    id: r.id,
    jobId: r.job_id,
    scriptId: r.script_id,
    versionId: r.version_id,
    source: r.source,
    articleId: r.article_id,
    atomId: r.atom_id ?? null,
    severity: r.severity,
    confidence: r.confidence ?? 0,
    titleAr: r.title_ar,
    descriptionAr: r.description_ar,
    rationaleAr: r.rationale_ar ?? null,
    evidenceSnippet: r.evidence_snippet,
    startOffsetGlobal: r.start_offset_global ?? null,
    endOffsetGlobal: r.end_offset_global ?? null,
    startLineChunk: r.start_line_chunk ?? null,
    endLineChunk: r.end_line_chunk ?? null,
    location: r.location ?? {},
    pageNumber: r.page_number ?? null,
    startOffsetPage: r.start_offset_page ?? null,
    endOffsetPage: r.end_offset_page ?? null,
    anchorStatus: r.anchor_status ?? null,
    anchorMethod: r.anchor_method ?? null,
    anchorPageNumber: r.anchor_page_number ?? null,
    anchorStartOffsetPage: r.anchor_start_offset_page ?? null,
    anchorEndOffsetPage: r.anchor_end_offset_page ?? null,
    anchorStartOffsetGlobal: r.anchor_start_offset_global ?? null,
    anchorEndOffsetGlobal: r.anchor_end_offset_global ?? null,
    anchorText: r.anchor_text ?? null,
    anchorConfidence: r.anchor_confidence ?? null,
    anchorUpdatedAt: r.anchor_updated_at ?? null,
    createdAt: r.created_at,
    reviewStatus: r.review_status ?? "violation",
    reviewReason: r.review_reason ?? null,
    reviewedBy: r.reviewed_by ?? null,
    reviewedAt: r.reviewed_at ?? null,
    reviewedRole: r.reviewed_role ?? null,
    createdBy: createdBy ?? (r.created_by as string | null) ?? null,
    manualComment: (r.manual_comment as string | null) ?? null,
  };
}

function camelReviewFinding(r: Record<string, unknown>) {
  return {
    id: r.id,
    jobId: r.job_id,
    reportId: r.report_id,
    scriptId: r.script_id,
    versionId: r.version_id,
    canonicalFindingId: r.canonical_finding_id ?? null,
    sourceKind: r.source_kind,
    primaryArticleId: r.primary_article_id,
    primaryAtomId: r.primary_atom_id ?? null,
    severity: r.severity,
    reviewStatus: r.review_status ?? "violation",
    titleAr: r.title_ar,
    descriptionAr: r.description_ar ?? null,
    rationaleAr: r.rationale_ar ?? null,
    evidenceSnippet: r.evidence_snippet,
    manualComment: r.manual_comment ?? null,
    pageNumber: r.page_number ?? null,
    startOffsetGlobal: r.start_offset_global ?? null,
    endOffsetGlobal: r.end_offset_global ?? null,
    startOffsetPage: r.start_offset_page ?? null,
    endOffsetPage: r.end_offset_page ?? null,
    anchorStatus: r.anchor_status ?? "unresolved",
    anchorMethod: r.anchor_method ?? null,
    anchorText: r.anchor_text ?? null,
    anchorConfidence: r.anchor_confidence ?? null,
    isManual: Boolean(r.is_manual),
    isHidden: Boolean(r.is_hidden),
    includeInReport: r.include_in_report !== false,
    approvedReason: r.approved_reason ?? null,
    reviewedBy: r.reviewed_by ?? null,
    reviewedAt: r.reviewed_at ?? null,
    editedBy: r.edited_by ?? null,
    editedAt: r.edited_at ?? null,
    createdFromJobId: r.created_from_job_id ?? null,
    supersedesReviewFindingId: r.supersedes_review_finding_id ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function compactWhitespace(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function canonicalIdFromFindingRow(row: Record<string, unknown> | null | undefined): string | null {
  const v3 = (((row?.location as Record<string, unknown> | undefined)?.v3 as Record<string, unknown> | undefined) ?? {}) as Record<string, unknown>;
  const raw = v3.canonical_finding_id;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

async function getReportIdForJob(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  jobId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("analysis_reports")
    .select("id")
    .eq("job_id", jobId)
    .maybeSingle();
  return (data as { id?: string | null } | null)?.id ?? null;
}

async function findReviewFindingIdsForRawFinding(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  reportId: string,
  row: Record<string, unknown>,
): Promise<string[]> {
  const canonicalId = canonicalIdFromFindingRow(row);
  if (canonicalId) {
    const { data } = await supabase
      .from("analysis_review_findings")
      .select("id")
      .eq("report_id", reportId)
      .eq("canonical_finding_id", canonicalId)
      .eq("is_hidden", false);
    const ids = ((data ?? []) as Array<{ id: string }>).map((item) => item.id).filter(Boolean);
    if (ids.length > 0) return ids;
  }

  const articleId = Number(row.article_id ?? 0);
  const source = String(row.source ?? "ai").toLowerCase();
  const evidence = compactWhitespace(row.evidence_snippet as string | null | undefined);
  const sourceKind =
    source === "manual"
      ? "manual"
      : source === "lexicon_mandatory" || source === "glossary"
        ? "glossary"
        : "ai";

  const { data } = await supabase
    .from("analysis_review_findings")
    .select("id, evidence_snippet")
    .eq("report_id", reportId)
    .eq("primary_article_id", articleId)
    .eq("source_kind", sourceKind)
    .eq("is_hidden", false);

  return ((data ?? []) as Array<{ id: string; evidence_snippet?: string | null }>)
    .filter((item) => {
      const candidate = compactWhitespace(item.evidence_snippet);
      if (!candidate || !evidence) return false;
      return candidate.includes(evidence) || evidence.includes(candidate);
    })
    .map((item) => item.id)
    .filter(Boolean);
}

async function syncReviewStatusFromRawFinding(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  row: Record<string, unknown>,
  uid: string,
  toStatus: "approved" | "violation",
  reason: string,
): Promise<void> {
  const jobId = String(row.job_id ?? "").trim();
  if (!jobId) return;
  const reportId = await getReportIdForJob(supabase, jobId);
  if (!reportId) return;
  const ids = await findReviewFindingIdsForRawFinding(supabase, reportId, row);
  if (ids.length === 0) return;
  const nowIso = new Date().toISOString();
  await supabase
    .from("analysis_review_findings")
    .update({
      review_status: toStatus === "approved" ? "approved" : "violation",
      approved_reason: reason,
      reviewed_by: uid,
      reviewed_at: nowIso,
      updated_at: nowIso,
    })
    .in("id", ids);
}

async function syncReviewClassificationFromRawFinding(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  row: Record<string, unknown>,
  uid: string,
  updates: {
    articleId: number;
    atomId: string | null;
    severity: string;
    manualComment: string | null;
  },
): Promise<void> {
  const jobId = String(row.job_id ?? "").trim();
  if (!jobId) return;
  const reportId = await getReportIdForJob(supabase, jobId);
  if (!reportId) return;
  const ids = await findReviewFindingIdsForRawFinding(supabase, reportId, row);
  if (ids.length === 0) return;
  const nowIso = new Date().toISOString();
  await supabase
    .from("analysis_review_findings")
    .update({
      primary_article_id: updates.articleId,
      primary_atom_id: updates.atomId,
      severity: updates.severity,
      manual_comment: updates.manualComment,
      edited_by: uid,
      edited_at: nowIso,
      updated_at: nowIso,
    })
    .in("id", ids);
}

async function createManualReviewFinding(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  payload: {
    reportId: string;
    jobId: string;
    scriptId: string;
    versionId: string;
    articleId: number;
    atomId: string | null;
    severity: string;
    evidenceSnippet: string;
    manualComment: string | null;
    pageNumber: number | null;
    startOffsetGlobal: number;
    endOffsetGlobal: number;
    startOffsetPage: number | null;
    endOffsetPage: number | null;
    uid: string;
  },
): Promise<string | null> {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("analysis_review_findings")
    .insert({
      job_id: payload.jobId,
      report_id: payload.reportId,
      script_id: payload.scriptId,
      version_id: payload.versionId,
      canonical_finding_id: null,
      source_kind: "manual",
      primary_article_id: payload.articleId,
      primary_atom_id: payload.atomId,
      severity: payload.severity,
      review_status: "violation",
      title_ar: "ملاحظة يدوية",
      description_ar: payload.manualComment || payload.evidenceSnippet,
      rationale_ar: null,
      evidence_snippet: payload.evidenceSnippet,
      manual_comment: payload.manualComment,
      page_number: payload.pageNumber,
      start_offset_global: payload.startOffsetGlobal,
      end_offset_global: payload.endOffsetGlobal,
      start_offset_page: payload.startOffsetPage,
      end_offset_page: payload.endOffsetPage,
      anchor_status: "exact",
      anchor_method: "stored_offsets",
      anchor_text: payload.evidenceSnippet,
      anchor_confidence: 1,
      is_manual: true,
      is_hidden: false,
      created_from_job_id: payload.jobId,
      reviewed_by: payload.uid,
      reviewed_at: nowIso,
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[findings] manual review-layer insert error:", error.message);
    return null;
  }

  return (data as { id?: string | null } | null)?.id ?? null;
}

function findNearestRawOccurrence(content: string, needle: string, hintStart: number): number | null {
  const target = needle.trim();
  if (!target) return null;
  let bestIndex: number | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  let searchFrom = 0;
  while (searchFrom <= content.length) {
    const idx = content.indexOf(target, searchFrom);
    if (idx === -1) break;
    const distance = Math.abs(idx - hintStart);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = idx;
      if (distance === 0) break;
    }
    searchFrom = idx + Math.max(1, target.length);
  }
  return bestIndex;
}

async function resolveManualAtomId(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  articleId: number,
  atomId: string | null | undefined,
): Promise<{ normalizedAtomId: string | null; warning: string | null; error: string | null }> {
  const raw = typeof atomId === "string" ? atomId.trim() : atomId == null ? "" : String(atomId).trim();
  const atomForValidation = raw.length > 0 ? raw : null;
  const validation = await validateArticleAtomLink(
    supabase as unknown as { from: (table: string) => { select: (cols: string) => any } },
    articleId,
    atomForValidation,
  );
  if (validation.ok) {
    return { normalizedAtomId: validation.normalizedAtomId, warning: null, error: null };
  }
  if (atomForValidation) {
    console.warn("[findings] Manual atom not in policy map; saving at article-level", {
      articleId,
      atomId: atomForValidation,
      reason: validation.reason,
    });
    return {
      normalizedAtomId: null,
      warning: `Atom ${atomForValidation} is not yet mapped for article ${articleId}; saved at article level instead.`,
      error: null,
    };
  }
  return { normalizedAtomId: null, warning: null, error: validation.reason ?? "Invalid atom/article mapping" };
}

/**
 * Recompute aggregates for a job's report from analysis_findings (excluding approved).
 * Updates analysis_reports columns + summary_json.totals inline.
 */
async function recomputeReportAggregates(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  jobId: string,
  uid: string,
  actorRole: string
) {
  // 1) Count violations (exclude approved)
  const { data: allFindings } = await supabase
    .from("analysis_findings")
    .select("severity, source, review_status")
    .eq("job_id", jobId);

  const rows = (allFindings ?? []) as { severity: string; source?: string | null; review_status?: string }[];
  const sc = { low: 0, medium: 0, high: 0, critical: 0 };
  const tc = { ai: 0, manual: 0, glossary: 0, special: 0 };
  let approvedCount = 0;
  for (const r of rows) {
    if ((r.review_status ?? "violation") === "approved") {
      approvedCount++;
    } else {
      const s = r.severity as keyof typeof sc;
      if (s in sc) sc[s]++;
      const source = (r.source ?? "ai").toLowerCase();
      if (source === "manual") tc.manual++;
      else if (source === "lexicon_mandatory" || source === "glossary") tc.glossary++;
      else tc.ai++;
    }
  }
  const findingsCount = sc.low + sc.medium + sc.high + sc.critical;

  // 2) Load existing report
  const { data: report } = await supabase
    .from("analysis_reports")
    .select("id, summary_json")
    .eq("job_id", jobId)
    .maybeSingle();

  if (!report) {
    console.warn("[findings] recomputeReportAggregates: no report for job", jobId);
    return null;
  }

  // 3) Update summary_json.totals in-place
  const summaryJson = (report as any).summary_json ?? {};
  if (!summaryJson.totals) summaryJson.totals = {};
  summaryJson.totals.findings_count = findingsCount;
  summaryJson.totals.severity_counts = sc;
  const specialCount = Array.isArray(summaryJson.report_hints) ? summaryJson.report_hints.length : 0;
  summaryJson.totals.type_counts = { ...tc, special: specialCount };
  summaryJson.approved_count = approvedCount;
  summaryJson.last_reviewed_at = new Date().toISOString();

  // 4) Update report row
  const updatePayload: Record<string, unknown> = {
    findings_count: findingsCount,
    severity_counts: sc,
    approved_count: approvedCount,
    last_reviewed_at: new Date().toISOString(),
    last_reviewed_by: uid,
    last_reviewed_role: actorRole,
    summary_json: summaryJson,
  };

  const { error: updErr } = await supabase
    .from("analysis_reports")
    .update(updatePayload)
    .eq("id", (report as any).id);

  if (updErr) {
    console.error("[findings] recomputeReportAggregates update error:", updErr.message);
    return null;
  }

  return { findingsCount, severityCounts: sc, typeCounts: summaryJson.totals.type_counts, approvedCount };
}

Deno.serve(async (req: Request) => {
  try {
    const origin = req.headers.get("origin") ?? undefined;
    const json = (body: unknown, status = 200) => jsonResponse(body, status, { origin });
    if (req.method === "OPTIONS") return optionsResponse(req);

    const auth = await requireAuth(req);
    if (auth instanceof Response) return auth;
    const uid = auth.userId;

    const supabase = createSupabaseAdmin();
    const rest = pathAfter("findings", req.url);
    const method = req.method;

    // Admin role check (Robust DB check)
    const isAdmin = await isUserAdmin(supabase, uid);

    // ── GET /findings/review-layer?jobId=... or ?reportId=... ──
    if (method === "GET" && rest === "review-layer") {
      const url = new URL(req.url);
      let jobId = url.searchParams.get("jobId")?.trim();
      const reportId = url.searchParams.get("reportId")?.trim();

      if (reportId && !jobId) {
        const { data: report, error: reportErr } = await supabase
          .from("analysis_reports")
          .select("job_id")
          .eq("id", reportId)
          .maybeSingle();
        if (reportErr || !report) {
          return json({ error: "Report not found" }, 404);
        }
        jobId = (report as { job_id: string }).job_id;
      }

      if (!jobId) return json([]);

      const { data: job, error: jobErr } = await supabase
        .from("analysis_jobs")
        .select("created_by")
        .eq("id", jobId)
        .maybeSingle();

      if (jobErr || !job || (!isAdmin && (job as { created_by?: string | null }).created_by !== uid)) {
        return json({ error: "Forbidden" }, 403);
      }

      const { data: rows, error } = await selectReviewFindings(supabase, jobId);
      if (error) return json({ error: error.message }, 500);
      return json((rows ?? []).map((r) => camelReviewFinding(r as Record<string, unknown>)));
    }

    // ── GET /findings?jobId=... or GET /findings?reportId=... ──
    if (method === "GET") {
      const url = new URL(req.url);
      let jobId = url.searchParams.get("jobId")?.trim();
      const reportId = url.searchParams.get("reportId")?.trim();

      if (reportId && !jobId) {
        const { data: report, error: reportErr } = await supabase
          .from("analysis_reports")
          .select("job_id")
          .eq("id", reportId)
          .maybeSingle();
        if (reportErr || !report) {
          return json({ error: "Report not found" }, 404);
        }
        jobId = (report as any).job_id;
      }

      if (!jobId) return json([]);

      // Admin bypass check (inherited from top scope)

      const { data: job, error: jobErr } = await supabase
        .from("analysis_jobs")
        .select("created_by")
        .eq("id", jobId)
        .maybeSingle();

      // If not admin, strictly enforce ownership
      if (jobErr || !job || (!isAdmin && (job as any).created_by !== uid)) {
        return json({ error: "Forbidden" }, 403);
      }

      const createdBy = (job as any).created_by ?? null;
      const { data: rows, error } = await selectFindings(supabase, jobId);
      if (error) return json({ error: error.message }, 500);
      return json((rows ?? []).map((r) => camelFinding(r as Record<string, unknown>, createdBy)));
    }

    // ── POST /findings/review ──
    if (method === "POST" && rest === "review") {
      let body: { findingId?: string; toStatus?: string; reason?: string };
      try {
        body = await req.json();
      } catch {
        return json({ error: "Invalid JSON" }, 400);
      }

      const findingId = body.findingId?.trim();
      const toStatus = body.toStatus?.trim();
      const reason = body.reason?.trim();

      if (!findingId) return json({ error: "findingId required" }, 400);
      if (!toStatus || !["approved", "violation"].includes(toStatus)) {
        return json({ error: "toStatus must be 'approved' or 'violation'" }, 400);
      }
      if (!reason || reason.length < 2) {
        return json({ error: "reason is required (min 2 chars)" }, 400);
      }

      // Load finding
      const { data: finding } = await supabase
        .from("analysis_findings")
        .select("id, job_id, review_status, location, article_id, source, evidence_snippet")
        .eq("id", findingId)
        .maybeSingle();
      if (!finding) return json({ error: "Finding not found" }, 404);

      const f = finding as any;
      const fromStatus = f.review_status ?? "violation";
      const jobId = f.job_id;

      // Ownership check via job
      const { data: job } = await supabase
        .from("analysis_jobs")
        .select("created_by")
        .eq("id", jobId)
        .maybeSingle();
      if (!job) return json({ error: "Job not found" }, 404);

      const isOwner = (job as any).created_by === uid;
      if (!isAdmin && !isOwner) return json({ error: "Forbidden" }, 403);

      const actorRole = "user";

      // a) Update finding
      const { error: updErr } = await supabase
        .from("analysis_findings")
        .update({
          review_status: toStatus,
          review_reason: reason,
          reviewed_by: uid,
          reviewed_at: new Date().toISOString(),
          reviewed_role: actorRole,
        })
        .eq("id", findingId);
      if (updErr) {
        console.error("[findings] review update error:", updErr.message);
        return json({ error: updErr.message }, 500);
      }

      await syncReviewStatusFromRawFinding(
        supabase,
        finding as Record<string, unknown>,
        uid,
        toStatus as "approved" | "violation",
        reason,
      );

      // b) Insert audit row
      const { error: auditErr } = await supabase
        .from("finding_reviews")
        .insert({
          finding_id: findingId,
          job_id: jobId,
          from_status: fromStatus,
          to_status: toStatus,
          reason,
          actor_user_id: uid,
          actor_role: actorRole,
        });
      if (auditErr) {
        console.error("[findings] audit insert error:", auditErr.message);
      }

      const eventType = toStatus === "approved" ? "FINDING_MARKED_SAFE" : "FINDING_OVERRIDDEN";
      logAuditCanonical(supabase, {
        event_type: eventType,
        actor_user_id: uid,
        actor_role: actorRole,
        target_type: "report",
        target_id: jobId,
        target_label: findingId,
        result_status: "success",
        metadata: { fromStatus, toStatus, reason },
      }).catch((e) => console.warn("[findings] audit canonical:", e));

      // c) Recompute report aggregates
      const agg = await recomputeReportAggregates(supabase, jobId, uid, actorRole);

      return json({
        ok: true,
        findingId,
        fromStatus,
        toStatus,
        reportAggregates: agg,
      });
    }

    // ── POST /findings/reclassify (or POST /findings with { action: "reclassify" }) ──
    if (method === "POST" && rest === "report-visibility") {
      let body: {
        reviewFindingId?: string;
        includeInReport?: boolean;
      };
      try {
        body = await req.json();
      } catch {
        return json({ error: "Invalid JSON" }, 400);
      }

      const reviewFindingId = body.reviewFindingId?.trim();
      if (!reviewFindingId) return json({ error: "reviewFindingId required" }, 400);
      if (typeof body.includeInReport !== "boolean") {
        return json({ error: "includeInReport must be boolean" }, 400);
      }

      const { data: reviewFinding } = await supabase
        .from("analysis_review_findings")
        .select("id, job_id, include_in_report")
        .eq("id", reviewFindingId)
        .maybeSingle();
      if (!reviewFinding) return json({ error: "Review finding not found" }, 404);

      const reviewRow = reviewFinding as { id: string; job_id: string; include_in_report?: boolean | null };
      const { data: job } = await supabase
        .from("analysis_jobs")
        .select("created_by")
        .eq("id", reviewRow.job_id)
        .maybeSingle();
      if (!job) return json({ error: "Job not found" }, 404);
      const isOwner = (job as { created_by?: string | null }).created_by === uid;
      if (!isAdmin && !isOwner) return json({ error: "Forbidden" }, 403);

      const nowIso = new Date().toISOString();
      const { data: updatedRow, error: updateErr } = await supabase
        .from("analysis_review_findings")
        .update({
          include_in_report: body.includeInReport,
          updated_at: nowIso,
        })
        .eq("id", reviewFindingId)
        .select(REVIEW_FINDING_COLS)
        .maybeSingle();
      if (updateErr || !updatedRow) {
        return json({ error: updateErr?.message ?? "Could not update report visibility" }, 500);
      }

      await logAuditCanonical(supabase, {
        event_type: body.includeInReport ? "FINDING_INCLUDED_IN_REPORT" : "FINDING_EXCLUDED_FROM_REPORT",
        actor_user_id: uid,
        actor_role: "user",
        target_type: "report",
        target_id: reviewRow.job_id,
        target_label: reviewFindingId,
        result_status: "success",
        metadata: {
          reviewFindingId,
          fromIncludeInReport: reviewRow.include_in_report !== false,
          toIncludeInReport: body.includeInReport,
        },
      }).catch((e) => console.warn("[findings] report visibility audit canonical:", e));

      return json({
        ok: true,
        reviewFinding: camelReviewFinding(updatedRow as Record<string, unknown>),
      });
    }

    // ── POST /findings/reclassify (or POST /findings with { action: "reclassify" }) ──
    if (method === "POST" && (rest === "reclassify" || rest === "")) {
      let body: {
        action?: string;
        findingId?: string;
        articleId?: number;
        atomId?: string | null;
        severity?: string;
        manualComment?: string | null;
      };
      try {
        body = await req.json();
      } catch {
        return json({ error: "Invalid JSON" }, 400);
      }

      if (rest === "" && body.action !== "reclassify") {
        return json({ error: "Not found" }, 404);
      }

      const findingId = body.findingId?.trim();
      const articleId = body.articleId;
      const atomId = body.atomId?.trim() || null;
      const severity = body.severity?.trim().toLowerCase();
      const manualComment = body.manualComment?.trim() ?? null;

      if (!findingId) return json({ error: "findingId required" }, 400);
      if (articleId == null || typeof articleId !== "number") {
        return json({ error: "articleId required" }, 400);
      }
      if (!severity || !["low", "medium", "high", "critical"].includes(severity)) {
        return json({ error: "severity must be low, medium, high, or critical" }, 400);
      }

      const atomResolution = await resolveManualAtomId(supabase, articleId, atomId);
      if (atomResolution.error) {
        return json({ error: atomResolution.error }, 400);
      }

      const { data: finding } = await supabase
        .from("analysis_findings")
        .select("id, job_id, script_id, article_id, atom_id, severity, manual_comment, location, source, evidence_snippet")
        .eq("id", findingId)
        .maybeSingle();
      if (!finding) return json({ error: "Finding not found" }, 404);

      const f = finding as {
        id: string;
        job_id: string;
        script_id: string;
        article_id: number;
        atom_id: string | null;
        severity: string;
        manual_comment: string | null;
      };

      const { data: job } = await supabase
        .from("analysis_jobs")
        .select("created_by")
        .eq("id", f.job_id)
        .maybeSingle();
      if (!job) return json({ error: "Job not found" }, 404);
      const isOwner = (job as { created_by?: string | null }).created_by === uid;
      if (!isAdmin && !isOwner) return json({ error: "Forbidden" }, 403);

      const actorRole = "user";
      const nowIso = new Date().toISOString();
      const { error: updErr } = await supabase
        .from("analysis_findings")
        .update({
          article_id: articleId,
          atom_id: atomResolution.normalizedAtomId,
          severity,
          manual_comment: manualComment,
          reviewed_by: uid,
          reviewed_at: nowIso,
          reviewed_role: actorRole,
        })
        .eq("id", findingId);
      if (updErr) {
        console.error("[findings] reclassify update error:", updErr.message);
        return json({ error: updErr.message }, 500);
      }

      await syncReviewClassificationFromRawFinding(
        supabase,
        finding as Record<string, unknown>,
        uid,
        {
          articleId,
          atomId: atomResolution.normalizedAtomId,
          severity,
          manualComment,
        },
      );

      await logAuditCanonical(supabase, {
        event_type: "FINDING_RECLASSIFIED",
        actor_user_id: uid,
        actor_role: actorRole,
        target_type: "report",
        target_id: f.job_id,
        target_label: findingId,
        result_status: "success",
        metadata: {
          oldArticleId: f.article_id,
          oldAtomId: f.atom_id,
          oldSeverity: f.severity,
          newArticleId: articleId,
          newAtomId: atomResolution.normalizedAtomId,
          newSeverity: severity,
          manualComment,
        },
      }).catch((e) => console.warn("[findings] reclassify audit canonical:", e));

      const agg = await recomputeReportAggregates(supabase, f.job_id, uid, actorRole);
      const { data: updatedRow, error: refetchErr } = await supabase
        .from("analysis_findings")
        .select(FINDING_COLS + ", review_status, review_reason, reviewed_by, reviewed_at, reviewed_role")
        .eq("id", findingId)
        .maybeSingle();
      if (refetchErr || !updatedRow) {
        return json({
          ok: true,
          findingId,
          atomMappingWarning: atomResolution.warning,
          reportAggregates: agg,
        });
      }

      return json({
        ok: true,
        finding: camelFinding(updatedRow as Record<string, unknown>),
        atomMappingWarning: atomResolution.warning,
        reportAggregates: agg,
      });
    }

    // ── POST /findings/manual ──
    if (method === "POST" && rest === "manual") {
      let body: {
        reportId?: string;
        scriptId?: string;
        versionId?: string;
        startOffsetGlobal?: number;
        endOffsetGlobal?: number;
        excerpt?: string;
        articleId?: number;
        atomId?: string | null;
        severity?: string;
        manualComment?: string;
      };
      try {
        body = await req.json();
      } catch {
        return json({ error: "Invalid JSON" }, 400);
      }
      const reportId = body.reportId?.trim();
      const scriptId = body.scriptId?.trim();
      const versionId = body.versionId?.trim();
      const startOffsetGlobal = body.startOffsetGlobal;
      const endOffsetGlobal = body.endOffsetGlobal;
      const articleId = body.articleId;
      const atomId = body.atomId?.trim() || null;
      const severity = body.severity?.trim();
      const manualComment = body.manualComment?.trim() ?? "";
      const excerpt = body.excerpt?.trim() ?? "";

      if (!reportId || !scriptId || !versionId) {
        return json({ error: "reportId, scriptId, versionId required" }, 400);
      }
      if (typeof startOffsetGlobal !== "number" || typeof endOffsetGlobal !== "number" || startOffsetGlobal < 0 || endOffsetGlobal <= startOffsetGlobal) {
        return json({ error: "startOffsetGlobal and endOffsetGlobal required (0 <= start < end)" }, 400);
      }
      if (articleId == null || typeof articleId !== "number") {
        return json({ error: "articleId required" }, 400);
      }
      const atomResolution = await resolveManualAtomId(supabase, articleId, atomId);
      if (atomResolution.error) {
        return json({ error: atomResolution.error }, 400);
      }
      const severityOk = severity && ["low", "medium", "high", "critical"].includes(severity.toLowerCase());
      if (!severityOk) {
        return json({ error: "severity must be low, medium, high, or critical" }, 400);
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
      if (!isAdmin && s.created_by !== uid && s.assignee_id !== uid) {
        return json({ error: "Forbidden" }, 403);
      }

      const { data: report, error: reportErr } = await supabase
        .from("analysis_reports")
        .select("id, job_id, script_id")
        .eq("id", reportId)
        .maybeSingle();
      if (reportErr || !report) {
        return json({ error: "Report not found" }, 404);
      }
      const r = report as { job_id: string; script_id: string };
      if (r.script_id !== scriptId) {
        return json({ error: "Report does not belong to this script" }, 400);
      }
      const jobId = r.job_id;

      const { data: textRow, error: textErr } = await supabase
        .from("script_text")
        .select("content")
        .eq("version_id", versionId)
        .maybeSingle();
      if (textErr || !textRow) {
        return json({ error: "Script text not found for version" }, 404);
      }
      const content = (textRow as { content: string }).content ?? "";
      let resolvedStartOffsetGlobal = startOffsetGlobal;
      let resolvedEndOffsetGlobal = endOffsetGlobal;
      if (excerpt) {
        const sliced = content.slice(startOffsetGlobal, endOffsetGlobal);
        if (compactWhitespace(sliced) !== compactWhitespace(excerpt)) {
          const nearest = findNearestRawOccurrence(content, excerpt, startOffsetGlobal);
          if (nearest != null) {
            resolvedStartOffsetGlobal = nearest;
            resolvedEndOffsetGlobal = nearest + excerpt.length;
          }
        }
      }
      const evidenceSnippet =
        content.slice(resolvedStartOffsetGlobal, resolvedEndOffsetGlobal) ||
        excerpt ||
        body.manualComment?.slice(0, 500) ||
        "—";

      const evidenceHash = "manual-" + crypto.randomUUID();
      const titleAr = "ملاحظة يدوية";
      const descriptionAr = manualComment || evidenceSnippet;

      const { data: pageRows } = await supabase
        .from("script_pages")
        .select("page_number, content")
        .eq("version_id", versionId)
        .order("page_number", { ascending: true });
      const { offsetToPageNumber, computePageLocalSpan } = await import("../_shared/offsetToPage.ts");
      const pr = (pageRows ?? []) as { page_number: number; content: string }[];
      const pageNumber = pr.length > 0 ? offsetToPageNumber(resolvedStartOffsetGlobal, pr) : null;
      const pageLocal =
        pr.length > 0 ? computePageLocalSpan(resolvedStartOffsetGlobal, resolvedEndOffsetGlobal, pr) : { start_offset_page: null, end_offset_page: null };

      const insertPayload: Record<string, unknown> = {
        job_id: jobId,
        script_id: scriptId,
        version_id: versionId,
        source: "manual",
        created_by: uid,
        article_id: articleId,
        atom_id: atomResolution.normalizedAtomId,
        severity: severity!.toLowerCase(),
        confidence: 1,
        title_ar: titleAr,
        description_ar: descriptionAr,
        evidence_snippet: evidenceSnippet,
        start_offset_global: resolvedStartOffsetGlobal,
        end_offset_global: resolvedEndOffsetGlobal,
        evidence_hash: evidenceHash,
        manual_comment: manualComment || null,
        anchor_status: "exact",
        anchor_method: "stored_offsets",
        anchor_start_offset_global: resolvedStartOffsetGlobal,
        anchor_end_offset_global: resolvedEndOffsetGlobal,
        anchor_text: evidenceSnippet,
        anchor_confidence: 1,
        anchor_updated_at: new Date().toISOString(),
      };
      if (pageNumber != null) insertPayload.page_number = pageNumber;
      if (pageLocal.start_offset_page != null) insertPayload.start_offset_page = pageLocal.start_offset_page;
      if (pageLocal.end_offset_page != null) insertPayload.end_offset_page = pageLocal.end_offset_page;
      if (pageNumber != null) insertPayload.anchor_page_number = pageNumber;
      if (pageLocal.start_offset_page != null) insertPayload.anchor_start_offset_page = pageLocal.start_offset_page;
      if (pageLocal.end_offset_page != null) insertPayload.anchor_end_offset_page = pageLocal.end_offset_page;

      const { data: inserted, error: insertErr } = await supabase
        .from("analysis_findings")
        .insert(insertPayload)
        .select("id, job_id, script_id, version_id, source, article_id, atom_id, severity, confidence, title_ar, description_ar, evidence_snippet, start_offset_global, end_offset_global, start_offset_page, end_offset_page, page_number, anchor_status, anchor_method, anchor_page_number, anchor_start_offset_page, anchor_end_offset_page, anchor_start_offset_global, anchor_end_offset_global, anchor_text, anchor_confidence, anchor_updated_at, created_at, review_status, created_by, manual_comment")
        .single();

      if (insertErr) {
        console.error("[findings] manual insert error:", insertErr.message);
        return json({ error: insertErr.message }, 500);
      }
      const insertedRow = inserted as { id: string; article_id: number; atom_id: string | null; confidence?: number | null };
      const reviewFindingId = await createManualReviewFinding(supabase, {
        reportId,
        jobId,
        scriptId,
        versionId,
        articleId,
        atomId: atomResolution.normalizedAtomId,
        severity: severity!.toLowerCase(),
        evidenceSnippet,
        manualComment: manualComment || null,
        pageNumber,
        startOffsetGlobal: resolvedStartOffsetGlobal,
        endOffsetGlobal: resolvedEndOffsetGlobal,
        startOffsetPage: pageLocal.start_offset_page,
        endOffsetPage: pageLocal.end_offset_page,
        uid,
      });
      // Dual-write adapter: populate policy link table if mapping tables are available.
      const conceptCode = insertedRow.atom_id ? `ART${insertedRow.article_id}_ATOM_${insertedRow.atom_id.replace(/[^\d-]/g, "")}` : `ART${insertedRow.article_id}_GENERIC`;
      const { data: concept } = await supabase
        .from("policy_atom_concepts")
        .upsert(
          {
            code: conceptCode,
            title_ar: `مفهوم ${conceptCode}`,
            description_ar: "Auto-generated from manual finding",
            status: "active",
            version: 1,
          },
          { onConflict: "code" }
        )
        .select("id")
        .single();
      const { data: map } = await supabase
        .from("policy_article_atom_map")
        .upsert(
          {
            article_id: insertedRow.article_id,
            atom_concept_id: (concept as { id: string } | null)?.id,
            local_atom_code: insertedRow.atom_id ? insertedRow.atom_id.split("-")[1] ?? null : null,
            rationale_ar: "Auto-mapped from manual finding",
            overlap_type: "primary",
            priority: 1,
            source: "manual",
            is_active: true,
          },
          { onConflict: "article_id,atom_concept_id,is_active" }
        )
        .select("id")
        .single();
      if (concept?.id) {
        await supabase
          .from("analysis_finding_policy_links")
          .upsert(
            {
              finding_id: insertedRow.id,
              article_id: insertedRow.article_id,
              atom_concept_id: concept.id,
              map_id: (map as { id?: string } | null)?.id ?? null,
              link_role: "primary",
              confidence: insertedRow.confidence ?? 1,
              rationale_ar: "Manual finding auto-linked",
              created_by_model: "manual",
            },
            { onConflict: "finding_id,article_id,atom_concept_id" }
          );
      }
      if (reviewFindingId) {
        await supabase
          .from("analysis_review_finding_sources")
          .upsert(
            {
              review_finding_id: reviewFindingId,
              analysis_finding_id: insertedRow.id,
              link_role: "primary",
            },
            { onConflict: "review_finding_id,analysis_finding_id" },
          );
      }

      await recomputeReportAggregates(supabase, jobId, uid, "user");

      const row = inserted as Record<string, unknown>;
      return json({
        ...camelFinding(row, (row.created_by as string) ?? uid),
        atomMappingWarning: atomResolution.warning,
      });
    }

    // Legacy stubs
    if (method === "POST" && rest === "") return json({ error: "Not implemented" }, 501);
    if (method === "PUT" && rest.length > 0) return json({ error: "Not implemented" }, 501);

    return json({ error: "Not Found" }, 404);
  } catch (e) {
    console.error("[findings] UNHANDLED ERROR:", e);
    return json({ error: String(e) }, 500);
  }
});
