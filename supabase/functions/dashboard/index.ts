/**
 * Dashboard stats — real aggregate queries.
 * GET /dashboard/stats → DashboardStats
 *
 * Script status source of truth: scripts.status (DB CHECK in 0001_init)
 * Canonical values: draft, in_review, analysis_running, review_required, approved, rejected
 * (no "assigned" or "completed" in DB; "completed" in API = approved + rejected for charts)
 */
import { jsonResponse, optionsResponse } from "../_shared/cors.ts";
import { requireAuth } from "../_shared/auth.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { isSuperAdminOrAdmin } from "../_shared/roleCheck.ts";

function pathAfter(base: string, url: string): string {
  const pathname = new URL(url).pathname;
  const match = pathname.match(new RegExp(`/${base}/?(.*)$`));
  return (match?.[1] ?? "").replace(/^\/+/, "").trim();
}

Deno.serve(async (req: Request) => {
  try {
    const origin = req.headers.get("origin") ?? undefined;
    const json = (body: unknown, status = 200) => jsonResponse(body, status, { origin });
    if (req.method === "OPTIONS") return optionsResponse(req);

    const auth = await requireAuth(req);
    if (auth instanceof Response) return auth;
    const uid = auth.userId;

    const rest = pathAfter("dashboard", req.url);
    if (req.method !== "GET" || (rest !== "" && rest !== "stats" && rest !== "recent-decisions")) {
      return json({ error: "Not Found" }, 404);
    }

    const supabase = createSupabaseAdmin();

    // Only Super Admin and Admin see all stats; regulators see assignee-only stats
    const seeAll = await isSuperAdminOrAdmin(supabase, uid);

    // Handle /dashboard/recent-decisions endpoint
    if (rest === "recent-decisions") {
      const { data: decisions, error } = await supabase
        .from("script_status_history")
        .select(`
          id,
          script_id,
          to_status,
          reason,
          changed_by,
          changed_at,
          scripts!inner(title, client_id, assignee_id, clients(name_en))
        `)
        .in("to_status", ["approved", "rejected"])
        .order("changed_at", { ascending: false })
        .limit(seeAll ? 10 : 50);

      if (error) {
        console.error("[dashboard] recent-decisions error:", error);
        return json({ error: error.message }, 500);
      }

      let list = decisions ?? [];
      if (!seeAll) list = list.filter((d: any) => d.scripts?.assignee_id === uid).slice(0, 10);
      else list = list.slice(0, 10);
      const userIds = [...new Set(list.map((d: any) => d.changed_by))].filter(Boolean);
      const { data: users } = await supabase.auth.admin.listUsers();
      const userMap = new Map();
      users?.users.forEach((u: any) => {
        userMap.set(u.id, u.email?.split('@')[0] || 'Unknown');
      });

      const formatted = list.map((d: any) => ({
        id: d.id,
        scriptId: d.script_id,
        scriptTitle: d.scripts?.title || 'Untitled',
        decision: d.to_status,
        reason: d.reason || '',
        actorName: userMap.get(d.changed_by) || 'Unknown',
        timestamp: d.changed_at,
        clientName: d.scripts?.clients?.name_en || ''
      }));

      return json(formatted);
    }

    // Continue with /dashboard/stats endpoint

    // --- pendingTasks: regulators see 0 (they don't start analysis); others see own jobs ---
    let pendingTasks = 0;
    if (seeAll) {
      const res = await supabase.from("analysis_jobs").select("id", { count: "exact", head: true }).in("status", ["queued", "running"]);
      pendingTasks = res.count ?? 0;
    } else {
      const res = await supabase.from("analysis_jobs").select("id", { count: "exact", head: true }).eq("created_by", uid).in("status", ["queued", "running"]);
      pendingTasks = res.count ?? 0;
    }

    // --- scriptsInReview: assignee-only for regulator, else created_by or assignee ---
    const reviewStatuses = ["draft", "in_review", "analysis_running", "review_required"];
    let scriptsInReviewQuery = supabase
      .from("scripts")
      .select("id", { count: "exact", head: true })
      .in("status", reviewStatuses);
    if (seeAll) { /* no filter */ } else scriptsInReviewQuery = scriptsInReviewQuery.eq("assignee_id", uid);
    const { count: scriptsInReview } = await scriptsInReviewQuery;

    // --- reportsThisMonth and finding aggregates: seeAll = whole DB; else jobs on scripts assigned to uid ---
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    let jobIds: string[] = [];
    if (!seeAll) {
      const { data: myScripts } = await supabase.from("scripts").select("id").eq("assignee_id", uid);
      const scriptIds = (myScripts ?? []).map((s: any) => s.id);
      if (scriptIds.length > 0) {
        const { data: jobsOnMyScripts } = await supabase.from("analysis_jobs").select("id").in("script_id", scriptIds);
        jobIds = (jobsOnMyScripts ?? []).map((j: any) => j.id);
      }
    }
    let reportsThisMonth = 0;
    if (seeAll) {
      const res = await supabase.from("analysis_reports").select("id", { count: "exact", head: true }).gte("created_at", monthStart);
      reportsThisMonth = res.count ?? 0;
    } else if (jobIds.length > 0) {
      const { count } = await supabase
        .from("analysis_reports")
        .select("id", { count: "exact", head: true })
        .in("job_id", jobIds)
        .gte("created_at", monthStart);
      reportsThisMonth = count ?? 0;
    }

    let highCriticalFindings = 0;
    if (seeAll) {
      const res = await supabase.from("analysis_findings").select("id", { count: "exact", head: true }).in("severity", ["high", "critical"]);
      highCriticalFindings = res.count ?? 0;
    } else if (jobIds.length > 0) {
      const { count } = await supabase
        .from("analysis_findings")
        .select("id", { count: "exact", head: true })
        .in("job_id", jobIds)
        .in("severity", ["high", "critical"]);
      highCriticalFindings = count ?? 0;
    }

    let specialNotesCount = 0;
    if (seeAll) {
      const { data: reportRows } = await supabase.from("analysis_reports").select("summary_json");
      for (const row of reportRows ?? []) {
        const summary = (row as any).summary_json ?? {};
        specialNotesCount += Array.isArray(summary.report_hints) ? summary.report_hints.length : 0;
      }
    } else if (jobIds.length > 0) {
      const { data: reportRows } = await supabase
        .from("analysis_reports")
        .select("summary_json")
        .in("job_id", jobIds);
      for (const row of reportRows ?? []) {
        const summary = (row as any).summary_json ?? {};
        specialNotesCount += Array.isArray(summary.report_hints) ? summary.report_hints.length : 0;
      }
    }

    // --- scriptsByStatus: assignee-only for regulator, else created_by or assignee ---
    let statusQuery = supabase.from("scripts").select("status");
    if (!seeAll) statusQuery = statusQuery.eq("assignee_id", uid);
    const { data: scriptRows } = await statusQuery;
    const scriptsByStatus = {
      draft: 0,
      assigned: 0,
      analysis_running: 0,
      in_review: 0,
      review_required: 0,
      approved: 0,
      rejected: 0,
      completed: 0
    };
    for (const r of scriptRows ?? []) {
      const s = String((r as any).status ?? "").toLowerCase();
      if (s === "draft") scriptsByStatus.draft++;
      else if (s === "assigned") scriptsByStatus.assigned++;
      else if (s === "in_review") scriptsByStatus.in_review++;
      else if (s === "analysis_running") scriptsByStatus.analysis_running++;
      else if (s === "review_required") scriptsByStatus.review_required++;
      else if (s === "approved") scriptsByStatus.approved++;
      else if (s === "rejected") scriptsByStatus.rejected++;
      else if (s === "completed") scriptsByStatus.completed++;
    }
    // "completed" not in DB; use approved+rejected for chart/UI
    scriptsByStatus.completed = scriptsByStatus.approved + scriptsByStatus.rejected;
    if (typeof Deno !== "undefined" && Deno.env.get("DEBUG_DASHBOARD") === "true") {
      console.log("[dashboard] scriptsByStatus", { seeAll, uid: uid.slice(0, 8) + "...", scriptsByStatus });
    }

    // --- findingsBySeverity ---
    const findingsBySeverity = { critical: 0, high: 0, medium: 0, low: 0 };
    const findingsByType = { ai: 0, manual: 0, glossary: 0, special: specialNotesCount };
    if (seeAll) {
      const { data: findingRows } = await supabase.from("analysis_findings").select("severity, source");
      for (const r of findingRows ?? []) {
        const sev = (r as any).severity as string;
        const source = String((r as any).source ?? "ai").toLowerCase();
        if (sev === "critical") findingsBySeverity.critical++;
        else if (sev === "high") findingsBySeverity.high++;
        else if (sev === "medium") findingsBySeverity.medium++;
        else if (sev === "low") findingsBySeverity.low++;
        if (source === "manual") findingsByType.manual++;
        else if (source === "lexicon_mandatory" || source === "glossary") findingsByType.glossary++;
        else findingsByType.ai++;
      }
    } else if (jobIds.length > 0) {
      const { data: findingRows } = await supabase
        .from("analysis_findings")
        .select("severity, source")
        .in("job_id", jobIds);
      for (const r of findingRows ?? []) {
        const sev = (r as any).severity as string;
        const source = String((r as any).source ?? "ai").toLowerCase();
        if (sev === "critical") findingsBySeverity.critical++;
        else if (sev === "high") findingsBySeverity.high++;
        else if (sev === "medium") findingsBySeverity.medium++;
        else if (sev === "low") findingsBySeverity.low++;
        if (source === "manual") findingsByType.manual++;
        else if (source === "lexicon_mandatory" || source === "glossary") findingsByType.glossary++;
        else findingsByType.ai++;
      }
    }

    return json({
      pendingTasks: pendingTasks ?? 0,
      scriptsInReview: scriptsInReview ?? 0,
      reportsThisMonth,
      highCriticalFindings,
      totalFindings: findingsByType.ai + findingsByType.manual + findingsByType.glossary + findingsByType.special,
      scriptsByStatus,
      findingsBySeverity,
      findingsByType,
    });
  } catch (e) {
    console.error("[dashboard] UNHANDLED ERROR:", e);
    return json({ error: String(e) }, 500);
  }
});
