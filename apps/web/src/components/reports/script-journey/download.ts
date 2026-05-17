import React from "react";
import { pdf } from "@react-pdf/renderer";
import { ScriptJourneyPdf } from "./Pdf";
import type { ScriptJourneyPayload } from "@/api";

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

export async function downloadScriptJourneyPdf(params: {
  data: ScriptJourneyPayload;
  lang: "ar" | "en";
}): Promise<void> {
  const origin = window.location.origin;
  const logoUrl = await toDataUrl(`${origin}/fclogo.png`);
  const doc = React.createElement(ScriptJourneyPdf, {
    data: params.data,
    lang: params.lang,
    logoUrl: logoUrl ?? undefined,
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
