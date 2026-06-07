/**
 * Reports Edge Function (crash-proof)
 *
 * GET  /reports?jobId=<uuid>           → single report by job_id
 * GET  /reports?scriptId=<uuid>        → list reports for script (newest first)
 * GET  /reports?id=<uuid>              → single report by report PK id
 * POST /reports  { id, review_status, review_notes } → update review
 *
 * NOTE: PDF generation has been moved to client-side (@react-pdf/renderer).
 * The following legacy PDF routes have been removed:
 * - GET /reports/analysis.pdf
 * - GET /reports/audit.pdf
 * - GET /reports/glossary.pdf
 * - GET /reports/clients.pdf
 */
// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// @ts-ignore
declare const Deno: any;

import { corsHeaders, jsonResponse, optionsResponse } from "../_shared/cors.ts";
import { requireAuth } from "../_shared/auth.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { isUserAdmin, isSuperAdminOrAdmin } from "../_shared/roleCheck.ts";
// Imports for PDF generation removed (migrated to client-side)

// Base columns always available; extended columns added by migrations 0005/0007/0010.
const BASE_COLS = "id, job_id, script_id, version_id, summary_json, report_html, findings_count, severity_counts, created_at";
const ENRICH_COLS = "scripts(title, clients(name_ar, name_en))";
const LIST_COLS = "id, job_id, script_id, version_id, findings_count, severity_counts, created_at";

function camelReport(r: Record<string, unknown>, full = false) {
  const summaryJson = (r.summary_json as Record<string, unknown> | null | undefined) ?? {};
  const totals = (summaryJson.totals as Record<string, unknown> | null | undefined) ?? {};
  const out: Record<string, unknown> = {
    id: r.id,
    jobId: r.job_id,
    scriptId: r.script_id,
    versionId: r.version_id,
    findingsCount: r.findings_count ?? 0,
    severityCounts: r.severity_counts ?? { low: 0, medium: 0, high: 0, critical: 0 },
    typeCounts: totals.type_counts ?? undefined,
    approvedCount: r.approved_count ?? 0,
    createdAt: r.created_at,
    createdBy: r.created_by ?? null,
    reviewStatus: r.review_status ?? "under_review",
    reviewedBy: r.reviewed_by ?? null,
    reviewedAt: r.reviewed_at ?? r.last_reviewed_at ?? r.created_at ?? null,
    lastReviewedAt: r.last_reviewed_at ?? r.reviewed_at ?? null,
    lastReviewedBy: r.last_reviewed_by ?? null,
    lastReviewedRole: r.last_reviewed_role ?? null,
  };
  if (full) {
    out.summaryJson = r.summary_json ?? {};
    out.reportHtml = r.report_html ?? "";
    out.reviewNotes = r.review_notes ?? null;
  }

  const scriptData = (r as any).scripts;
  if (scriptData) {
    out.scriptTitle = scriptData.title;
    const clientData = scriptData.clients;
    if (clientData) {
      out.clientName = clientData.name_ar || clientData.name_en;
    }
  }

  return out;
}

function parseIsoDateInput(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function startOfIsoDay(value: string): string {
  const dt = new Date(value);
  dt.setUTCHours(0, 0, 0, 0);
  return dt.toISOString();
}

function endOfIsoDay(value: string): string {
  const dt = new Date(value);
  dt.setUTCHours(23, 59, 59, 999);
  return dt.toISOString();
}

function minutesBetween(start?: string | null, end?: string | null): number | null {
  if (!start || !end) return null;
  const a = new Date(start).getTime();
  const b = new Date(end).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return Math.max(0, Math.round((b - a) / 60000));
}

function daysBetween(start?: string | null, end?: string | null): number | null {
  if (!start || !end) return null;
  const a = new Date(start).getTime();
  const b = new Date(end).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return Math.max(0, Math.ceil((b - a) / 86_400_000));
}

/** Try to select with extended columns; if that fails, fall back to base. */
async function selectReport(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  filter: { col: string; val: string },
  full: boolean
) {
  const cols = full ? BASE_COLS : LIST_COLS;
  const extCols = cols + ", created_by, approved_count, review_status, reviewed_by, reviewed_at, last_reviewed_at, last_reviewed_by, last_reviewed_role" + (full ? ", review_notes" : "");
  const { data, error } = await supabase
    .from("analysis_reports")
    .select(`${extCols}, ${ENRICH_COLS}`)
    .eq(filter.col, filter.val)
    .maybeSingle();
  if (!error) return { data, error: null };
  console.warn("[reports] extended or enrich columns not available, falling back:", error.message);
  const fallback = await supabase
    .from("analysis_reports")
    .select(cols)
    .eq(filter.col, filter.val)
    .maybeSingle();
  return fallback;
}

async function selectReportList(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  scriptId: string
) {
  const cols = LIST_COLS;
  const extCols = cols + ", created_by, approved_count, review_status, reviewed_by, reviewed_at, last_reviewed_at, last_reviewed_by, last_reviewed_role";
  const { data, error } = await supabase
    .from("analysis_reports")
    .select(extCols)
    .eq("script_id", scriptId)
    .order("created_at", { ascending: false });
  if (!error) return { data, error: null };
  console.warn("[reports] extended columns not available for list, falling back:", error.message);
  const fallback = await supabase
    .from("analysis_reports")
    .select(cols)
    .eq("script_id", scriptId)
    .order("created_at", { ascending: false });
  return fallback;
}

async function enrichReportListItems(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  reports: any[]
) {
  if (!reports || reports.length === 0) return [];

  const scriptIds = [...new Set(reports.map((r: any) => r.script_id).filter(Boolean))];
  const jobIds = [...new Set(reports.map((r: any) => r.job_id).filter(Boolean))];

  const [scriptsResult, jobsResult] = await Promise.all([
    scriptIds.length > 0
      ? supabase.from("scripts").select("id, title, company_id, created_by").in("id", scriptIds)
      : Promise.resolve({ data: [], error: null }),
    jobIds.length > 0
      ? supabase.from("analysis_jobs").select("id, created_by").in("id", jobIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const scripts = scriptsResult.data ?? [];
  const jobs = jobsResult.data ?? [];
  const companyIds = [...new Set(scripts.map((s: any) => s.company_id).filter(Boolean))];
  const creatorIds = [...new Set(jobs.map((j: any) => j.created_by).filter(Boolean))];

  const [companiesResult, creatorsResult] = await Promise.all([
    companyIds.length > 0
      ? supabase.from("clients").select("id, name_ar, name_en").in("id", companyIds)
      : Promise.resolve({ data: [], error: null }),
    creatorIds.length > 0
      ? supabase.from("profiles").select("user_id, name").in("user_id", creatorIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const companies = companiesResult.data ?? [];
  const creators = creatorsResult.data ?? [];

  return reports.map((r: any) => {
    const base = camelReport(r as Record<string, unknown>) as Record<string, unknown>;
    const script = scripts.find((s: any) => s.id === r.script_id);
    const job = jobs.find((j: any) => j.id === r.job_id);
    const company = companies.find((c: any) => c.id === script?.company_id);
    const creator = creators.find((c: any) => c.user_id === job?.created_by);
    return {
      ...base,
      scriptTitle: script?.title ?? base.scriptTitle ?? undefined,
      companyId: script?.company_id ?? undefined,
      companyNameAr: company?.name_ar ?? undefined,
      companyNameEn: company?.name_en ?? undefined,
      clientName: (company?.name_ar || company?.name_en || base.clientName) ?? undefined,
      scriptOwnerId: script?.created_by ?? undefined,
      reportCreatorId: job?.created_by ?? base.reportCreatorId ?? undefined,
      reportCreatorName: creator?.name ?? undefined,
    };
  });
}

async function checkOwnership(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  jobId: string,
  uid: string
): Promise<boolean> {
  const { data: job } = await supabase
    .from("analysis_jobs")
    .select("created_by")
    .eq("id", jobId)
    .maybeSingle();
  return !!job && (job as any).created_by === uid;
}

async function checkScriptAccess(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  scriptId: string,
  uid: string,
  isAdmin: boolean,
): Promise<{ allowed: boolean; script?: Record<string, unknown> | null; error?: string }> {
  const { data: script, error } = await supabase
    .from("scripts")
    .select("id, title, status, created_at, received_at, created_by, assignee_id, client_id, company_id, type, work_classification, episode_count, expected_rank, synopsis, story_summary, file_url, script_summary_pdf_url, has_security_scenes, security_content_attachment_url")
    .eq("id", scriptId)
    .maybeSingle();
  if (error) return { allowed: false, error: error.message };
  if (!script) return { allowed: false, error: "Script not found" };
  const s = script as { created_by?: string | null; assignee_id?: string | null };
  const allowed = isAdmin || s.created_by === uid || s.assignee_id === uid;
  return { allowed, script };
}

async function buildScriptJourneyPayload(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  script: Record<string, unknown>,
) {
  const scriptId = String(script.id);
  const companyId = String((script.company_id ?? script.client_id ?? "") || "");

  const [
    clientRes,
    cyclesRes,
    cycleEventsRes,
    cycleSnapshotsRes,
    cycleComparisonsRes,
    reportsRes,
    jobsRes,
    findingsRes,
    statusHistoryRes,
  ] = await Promise.all([
    companyId
      ? supabase.from("clients").select("id, name_ar, name_en, beneficiary_type, contact_person, contact_person_email, email").eq("id", companyId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("script_revision_cycles")
      .select("id, cycle_number, status, sent_by, sent_at, returned_at, reanalyzed_at, source_job_id, source_report_id, reanalyzed_job_id, reanalyzed_report_id, beneficiary_returned_version_id, admin_note, created_at, updated_at")
      .eq("script_id", scriptId)
      .order("cycle_number", { ascending: true }),
    supabase
      .from("script_revision_cycle_events")
      .select("id, cycle_id, event_type, actor_user_id, payload, created_at")
      .eq("script_id", scriptId)
      .order("created_at", { ascending: true }),
    supabase
      .from("script_revision_cycle_snapshots")
      .select("id, cycle_id, findings_total, findings_by_severity, findings_by_source, checklist_summary, created_at")
      .eq("script_id", scriptId)
      .order("created_at", { ascending: true }),
    supabase
      .from("script_revision_cycle_comparisons")
      .select("id, cycle_id, comparison_summary, created_at")
      .eq("script_id", scriptId)
      .order("created_at", { ascending: true }),
    supabase
      .from("analysis_reports")
      .select("id, job_id, script_id, findings_count, severity_counts, summary_json, review_status, reviewed_by, reviewed_at, created_at")
      .eq("script_id", scriptId)
      .order("created_at", { ascending: true }),
    supabase
      .from("analysis_jobs")
      .select("id, script_id, status, created_by, created_at, started_at, completed_at, config_snapshot")
      .eq("script_id", scriptId)
      .order("created_at", { ascending: true }),
    supabase
      .from("analysis_findings")
      .select("id, job_id, source, severity, created_at")
      .eq("script_id", scriptId),
    supabase
      .from("script_status_history")
      .select("id, to_status, changed_at, changed_by, reason, related_report_id, metadata")
      .eq("script_id", scriptId)
      .order("changed_at", { ascending: true }),
  ]);

  const cycles = (cyclesRes.data ?? []) as Array<Record<string, unknown>>;
  const cycleEvents = (cycleEventsRes.data ?? []) as Array<Record<string, unknown>>;
  const cycleSnapshots = (cycleSnapshotsRes.data ?? []) as Array<Record<string, unknown>>;
  const cycleComparisons = (cycleComparisonsRes.data ?? []) as Array<Record<string, unknown>>;
  const reports = (reportsRes.data ?? []) as Array<Record<string, unknown>>;
  const jobs = (jobsRes.data ?? []) as Array<Record<string, unknown>>;
  const findings = (findingsRes.data ?? []) as Array<Record<string, unknown>>;
  const history = (statusHistoryRes.data ?? []) as Array<Record<string, unknown>>;

  const actorIds = new Set<string>();
  for (const row of cycleEvents) {
    const actor = row.actor_user_id;
    if (typeof actor === "string" && actor) actorIds.add(actor);
  }
  for (const row of cycles) {
    const actor = row.sent_by;
    if (typeof actor === "string" && actor) actorIds.add(actor);
  }
  for (const row of jobs) {
    const actor = row.created_by;
    if (typeof actor === "string" && actor) actorIds.add(actor);
  }
  for (const row of history) {
    const actor = row.changed_by;
    if (typeof actor === "string" && actor) actorIds.add(actor);
  }

  const { data: profileRows } = actorIds.size > 0
    ? await supabase.from("profiles").select("user_id, name").in("user_id", [...actorIds])
    : { data: [] as Array<{ user_id: string; name?: string | null }> };
  const profileById = new Map<string, string>();
  for (const row of profileRows ?? []) {
    profileById.set(row.user_id, row.name ?? row.user_id);
  }

  const findingsByJob = new Map<string, Array<Record<string, unknown>>>();
  for (const f of findings) {
    const jobId = String(f.job_id ?? "");
    if (!jobId) continue;
    if (!findingsByJob.has(jobId)) findingsByJob.set(jobId, []);
    findingsByJob.get(jobId)!.push(f);
  }

  const reportById = new Map<string, Record<string, unknown>>();
  for (const r of reports) reportById.set(String(r.id), r);

  const snapshotByCycle = new Map<string, Record<string, unknown>>();
  for (const snap of cycleSnapshots) {
    const cycleId = String(snap.cycle_id ?? "");
    if (!cycleId) continue;
    snapshotByCycle.set(cycleId, snap);
  }
  const comparisonByCycle = new Map<string, Record<string, unknown>>();
  for (const cmp of cycleComparisons) {
    const cycleId = String(cmp.cycle_id ?? "");
    if (!cycleId) continue;
    comparisonByCycle.set(cycleId, cmp);
  }

  const scriptCreatedAt = String(script.created_at ?? "");
  const scriptReceivedAt = String(script.received_at ?? scriptCreatedAt);
  const finalDecision = [...history].reverse().find((row) => {
    const status = String(row.to_status ?? "").toLowerCase();
    return status === "approved" || status === "rejected";
  }) ?? null;
  const finalDecisionAt = String(finalDecision?.changed_at ?? "");
  const processDays = scriptReceivedAt && finalDecisionAt
    ? Math.max(0, Math.ceil((new Date(finalDecisionAt).getTime() - new Date(scriptReceivedAt).getTime()) / 86_400_000))
    : null;

  const cycleCards = cycles.map((cycle) => {
    const cycleId = String(cycle.id ?? "");
    const cycleNumber = Number(cycle.cycle_number ?? 0);
    const sourceJobId = String(cycle.source_job_id ?? "");
    const reJobId = String(cycle.reanalyzed_job_id ?? "");
    const sourceFindings = sourceJobId ? (findingsByJob.get(sourceJobId) ?? []) : [];
    const reFindings = reJobId ? (findingsByJob.get(reJobId) ?? []) : [];
    const bySeverity = (list: Array<Record<string, unknown>>) => {
      const out = { low: 0, medium: 0, high: 0, critical: 0 };
      for (const row of list) {
        const s = String(row.severity ?? "").toLowerCase();
        if (s in out) (out as Record<string, number>)[s] += 1;
      }
      return out;
    };
    const bySource = (list: Array<Record<string, unknown>>) => {
      const out: Record<string, number> = {};
      for (const row of list) {
        const s = String(row.source ?? "unknown");
        out[s] = (out[s] ?? 0) + 1;
      }
      return out;
    };
    return {
      cycleId,
      cycleNumber,
      status: cycle.status ?? null,
      sentAt: cycle.sent_at ?? null,
      returnedAt: cycle.returned_at ?? null,
      reanalyzedAt: cycle.reanalyzed_at ?? null,
      adminNote: cycle.admin_note ?? null,
      sentBy: cycle.sent_by ?? null,
      sentByName: typeof cycle.sent_by === "string" ? (profileById.get(cycle.sent_by) ?? cycle.sent_by) : null,
      sourceJobId: sourceJobId || null,
      reanalyzedJobId: reJobId || null,
      sourceReportId: cycle.source_report_id ?? null,
      reanalyzedReportId: cycle.reanalyzed_report_id ?? null,
      sourceFindingsTotal: sourceFindings.length,
      reanalyzedFindingsTotal: reFindings.length,
      sourceFindingsBySeverity: bySeverity(sourceFindings),
      reanalyzedFindingsBySeverity: bySeverity(reFindings),
      sourceFindingsBySource: bySource(sourceFindings),
      reanalyzedFindingsBySource: bySource(reFindings),
      snapshot: snapshotByCycle.get(cycleId)?.checklist_summary ?? null,
      comparison: comparisonByCycle.get(cycleId)?.comparison_summary ?? null,
    };
  });

  const timeline: Array<Record<string, unknown>> = [
    {
      type: "script_received",
      at: scriptReceivedAt,
      actorId: script.created_by ?? null,
      actorName: typeof script.created_by === "string" ? (profileById.get(script.created_by) ?? script.created_by) : null,
      note: "Script received in admin system",
    },
    ...jobs.map((job) => ({
      type: "analysis_job_created",
      at: job.created_at ?? null,
      actorId: job.created_by ?? null,
      actorName: typeof job.created_by === "string" ? (profileById.get(job.created_by) ?? job.created_by) : null,
      note: `Analysis job created (${String(job.status ?? "unknown")})`,
      jobId: job.id ?? null,
    })),
    ...cycleEvents.map((ev) => ({
      type: ev.event_type ?? "cycle_event",
      at: ev.created_at ?? null,
      actorId: ev.actor_user_id ?? null,
      actorName: typeof ev.actor_user_id === "string" ? (profileById.get(ev.actor_user_id) ?? ev.actor_user_id) : null,
      cycleId: ev.cycle_id ?? null,
      payload: ev.payload ?? null,
      note: String(ev.event_type ?? "cycle_event"),
    })),
    ...history.map((h) => ({
      type: "script_status_changed",
      at: h.changed_at ?? null,
      actorId: h.changed_by ?? null,
      actorName: typeof h.changed_by === "string" ? (profileById.get(h.changed_by) ?? h.changed_by) : null,
      toStatus: h.to_status ?? null,
      reason: h.reason ?? null,
      relatedReportId: h.related_report_id ?? null,
      note: `Status changed to ${String(h.to_status ?? "")}`,
    })),
  ].filter((row) => row.at != null).sort((a, b) => String(a.at).localeCompare(String(b.at)));

  const firstCycleSourceCount = cycleCards[0]?.sourceFindingsTotal ?? 0;
  const finalCycleReCount = cycleCards.length > 0
    ? (cycleCards[cycleCards.length - 1]?.reanalyzedFindingsTotal ?? cycleCards[cycleCards.length - 1]?.sourceFindingsTotal ?? 0)
    : 0;

  return {
    script: {
      id: script.id,
      title: script.title,
      status: script.status,
      createdAt: script.created_at,
      receivedAt: script.received_at ?? script.created_at,
      type: script.type ?? null,
      workClassification: script.work_classification ?? null,
      episodeCount: script.episode_count ?? null,
      expectedRank: script.expected_rank ?? null,
      synopsis: script.synopsis ?? null,
      storySummary: script.story_summary ?? null,
      attachments: {
        scriptFileUrl: script.file_url ?? null,
        scriptSummaryPdfUrl: script.script_summary_pdf_url ?? null,
        hasSecurityScenes: script.has_security_scenes ?? null,
        securityContentAttachmentUrl: script.security_content_attachment_url ?? null,
      },
    },
    beneficiary: {
      id: clientRes.data?.id ?? null,
      nameAr: clientRes.data?.name_ar ?? null,
      nameEn: clientRes.data?.name_en ?? null,
      type: (clientRes.data as Record<string, unknown> | null)?.beneficiary_type ?? null,
      contactPerson: (clientRes.data as Record<string, unknown> | null)?.contact_person ?? null,
      contactPersonEmail: (clientRes.data as Record<string, unknown> | null)?.contact_person_email ?? null,
      email: (clientRes.data as Record<string, unknown> | null)?.email ?? null,
    },
    decision: {
      status: finalDecision?.to_status ?? null,
      decidedAt: finalDecision?.changed_at ?? null,
      decidedBy: finalDecision?.changed_by ?? null,
      decidedByName: typeof finalDecision?.changed_by === "string" ? (profileById.get(finalDecision.changed_by) ?? finalDecision.changed_by) : null,
      reason: finalDecision?.reason ?? null,
      relatedReportId: finalDecision?.related_report_id ?? null,
    },
    summary: {
      totalCycles: cycleCards.length,
      totalProcessDays: processDays,
      firstFindingsCount: firstCycleSourceCount,
      finalFindingsCount: finalCycleReCount,
      reportsCount: reports.length,
      jobsCount: jobs.length,
    },
    timeline,
    cycles: cycleCards,
    findingsEvolution: cycleCards.map((cycle) => ({
      cycleNumber: cycle.cycleNumber,
      sourceFindingsTotal: cycle.sourceFindingsTotal,
      reanalyzedFindingsTotal: cycle.reanalyzedFindingsTotal,
      comparisonSummary: cycle.comparison ?? null,
    })),
    adminActivity: timeline.filter((row) => {
      const actorId = row.actorId;
      return typeof actorId === "string" && actorId.length > 0;
    }),
    complianceSnapshot: {
      latestReportId: reports.length > 0 ? reports[reports.length - 1].id : null,
      latestChecklist: reports.length > 0 ? ((reports[reports.length - 1].summary_json as Record<string, unknown> | null)?.checklist_articles ?? null) : null,
    },
  };
}

async function buildRegulatorPerformancePayload(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  regulatorUserId: string,
  fromIso: string | null,
  toIso: string | null,
) {
  const [{ data: profile }, { data: roleRows }] = await Promise.all([
    supabase.from("profiles").select("user_id, name, email").eq("user_id", regulatorUserId).maybeSingle(),
    supabase.from("user_roles").select("role_id, roles(key)").eq("user_id", regulatorUserId),
  ]);

  const roleKey = ((roleRows ?? []) as Array<{ roles?: { key?: string | null } }>)
    .map((row) => String(row.roles?.key ?? "").toLowerCase())
    .find(Boolean) ?? null;

  const rangeFrom = fromIso ? startOfIsoDay(fromIso) : null;
  const rangeTo = toIso ? endOfIsoDay(toIso) : null;

  const scriptQuery = supabase
    .from("scripts")
    .select("id, title, status, received_at, created_at, updated_at, assignee_id, created_by, company_id, client_id")
    .eq("assignee_id", regulatorUserId)
    .order("created_at", { ascending: false });
  if (rangeFrom) scriptQuery.gte("created_at", rangeFrom);
  if (rangeTo) scriptQuery.lte("created_at", rangeTo);
  const { data: assignedScripts } = await scriptQuery;

  const assignedScriptRows = (assignedScripts ?? []) as Array<Record<string, unknown>>;
  const assignedScriptIds = assignedScriptRows.map((row) => String(row.id ?? "")).filter(Boolean);

  const [recommendationsRes, cyclesRes, statusHistoryRes, reportsRes, cycleEventsRes, cycleComparisonsRes, notificationsRes] = await Promise.all([
    assignedScriptIds.length > 0
      ? supabase
          .from("script_recommendation_events")
          .select("id, script_id, report_id, recommended_by, recommendation_type, reason, created_at")
          .in("script_id", assignedScriptIds)
          .eq("recommended_by", regulatorUserId)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [] as any[] }),
    assignedScriptIds.length > 0
      ? supabase
          .from("script_revision_cycles")
          .select("id, script_id, cycle_number, status, sent_by, sent_at, returned_at, reanalyzed_at, source_report_id, source_job_id, reanalyzed_job_id, reanalyzed_report_id, beneficiary_returned_version_id, admin_note, created_at, updated_at")
          .in("script_id", assignedScriptIds)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [] as any[] }),
    assignedScriptIds.length > 0
      ? supabase
          .from("script_status_history")
          .select("id, script_id, to_status, changed_at, changed_by, reason, related_report_id, metadata")
          .in("script_id", assignedScriptIds)
          .order("changed_at", { ascending: true })
      : Promise.resolve({ data: [] as any[] }),
    assignedScriptIds.length > 0
      ? supabase
          .from("analysis_reports")
          .select("id, job_id, script_id, findings_count, severity_counts, summary_json, review_status, reviewed_by, reviewed_at, created_at")
          .in("script_id", assignedScriptIds)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [] as any[] }),
    assignedScriptIds.length > 0
      ? supabase
          .from("script_revision_cycle_events")
          .select("id, cycle_id, script_id, event_type, actor_user_id, payload, created_at")
          .in("script_id", assignedScriptIds)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [] as any[] }),
    assignedScriptIds.length > 0
      ? supabase
          .from("script_revision_cycle_comparisons")
          .select("id, cycle_id, comparison_summary, created_at")
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [] as any[] }),
    assignedScriptIds.length > 0
      ? supabase
          .from("notifications")
          .select("id, type, title, body, metadata, created_at")
          .eq("user_id", regulatorUserId)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const recommendations = (recommendationsRes.data ?? []) as Array<Record<string, unknown>>;
  const cycles = (cyclesRes.data ?? []) as Array<Record<string, unknown>>;
  const statusHistory = (statusHistoryRes.data ?? []) as Array<Record<string, unknown>>;
  const reports = (reportsRes.data ?? []) as Array<Record<string, unknown>>;
  const cycleEvents = (cycleEventsRes.data ?? []) as Array<Record<string, unknown>>;
  const cycleComparisons = (cycleComparisonsRes.data ?? []) as Array<Record<string, unknown>>;
  const notifications = (notificationsRes.data ?? []) as Array<Record<string, unknown>>;

  const scriptIds = [...new Set(assignedScriptIds)];
  const reportIds = [...new Set([
    ...recommendations.map((row) => row.report_id).filter((v): v is string => typeof v === "string" && v.trim().length > 0),
    ...cycles.flatMap((row) => [row.source_report_id, row.reanalyzed_report_id]).filter((v): v is string => typeof v === "string" && v.trim().length > 0),
    ...reports.map((row) => row.id).filter((v): v is string => typeof v === "string" && v.trim().length > 0),
  ])];

  const [reportProfilesRes, scriptProfilesRes] = await Promise.all([
    reportIds.length > 0
      ? supabase.from("profiles").select("user_id, name, email").in("user_id", [...new Set([
          ...recommendations.map((row) => row.recommended_by).filter((v): v is string => typeof v === "string" && v.trim().length > 0),
          ...cycles.map((row) => row.sent_by).filter((v): v is string => typeof v === "string" && v.trim().length > 0),
          ...statusHistory.map((row) => row.changed_by).filter((v): v is string => typeof v === "string" && v.trim().length > 0),
          regulatorUserId,
        ])])
      : Promise.resolve({ data: [] as any[] }),
    scriptIds.length > 0
      ? supabase.from("clients").select("id, name_ar, name_en, beneficiary_type").in("id", [...new Set(assignedScriptRows.map((row) => String(row.company_id ?? row.client_id ?? "")).filter(Boolean))])
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const actorProfiles = (reportProfilesRes.data ?? []) as Array<{ user_id: string; name?: string | null; email?: string | null }>;
  const actorNameById = new Map(actorProfiles.map((row) => [row.user_id, row.name ?? row.email ?? row.user_id]));
  if (profile?.user_id) actorNameById.set(profile.user_id, profile.name ?? profile.email ?? profile.user_id);

  const companyRows = (scriptProfilesRes.data ?? []) as Array<{ id: string; name_ar?: string | null; name_en?: string | null; beneficiary_type?: string | null }>;
  const companyNameById = new Map(companyRows.map((row) => [row.id, row.name_ar ?? row.name_en ?? row.id]));
  const companyTypeById = new Map(companyRows.map((row) => [row.id, row.beneficiary_type ?? null]));

  const latestRecommendationByScript = new Map<string, Record<string, unknown>>();
  for (const row of recommendations) {
    const scriptId = String(row.script_id ?? "");
    if (!scriptId) continue;
    latestRecommendationByScript.set(scriptId, row);
  }

  const latestDecisionByScript = new Map<string, Record<string, unknown>>();
  for (const row of statusHistory) {
    const scriptId = String(row.script_id ?? "");
    if (!scriptId) continue;
    const status = String(row.to_status ?? "").toLowerCase();
    if (status === "approved" || status === "rejected") {
      latestDecisionByScript.set(scriptId, row);
    }
  }

  const cyclesByScript = new Map<string, Array<Record<string, unknown>>>();
  for (const row of cycles) {
    const scriptId = String(row.script_id ?? "");
    if (!scriptId) continue;
    const bucket = cyclesByScript.get(scriptId) ?? [];
    bucket.push(row);
    cyclesByScript.set(scriptId, bucket);
  }

  const eventsByScript = new Map<string, Array<Record<string, unknown>>>();
  for (const row of cycleEvents) {
    const scriptId = String(row.script_id ?? "");
    if (!scriptId) continue;
    const bucket = eventsByScript.get(scriptId) ?? [];
    bucket.push(row);
    eventsByScript.set(scriptId, bucket);
  }

  const reportsByScript = new Map<string, Array<Record<string, unknown>>>();
  for (const row of reports) {
    const scriptId = String(row.script_id ?? "");
    if (!scriptId) continue;
    const bucket = reportsByScript.get(scriptId) ?? [];
    bucket.push(row);
    reportsByScript.set(scriptId, bucket);
  }

  const timeline = [
    ...recommendations.map((row) => ({
      type: "recommendation_submitted",
      at: row.created_at ?? null,
      scriptId: row.script_id ?? null,
      actorId: row.recommended_by ?? null,
      actorName: typeof row.recommended_by === "string" ? (actorNameById.get(row.recommended_by) ?? row.recommended_by) : null,
      recommendationType: row.recommendation_type ?? null,
      reason: row.reason ?? null,
      reportId: row.report_id ?? null,
    })),
    ...cycles.map((row) => ({
      type: "cycle_sent_for_review",
      at: row.sent_at ?? row.created_at ?? null,
      scriptId: row.script_id ?? null,
      actorId: row.sent_by ?? null,
      actorName: typeof row.sent_by === "string" ? (actorNameById.get(row.sent_by) ?? row.sent_by) : null,
      cycleId: row.id ?? null,
      cycleNumber: row.cycle_number ?? null,
      note: row.admin_note ?? null,
      status: row.status ?? null,
    })),
    ...cycleEvents.map((row) => ({
      type: String(row.event_type ?? "cycle_event"),
      at: row.created_at ?? null,
      scriptId: row.script_id ?? null,
      actorId: row.actor_user_id ?? null,
      actorName: typeof row.actor_user_id === "string" ? (actorNameById.get(row.actor_user_id) ?? row.actor_user_id) : null,
      cycleId: row.cycle_id ?? null,
      payload: row.payload ?? null,
    })),
    ...statusHistory.map((row) => ({
      type: "status_change",
      at: row.changed_at ?? null,
      scriptId: row.script_id ?? null,
      actorId: row.changed_by ?? null,
      actorName: typeof row.changed_by === "string" ? (actorNameById.get(row.changed_by) ?? row.changed_by) : null,
      toStatus: row.to_status ?? null,
      reason: row.reason ?? null,
      relatedReportId: row.related_report_id ?? null,
    })),
    ...notifications.map((row) => ({
      type: String(row.type ?? "notification"),
      at: row.created_at ?? null,
      actorId: regulatorUserId,
      actorName: profile?.name ?? profile?.email ?? regulatorUserId,
      notificationTitle: row.title ?? null,
      notificationBody: row.body ?? null,
      metadata: row.metadata ?? null,
    })),
  ]
    .filter((row) => row.at != null && row.at !== "")
    .filter((row) => {
      const at = String(row.at);
      if (rangeFrom && at < rangeFrom) return false;
      if (rangeTo && at > rangeTo) return false;
      return true;
    })
    .sort((a, b) => String(a.at).localeCompare(String(b.at)));

  const scriptRows = assignedScriptRows.map((script) => {
    const scriptId = String(script.id ?? "");
    const recs = recommendations.filter((row) => String(row.script_id ?? "") === scriptId);
    const cyclesForScript = cyclesByScript.get(scriptId) ?? [];
    const eventsForScript = eventsByScript.get(scriptId) ?? [];
    const reportsForScript = reportsByScript.get(scriptId) ?? [];
    const latestRec = latestRecommendationByScript.get(scriptId) ?? null;
    const finalDecision = latestDecisionByScript.get(scriptId) ?? null;
    const firstActionAt = [...recs, ...cyclesForScript, ...eventsForScript]
      .map((row) => String((row.created_at ?? row.sent_at ?? row.at ?? "") || ""))
      .filter(Boolean)
      .sort()[0] ?? null;
    const lastActionAt = [...recs, ...cyclesForScript, ...eventsForScript]
      .map((row) => String((row.created_at ?? row.updated_at ?? row.sent_at ?? row.at ?? "") || ""))
      .filter(Boolean)
      .sort()
      .at(-1) ?? null;
    const finalDecisionStatus = String(finalDecision?.to_status ?? "").toLowerCase() || null;
    const firstReceivedAt = String(script.received_at ?? script.created_at ?? "");
    return {
      id: scriptId,
      title: script.title ?? null,
      status: script.status ?? null,
      beneficiaryId: script.company_id ?? script.client_id ?? null,
      beneficiaryName: companyNameById.get(String(script.company_id ?? script.client_id ?? "")) ?? null,
      beneficiaryType: companyTypeById.get(String(script.company_id ?? script.client_id ?? "")) ?? null,
      receivedAt: script.received_at ?? script.created_at ?? null,
      assignedAt: script.updated_at ?? script.received_at ?? script.created_at ?? null,
      firstActionAt,
      lastActionAt,
      firstActionMinutes: minutesBetween(firstReceivedAt, firstActionAt),
      turnaroundDays: daysBetween(firstReceivedAt, finalDecision?.changed_at ?? lastActionAt ?? null),
      recommendationsCount: recs.length,
      recommendationApprovalCount: recs.filter((row) => String(row.recommendation_type ?? "").toLowerCase() === "recommended_approval").length,
      recommendationRejectionCount: recs.filter((row) => String(row.recommendation_type ?? "").toLowerCase() === "recommended_rejection").length,
      sendBackCount: cyclesForScript.filter((row) => String(row.sent_by ?? "") === regulatorUserId).length,
      cycleCount: cyclesForScript.length,
      latestRecommendation: latestRec ? {
        type: latestRec.recommendation_type ?? null,
        reason: latestRec.reason ?? null,
        at: latestRec.created_at ?? null,
        reportId: latestRec.report_id ?? null,
      } : null,
      finalDecision: finalDecisionStatus ? {
        status: finalDecisionStatus,
        at: finalDecision?.changed_at ?? null,
        by: finalDecision?.changed_by ?? null,
        byName: typeof finalDecision?.changed_by === "string" ? (actorNameById.get(finalDecision.changed_by) ?? finalDecision.changed_by) : null,
        reason: finalDecision?.reason ?? null,
      } : null,
      reportsCount: reportsForScript.length,
    };
  });

  const totalRecommendations = recommendations.length;
  const totalApprovalRecommendations = recommendations.filter((row) => String(row.recommendation_type ?? "").toLowerCase() === "recommended_approval").length;
  const totalRejectionRecommendations = recommendations.filter((row) => String(row.recommendation_type ?? "").toLowerCase() === "recommended_rejection").length;
  const totalSendBacks = cycles.filter((row) => String(row.sent_by ?? "") === regulatorUserId).length;
  const finalDecisions = scriptRows.filter((row) => Boolean(row.finalDecision));
  const matchingRecommendations = scriptRows.filter((row) => {
    const latest = row.latestRecommendation as { type?: string | null } | null;
    const final = row.finalDecision as { status?: string | null } | null;
    if (!latest || !final?.status) return false;
    const latestType = String(latest.type ?? "").toLowerCase();
    const finalStatus = String(final.status ?? "").toLowerCase();
    return (latestType === "recommended_approval" && finalStatus === "approved")
      || (latestType === "recommended_rejection" && finalStatus === "rejected");
  }).length;

  const firstActionMinutesValues = scriptRows.map((row) => row.firstActionMinutes).filter((v): v is number => typeof v === "number");
  const turnaroundDaysValues = scriptRows.map((row) => row.turnaroundDays).filter((v): v is number => typeof v === "number");

  return {
    regulator: {
      id: regulatorUserId,
      name: profile?.name ?? profile?.email ?? regulatorUserId,
      email: profile?.email ?? null,
      roleKey,
    },
    scope: {
      from: rangeFrom,
      to: rangeTo,
      generatedAt: new Date().toISOString(),
    },
    summary: {
      totalAssignedScripts: assignedScriptRows.length,
      totalRecommendations,
      totalApprovalRecommendations,
      totalRejectionRecommendations,
      totalSendBacks,
      totalCyclesHandled: cycles.length,
      finalDecisionCount: finalDecisions.length,
      finalApprovedCount: finalDecisions.filter((row) => String(row.finalDecision?.status ?? row.to_status ?? "").toLowerCase() === "approved").length,
      finalRejectedCount: finalDecisions.filter((row) => String(row.finalDecision?.status ?? row.to_status ?? "").toLowerCase() === "rejected").length,
      recommendationAgreementRate: totalRecommendations > 0 ? Number(((matchingRecommendations / totalRecommendations) * 100).toFixed(1)) : null,
      averageFirstActionMinutes: firstActionMinutesValues.length > 0 ? Number((firstActionMinutesValues.reduce((a, b) => a + b, 0) / firstActionMinutesValues.length).toFixed(1)) : null,
      averageTurnaroundDays: turnaroundDaysValues.length > 0 ? Number((turnaroundDaysValues.reduce((a, b) => a + b, 0) / turnaroundDaysValues.length).toFixed(1)) : null,
    },
    scripts: scriptRows,
    cycles: cycles.map((cycle) => ({
      id: cycle.id,
      scriptId: cycle.script_id ?? null,
      cycleNumber: cycle.cycle_number ?? null,
      status: cycle.status ?? null,
      sentAt: cycle.sent_at ?? null,
      returnedAt: cycle.returned_at ?? null,
      reanalyzedAt: cycle.reanalyzed_at ?? null,
      sentBy: cycle.sent_by ?? null,
      sentByName: typeof cycle.sent_by === "string" ? (actorNameById.get(cycle.sent_by) ?? cycle.sent_by) : null,
      adminNote: cycle.admin_note ?? null,
      sourceReportId: cycle.source_report_id ?? null,
      reanalyzedReportId: cycle.reanalyzed_report_id ?? null,
      sourceJobId: cycle.source_job_id ?? null,
      reanalyzedJobId: cycle.reanalyzed_job_id ?? null,
      cycleEvents: (eventsByScript.get(String(cycle.script_id ?? "")) ?? []).filter((event) => String(event.cycle_id ?? "") === String(cycle.id ?? "")),
      comparison: cycleComparisons.find((cmp) => String(cmp.cycle_id ?? "") === String(cycle.id ?? "")) ?? null,
    })),
    timeline,
    notes: [
      "First-action timing is based on recorded recommendations, cycle sends, and cycle events. First view/open time is not tracked yet.",
      "Alignment compares the regulator's latest recorded recommendation with the final approved/rejected outcome.",
    ],
  };
}

function pathAfter(base: string, url: string): string {
  const pathname = new URL(url).pathname;
  const match = pathname.match(new RegExp(`/${base}/?(.*)$`));
  return (match?.[1] ?? "").replace(/^\/+/, "").trim();
}

// generateAnalysisPdf helper removed (migrated to client-side)

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? undefined;
  const json = (body: unknown, status = 200) => jsonResponse(body, status, { origin });
  try {
    if (req.method === "OPTIONS") return optionsResponse(req);

    const url = new URL(req.url);
    const pathRest = pathAfter("reports", req.url);

    // ── GET /reports/debug-pdf (Public Debug Route) ──
    // ── GET /reports/debug-pdf (Removed) ──

    const auth = await requireAuth(req);
    if (auth instanceof Response) return auth;
    const uid = auth.userId;
    const supabase = createSupabaseAdmin();

    // Admin bypass check (Robust DB check)
    const isAdmin = await isUserAdmin(supabase, uid);

    // ──────────────── GET ────────────────
    if (req.method === "GET") {
      const url = new URL(req.url);
      const pathRest = pathAfter("reports", req.url);

      const jobId = url.searchParams.get("jobId")?.trim() || undefined;
      const scriptId = url.searchParams.get("scriptId")?.trim() || undefined;
      const reportId = url.searchParams.get("id")?.trim() || undefined;
      const langParam = (url.searchParams.get("lang")?.trim() || "en").toLowerCase();
      const pdfLang = langParam === "ar" ? "ar" : "en";

      if (pathRest === "script-journey") {
        const scriptId = url.searchParams.get("scriptId")?.trim();
        if (!scriptId) return json({ error: "scriptId query param required" }, 400);
        const access = await checkScriptAccess(supabase, scriptId, uid, isAdmin);
        if (access.error) return json({ error: access.error }, access.error === "Script not found" ? 404 : 500);
        if (!access.allowed) return json({ error: "Forbidden" }, 403);
        const payload = await buildScriptJourneyPayload(supabase, access.script as Record<string, unknown>);
        return json(payload);
      }

      if (pathRest === "regulator-performance") {
        if (!isAdmin) return json({ error: "Forbidden" }, 403);
        const regulatorUserId = url.searchParams.get("userId")?.trim();
        if (!regulatorUserId) return json({ error: "userId query param required" }, 400);
        const fromIso = parseIsoDateInput(url.searchParams.get("from"));
        const toIso = parseIsoDateInput(url.searchParams.get("to"));
        const payload = await buildRegulatorPerformancePayload(supabase, regulatorUserId, fromIso, toIso);
        return json(payload);
      }

      // ── Legacy PDF routes (removed; return 410 so frontend can show clear message — BUG-06) ──
      if (pathRest === "audit.pdf" || pathRest === "glossary.pdf" || pathRest === "clients.pdf") {
        return json(
          { error: "PDF export for this report has been moved to client-side; use the in-app export or download from the report page." },
          410
        );
      }

      // ── GET /reports/analysis.pdf?jobId=<uuid>&lang=(en|ar) ──
      if (pathRest === "analysis.pdf") {
        const jobId = url.searchParams.get("jobId")?.trim();
        if (!jobId) return json({ error: "jobId query param required" }, 400);

        // Fetch report
        const { data: report, error: reportErr } = await selectReport(
          supabase,
          { col: "job_id", val: jobId },
          true
        );
        if (reportErr || !report) {
          console.error("[reports] PDF generation - report fetch error:", reportErr?.message);
          return json({ error: "Report not found" }, 404);
        }

        // Check ownership
        if (!isAdmin) {
          const owns = await checkOwnership(supabase, jobId, uid);
          if (!owns) return json({ error: "Forbidden" }, 403);
        }

        // Fetch findings
        const { data: findings, error: findingsErr } = await supabase
          .from("analysis_findings")
          .select("id, article_id, title_ar, severity, confidence, evidence_snippet, source, start_line_chunk, end_line_chunk, review_status, reviewed_at")
          .eq("job_id", jobId)
          .order("article_id", { ascending: true });

        if (findingsErr) {
          console.error("[reports] PDF generation - findings fetch error:", findingsErr.message);
          return json({ error: "Failed to fetch findings" }, 500);
        }

        try {
          // Import services
          const { prepareReportData } = await import("./data-mapper.ts");
          const { renderPdfFromTemplate } = await import("./pdf-renderer.ts");

          // Prepare template data
          const templateData = await prepareReportData(
            report as any,
            findings ?? [],
            pdfLang
          );

          // Render PDF
          const templatePath = new URL("./templates/report-template.html", import.meta.url).pathname;
          const pdfBuffer = await renderPdfFromTemplate(templatePath, templateData);

          // Return PDF
          // Server-side PDF generation is deprecated in favor of client-side.
          return new Response(null, { status: 501, statusText: "Not Implemented" });
        } catch (pdfError) {
          console.error("[reports] PDF generation error:", pdfError);
          return json({ error: `PDF generation failed: ${String(pdfError)}` }, 500);
        }
      }

      // ── GET /reports (no query params, no subpath) → List reports (Regulator: only own; Admin/Super Admin: all)
      if (pathRest !== "" && pathRest !== "analysis.pdf") {
        return json({ error: "Not Found" }, 404);
      }
      if (!jobId && !scriptId && !reportId) {
        const seeAllReports = await isSuperAdminOrAdmin(supabase, uid);
        console.log(`[reports] Listing reports for uid=${uid}, seeAllReports=${seeAllReports}`);

        let reports: any[] | null;
        if (seeAllReports) {
          const { data, error } = await supabase
            .from("analysis_reports")
            .select("id, job_id, script_id, created_at, review_status, reviewed_by, reviewed_at, review_notes, approved_count, findings_count")
            .order("created_at", { ascending: false });
          if (error) {
            console.error(`[reports] List all error:`, error.message);
            return json({ error: error.message }, 500);
          }
          reports = data;
        } else {
          // Regulator (or non-admin): only reports for scripts assigned to them or jobs they created
          const { data: assignedScripts } = await supabase.from("scripts").select("id").eq("assignee_id", uid);
          const { data: myJobs } = await supabase.from("analysis_jobs").select("id").eq("created_by", uid);
          const scriptIds = (assignedScripts ?? []).map((s: any) => s.id);
          const jobIds = (myJobs ?? []).map((j: any) => j.id);
          if (scriptIds.length === 0 && jobIds.length === 0) {
            reports = [];
          } else {
            const byScript = scriptIds.length > 0
              ? await supabase.from("analysis_reports").select("id, job_id, script_id, created_at, review_status, reviewed_by, reviewed_at, review_notes, approved_count, findings_count").in("script_id", scriptIds)
              : { data: [] as any[] };
            const byJob = jobIds.length > 0
              ? await supabase.from("analysis_reports").select("id, job_id, script_id, created_at, review_status, reviewed_by, reviewed_at, review_notes, approved_count, findings_count").in("job_id", jobIds)
              : { data: [] as any[] };
            if (byScript.error) {
              console.error(`[reports] List regulator by script error:`, byScript.error.message);
              return json({ error: byScript.error.message }, 500);
            }
            if (byJob.error) {
              console.error(`[reports] List regulator by job error:`, byJob.error.message);
              return json({ error: byJob.error.message }, 500);
            }
            const seen = new Set<string>();
            reports = [...(byScript.data ?? []), ...(byJob.data ?? [])]
              .filter((r: any) => {
                if (seen.has(r.id)) return false;
                seen.add(r.id);
                return true;
              })
              .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
          }
        }

        if (!reports || reports.length === 0) {
          return json([]);
        }

        console.log(`[reports] Found ${reports.length} reports (post-RLS)`);

        // Enrich with script, company, and job creator data
        const scriptIds = [...new Set(reports.map((r: any) => r.script_id))];
        const jobIds = [...new Set(reports.map((r: any) => r.job_id))];

        const [scriptsResult, jobsResult] = await Promise.all([
          supabase.from("scripts").select("id, title, company_id, created_by").in("id", scriptIds),
          supabase.from("analysis_jobs").select("id, created_by").in("id", jobIds),
        ]);

        const scripts = scriptsResult.data ?? [];
        const jobs = jobsResult.data ?? [];
        const companyIds = [...new Set(scripts.map((s: any) => s.company_id).filter(Boolean))];
        const { data: companies } = await supabase.from("clients").select("id, name_ar, name_en").in("id", companyIds);
        const creatorIds = [...new Set(jobs.map((j: any) => j.created_by).filter(Boolean))];
        const { data: creators } = await supabase.from("profiles").select("user_id, name").in("user_id", creatorIds);

        const enriched = reports.map((r: any) => {
          const script = scripts.find((s: any) => s.id === r.script_id);
          const job = jobs.find((j: any) => j.id === r.job_id);
          const company = companies?.find((c: any) => c.id === script?.company_id);
          const creator = creators?.find((c: any) => c.user_id === job?.created_by);

          return {
            id: r.id,
            jobId: r.job_id,
            scriptId: r.script_id,
            scriptTitle: script?.title ?? "Unknown Script",
            companyId: script?.company_id,
            companyNameAr: company?.name_ar ?? "",
            companyNameEn: company?.name_en ?? "",
            scriptOwnerId: script?.created_by,
            reportCreatorId: job?.created_by,
            reportCreatorName: creator?.name ?? "Unknown User",
            createdAt: r.created_at,
            reviewStatus: r.review_status,
            reviewedBy: r.reviewed_by,
            reviewedAt: r.reviewed_at ?? r.last_reviewed_at ?? r.created_at ?? null,
            lastReviewedAt: r.last_reviewed_at ?? r.reviewed_at ?? null,
            lastReviewedBy: r.last_reviewed_by ?? null,
            lastReviewedRole: r.last_reviewed_role ?? null,
            reviewNotes: r.review_notes,
            approvedCount: r.approved_count ?? 0,
            findingsCount: r.findings_count ?? 0,
          };
        });

        console.log(`[reports] Returning ${enriched.length} enriched reports`);
        return json(enriched);
      }

      // ── Single report by report PK id ──
      if (reportId) {
        const { data: row, error } = await selectReport(supabase, { col: "id", val: reportId }, true);
        if (error) {
          console.error("[reports] GET id error:", error.message);
          return json({ error: error.message }, 500);
        }
        if (!row) return json({ error: "Report not found" }, 404);
        if (!isAdmin) {
          const owns = await checkOwnership(supabase, (row as any).job_id, uid);
          if (!owns) return json({ error: "Forbidden" }, 403);
        }
        return json(camelReport(row as Record<string, unknown>, true));
      }

      // ── Single report by jobId ──
      if (jobId) {
        const { data: row, error } = await selectReport(supabase, { col: "job_id", val: jobId }, true);
        if (error) {
          console.error("[reports] GET jobId error:", error.message);
          return json({ error: error.message }, 500);
        }
        if (!row) return json({ error: "Report not found" }, 404);
        if (!isAdmin) {
          const owns = await checkOwnership(supabase, jobId, uid);
          if (!owns) return json({ error: "Forbidden" }, 403);
        }
        return json(camelReport(row as Record<string, unknown>, true));
      }

      // ── List reports by scriptId ──
      if (scriptId) {
        // ownership: user must own or be assigned
        const { data: script } = await supabase
          .from("scripts")
          .select("created_by, assignee_id")
          .eq("id", scriptId)
          .maybeSingle();
        if (!script) return json({ error: "Script not found" }, 404);
        const s = script as { created_by: string | null; assignee_id: string | null };
        if (!isAdmin && s.created_by !== uid && s.assignee_id !== uid) {
          return json({ error: "Forbidden" }, 403);
        }
        const { data: rows, error } = await selectReportList(supabase, scriptId);
        if (error) {
          console.error("[reports] GET scriptId list error:", error.message);
          return json({ error: error.message }, 500);
        }
        const enriched = await enrichReportListItems(supabase, rows ?? []);
        return json(enriched);
      }

      return json({ error: "Provide jobId, scriptId, or id query param" }, 400);
    }

    // ──────────────── POST — review update ────────────────
    if (req.method === "POST") {
      let body: { id?: string; review_status?: string; review_notes?: string; update_script_status?: boolean };
      try {
        body = await req.json();
      } catch {
        return json({ error: "Invalid JSON" }, 400);
      }

      const id = body.id?.trim();
      if (!id) return json({ error: "id (report PK) is required" }, 400);

      const validStatuses = ["under_review", "approved", "rejected"];
      const status = body.review_status?.trim();
      if (!status || !validStatuses.includes(status)) {
        return json({ error: `review_status must be one of: ${validStatuses.join(", ")}` }, 400);
      }
      const reviewNotes = body.review_notes?.trim() ?? "";
      if (status === "under_review" && reviewNotes.length === 0) {
        return json({ error: "review_notes are required when sending a report back for re-review" }, 400);
      }

      const { data: row } = await supabase
        .from("analysis_reports")
        .select("id, job_id, script_id")
        .eq("id", id)
        .maybeSingle();
      if (!row) return json({ error: "Report not found" }, 404);

      if (!isAdmin) {
        const owns = await checkOwnership(supabase, (row as any).job_id, uid);
        if (!owns) return json({ error: "Forbidden" }, 403);
      }

      const update: Record<string, unknown> = {
        review_status: status,
        reviewed_by: uid,
        reviewed_at: new Date().toISOString(),
        last_reviewed_by: uid,
        last_reviewed_at: new Date().toISOString(),
      };
      if (body.review_notes != null) update.review_notes = body.review_notes;

      const { error: updErr } = await supabase
        .from("analysis_reports")
        .update(update)
        .eq("id", id);
      if (updErr) {
        console.error("[reports] POST review update error:", updErr.message);
        return json({ error: updErr.message }, 500);
      }

      if (body.update_script_status === true && (row as { script_id?: string | null }).script_id) {
        if (status === "approved") {
          return json({
            error: "Approving script status from report review is disabled. Use script decision approval flow with certificate confirmation.",
          }, 409);
        }
        const nextScriptStatus =
          status === "approved"
            ? "approved"
            : status === "rejected"
              ? "rejected"
              : "review_required";
        const { error: scriptUpdErr } = await supabase
          .from("scripts")
          .update({ status: nextScriptStatus })
          .eq("id", (row as { script_id: string }).script_id);
        if (scriptUpdErr) {
          console.error("[reports] POST script status sync error:", scriptUpdErr.message);
          return json({ error: scriptUpdErr.message }, 500);
        }
      }

      return json({ ok: true });
    }

    // ──────────────── DELETE — delete report by id ────────────────
    if (req.method === "DELETE") {
      const url = new URL(req.url);
      const reportId = url.searchParams.get("id")?.trim();
      if (!reportId) return json({ error: "id query param required" }, 400);

      const { data: row } = await supabase
        .from("analysis_reports")
        .select("id, job_id")
        .eq("id", reportId)
        .maybeSingle();
      if (!row) return json({ error: "Report not found" }, 404);

      if (!isAdmin) {
        const owns = await checkOwnership(supabase, (row as any).job_id, uid);
        if (!owns) return json({ error: "Forbidden" }, 403);
      }

      const { error: delErr } = await supabase
        .from("analysis_reports")
        .delete()
        .eq("id", reportId);
      if (delErr) {
        console.error("[reports] DELETE error:", delErr.message);
        return json({ error: delErr.message }, 500);
      }
      return json({ ok: true });
    }

    return json({ error: "Method not allowed" }, 405);
  } catch (e) {
    console.error("[reports] UNHANDLED ERROR:", e);
    return json({ error: String(e) }, 500);
  }
});
