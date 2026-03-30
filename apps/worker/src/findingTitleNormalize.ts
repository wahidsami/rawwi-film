/**
 * Pass 0 (glossary) prompt example uses fixed title "لفظ محظور من المعجم".
 * The model sometimes copies it for non-lexicon findings (e.g. violence). Badge stays "AI"
 * because source is still ai — only the title is wrong. Normalize before persist / after auditor.
 */
export const GLOSSARY_PASS_TITLE_PLACEHOLDER = "لفظ محظور من المعجم";
const GLOSSARY_STYLE_TITLE = /^مخالفة\s+معجمية\s*:\s*(.+)$/;
const GLOSSARY_CANONICAL_TITLE = /^مطابقة\s+من\s+قاموس\s+المصطلحات\s*:\s*(.+)$/;

export function normalizeMisusedGlossaryPassTitle(params: {
  titleAr: string | undefined;
  rationaleAr?: string | null;
  detectionPass?: string | null;
  evidenceSnippet: string;
  articleId: number;
}): string {
  const t = (params.titleAr ?? "").trim();
  const glossaryLeakMatch = t.match(GLOSSARY_STYLE_TITLE) ?? t.match(GLOSSARY_CANONICAL_TITLE);
  const r = (params.rationaleAr ?? "").trim();
  const longEvidence = params.evidenceSnippet.length > 180;
  const rationaleLooksContextual =
    r.length > 50 &&
    !/معجم|قاموس|لفظ\s*محظور\s*من\s*المعجم|المصطلحات\s*المحظورة|من\s*القائمة\s*أعلاه|وجود\s*لفظ/.test(r);
  const pass = params.detectionPass ?? "";
  const isGlossaryStyleTitle = t === GLOSSARY_PASS_TITLE_PLACEHOLDER || glossaryLeakMatch != null;

  if (!isGlossaryStyleTitle) {
    return params.titleAr?.trim() || "مخالفة محتوى";
  }

  if ((pass === "" || pass === "glossary") && glossaryLeakMatch?.[1]?.trim()) {
    return `مطابقة من قاموس المصطلحات: ${glossaryLeakMatch[1].trim()}`;
  }

  if (pass !== "" && pass !== "glossary") {
    return `مخالفة المحتوى الإعلامي — المادة ${params.articleId}`;
  }
  if (longEvidence || rationaleLooksContextual) {
    return `مخالفة المحتوى الإعلامي — المادة ${params.articleId}`;
  }
  if (glossaryLeakMatch?.[1]?.trim()) {
    return `مطابقة من قاموس المصطلحات: ${glossaryLeakMatch[1].trim()}`;
  }
  return "مطابقة من قاموس المصطلحات";
}
