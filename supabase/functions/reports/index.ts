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
import { isUserAdmin } from "../_shared/roleCheck.ts";
// Imports for PDF generation removed (migrated to client-side)

// Base columns always available; extended columns added by migrations 0005/0007/0010.
const BASE_COLS = "id, job_id, script_id, version_id, summary_json, report_html, findings_count, severity_counts, created_at";
const ENRICH_COLS = "scripts(title, clients(name_ar, name_en))";
const LIST_COLS = "id, job_id, script_id, version_id, findings_count, severity_counts, created_at";

function camelReport(r: Record<string, unknown>, full = false) {
  const out: Record<string, unknown> = {
    id: r.id,
    jobId: r.job_id,
    scriptId: r.script_id,
    versionId: r.version_id,
    findingsCount: r.findings_count ?? 0,
    severityCounts: r.severity_counts ?? { low: 0, medium: 0, high: 0, critical: 0 },
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

      // ── GET /reports (no query params) → List ALL user reports ──
      // RLS handles filtering: users see only their reports, admins see all
      if (!jobId && !scriptId && !reportId) {
        console.log(`[reports] Listing all reports for uid=${uid}, isAdmin=${isAdmin}`);

        const { data: reports, error } = await supabase
          .from("analysis_reports")
          .select("id, job_id, script_id, created_at, review_status, reviewed_by, reviewed_at, review_notes, approved_count, rejected_count, total_findings")
          .order("created_at", { ascending: false });

        if (error) {
          console.error(`[reports] List all error:`, error.message);
          return json({ error: error.message }, 500);
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
            rejectedCount: r.rejected_count ?? 0,
            totalFindings: r.total_findings ?? 0,
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
        return json((rows ?? []).map((r: any) => camelReport(r)));
      }

      return json({ error: "Provide jobId, scriptId, or id query param" }, 400);
    }

    // ──────────────── POST — review update ────────────────
    if (req.method === "POST") {
      let body: { id?: string; review_status?: string; review_notes?: string };
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

      const { data: row } = await supabase
        .from("analysis_reports")
        .select("id, job_id")
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
