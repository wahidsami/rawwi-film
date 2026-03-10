import React from "react";
import { pdf } from "@react-pdf/renderer";
import type { AuditEventRow } from "@/services/auditService";
import { mapAuditDataForPdf } from "./mapper";
import { AuditSectionPdf } from "./Pdf";

export async function downloadAuditPdf(params: {
  events: AuditEventRow[];
  total: number;
  lang: "ar" | "en";
  dateFormat?: string;
}): Promise<void> {
  const doc = React.createElement(AuditSectionPdf, {
    rows: mapAuditDataForPdf(params.events),
    total: params.total,
    lang: params.lang,
    dateFormat: params.dateFormat,
    generatedAt: new Date().toISOString(),
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
