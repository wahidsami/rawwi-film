import React from 'react';
import { pdf } from '@react-pdf/renderer';
import { ReportBuilderPdf, type ReportBuilderPdfData } from './Pdf';

export async function downloadReportBuilderPdf(params: {
  data: ReportBuilderPdfData;
  lang: 'ar' | 'en';
  dateFormat?: string;
}): Promise<void> {
  const logoUrl = await (async () => {
    try {
      const res = await fetch(`${window.location.origin}/fclogo.png`);
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
  })();
  const doc = React.createElement(ReportBuilderPdf, {
    data: params.data,
    lang: params.lang,
    dateFormat: params.dateFormat,
    logoUrl: logoUrl ?? undefined,
  });
  const blob = await pdf(doc).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `report-builder-${new Date().toISOString().slice(0, 10)}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
