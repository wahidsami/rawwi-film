import React from "react";
import { pdf } from "@react-pdf/renderer";
import { RegulatorPerformancePdf } from "./Pdf";
import type { RegulatorPerformancePayload } from "@/api";

async function toDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function downloadRegulatorPerformancePdf(params: {
  data: RegulatorPerformancePayload;
  lang: "ar" | "en";
  dateFormat?: string;
}): Promise<void> {
  const origin = window.location.origin;
  const logoUrl = await toDataUrl(`${origin}/fclogo.png`);
  const doc = React.createElement(RegulatorPerformancePdf, {
    data: params.data,
    lang: params.lang,
    logoUrl: logoUrl ?? undefined,
    dateFormat: params.dateFormat,
  });
  const blob = await pdf(doc).toBlob();
  const url = URL.createObjectURL(blob);
  const safeName = (params.data.regulator.name || "regulator").replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, "_").slice(0, 60);
  const datePart = new Date().toISOString().slice(0, 10);
  const a = document.createElement("a");
  a.href = url;
  a.download = `regulator_performance_${safeName}_${datePart}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
