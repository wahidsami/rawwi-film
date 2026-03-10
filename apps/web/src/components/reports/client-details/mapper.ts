import type { Company, Script } from "@/api/models";
import { normalizeScriptStatusForDisplay, normalizeScriptStatusForFilter } from "@/utils/scriptStatus";

export type ClientDetailsScriptRow = {
  title: string;
  type: string;
  date: string;
  assignee: string;
  reportsCount: number;
  status: string;
};

export function mapClientDetailsForPdf(params: {
  company: Company;
  scripts: Script[];
  reportCountByScriptId: Record<string, number>;
  users: Array<{ id: string; name: string }>;
  lang: "ar" | "en";
}) {
  const isAr = params.lang === "ar";
  const rows: ClientDetailsScriptRow[] = (params.scripts || []).map((s) => ({
    title: s.title || "—",
    type: s.type || "—",
    date: s.createdAt || "",
    assignee: params.users.find((u) => u.id === s.assigneeId)?.name || (isAr ? "غير مسند" : "Unassigned"),
    reportsCount: params.reportCountByScriptId[s.id] ?? 0,
    status: normalizeScriptStatusForDisplay(s.status),
  }));

  const total = rows.length;
  const approved = params.scripts.filter((s) => normalizeScriptStatusForFilter(s.status) === "approved").length;
  const inReview = params.scripts.filter((s) => ["in_review", "review_required"].includes(normalizeScriptStatusForFilter(s.status))).length;
  const draft = params.scripts.filter((s) => normalizeScriptStatusForFilter(s.status) === "draft").length;

  return {
    client: {
      name: isAr ? params.company.nameAr : params.company.nameEn,
      representative: params.company.representativeName || "",
      email: params.company.email || "",
      phone: params.company.phone || params.company.mobile || "—",
      registrationDate: params.company.createdAt || "",
      status: total > 0 ? (isAr ? "نشط" : "Active") : (isAr ? "غير نشط" : "Inactive"),
      logoUrl: params.company.logoUrl || params.company.avatarUrl || "",
    },
    rows,
    stats: { total, approved, inReview, draft },
  };
}
