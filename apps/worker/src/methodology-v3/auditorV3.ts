import { containsAnyNormalized, normalizeDetectionText } from "../textDetectionNormalize.js";
import type { HybridFindingLike } from "./contextArbiter.js";

export type AuditorV3Category =
  | "sexual_explicit"
  | "sexual_implicit"
  | "drugs"
  | "national_security"
  | "political"
  | "religion"
  | "historical"
  | "society"
  | "children"
  | "disability"
  | "women"
  | "parents"
  | "elderly"
  | "family"
  | "profanity"
  | "bullying"
  | "other";

export type AuditorV3Result = {
  findings: HybridFindingLike[];
  metrics: {
    inputCount: number;
    keptCount: number;
    rejectedCount: number;
    exactMatchRejected: number;
    groundingRejected: number;
    sanityRejected: number;
    signalRejected: number;
    conflictRejected: number;
    byCategory: Record<string, number>;
  };
};

type CategoryConfig = {
  titleAr: string;
  titleRegex: RegExp;
  allowTokens: string[];
  exactTerms: string[];
  minimumTokens: number;
  requiresSpecificSignal: boolean;
};

const TITLE_TO_CATEGORY: Array<[AuditorV3Category, CategoryConfig]> = [
  [
    "religion",
    {
      titleAr: "المساس بالثوابت الدينية",
      titleRegex: /(?:المساس\s+بالثوابت\s+الدينية|الثوابت\s+الدينية|الدينية)/u,
      allowTokens: ["الدين", "الإسلام", "مسلم", "مسلمين", "قرآن", "سنة", "صلاة", "أذان", "صيام", "حج", "رمضان", "الله", "النبي", "رسول", "شريعة", "مسجد", "عبادة", "كافر", "كفر"],
      exactTerms: ["الدين", "الصلاة", "الأذان", "القرآن", "السنة", "الإسلام", "الله", "رسول", "نبي"],
      minimumTokens: 2,
      requiresSpecificSignal: true,
    },
  ],
  [
    "political",
    {
      titleAr: "المساس بالقيادة السياسية",
      titleRegex: /(?:المساس\s+بالقيادة\s+السياسية|القيادة\s+السياسية)/u,
      allowTokens: ["الملك", "ملكي", "ولي", "العهد", "القيادة", "القائد", "القيادة", "الحاكم", "الحكم", "السلطة", "الانقلاب", "الإسقاط", "تمرد", "عصيان"],
      exactTerms: ["الملك", "ولي العهد", "القيادة", "الحاكم", "الحكم", "إسقاط الحكم", "انقلاب", "تمرد"],
      minimumTokens: 2,
      requiresSpecificSignal: true,
    },
  ],
  [
    "national_security",
    {
      titleAr: "الإضرار بالأمن الوطني",
      titleRegex: /(?:الإضرار\s+بالأمن\s+الوطني|الأمن\s+الوطني)/u,
      allowTokens: ["أمن", "استقرار", "فوضى", "تمرد", "عصيان", "تخريب", "تفجير", "قنبلة", "هجوم", "شغب", "إرهاب", "حرق", "نسف", "خطف"],
      exactTerms: ["تمرد", "عصيان", "إسقاط النظام", "تخريب", "تفجير", "إرهاب", "هجوم", "فوضى", "شغب"],
      minimumTokens: 2,
      requiresSpecificSignal: true,
    },
  ],
  [
    "historical",
    {
      titleAr: "المحتوى التاريخي غير الموثوق",
      titleRegex: /(?:المحتوى\s+التاريخي\s+غير\s+الموثوق|غير\s+الموثوق)/u,
      allowTokens: ["تاريخ", "تاريخي", "عام", "سنة", "هجرية", "ميلادية", "عهد", "ماض", "الماضي", "الخلافة", "الدولة", "رواية", "حدث", "حصل", "كان"],
      exactTerms: ["في عام", "التاريخ يقول", "الرواية التاريخية", "سنة", "هجرية", "ميلادية"],
      minimumTokens: 3,
      requiresSpecificSignal: true,
    },
  ],
  [
    "society",
    {
      titleAr: "الإساءة للمجتمع أو الهوية الوطنية",
      titleRegex: /(?:الإساءة\s+للمجتمع\s+أو\s+الهوية\s+الوطنية|الهوية\s+الوطنية|المجتمع)/u,
      allowTokens: ["السعوديين", "السعودي", "السعودية", "الشعب", "المجتمع", "القبيلة", "القبائل", "العائلة", "العوائل", "كلهم", "جميع", "دائم", "أبد", "أغلب", "معظم"],
      exactTerms: ["السعوديين", "كلهم", "دائمًا", "دائما", "القبيلة كلها", "المجتمع"],
      minimumTokens: 3,
      requiresSpecificSignal: true,
    },
  ],
  [
    "children",
    {
      titleAr: "محتوى الجرائم الموجه للأطفال",
      titleRegex: /(?:محتوى\s+الجرائم\s+الموجه\s+للأطفال|الجرائم\s+الموجه\s+للأطفال)/u,
      allowTokens: ["طفل", "أطفال", "طفلة", "أولاد", "ولد", "بنت", "طلاب", "طالب", "تلميذ", "قاصر", "قاصرين"],
      exactTerms: ["طفل", "أطفال", "قاصر", "قاصرين", "طالب", "طالبة"],
      minimumTokens: 2,
      requiresSpecificSignal: true,
    },
  ],
  [
    "drugs",
    {
      titleAr: "الترويج للمخدرات والمسكرات",
      titleRegex: /(?:الترويج\s+للمخدرات\s+والمسكرات|المخدرات\s+والمسكرات)/u,
      allowTokens: ["مخدر", "مخدرات", "حشيش", "خمر", "كحول", "سكران", "سكر", "تعاطي", "مدمن", "تدخين", "سيجارة", "يشرب"],
      exactTerms: ["مخدرات", "خمر", "كحول", "حشيش", "سكران", "مدمن"],
      minimumTokens: 1,
      requiresSpecificSignal: true,
    },
  ],
  [
    "disability",
    {
      titleAr: "إيذاء الطفل وذوي الإعاقة",
      titleRegex: /(?:إيذاء\s+الطفل\s+وذوي\s+الإعاقة|ذوي\s+الإعاقة)/u,
      allowTokens: ["إعاقة", "معاق", "معاقة", "أعمى", "أصم", "بكم", "مقعد", "إعاقة", "طفل", "أطفال"],
      exactTerms: ["ذوي الإعاقة", "معاق", "إعاقة", "أعمى", "أصم"],
      minimumTokens: 2,
      requiresSpecificSignal: true,
    },
  ],
  [
    "sexual_implicit",
    {
      titleAr: "المحتوى الجنسي غير المناسب",
      titleRegex: /(?:المحتوى\s+الجنسي\s+غير\s+المناسب|غير\s+المناسب)/u,
      allowTokens: ["غزل", "إيحاء", "إيحائي", "شهوة", "إغراء", "قبلات", "حضن", "عناق", "يلمس", "يلامس", "ينام", "علاقة", "جسد"],
      exactTerms: ["إيحاء", "غزل", "شهوة", "قبلات", "عناق", "حضن", "علاقة"],
      minimumTokens: 2,
      requiresSpecificSignal: true,
    },
  ],
  [
    "sexual_explicit",
    {
      titleAr: "المشاهد الجنسية الصريحة",
      titleRegex: /(?:المشاهد\s+الجنسية\s+الصريحة|جنسية\s+صريحة)/u,
      allowTokens: ["جنس", "جماع", "مضاجعة", "ممارسة", "عري", "عاري", "مكشوف", "ثدي", "قضيب", "مهبل", "فرج", "زنا", "خيانة"],
      exactTerms: ["جنس", "جماع", "عري", "مضاجعة", "ممارسة", "زنا"],
      minimumTokens: 1,
      requiresSpecificSignal: true,
    },
  ],
  [
    "profanity",
    {
      titleAr: "الألفاظ النابية",
      titleRegex: /(?:الألفاظ\s+النابية|النابية)/u,
      allowTokens: ["يلعن", "لعنة", "تبا", "تبًا", "حمار", "كلب", "غبي", "أحمق", "ساقط", "وسخ", "قذر", "حقير", "وضيع", "نذل", "خسيس", "لئيم", "جبان", "كذاب", "حرامي", "نصاب", "أهبل", "خرا", "نابي", "نابية", "شتيمة", "سباب"],
      exactTerms: ["يلعن", "يا حمار", "يا كلب", "كذاب", "حرامي", "نصاب", "غبي", "أحمق"],
      minimumTokens: 1,
      requiresSpecificSignal: true,
    },
  ],
  [
    "women",
    {
      titleAr: "الإساءة إلى المرأة أو تعنيفها",
      titleRegex: /(?:الإساءة\s+إلى\s+المرأة\s+أو\s+تعنيفها|المرأة\s+أو\s+تعنيفها)/u,
      allowTokens: ["امرأة", "المرأة", "نساء", "زوجة", "بنت", "بنات", "أنثى", "مطبخ", "بيت", "ضعيفة", "أقل", "تقليل", "تحقير", "إهانة", "تعنيف"],
      exactTerms: ["المرأة", "زوجة", "بنت", "بنات", "مكانها المطبخ", "مكان المرأة"],
      minimumTokens: 2,
      requiresSpecificSignal: true,
    },
  ],
  [
    "family",
    {
      titleAr: "تقويض قيم الأسرة",
      titleRegex: /(?:تقويض\s+قيم\s+الأسرة|قيم\s+الأسرة)/u,
      allowTokens: ["أسرة", "عائلة", "أهل", "أهلك", "الزواج", "زوج", "زوجة", "البيت", "اقطع", "اترك", "بدونهم", "استغني", "مضيعة", "قيمة"],
      exactTerms: ["اقطع علاقتك بأهلك", "الزواج مضيعة وقت", "العائلة ما لها قيمة", "بدونهم"],
      minimumTokens: 2,
      requiresSpecificSignal: true,
    },
  ],
  [
    "parents",
    {
      titleAr: "الإساءة إلى الوالدين",
      titleRegex: /(?:الإساءة\s+إلى\s+الوالدين|الوالدين)/u,
      allowTokens: ["أب", "أم", "أبوك", "أمك", "والد", "والدة", "والدين", "عقوق", "سب", "إهانة", "ضرب", "احتقار"],
      exactTerms: ["أبوك", "أمك", "الوالدين", "أبوي", "أمي"],
      minimumTokens: 2,
      requiresSpecificSignal: true,
    },
  ],
  [
    "elderly",
    {
      titleAr: "الإساءة إلى كبار السن",
      titleRegex: /(?:الإساءة\s+إلى\s+كبار\s+السن|كبار\s+السن)/u,
      allowTokens: ["عجوز", "مسن", "مسنة", "كبير", "الكبار", "السن", "شيخ", "جدة", "جد", "إهانة", "احتقار"],
      exactTerms: ["العجوز", "كبار السن", "مسن", "مسنة"],
      minimumTokens: 2,
      requiresSpecificSignal: true,
    },
  ],
  [
    "bullying",
    {
      titleAr: "التنمر الجارح والسخرية",
      titleRegex: /(?:التنمر\s+الجارح\s+والسخرية|التنمر)/u,
      allowTokens: ["غبي", "أحمق", "فاشل", "ما تسوى", "لا أحد يبيك", "مقرف", "سخيف", "حقير", "وضيع", "جبان", "مضحك", "سخرية", "تسخر", "تحقير", "إذلال", "فشل"],
      exactTerms: ["أنت غبي", "يا فاشل", "ما تسوى شيء", "لا أحد يبيك"],
      minimumTokens: 2,
      requiresSpecificSignal: true,
    },
  ],
  [
    "other",
    {
      titleAr: "أخرى",
      titleRegex: /(?:أخرى|other)/u,
      allowTokens: ["فساد", "رشوة", "ابتزاز", "احتيال", "خيانة", "سرقة", "تسريب", "تهديد", "تحريض", "كذب", "اكذب", "كاذب", "فضيحة", "مخالفة", "انتهاك"],
      exactTerms: [],
      minimumTokens: 2,
      requiresSpecificSignal: false,
    },
  ],
];

const CATEGORY_MAP = new Map<AuditorV3Category, CategoryConfig>(TITLE_TO_CATEGORY);

const PRIORITY_ORDER: AuditorV3Category[] = [
  "sexual_explicit",
  "sexual_implicit",
  "drugs",
  "national_security",
  "political",
  "religion",
  "historical",
  "society",
  "children",
  "disability",
  "women",
  "parents",
  "elderly",
  "family",
  "profanity",
  "bullying",
  "other",
];

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim().normalize("NFC");
}

function tokenSet(value: string | null | undefined): Set<string> {
  const text = normalizeDetectionText(value ?? "", { stripPunctuation: true });
  return new Set(text.split(/\s+/).filter(Boolean));
}

function tokenCount(value: string | null | undefined): number {
  return tokenSet(value).size;
}

function findTitleCategory(title: string | null | undefined): AuditorV3Category | null {
  const normalized = normalizeText(title);
  if (!normalized) return null;
  for (const [category, cfg] of CATEGORY_MAP.entries()) {
    if (cfg.titleRegex.test(normalized)) return category;
  }
  return null;
}

function hasAnyToken(text: string, needles: string[]): boolean {
  return containsAnyNormalized(text, needles);
}

function isGroundedRationale(category: AuditorV3Category, evidenceSnippet: string, rationale: string | null | undefined): boolean {
  const text = normalizeText(rationale);
  if (!text) return true;

  if (/\bمادة\s+\d+/u.test(text)) return false;
  const evidence = normalizeText(evidenceSnippet);
  if (containsAnyNormalized(text, ["فهد", "سامي", "مها", "ناصر", "حسام", "ريم", "دلال"])) {
    const names = ["فهد", "سامي", "مها", "ناصر", "حسام", "ريم", "دلال"];
    if (!names.some((name) => evidence.includes(name))) return false;
  }
  return true;
}

function isExactMatch(fullText: string | null, snippet: string | null | undefined): boolean {
  const text = normalizeText(fullText);
  const evidence = normalizeText(snippet);
  if (!text || !evidence) return false;
  return text.includes(evidence);
}

function isSpecificSignalPresent(category: AuditorV3Category, evidenceSnippet: string): boolean {
  const text = normalizeText(evidenceSnippet);
  const cfg = CATEGORY_MAP.get(category);
  if (!cfg) return false;

  if (category === "other") {
    const genericSignals = [
      "فساد",
      "رشوة",
      "ابتزاز",
      "احتيال",
      "خيانة",
      "سرقة",
      "تسريب",
      "تهديد",
      "تحريض",
      "كذب",
      "كاذب",
      "فضيحة",
      "مخالفة",
      "انتهاك",
    ];
    return hasAnyToken(text, genericSignals);
  }

  if (!cfg.requiresSpecificSignal) return true;
  if (cfg.exactTerms.some((term) => text.includes(term))) return true;
  return hasAnyToken(text, cfg.allowTokens);
}

function passesMinimumSignal(category: AuditorV3Category, evidenceSnippet: string): boolean {
  const count = tokenCount(evidenceSnippet);
  if (category === "profanity") return count >= 1;
  if (category === "sexual_explicit") return count >= 1;
  if (category === "other") return count >= 2;
  return count >= CATEGORY_MAP.get(category)!.minimumTokens;
}

function resolveCategory(finding: HybridFindingLike): AuditorV3Category {
  const titleCategory = findTitleCategory(finding.title_ar);
  if (titleCategory) return titleCategory;

  const pass = String((finding as { detection_pass?: string }).detection_pass ?? "").trim().toLowerCase();
  if (pass === "glossary") return "other";
  if (pass === "sexual_content") return "sexual_implicit";
  if (pass === "drugs_alcohol") return "drugs";
  if (pass === "discrimination_incitement") return "society";
  if (pass === "women") return "women";
  if (pass === "national_security") return "national_security";
  if (pass === "extremism_banned_groups") return "national_security";
  if (pass === "misinformation") return "historical";
  if (pass === "international_relations") return "society";

  return "other";
}

function priorityIndex(category: AuditorV3Category): number {
  const idx = PRIORITY_ORDER.indexOf(category);
  return idx >= 0 ? idx : PRIORITY_ORDER.length - 1;
}

function normalizeCategoryTitle(category: AuditorV3Category, finding: HybridFindingLike): string {
  const cfg = CATEGORY_MAP.get(category);
  if (!cfg) return normalizeText(finding.title_ar) || "مخالفة محتوى";
  if (category === "other" && String((finding as { detection_pass?: string }).detection_pass ?? "").trim().toLowerCase() === "glossary") {
    return normalizeText(finding.title_ar) || cfg.titleAr;
  }
  return cfg.titleAr;
}

function validateFinding(finding: HybridFindingLike, fullText: string | null): {
  keep: boolean;
  reason: string;
  category: AuditorV3Category;
} {
  const category = resolveCategory(finding);
  const evidence = finding.evidence_snippet ?? "";

  if (!isExactMatch(fullText, evidence)) {
    return { keep: false, reason: "exact_match_failed", category };
  }

  if (String((finding as { detection_pass?: string }).detection_pass ?? "").trim().toLowerCase() !== "glossary") {
    if (!isSpecificSignalPresent(category, evidence)) {
      return { keep: false, reason: "category_sanity_failed", category };
    }
    if (!passesMinimumSignal(category, evidence)) {
      return { keep: false, reason: "minimum_signal_failed", category };
    }
  } else if (tokenCount(evidence) < 1) {
    return { keep: false, reason: "minimum_signal_failed", category };
  }

  if (!isGroundedRationale(category, evidence, finding.rationale_ar)) {
    return { keep: false, reason: "grounding_failed", category };
  }

  return { keep: true, reason: "ok", category };
}

function dedupeByEvidence(findings: Array<HybridFindingLike & { __v3Category?: AuditorV3Category }>): HybridFindingLike[] {
  const byEvidence = new Map<string, Array<HybridFindingLike & { __v3Category?: AuditorV3Category }>>();
  for (const finding of findings) {
    const key = normalizeText(finding.evidence_snippet).toLowerCase();
    if (!key) continue;
    if (!byEvidence.has(key)) byEvidence.set(key, []);
    byEvidence.get(key)!.push(finding);
  }

  const selected: HybridFindingLike[] = [];
  for (const group of byEvidence.values()) {
    group.sort((a, b) => {
      const pa = priorityIndex((a.__v3Category ?? "other"));
      const pb = priorityIndex((b.__v3Category ?? "other"));
      if (pa !== pb) return pa - pb;
      if ((b.confidence ?? 0) !== (a.confidence ?? 0)) return (b.confidence ?? 0) - (a.confidence ?? 0);
      const al = (a.rationale_ar ?? "").trim().length;
      const bl = (b.rationale_ar ?? "").trim().length;
      if (bl !== al) return bl - al;
      return (a.title_ar ?? "").localeCompare(b.title_ar ?? "", "ar");
    });
    const winner = group[0];
    if (winner) selected.push(winner);
  }

  selected.sort((a, b) => priorityIndex((a as { __v3Category?: AuditorV3Category }).__v3Category ?? "other") - priorityIndex((b as { __v3Category?: AuditorV3Category }).__v3Category ?? "other"));
  return selected;
}

export function runAuditorV3Gate(args: {
  findings: HybridFindingLike[];
  fullText: string | null;
}): AuditorV3Result {
  const accepted: Array<HybridFindingLike & { __v3Category?: AuditorV3Category }> = [];
  const byCategory: Record<string, number> = {};
  let exactMatchRejected = 0;
  let groundingRejected = 0;
  let sanityRejected = 0;
  let signalRejected = 0;

  for (const finding of args.findings) {
    const verdict = validateFinding(finding, args.fullText);
    if (!verdict.keep) {
      if (verdict.reason === "exact_match_failed") exactMatchRejected++;
      else if (verdict.reason === "grounding_failed") groundingRejected++;
      else if (verdict.reason === "category_sanity_failed") sanityRejected++;
      else if (verdict.reason === "minimum_signal_failed") signalRejected++;
      continue;
    }

    const normalizedTitle = normalizeCategoryTitle(verdict.category, finding);
    const nextFinding = {
      ...finding,
      title_ar: normalizedTitle,
      __v3Category: verdict.category,
    };
    accepted.push(nextFinding);
    byCategory[verdict.category] = (byCategory[verdict.category] ?? 0) + 1;
  }

  const deduped = dedupeByEvidence(accepted);
  const rejectedCount = args.findings.length - deduped.length;
  const conflictRejected = Math.max(0, accepted.length - deduped.length);

  return {
    findings: deduped.map((finding) => {
      const clone = { ...finding };
      delete (clone as { __v3Category?: AuditorV3Category }).__v3Category;
      return clone;
    }),
    metrics: {
      inputCount: args.findings.length,
      keptCount: deduped.length,
      rejectedCount,
      exactMatchRejected,
      groundingRejected,
      sanityRejected,
      signalRejected,
      conflictRejected,
      byCategory,
    },
  };
}
