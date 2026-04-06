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
    reviewedAt: r.reviewed_at ?? null,
    lastReviewedAt: r.last_reviewed_at ?? null,
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
            reviewedAt: r.reviewed_at,
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
