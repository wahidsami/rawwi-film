import React from 'react';
import { pdf } from '@react-pdf/renderer';
import { ReportBuilderPdf, type ReportBuilderPdfData } from './Pdf';

export async function downloadReportBuilderPdf(params: {
  data: ReportBuilderPdfData;
  lang: 'ar' | 'en';
  dateFormat?: string;
}): Promise<void> {
  const doc = React.createElement(ReportBuilderPdf, {
    data: params.data,
    lang: params.lang,
    dateFormat: params.dateFormat,
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
