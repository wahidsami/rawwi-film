import type { DashboardStats } from "@/services/dashboardService";
import type { Activity } from "@/services/activityService";

export type StatusPdfData = {
  pendingTasks: number;
  scriptsInReview: number;
  reportsThisMonth: number;
  totalFindings: number;
  scriptsByStatus: { draft: number; assigned: number; review_required: number; completed: number };
  findingsByType: { ai: number; manual: number; glossary: number; special: number };
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
    totalFindings: stats.totalFindings ?? (
      (stats.findingsByType?.ai ?? 0) +
      (stats.findingsByType?.manual ?? 0) +
      (stats.findingsByType?.glossary ?? 0) +
      (stats.findingsByType?.special ?? 0)
    ),
    scriptsByStatus: {
      draft: stats.scriptsByStatus?.draft ?? 0,
      assigned: stats.scriptsByStatus?.assigned ?? 0,
      review_required: stats.scriptsByStatus?.review_required ?? 0,
      completed: stats.scriptsByStatus?.completed ?? 0,
    },
    findingsByType: {
      ai: stats.findingsByType?.ai ?? 0,
      manual: stats.findingsByType?.manual ?? 0,
      glossary: stats.findingsByType?.glossary ?? 0,
      special: stats.findingsByType?.special ?? 0,
    },
    activities: safeActivities,
  };
}
