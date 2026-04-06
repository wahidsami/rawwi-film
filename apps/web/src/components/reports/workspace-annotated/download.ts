import React from "react";
import { pdf } from "@react-pdf/renderer";
import { AnnotatedWorkspacePdf, type AnnotatedWorkspacePage, type AnnotatedWorkspaceUnresolved } from "./Pdf";

export interface DownloadAnnotatedWorkspacePdfParams {
  scriptTitle: string;
  reportLabel?: string;
  lang: "ar" | "en";
  pages: AnnotatedWorkspacePage[];
  unresolved?: AnnotatedWorkspaceUnresolved[];
}

export async function downloadAnnotatedWorkspacePdf(
  params: DownloadAnnotatedWorkspacePdfParams,
): Promise<void> {
  const doc = React.createElement(AnnotatedWorkspacePdf, {
    scriptTitle: params.scriptTitle,
    reportLabel: params.reportLabel,
    lang: params.lang,
    pages: params.pages,
    unresolved: params.unresolved ?? [],
  });

  const blob = await pdf(doc).toBlob();
  const MIN_PDF_BYTES = 500;
  if (blob.size < MIN_PDF_BYTES) {
    throw new Error(
      params.lang === "ar"
        ? "الملف الناتج غير صالح (حجم صغير جداً). أعد المحاولة."
        : "Generated PDF is invalid (file too small). Please retry.",
    );
  }

  const objectUrl = URL.createObjectURL(blob);
  const safeTitle = (params.scriptTitle || (params.lang === "ar" ? "نسخة_معلقة" : "annotated_copy"))
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, "_")
    .slice(0, 80);
  const datePart = new Date().toISOString().slice(0, 10);
  const anchorLabel = params.lang === "ar" ? "نسخة_معلقة" : "annotated_copy";
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = `${anchorLabel}_${safeTitle}_${datePart}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}
