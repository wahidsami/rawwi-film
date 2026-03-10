import React from "react";
import { pdf } from "@react-pdf/renderer";
import type { Company, Script } from "@/api/models";
import { mapClientDetailsForPdf } from "./mapper";
import { ClientDetailsSectionPdf } from "./Pdf";

async function toDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function downloadClientDetailsPdf(params: {
  company: Company;
  scripts: Script[];
  reportCountByScriptId: Record<string, number>;
  users: Array<{ id: string; name: string }>;
  lang: "ar" | "en";
  dateFormat?: string;
}): Promise<void> {
  const origin = window.location.origin;
  const [coverImageDataUrl, dashboardLogoUrl] = await Promise.all([
    toDataUrl(`${origin}/cover.jpg`),
    toDataUrl(`${origin}/dashboardlogo.png`),
  ]);
  const mapped = mapClientDetailsForPdf({
    company: params.company,
    scripts: params.scripts,
    reportCountByScriptId: params.reportCountByScriptId,
    users: params.users,
    lang: params.lang,
  });

  const doc = React.createElement(ClientDetailsSectionPdf, {
    lang: params.lang,
    dateFormat: params.dateFormat,
    generatedAt: new Date().toISOString(),
    coverImageDataUrl,
    dashboardLogoUrl: dashboardLogoUrl ?? undefined,
    client: mapped.client,
    stats: mapped.stats,
    rows: mapped.rows,
  });

  const blob = await pdf(doc).toBlob();
  const url = URL.createObjectURL(blob);
  const safeTitle = (mapped.client.name || (params.lang === "ar" ? "عميل" : "client"))
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, "_")
    .slice(0, 80);
  const a = document.createElement("a");
  a.href = url;
  a.download = `client_detail_${safeTitle}_${new Date().toISOString().slice(0, 10)}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
