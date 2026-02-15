/**
 * Activity feed — audit preview (from audit_events) or fallback to analysis_jobs for current user.
 * GET /activity/recent → Activity[]
 */
import { jsonResponse, optionsResponse } from "../_shared/cors.ts";
import { requireAuth } from "../_shared/auth.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";

function pathAfter(base: string, url: string): string {
  const pathname = new URL(url).pathname;
  const match = pathname.match(new RegExp(`/${base}/?(.*)$`));
  return (match?.[1] ?? "").replace(/^\/+/, "").trim();
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "الآن";
  if (minutes < 60) return `منذ ${minutes} دقيقة`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `منذ ${hours} ساعة`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "منذ يوم";
  return `منذ ${days} أيام`;
}

function statusAction(status: string): string {
  switch (status) {
    case "queued": return "تم طلب تحليل";
    case "running": return "بدأ التحليل";
    case "completed": return "اكتمل التحليل";
    case "failed": return "فشل التحليل";
    default: return `تحليل (${status})`;
  }
}

async function userHasViewAudit(supabase: ReturnType<typeof createSupabaseAdmin>, userId: string): Promise<boolean> {
  const { data: roleRows } = await supabase.from("user_roles").select("role_id").eq("user_id", userId);
  const roleIds = (roleRows ?? []).map((r: { role_id: string }) => r.role_id);
  if (roleIds.length === 0) return false;
  const { data: permRows } = await supabase.from("role_permissions").select("permission_id").in("role_id", roleIds);
  const permIds = [...new Set((permRows ?? []).map((p: { permission_id: string }) => p.permission_id))];
  if (permIds.length === 0) return false;
  const { data: keys } = await supabase.from("permissions").select("key").in("id", permIds);
  return (keys ?? []).some((p: { key: string }) => p.key === "view_audit");
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? undefined;
  const json = (body: unknown, status = 200) => jsonResponse(body, status, { origin });
  try {
    if (req.method === "OPTIONS") return optionsResponse(req);

    const auth = await requireAuth(req);
    if (auth instanceof Response) return auth;
    const uid = auth.userId;

    const rest = pathAfter("activity", req.url);
    if (req.method !== "GET" || (rest !== "" && rest !== "recent")) {
      return json({ error: "Not Found" }, 404);
    }

    const supabase = createSupabaseAdmin();

    // If user has view_audit, show recent from audit_events (audit preview)
    const hasAudit = await userHasViewAudit(supabase, uid);
    if (hasAudit) {
      const retentionDays = 180;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - retentionDays);
      const { data: events, error: auditErr } = await supabase
        .from("audit_events")
        .select("id, event_type, actor_name, actor_role, occurred_at, target_type, target_label, result_status")
        .gte("occurred_at", cutoff.toISOString())
        .order("occurred_at", { ascending: false })
        .limit(20);
      if (!auditErr && events?.length) {
        const activities = (events as any[]).map((e) => ({
          id: e.id,
          action: `${e.event_type}${e.target_label ? `: ${e.target_label}` : ""}`,
          actor: e.actor_name ?? "",
          time: timeAgo(e.occurred_at),
          target: e.target_type === "script" && e.target_id ? `/workspace/${e.target_id}` : e.target_type === "task" ? "/tasks" : e.target_type === "client" ? "/clients" : "/audit",
        }));
        return json(activities);
      }
    }

    // Fallback: recent analysis jobs for this user
    const { data: jobs, error: jobsErr } = await supabase
      .from("analysis_jobs")
      .select("id, script_id, status, created_at, started_at, completed_at")
      .eq("created_by", uid)
      .order("created_at", { ascending: false })
      .limit(15);

    if (jobsErr) {
      console.error("[activity] jobs query error:", jobsErr.message);
      return json([]);
    }

    if (!jobs || jobs.length === 0) return json([]);

    const scriptIds = [...new Set((jobs as any[]).map((j) => j.script_id))];
    const { data: scripts } = await supabase.from("scripts").select("id, title").in("id", scriptIds);
    const scriptMap = new Map<string, string>();
    for (const s of (scripts ?? []) as any[]) scriptMap.set(s.id, s.title);

    const activities = (jobs as any[]).map((j) => {
      const scriptTitle = scriptMap.get(j.script_id) ?? "نص";
      return {
        id: j.id,
        action: `${statusAction(j.status)}: ${scriptTitle}`,
        actor: "",
        time: timeAgo(j.completed_at ?? j.started_at ?? j.created_at),
        target: `/workspace/${j.script_id}`,
      };
    });
    return json(activities);
  } catch (e) {
    console.error("[activity] UNHANDLED ERROR:", e);
    return json({ error: String(e) }, 500);
  }
});
