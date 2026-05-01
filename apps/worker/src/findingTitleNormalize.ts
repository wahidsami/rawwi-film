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

type CategoryTitleRule = {
  title: string;
  patterns: RegExp[];
};

const CATEGORY_TITLE_RULES: CategoryTitleRule[] = [
  {
    title: "الإساءة إلى الوالدين",
    patterns: [
      /الإساءة\s+إلى\s+الوالدين/u,
      /إساءة\s+صريحة\s+للوالدين/u,
      /عقوق\s+والد/u,
      /عقوق\s+والديه/u,
    ],
  },
  {
    title: "الألفاظ النابية",
    patterns: [
      /الألفاظ\s+النابية/u,
      /لفظ(?:اً|ًا)?\s+نابي/u,
      /سب(?:اب)?(?:اً|ًا)?\s+مباشر/u,
      /شتيمة\s+عامة/u,
      /خادش\s+للحياء/u,
    ],
  },
  {
    title: "التنمر الجارح والسخرية",
    patterns: [
      /التنمر\s+الجارح\s+والسخرية/u,
      /تنمر(?:اً|ًا)?\s+وإذلال/u,
      /سخرية\s+جارحة/u,
      /إذلال\s+وتنمر/u,
      /إهانة\s+مباشرة/u,
    ],
  },
  {
    title: "إيذاء الطفل وذوي الإعاقة",
    patterns: [
      /إيذاء\s+الطفل\s+وذوي\s+الإعاقة/u,
      /إيذاء\s+جسدي\s+واضح\s+لطفل/u,
      /إيذاء\s+لفظي\s+موجّه\s+لطفل/u,
      /تهديد\s+مباشر\s+بالإيذاء\s+الجسدي\s+لطفل/u,
      /عنف(?:اً|ًا)?\s+جسدي(?:اً|ًا)?\s+مباشر(?:اً|ًا)?\s+.*?الطفل/u,
      /تنمر\s+جماعي\s+موجّه\s+لطفل/u,
    ],
  },
  {
    title: "محتوى الجرائم الموجه للأطفال",
    patterns: [
      /محتوى\s+الجرائم\s+الموجه\s+للأطفال/u,
      /تطبيع\s+السلوكيات\s+الخطرة\s+لدى\s+الأطفال/u,
      /طفل\s+يرتكب\s+جريمة/u,
    ],
  },
  {
    title: "الإساءة إلى المرأة أو تعنيفها",
    patterns: [
      /الإساءة\s+إلى\s+المرأة\s+أو\s+تعنيفها/u,
      /العنف\s+ضد\s+المرأة/u,
      /تعنيف(?:ها| المرأة)/u,
      /حصر\s+دور\s+المرأة/u,
      /تقويض\s+كرامة\s+المرأة/u,
      /تحقير\s+المرأة/u,
    ],
  },
  {
    title: "الإساءة للمجتمع أو الهوية الوطنية",
    patterns: [
      /الإساءة\s+للمجتمع\s+أو\s+الهوية\s+الوطنية/u,
      /إساءة\s+للمجتمع\s+أو\s+الهوية\s+الوطنية/u,
      /يسيء\s+لمجموعة\s+كبيرة/u,
      /تعميم\s+سلبي\s+مباشر/u,
      /الإساءة\s+لمجموعة\s+اجتماعية/u,
    ],
  },
  {
    title: "الإضرار بالأمن الوطني",
    patterns: [
      /الإضرار\s+بالأمن\s+الوطني/u,
      /يمس\s+الأمن\s+الوطني/u,
      /تهدد\s+الأمن\s+الوطني/u,
      /زعزعة\s+النظام\s+العام/u,
      /الإخلال\s+بالنظام\s+العام/u,
    ],
  },
  {
    title: "المساس بالقيادة السياسية",
    patterns: [
      /المساس\s+بالقيادة\s+السياسية/u,
      /قلب\s+نظام\s+الحكم/u,
      /إسقاط\s+الحكم/u,
      /ضد\s+القيادة\s+السياسية/u,
    ],
  },
  {
    title: "المحتوى التاريخي غير الموثوق",
    patterns: [
      /المحتوى\s+التاريخي\s+غير\s+الموثوق/u,
      /تقديم\s+معلومات\s+(?:مغلوطة|مضللة|غير\s+دقيقة)\s+على\s+أنها\s+حقائق/u,
      /معلومات\s+(?:مغلوطة|مضللة|غير\s+دقيقة)/u,
    ],
  },
  {
    title: "المحتوى الجنسي غير المناسب",
    patterns: [
      /المحتوى\s+الجنسي\s+غير\s+المناسب/u,
      /إيحاء(?:اً|ً)?\s+جنسي/u,
      /تلميح(?:اً|ًا)?\s+جنسي/u,
    ],
  },
  {
    title: "المشاهد الجنسية الصريحة",
    patterns: [
      /المشاهد\s+الجنسية\s+الصريحة/u,
      /مشهد\s+جنسي\s+صريح/u,
    ],
  },
  {
    title: "تقويض قيم الأسرة",
    patterns: [
      /تقويض\s+قيم\s+الأسرة/u,
      /القيم\s+الأسرية/u,
    ],
  },
  {
    title: "الإساءة إلى كبار السن",
    patterns: [
      /الإساءة\s+إلى\s+كبار\s+السن/u,
      /إهانة\s+كبار\s+السن/u,
    ],
  },
  {
    title: "الترويج للمخدرات والمسكرات",
    patterns: [
      /الترويج\s+للمخدرات\s+والمسكرات/u,
      /تعاطي\s+المخدرات/u,
      /تعاطي\s+المسكرات/u,
    ],
  },
];

export function normalizeFindingTitleAgainstRationale(params: {
  titleAr: string;
  rationaleAr?: string | null;
  descriptionAr?: string | null;
  evidenceSnippet?: string | null;
  source?: string | null;
}): string {
  const source = (params.source ?? "").trim().toLowerCase();
  if (source === "manual" || source === "lexicon_mandatory") return params.titleAr.trim() || "مخالفة محتوى";

  const rationale = (params.rationaleAr ?? "").trim();
  const description = (params.descriptionAr ?? "").trim();
  const evidence = (params.evidenceSnippet ?? "").trim();
  const current = params.titleAr.trim();
  const text = [rationale, description, evidence].filter(Boolean).join("\n");

  for (const rule of CATEGORY_TITLE_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(text))) return rule.title;
  }

  return current || "مخالفة محتوى";
}
