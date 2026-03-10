import React from "react";
import { pdf } from "@react-pdf/renderer";
import type { AuditEventRow } from "@/services/auditService";
import { mapAuditDataForPdf } from "./mapper";
import { AuditSectionPdf } from "./Pdf";

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

export async function downloadAuditPdf(params: {
  events: AuditEventRow[];
  total: number;
  lang: "ar" | "en";
  dateFormat?: string;
}): Promise<void> {
  const coverImageDataUrl = await toDataUrl(`${window.location.origin}/cover.jpg`);
  const doc = React.createElement(AuditSectionPdf, {
    rows: mapAuditDataForPdf(params.events),
    total: params.total,
    lang: params.lang,
    dateFormat: params.dateFormat,
    generatedAt: new Date().toISOString(),
    coverImageDataUrl,
  });
  const blob = await pdf(doc).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `audit_${new Date().toISOString().slice(0, 10)}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
