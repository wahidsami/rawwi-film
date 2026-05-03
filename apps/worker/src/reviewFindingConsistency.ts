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

const TITLE_PRIMARY_ARTICLE_MAP: Array<{ pattern: RegExp; articleId: number; atomId?: string | null }> = [
  { pattern: /المساس\s+بالثوابت\s+الدينية/u, articleId: 4, atomId: null },
  { pattern: /المساس\s+بالقيادة\s+السياسية/u, articleId: 13, atomId: null },
  { pattern: /الإضرار\s+بالأمن\s+الوطني/u, articleId: 12, atomId: null },
  { pattern: /المحتوى\s+التاريخي\s+غير\s+الموثوق/u, articleId: 16, atomId: null },
  { pattern: /الإساءة\s+للمجتمع\s+أو\s+الهوية\s+الوطنية/u, articleId: 8, atomId: null },
  { pattern: /محتوى\s+الجرائم\s+الموجه\s+للأطفال/u, articleId: 6, atomId: "6-2" },
  { pattern: /الترويج\s+للمخدرات\s+والمسكرات/u, articleId: 10, atomId: null },
  { pattern: /إيذاء\s+الطفل\s+وذوي\s+الإعاقة/u, articleId: 6, atomId: "6-3" },
  { pattern: /المحتوى\s+الجنسي\s+غير\s+المناسب/u, articleId: 9, atomId: "9-4" },
  { pattern: /المشاهد\s+الجنسية\s+الصريحة/u, articleId: 9, atomId: null },
  { pattern: /الألفاظ\s+النابية/u, articleId: 5, atomId: null },
  { pattern: /الإساءة\s+إلى\s+المرأة\s+أو\s+تعنيفها/u, articleId: 7, atomId: null },
  { pattern: /تقويض\s+قيم\s+الأسرة/u, articleId: 17, atomId: null },
  { pattern: /الإساءة\s+إلى\s+الوالدين/u, articleId: 17, atomId: "17-14" },
  { pattern: /الإساءة\s+إلى\s+كبار\s+السن/u, articleId: 17, atomId: "17-15" },
  { pattern: /التنمر\s+الجارح\s+والسخرية/u, articleId: 17, atomId: "17-16" },
  { pattern: /^مخالفة\s+محتوى$|^أخرى$/u, articleId: 4, atomId: null },
];

const QUOTED_TEXT_RE = /["“”'‘’«»]([^"“”'‘’«»]{2,160})["“”'‘’«»]/gu;
const RELIGIOUS_RE = /(الله|الرب|الدين|الإسلام|مسلم|مسلمين|قرآن|القرآن|النبي|رسول|الصلاة|المسجد|الحرم|الكعبة|الشريعة|العقيدة|العبادة|المقدسات|ثوابت\s+دينية)/u;
const POLITICAL_RE = /(القيادة|الحكم|النظام|الرئيس|الملك|ولي\s+العهد|الحكومة|الدولة|السلطة|انقلاب|إسقاط|انتفاضة|تمرد|ثورة|الخروج\s+للشارع|جهة\s+رسمية|الجهات\s+الرسمية)/u;
const EXPLICIT_SEX_RE = /(جماع|اغتصاب|نكاح|علاقة\s+جنسية|مشهد\s+جنسي|يمارس(?:ون)?\s+الجنس|عري|عاري|أعضاء\s+حميمة|تحرش\s+جنسي)/u;

const PROFANITY_RE = /(يلعن|لعن|طز|حمارة|غبي|فاشل|كذاب|كذّاب|حرامية|نصاب|حقير|قذر|كلب|حيوان|عديم\s+التربية|ما\s+منه\s+فايدة)/u;
const CHILD_RE = /(طفل|الطفل|ولد|الولد|سامي|طالب|طلاب|مدرسة|المعلم|ناصر|الفصل)/u;
const CHILD_HARM_RE = /(يضرب|ضرب|أضرب|حضربك|أسيل\s+دمك|دمك|تهديد|يهدد|يمسك\s+أذن|يدفعه|عصا|إهانة|يسخر|تنمر|عديم\s+التربية|فاشل|غبي|كذاب|كذّاب)/u;
const WOMEN_RE = /(مرأة|المرأة|زوجته|زوجة|البنت|نساء|المطبخ|السرير|يضربها|يمسك\s+ذراعها|تحقير\s+المرأة|كرامة\s+المرأة)/u;
const FAMILY_RE = /(الأسرة|العائلة|البيت|زوجته|ابنه|ابنته|الوالدين|والديك|كلهم|طز\s+فيهم)/u;
const SOCIETY_RE = /(المجتمع|الهوية|الدولة|دولة|الجهات\s+الرسمية|جهة\s+رسمية|كلهم\s+حرامية|حرامية\s+في\s+الجهات)/u;

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

function inferGroundedTitle(groundingText: string, currentTitle: string): string {
  const text = normalize(groundingText);

  if (CHILD_RE.test(text) && CHILD_HARM_RE.test(text)) {
    return "إيذاء الطفل وذوي الإعاقة";
  }
  if (WOMEN_RE.test(text)) {
    return "الإساءة إلى المرأة أو تعنيفها";
  }
  if (FAMILY_RE.test(text) && /طز|احتقار|لا\s+يهتم|تفكك|العن\s+والديك|والديك/u.test(text)) {
    return "تقويض قيم الأسرة";
  }
  if (SOCIETY_RE.test(text)) {
    return "الإساءة للمجتمع أو الهوية الوطنية";
  }
  if (PROFANITY_RE.test(text)) {
    return CHILD_RE.test(text) ? "التنمر الجارح والسخرية" : "الألفاظ النابية";
  }
  if (RELIGIOUS_RE.test(text)) {
    return "المساس بالثوابت الدينية";
  }
  if (POLITICAL_RE.test(text)) {
    return "المساس بالقيادة السياسية";
  }
  if (EXPLICIT_SEX_RE.test(text)) {
    return "المشاهد الجنسية الصريحة";
  }

  return currentTitle || "مخالفة محتوى";
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

function inferPrimaryArticleMappingFromTitle(
  title: string,
  fallbackId: number,
): { articleId: number; atomId?: string | null } {
  const compactTitle = compact(title);
  const hit = TITLE_PRIMARY_ARTICLE_MAP.find((item) => item.pattern.test(compactTitle));
  if (!hit) return { articleId: fallbackId };
  return { articleId: hit.articleId, atomId: hit.atomId };
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

  let title = compact(row.title_ar) || "مخالفة محتوى";
  const religiousDrift = titleNeedsReligiousAnchors(title) && !RELIGIOUS_RE.test(normalizedGrounding);
  const politicalDrift = titleNeedsPoliticalAnchors(title) && !POLITICAL_RE.test(normalizedGrounding);
  const sexDrift = titleNeedsExplicitSexAnchors(title) && !EXPLICIT_SEX_RE.test(normalizedGrounding);

  if (religiousDrift || politicalDrift || sexDrift) {
    title = inferGroundedTitle(groundingText, title);
  }

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
    title !== row.title_ar || rationale_ar !== row.rationale_ar
      ? Math.min(row.anchor_confidence ?? 1, 0.72)
      : row.anchor_confidence;
  const remapped = inferPrimaryArticleMappingFromTitle(title, row.primary_article_id);

  return {
    ...row,
    primary_article_id: remapped.articleId,
    ...(remapped.atomId !== undefined ? { primary_atom_id: remapped.atomId } : {}),
    title_ar: title,
    rationale_ar,
    anchor_confidence,
  };
}
