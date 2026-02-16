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
import { isUserAdmin } from "../_shared/roleCheck.ts";

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

    // Admin bypass check (Robust DB check)
    const isAdmin = await isUserAdmin(supabase, uid);

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
          scripts!inner(title, client_id, clients(name_en))
        `)
        .in("to_status", ["approved", "rejected"])
        .order("changed_at", { ascending: false })
        .limit(10);

      if (error) {
        console.error("[dashboard] recent-decisions error:", error);
        return json({ error: error.message }, 500);
      }

      // Get user names for changed_by
      const userIds = [...new Set((decisions ?? []).map((d: any) => d.changed_by))].filter(Boolean);
      const { data: users } = await supabase.auth.admin.listUsers();
      const userMap = new Map();
      users?.users.forEach((u: any) => {
        userMap.set(u.id, u.email?.split('@')[0] || 'Unknown');
      });

      const formatted = (decisions ?? []).map((d: any) => ({
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

    // --- pendingTasks: analysis_jobs in queued/running ---
    let pendingTasksQuery = supabase
      .from("analysis_jobs")
      .select("id", { count: "exact", head: true });
    if (!isAdmin) pendingTasksQuery = pendingTasksQuery.eq("created_by", uid);
    const { count: pendingTasks } = await pendingTasksQuery.in("status", ["queued", "running"]);

    // --- scriptsInReview: scripts not yet approved/rejected (same visibility as GET /scripts) ---
    const reviewStatuses = ["draft", "in_review", "analysis_running", "review_required"];
    let scriptsInReviewQuery = supabase
      .from("scripts")
      .select("id", { count: "exact", head: true })
      .in("status", reviewStatuses);
    if (!isAdmin) scriptsInReviewQuery = scriptsInReviewQuery.or(`created_by.eq.${uid},assignee_id.eq.${uid}`);
    const { count: scriptsInReview } = await scriptsInReviewQuery;

    // --- reportsThisMonth: analysis_reports created this month (via job ownership) ---
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    // Get user's job ids first, then count reports
    let jobQuery = supabase.from("analysis_jobs").select("id");
    if (!isAdmin) jobQuery = jobQuery.eq("created_by", uid);
    const { data: userJobs } = await jobQuery;
    const jobIds = (userJobs ?? []).map((j: any) => j.id);
    let reportsThisMonth = 0;
    if (jobIds.length > 0) {
      const { count } = await supabase
        .from("analysis_reports")
        .select("id", { count: "exact", head: true })
        .in("job_id", jobIds)
        .gte("created_at", monthStart);
      reportsThisMonth = count ?? 0;
    }

    // --- highCriticalFindings: analysis_findings with severity high/critical (via job ownership) ---
    let highCriticalFindings = 0;
    if (jobIds.length > 0) {
      const { count } = await supabase
        .from("analysis_findings")
        .select("id", { count: "exact", head: true })
        .in("job_id", jobIds)
        .in("severity", ["high", "critical"]);
      highCriticalFindings = count ?? 0;
    }

    // --- scriptsByStatus: use scripts.status only; same RBAC as GET /scripts ---
    let statusQuery = supabase.from("scripts").select("status");
    if (!isAdmin) statusQuery = statusQuery.or(`created_by.eq.${uid},assignee_id.eq.${uid}`);
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
      console.log("[dashboard] scriptsByStatus", { isAdmin, uid: uid.slice(0, 8) + "...", scriptsByStatus });
    }

    // --- findingsBySeverity ---
    const findingsBySeverity = { critical: 0, high: 0, medium: 0, low: 0 };
    if (jobIds.length > 0) {
      const { data: findingRows } = await supabase
        .from("analysis_findings")
        .select("severity")
        .in("job_id", jobIds);
      for (const r of findingRows ?? []) {
        const sev = (r as any).severity as string;
        if (sev === "critical") findingsBySeverity.critical++;
        else if (sev === "high") findingsBySeverity.high++;
        else if (sev === "medium") findingsBySeverity.medium++;
        else if (sev === "low") findingsBySeverity.low++;
      }
    }

    return json({
      pendingTasks: pendingTasks ?? 0,
      scriptsInReview: scriptsInReview ?? 0,
      reportsThisMonth,
      highCriticalFindings,
      scriptsByStatus,
      findingsBySeverity,
    });
  } catch (e) {
    console.error("[dashboard] UNHANDLED ERROR:", e);
    return json({ error: String(e) }, 500);
  }
});
