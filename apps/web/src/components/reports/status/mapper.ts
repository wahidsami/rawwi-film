import type { DashboardStats } from "@/services/dashboardService";
import type { Activity } from "@/services/activityService";

export type StatusPdfData = {
  pendingTasks: number;
  scriptsInReview: number;
  reportsThisMonth: number;
  highCriticalFindings: number;
  scriptsByStatus: { draft: number; assigned: number; review_required: number; completed: number };
  findingsBySeverity: { critical: number; high: number; medium: number; low: number };
  activities: Array<{ action: string; actor: string; time: string }>;
};

export function mapStatusDataForPdf(stats: DashboardStats, activities: Activity[] | null | undefined): StatusPdfData {
  const safeActivities = (activities || [])
    .filter((a): a is Activity => !!a)
    .slice(0, 15)
    .map((a) => ({
      action: a.action ?? "—",
      actor: a.actor ?? "—",
      time: a.time ?? "—",
    }));

  return {
    pendingTasks: stats.pendingTasks ?? 0,
    scriptsInReview: stats.scriptsInReview ?? 0,
    reportsThisMonth: stats.reportsThisMonth ?? 0,
    highCriticalFindings: stats.highCriticalFindings ?? 0,
    scriptsByStatus: {
      draft: stats.scriptsByStatus?.draft ?? 0,
      assigned: stats.scriptsByStatus?.assigned ?? 0,
      review_required: stats.scriptsByStatus?.review_required ?? 0,
      completed: stats.scriptsByStatus?.completed ?? 0,
    },
    findingsBySeverity: {
      critical: stats.findingsBySeverity?.critical ?? 0,
      high: stats.findingsBySeverity?.high ?? 0,
      medium: stats.findingsBySeverity?.medium ?? 0,
      low: stats.findingsBySeverity?.low ?? 0,
    },
    activities: safeActivities,
  };
}
