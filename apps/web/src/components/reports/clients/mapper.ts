import type { Company } from "@/api/models";

export type ClientPdfRow = {
  name: string;
  nameSecondary: string;
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
  totalScripts: number;
  avgScripts: number;
  activeClients: number;
} {
  const rows = (companies || []).filter(Boolean).map((c) => {
    const scriptsCount = Number(c.scriptsCount || 0);
    return {
      name: lang === "ar" ? (c.nameAr || "") : (c.nameEn || ""),
      nameSecondary: lang === "ar" ? (c.nameEn || "") : (c.nameAr || ""),
      representative: c.representativeName || "",
      email: c.email || "",
      phone: c.phone || c.mobile || "—",
      registrationDate: c.createdAt || "",
      scriptsCount,
      status: scriptsCount > 0 ? (lang === "ar" ? "نشط" : "Active") : (lang === "ar" ? "غير نشط" : "Inactive"),
    } as ClientPdfRow;
  });

  const totalClients = companies.length;
  const totalScripts = companies.reduce((acc, c) => acc + Number(c.scriptsCount || 0), 0);
  const avgScripts = totalClients > 0 ? Math.round((totalScripts / totalClients) * 10) / 10 : 0;
  const activeClients = companies.filter((c) => Number(c.scriptsCount || 0) > 0).length;

  return { rows, totalClients, totalScripts, avgScripts, activeClients };
}
