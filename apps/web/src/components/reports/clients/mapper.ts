import type { Company } from "@/api/models";

export type ClientPdfRow = {
  name: string;
  beneficiaryType: string;
  representative: string;
  email: string;
  phone: string;
  registrationDate: string;
  scriptsCount: number;
  status: string;
};

export function mapClientsDataForPdf(companies: Company[], lang: "ar" | "en"): {
  rows: ClientPdfRow[];
  totalClients: number;
  totalCompanies: number;
  totalIndividuals: number;
  joinedThisMonth: number;
  totalScripts: number;
  avgScripts: number;
  activeClients: number;
} {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const rows = (companies || []).filter(Boolean).map((c) => {
    const scriptsCount = Number(c.scriptsCount || 0);
    const isIndividual = (c.beneficiaryType ?? "company") === "individual";
    return {
      name: isIndividual
        ? (c.individualProfile?.fullName || c.representativeName || c.nameAr || c.nameEn || "")
        : (lang === "ar" ? (c.nameAr || "") : (c.nameEn || "")),
      beneficiaryType: isIndividual ? (lang === "ar" ? "فرد" : "Individual") : (lang === "ar" ? "شركة" : "Company"),
      representative: isIndividual
        ? (c.individualProfile?.fullName || c.representativeName || "")
        : (c.representativeName || ""),
      email: c.email || "",
      phone: c.phone || c.mobile || "—",
      registrationDate: c.createdAt || "",
      scriptsCount,
      status: scriptsCount > 0 ? (lang === "ar" ? "نشط" : "Active") : (lang === "ar" ? "غير نشط" : "Inactive"),
    } as ClientPdfRow;
  });

  const totalClients = companies.length;
  const totalCompanies = companies.filter((c) => (c.beneficiaryType ?? "company") === "company").length;
  const totalIndividuals = companies.filter((c) => (c.beneficiaryType ?? "company") === "individual").length;
  const joinedThisMonth = companies.filter((c) => {
    const dt = c.createdAt ? new Date(c.createdAt) : null;
    return dt && !Number.isNaN(dt.getTime()) && dt.getMonth() === currentMonth && dt.getFullYear() === currentYear;
  }).length;
  const totalScripts = companies.reduce((acc, c) => acc + Number(c.scriptsCount || 0), 0);
  const avgScripts = totalClients > 0 ? Math.round((totalScripts / totalClients) * 10) / 10 : 0;
  const activeClients = companies.filter((c) => Number(c.scriptsCount || 0) > 0).length;

  return { rows, totalClients, totalCompanies, totalIndividuals, joinedThisMonth, totalScripts, avgScripts, activeClients };
}
