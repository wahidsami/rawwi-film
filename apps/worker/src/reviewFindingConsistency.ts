type ReviewFindingLike = {
  source_kind: "ai" | "glossary" | "manual" | "special";
  primary_article_id: number;
  primary_atom_id?: string | null;
  title_ar: string;
  rationale_ar: string | null;
  evidence_snippet: string;
  start_offset_global: number | null;
  end_offset_global: number | null;
  anchor_confidence: number | null;
};

const QUOTED_TEXT_RE = /["“”'‘’«»]([^"“”'‘’«»]{2,160})["“”'‘’«»]/gu;
const RELIGIOUS_RE = /(الله|الرب|الدين|الإسلام|مسلم|مسلمين|قرآن|القرآن|النبي|رسول|الصلاة|المسجد|الحرم|الكعبة|الشريعة|العقيدة|العبادة|المقدسات|ثوابت\s+دينية)/u;
const POLITICAL_RE = /(القيادة|الحكم|النظام|الرئيس|الملك|ولي\s+العهد|الحكومة|الدولة|السلطة|انقلاب|إسقاط|انتفاضة|تمرد|ثورة|الخروج\s+للشارع|جهة\s+رسمية|الجهات\s+الرسمية)/u;
const EXPLICIT_SEX_RE = /(جماع|اغتصاب|نكاح|علاقة\s+جنسية|مشهد\s+جنسي|يمارس(?:ون)?\s+الجنس|عري|عاري|أعضاء\s+حميمة|تحرش\s+جنسي)/u;

function compact(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function normalize(value: string | null | undefined): string {
  return compact(value)
    .normalize("NFC")
    .replace(/[إأآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/[ًٌٍَُِّْـ]/g, "");
}

function buildContext(fullText: string | null | undefined, row: ReviewFindingLike): string {
  const text = fullText ?? "";
  if (!text || row.start_offset_global == null) return "";
  const start = Math.max(0, row.start_offset_global - 280);
  const endHint = row.end_offset_global != null && row.end_offset_global > row.start_offset_global
    ? row.end_offset_global
    : row.start_offset_global;
  const end = Math.min(text.length, endHint + 280);
  return compact(text.slice(start, end));
}

function quotedPhrases(value: string | null | undefined): string[] {
  const out: string[] = [];
  const text = value ?? "";
  QUOTED_TEXT_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = QUOTED_TEXT_RE.exec(text)) !== null) {
    const phrase = compact(match[1]);
    if (phrase.length >= 2) out.push(phrase);
  }
  return out;
}

function rationaleQuotesAreGrounded(rationale: string | null, groundingText: string): boolean {
  const quotes = quotedPhrases(rationale);
  if (quotes.length === 0) return true;
  const normalizedGrounding = normalize(groundingText);
  return quotes.every((quote) => normalizedGrounding.includes(normalize(quote)));
}

function titleNeedsReligiousAnchors(title: string): boolean {
  return /الثوابت\s+الدينية|الدين|المقدسات/u.test(title);
}

function titleNeedsPoliticalAnchors(title: string): boolean {
  return /القيادة\s+السياسية|نظام\s+الحكم/u.test(title);
}

function titleNeedsExplicitSexAnchors(title: string): boolean {
  return /المشاهد\s+الجنسية\s+الصريحة/u.test(title);
}

function fallbackRationale(title: string, evidence: string): string {
  if (title === "إيذاء الطفل وذوي الإعاقة") {
    return "المقتطف يتضمن إساءة أو تهديدًا موجهًا لطفل ضمن السياق المعروض، لذلك يحتاج مراجعة ضمن بند إيذاء الطفل.";
  }
  if (title === "التنمر الجارح والسخرية") {
    return "المقتطف يتضمن إهانة أو تحقيرًا مباشرًا للشخصية، لذلك يحتاج مراجعة ضمن بند التنمر الجارح والسخرية.";
  }
  if (title === "الألفاظ النابية") {
    return "المقتطف يتضمن لفظًا مهينًا أو سبًا مباشرًا، لذلك يحتاج مراجعة ضمن بند الألفاظ النابية.";
  }
  if (title === "الإساءة إلى المرأة أو تعنيفها") {
    return "المقتطف أو سياقه القريب يتضمن تحقيرًا أو تعنيفًا للمرأة، لذلك يحتاج مراجعة ضمن هذا البند.";
  }
  if (title === "تقويض قيم الأسرة") {
    return "المقتطف أو سياقه القريب يتضمن تقليلًا من شأن الأسرة أو روابطها، لذلك يحتاج مراجعة ضمن بند تقويض قيم الأسرة.";
  }
  if (title === "الإساءة للمجتمع أو الهوية الوطنية") {
    return "المقتطف يتضمن تعميمًا أو إساءة مرتبطة بالمجتمع أو جهة عامة، لذلك يحتاج مراجعة ضمن هذا البند.";
  }
  if (evidence.length > 0) {
    return `المقتطف المعروض يحتاج مراجعة ضمن بند ${title}.`;
  }
  return "يتطلب تقييم مراجع مختص.";
}

export function normalizeReviewFindingConsistency<T extends ReviewFindingLike>(
  row: T,
  fullText: string | null | undefined,
): T {
  if (row.source_kind === "manual" || row.source_kind === "special") return row;

  const evidence = compact(row.evidence_snippet);
  const context = buildContext(fullText, row);
  const groundingText = compact([context, evidence].filter(Boolean).join(" "));
  const normalizedGrounding = normalize(groundingText);

  // Validation-only mode:
  // - do NOT reinterpret/override category title from rationale
  // - do NOT remap article/atom ids
  const title = compact(row.title_ar) || "مخالفة محتوى";
  const religiousDrift = titleNeedsReligiousAnchors(title) && !RELIGIOUS_RE.test(normalizedGrounding);
  const politicalDrift = titleNeedsPoliticalAnchors(title) && !POLITICAL_RE.test(normalizedGrounding);
  const sexDrift = titleNeedsExplicitSexAnchors(title) && !EXPLICIT_SEX_RE.test(normalizedGrounding);

  const quotesGrounded = rationaleQuotesAreGrounded(row.rationale_ar, groundingText);
  const rationaleMentionsDriftedCategory =
    (religiousDrift && /ثوابت\s+دينية|ديني|المقدسات/u.test(row.rationale_ar ?? "")) ||
    (politicalDrift && /القيادة\s+السياسية|قلب\s+نظام\s+الحكم|النظام/u.test(row.rationale_ar ?? "")) ||
    (sexDrift && /جنسي|جنسية/u.test(row.rationale_ar ?? ""));

  const rationale_ar =
    quotesGrounded && !rationaleMentionsDriftedCategory
      ? row.rationale_ar
      : fallbackRationale(title, evidence);

  const anchor_confidence =
    religiousDrift || politicalDrift || sexDrift || rationale_ar !== row.rationale_ar
      ? Math.min(row.anchor_confidence ?? 1, 0.72)
      : row.anchor_confidence;

  return {
    ...row,
    title_ar: title,
    rationale_ar,
    anchor_confidence,
  };
}
