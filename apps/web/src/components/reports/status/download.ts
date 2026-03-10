import React from "react";
import { pdf } from "@react-pdf/renderer";
import type { DashboardStats } from "@/services/dashboardService";
import type { Activity } from "@/services/activityService";
import { mapStatusDataForPdf } from "./mapper";
import { StatusSectionPdf } from "./Pdf";

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

export async function downloadStatusPdf(params: {
  stats: DashboardStats;
  activities: Activity[];
  lang: "ar" | "en";
  dateFormat?: string;
}): Promise<void> {
  const origin = window.location.origin;
  const [coverImageDataUrl, logoUrl] = await Promise.all([
    toDataUrl(`${origin}/cover.jpg`),
    toDataUrl(`${origin}/dashboardlogo.png`),
  ]);
  const doc = React.createElement(StatusSectionPdf, {
    data: mapStatusDataForPdf(params.stats, params.activities),
    lang: params.lang,
    dateFormat: params.dateFormat,
    generatedAt: new Date().toISOString(),
    coverImageDataUrl,
    logoUrl: logoUrl ?? undefined,
  });
  const blob = await pdf(doc).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `status_report_${new Date().toISOString().slice(0, 10)}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
