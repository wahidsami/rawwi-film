import type { DashboardStats } from "@/services/dashboardService";
import type { Activity } from "@/services/activityService";
import type { Script, Company } from "@/api/models";

export type StatusPdfData = {
  pendingTasks: number;
  scriptsInReview: number;
  reportsThisMonth: number;
  totalFindings: number;
  beneficiariesThisMonth: number;
  totalBeneficiaries: number;
  totalCompanies: number;
  totalIndividuals: number;
  scriptsByStatus: { draft: number; assigned: number; review_required: number; completed: number };
  findingsByType: { ai: number; manual: number; glossary: number; special: number };
  scriptRows: Array<{
    scriptTitle: string;
    beneficiaryName: string;
    receivedAt: string;
    status: string;
    approvedOrRejectedAt: string;
  }>;
};

export function mapStatusDataForPdf(
  stats: DashboardStats,
  _activities: Activity[] | null | undefined,
  scripts: Script[] | null | undefined,
  companies: Company[] | null | undefined,
): StatusPdfData {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const allBeneficiaries = (companies ?? []).filter(Boolean);
  const joinedThisMonth = allBeneficiaries.filter((c) => {
    const dt = c.createdAt ? new Date(c.createdAt) : null;
    return dt && !Number.isNaN(dt.getTime()) && dt.getMonth() === currentMonth && dt.getFullYear() === currentYear;
  }).length;

  const companyNameById = new Map<string, string>(
    allBeneficiaries.map((c) => [
      c.companyId,
      (c.beneficiaryType ?? "company") === "individual"
        ? (c.individualProfile?.fullName || c.representativeName || c.nameAr || c.nameEn || "—")
        : (c.nameAr || c.nameEn || "—"),
    ]),
  );

  const scriptRows = (scripts ?? [])
    .slice()
    .sort((a, b) => {
      const da = new Date(a.receivedAt || a.createdAt || 0).getTime();
      const db = new Date(b.receivedAt || b.createdAt || 0).getTime();
      return db - da;
    })
    .slice(0, 40)
    .map((s) => {
      const status = String(s.status ?? "—");
      const statusKey = status.toLowerCase();
      const approvedOrRejectedAt =
        statusKey === "approved"
          ? (s as any).approvedAt ?? "—"
          : statusKey === "rejected"
            ? (s as any).rejectedAt ?? "—"
            : "—";
      return {
        scriptTitle: s.title || "—",
        beneficiaryName: companyNameById.get(s.companyId) ?? "—",
        receivedAt: s.receivedAt || s.createdAt || "—",
        status,
        approvedOrRejectedAt,
      };
    });

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
    beneficiariesThisMonth: joinedThisMonth,
    totalBeneficiaries: allBeneficiaries.length,
    totalCompanies: allBeneficiaries.filter((c) => (c.beneficiaryType ?? "company") === "company").length,
    totalIndividuals: allBeneficiaries.filter((c) => (c.beneficiaryType ?? "company") === "individual").length,
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
    scriptRows,
  };
}
