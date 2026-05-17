import React from "react";
import { pdf } from "@react-pdf/renderer";
import { ScriptJourneyPdf } from "./Pdf";
import type { ScriptJourneyPayload } from "@/api";

export async function downloadScriptJourneyPdf(params: {
  data: ScriptJourneyPayload;
  lang: "ar" | "en";
}): Promise<void> {
  const doc = React.createElement(ScriptJourneyPdf, {
    data: params.data,
    lang: params.lang,
  });
  const blob = await pdf(doc).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safeTitle = (params.data.script.title || "script").replace(/[^\p{L}\p{N}_-]+/gu, "_").slice(0, 80);
  a.href = url;
  a.download = `script_journey_${safeTitle}_${new Date().toISOString().slice(0, 10)}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
