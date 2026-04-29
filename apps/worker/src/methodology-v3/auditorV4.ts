import { containsAnyNormalized, isDetectionVerbatim, normalizeDetectionText } from "../textDetectionNormalize.js";
import type { HybridFindingLike } from "./contextArbiter.js";

export type AuditorV4Category =
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

type CategoryRule = {
  titleAr: string;
  priority: number;
  minTokens: number;
  signals: string[];
  phrases: string[];
  negatives: string[];
  score: (evidence: string) => number;
};

export type AuditorV4Result = {
  findings: HybridFindingLike[];
  metrics: {
    inputCount: number;
    keptCount: number;
    rejectedCount: number;
    exactMatchRejected: number;
    categoryRejected: number;
    groundingRejected: number;
    signalRejected: number;
    conflictRejected: number;
    byCategory: Record<string, number>;
  };
};

const PRIORITY_ORDER: AuditorV4Category[] = [
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

const CATEGORY_RULES: Record<AuditorV4Category, CategoryRule> = {
  sexual_explicit: {
    titleAr: "المشاهد الجنسية الصريحة",
    priority: 1,
    minTokens: 1,
    signals: ["جنس", "جماع", "مضاجعة", "ممارسة", "عري", "عاري", "مكشوف", "ثدي", "قضيب", "مهبل", "فرج", "زنا"],
    phrases: ["ممارسة جنسية", "علاقة جنسية", "ينام معها", "عري كامل"],
    negatives: ["ضرب", "دفع", "قتل", "رمي", "ركل", "صفع"],
    score: (evidence) => {
      if (!containsAnyNormalized(evidence, ["جنس", "جماع", "مضاجعة", "ممارسة", "عري", "عاري", "مكشوف", "ثدي", "قضيب", "مهبل", "فرج", "زنا"])) return 0;
      return 3;
    },
  },
  sexual_implicit: {
    titleAr: "المحتوى الجنسي غير المناسب",
    priority: 2,
    minTokens: 2,
    signals: ["غزل", "إيحاء", "إيحائي", "شهوة", "إغراء", "قبلات", "حضن", "عناق", "يلمس", "يلامس", "ينام", "علاقة", "جسد"],
    phrases: ["ينام معها", "نظرة شهوانية", "إيحاء جنسي"],
    negatives: ["ضرب", "دفع", "قتل", "رعب", "دم", "جريمة"],
    score: (evidence) => {
      if (containsAnyNormalized(evidence, ["جنس", "جماع", "مضاجعة", "ممارسة", "عري", "عاري", "مكشوف", "ثدي", "قضيب", "مهبل", "فرج", "زنا"])) return 0;
      if (!containsAnyNormalized(evidence, ["غزل", "إيحاء", "إيحائي", "شهوة", "إغراء", "قبلات", "حضن", "عناق", "يلمس", "يلامس", "ينام", "علاقة", "جسد"])) return 0;
      return 2;
    },
  },
  drugs: {
    titleAr: "الترويج للمخدرات والمسكرات",
    priority: 3,
    minTokens: 1,
    signals: ["مخدر", "مخدرات", "حشيش", "خمر", "كحول", "سكران", "سكر", "تعاطي", "مدمن", "تدخين", "سيجارة"],
    phrases: ["يشرب خمر", "يشرب كحول", "يدخن سيجارة", "يتعاطى مخدرات"],
    negatives: [],
    score: (evidence) => (containsAnyNormalized(evidence, ["مخدر", "مخدرات", "حشيش", "خمر", "كحول", "سكران", "سكر", "تعاطي", "مدمن", "تدخين", "سيجارة"]) ? 3 : 0),
  },
  national_security: {
    titleAr: "الإضرار بالأمن الوطني",
    priority: 4,
    minTokens: 2,
    signals: ["أمن", "استقرار", "فوضى", "تمرد", "عصيان", "تخريب", "تفجير", "قنبلة", "هجوم", "شغب", "إرهاب", "حرق", "نسف", "خطف"],
    phrases: ["إسقاط النظام", "اخرجوا وخربوا", "دعوة للفوضى", "تهديد الأمن"],
    negatives: ["غضب", "انفعال", "خلاف", "زعل"],
    score: (evidence) => {
      const hit = containsAnyNormalized(evidence, ["أمن", "استقرار", "فوضى", "تمرد", "عصيان", "تخريب", "تفجير", "قنبلة", "هجوم", "شغب", "إرهاب", "حرق", "نسف", "خطف"]) || containsAnyNormalized(evidence, ["إسقاط النظام", "اخرجوا وخربوا", "دعوة للفوضى", "تهديد الأمن"]);
      return hit ? 3 : 0;
    },
  },
  political: {
    titleAr: "المساس بالقيادة السياسية",
    priority: 5,
    minTokens: 2,
    signals: ["الملك", "ولي", "العهد", "القيادة", "القائد", "الحاكم", "الحكم", "السلطة", "الانقلاب", "الإسقاط", "تمرد", "عصيان"],
    phrases: ["ولي العهد", "إسقاط الحكم", "إسقاط القيادة", "دعوة ضد القيادة", "إسقاط النظام"],
    negatives: ["الجهات الرسمية", "الموظفين", "المؤسسات", "الحكومة"],
    score: (evidence) => {
      if (!containsAnyNormalized(evidence, ["الملك", "ولي العهد", "القيادة", "الحاكم", "الحكم", "السلطة", "انقلاب", "تمرد", "عصيان", "إسقاط الحكم", "إسقاط القيادة"])) return 0;
      return 3;
    },
  },
  religion: {
    titleAr: "المساس بالثوابت الدينية",
    priority: 6,
    minTokens: 2,
    signals: ["الدين", "الإسلام", "مسلم", "مسلمين", "قرآن", "سنة", "صلاة", "أذان", "صيام", "حج", "رمضان", "الله", "النبي", "رسول", "شريعة", "مسجد", "عبادة"],
    phrases: ["استهزاء بالدين", "الصلاة مضيعة", "الأذان مزعج", "هذا الدين", "القرآن", "السنة"],
    negatives: ["حرامية", "فاشل", "غبي", "كذاب", "يا كلب", "يا حمار"],
    score: (evidence) => {
      if (!containsAnyNormalized(evidence, ["الدين", "الإسلام", "مسلم", "مسلمين", "قرآن", "سنة", "صلاة", "أذان", "صيام", "حج", "رمضان", "الله", "النبي", "رسول", "شريعة", "مسجد", "عبادة"])) return 0;
      if (containsAnyNormalized(evidence, ["يلعن", "لعنة"]) && !containsAnyNormalized(evidence, ["الدين", "الإسلام", "مسلم", "قرآن", "سنة", "صلاة", "أذان", "الله", "النبي", "رسول"])) return 0;
      return 3;
    },
  },
  historical: {
    titleAr: "المحتوى التاريخي غير الموثوق",
    priority: 7,
    minTokens: 3,
    signals: ["تاريخ", "تاريخي", "هجرية", "ميلادية", "عهد", "قرن", "التاريخ", "ماض", "الماضي", "رواية", "حدث"],
    phrases: ["في عام", "التاريخ يقول", "حدث تاريخي", "الرواية التاريخية", "سنة هجرية", "سنة ميلادية"],
    negatives: ["الاقتصاد", "الجهات الرسمية", "فاشل", "حرامية", "يا", "أنت"],
    score: (evidence) => {
      const hasHistorySignal = containsAnyNormalized(evidence, ["تاريخ", "تاريخي", "هجرية", "ميلادية", "عهد", "قرن", "التاريخ", "ماض", "الماضي", "رواية", "حدث"]) || containsAnyNormalized(evidence, ["في عام", "التاريخ يقول", "حدث تاريخي", "الرواية التاريخية", "سنة هجرية", "سنة ميلادية"]);
      if (!hasHistorySignal) return 0;
      return 3;
    },
  },
  society: {
    titleAr: "الإساءة للمجتمع أو الهوية الوطنية",
    priority: 8,
    minTokens: 3,
    signals: ["السعوديين", "السعودي", "السعودية", "الشعب", "المجتمع", "القبيلة", "القبائل", "العائلة", "العوائل", "الجهات الرسمية", "الموظفين", "الحكومة", "المؤسسات"],
    phrases: ["كلهم", "جميع", "دائمًا", "دائماً", "القبيلة كلها", "الناس كلها", "الجهات الرسمية"],
    negatives: ["أبوك", "أمك", "المطبخ", "يا", "أنت"],
    score: (evidence) => {
      if (!containsAnyNormalized(evidence, ["السعوديين", "السعودي", "السعودية", "الشعب", "المجتمع", "القبيلة", "القبائل", "العائلة", "العوائل", "الجهات الرسمية", "الموظفين", "الحكومة", "المؤسسات"])) return 0;
      if (!containsAnyNormalized(evidence, ["كلهم", "جميع", "دائمًا", "دائماً", "القبيلة كلها", "الناس كلها", "حرامية", "كسالى", "نصابين", "مجرمين", "فاسدين"])) return 0;
      return 3;
    },
  },
  children: {
    titleAr: "محتوى الجرائم الموجه للأطفال",
    priority: 9,
    minTokens: 2,
    signals: ["طفل", "أطفال", "طفلة", "أولاد", "ولد", "بنت", "طلاب", "طالب", "تلميذ", "قاصر", "قاصرين"],
    phrases: ["طفل يسرق", "طفل يدخن", "تعاطي أمام الأطفال", "استغلال الأطفال"],
    negatives: [],
    score: (evidence) => {
      const hasChild = containsAnyNormalized(evidence, ["طفل", "أطفال", "طفلة", "أولاد", "ولد", "بنت", "طلاب", "طالب", "تلميذ", "قاصر", "قاصرين"]);
      if (!hasChild) return 0;
      if (!containsAnyNormalized(evidence, ["سرق", "يضحك", "يدخن", "تعاطي", "جرم", "جريمة", "عنف", "تنمر", "إهانة", "ضرب", "إيذاء"])) return 0;
      return 2;
    },
  },
  disability: {
    titleAr: "إيذاء الطفل وذوي الإعاقة",
    priority: 10,
    minTokens: 2,
    signals: ["إعاقة", "معاق", "معاقة", "أعمى", "أصم", "بكم", "مقعد", "ذوي الإعاقة"],
    phrases: ["ذوي الإعاقة", "أعمى", "أصم", "بكم", "معاق", "معاقة"],
    negatives: [],
    score: (evidence) => {
      if (!containsAnyNormalized(evidence, ["إعاقة", "معاق", "معاقة", "أعمى", "أصم", "بكم", "مقعد", "ذوي الإعاقة"])) return 0;
      if (!containsAnyNormalized(evidence, ["إهانة", "سخرية", "ضرب", "إيذاء", "احتقار", "تنمر"])) return 0;
      return 3;
    },
  },
  women: {
    titleAr: "الإساءة إلى المرأة أو تعنيفها",
    priority: 11,
    minTokens: 2,
    signals: ["امرأة", "المرأة", "نساء", "زوجة", "بنت", "بنات", "أنثى", "نسائية"],
    phrases: ["مكانها المطبخ", "مكان المرأة", "المرأة ما تفهم", "المرأة أقل", "أقل من الرجل"],
    negatives: ["أبو", "أم", "المجتمع", "الدين"],
    score: (evidence) => {
      if (!containsAnyNormalized(evidence, ["امرأة", "المرأة", "نساء", "زوجة", "بنت", "بنات", "أنثى", "نسائية"])) return 0;
      if (!containsAnyNormalized(evidence, ["مكانها المطبخ", "مكان المرأة", "المرأة ما تفهم", "المرأة أقل", "أقل من الرجل", "تعنيف", "إهانة", "تحقير", "ضرب", "إيذاء"])) return 0;
      return 3;
    },
  },
  parents: {
    titleAr: "الإساءة إلى الوالدين",
    priority: 12,
    minTokens: 2,
    signals: ["أب", "أم", "أبوك", "أمك", "والد", "والدة", "والدين", "أبوي", "أمي"],
    phrases: ["أبوك غبي", "أمك", "الوالدين", "أبوي", "أمي"],
    negatives: ["أهل", "العائلة", "الزواج"],
    score: (evidence) => {
      if (!containsAnyNormalized(evidence, ["أب", "أم", "أبوك", "أمك", "والد", "والدة", "والدين", "أبوي", "أمي"])) return 0;
      if (!containsAnyNormalized(evidence, ["إهانة", "تحقير", "سب", "ضرب", "عقوق", "غبي", "فاشل", "حقير", "وسخ", "قذر"])) return 0;
      return 3;
    },
  },
  elderly: {
    titleAr: "الإساءة إلى كبار السن",
    priority: 13,
    minTokens: 2,
    signals: ["عجوز", "مسن", "مسنة", "كبير السن", "كبار السن", "شيخ", "جدة", "جد"],
    phrases: ["كبار السن", "العجوز", "مسن", "مسنة"],
    negatives: [],
    score: (evidence) => {
      if (!containsAnyNormalized(evidence, ["عجوز", "مسن", "مسنة", "كبير السن", "كبار السن", "شيخ", "جدة", "جد"])) return 0;
      if (!containsAnyNormalized(evidence, ["إهانة", "تحقير", "سخرية", "ضرب", "إيذاء", "غبي", "فاشل", "حقير"])) return 0;
      return 3;
    },
  },
  family: {
    titleAr: "تقويض قيم الأسرة",
    priority: 14,
    minTokens: 2,
    signals: ["أسرة", "عائلة", "أهل", "أهلك", "الزواج", "زوج", "زوجة", "البيت"],
    phrases: ["اقطع علاقتك بأهلك", "اترك أهلك", "العائلة ما لها قيمة", "الزواج مضيعة وقت", "بدونهم", "استغني عن الأسرة"],
    negatives: ["غبي", "فاشل", "يا", "اسكتي", "إهانة"],
    score: (evidence) => {
      const hasFamilyTerm = containsAnyNormalized(evidence, ["أسرة", "عائلة", "أهل", "أهلك", "الزواج", "زوج", "زوجة", "البيت"]);
      const hasBreakPhrase = containsAnyNormalized(evidence, ["اقطع علاقتك بأهلك", "اترك أهلك", "العائلة ما لها قيمة", "الزواج مضيعة وقت", "بدونهم", "استغني عن الأسرة"]);
      if (!hasFamilyTerm || !hasBreakPhrase) return 0;
      return 3;
    },
  },
  bullying: {
    titleAr: "التنمر الجارح والسخرية",
    priority: 16,
    minTokens: 2,
    signals: ["غبي", "أحمق", "فاشل", "ما تسوى", "لا أحد يبيك", "مقرف", "سخيف", "حقير", "وضيع", "جبان", "تافه", "عديم التربية", "اسكت", "اسكتي"],
    phrases: ["ما تسوى شيء", "لا أحد يبيك", "عديم التربية", "أنت غبي", "يا فاشل"],
    negatives: ["أب", "أم", "المرأة", "كبار السن", "المجتمع", "العائلة", "أهلك", "زوجة"],
    score: (evidence) => {
      if (containsAnyNormalized(evidence, ["أب", "أم", "أبوك", "أمك", "امرأة", "المرأة", "عجوز", "مسن", "مسنة", "السعوديين", "المجتمع", "القبيلة", "العائلة", "أهلك"])) return 0;
      if (!containsAnyNormalized(evidence, ["غبي", "أحمق", "فاشل", "ما تسوى", "لا أحد يبيك", "مقرف", "سخيف", "حقير", "وضيع", "جبان", "تافه", "عديم التربية", "اسكت", "اسكتي"])) return 0;
      return 2;
    },
  },
  profanity: {
    titleAr: "الألفاظ النابية",
    priority: 15,
    minTokens: 1,
    signals: ["يلعن", "لعنة", "تبا", "تبًا", "تباً", "خرا", "وسخ", "قذر", "ساقط", "نذل", "خسيس", "لئيم"],
    phrases: ["يا حمار", "يا كلب", "يا خرا", "يلعن", "تبًا", "تبا"],
    negatives: ["أب", "أم", "المرأة", "العجوز", "المجتمع", "القيادة", "الدين", "الصلاة", "الأذان", "القرآن", "السنة"],
    score: (evidence) => {
      if (!containsAnyNormalized(evidence, ["يلعن", "لعنة", "تبا", "تبًا", "تباً", "خرا", "وسخ", "قذر", "حقير", "وضيع", "نذل", "خسيس", "لئيم", "جبان", "ساقط", "يا حمار", "يا كلب", "يا خرا"])) return 0;
      if (containsAnyNormalized(evidence, ["الدين", "الإسلام", "الصلاة", "الأذان", "القرآن", "السنة"]) && !containsAnyNormalized(evidence, ["يلعن", "لعنة", "تبًا", "تبا"])) return 0;
      return 3;
    },
  },
  other: {
    titleAr: "أخرى",
    priority: 17,
    minTokens: 2,
    signals: ["فساد", "رشوة", "ابتزاز", "احتيال", "خيانة", "سرقة", "تسريب", "تحريض", "تهديد", "كذب", "كاذب", "فضيحة", "انتهاك", "مخالفة"],
    phrases: ["فساد", "رشوة", "ابتزاز", "احتيال", "خيانة", "سرقة", "تسريب", "فضيحة"],
    negatives: [],
    score: (evidence) => {
      if (!containsAnyNormalized(evidence, ["فساد", "رشوة", "ابتزاز", "احتيال", "خيانة", "سرقة", "تسريب", "تحريض", "تهديد", "كذب", "كاذب", "فضيحة", "انتهاك", "مخالفة"])) return 0;
      return 1;
    },
  },
};

const CATEGORY_ORDER = [...PRIORITY_ORDER];

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim().normalize("NFC");
}

function tokenCount(value: string | null | undefined): number {
  return normalizeText(value)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean).length;
}

const GROUNDING_STOPWORDS = new Set([
  "في",
  "من",
  "على",
  "إلى",
  "الى",
  "عن",
  "هذا",
  "هذه",
  "ذلك",
  "تلك",
  "هناك",
  "هنا",
  "ثم",
  "كما",
  "لكن",
  "بل",
  "قد",
  "لا",
  "لم",
  "لن",
  "ما",
  "ماذا",
  "متى",
  "كيف",
  "أو",
  "و",
  "أن",
  "إن",
  "إنه",
  "أنها",
  "انه",
  "انها",
  "هو",
  "هي",
  "هم",
  "هن",
  "أنا",
  "انت",
  "أنت",
  "انتي",
  "أنتي",
  "نص",
  "المقتطف",
  "العبارة",
  "السياق",
  "المشهد",
  "الفصل",
  "صفحة",
  "تحليل",
  "آلي",
  "ملاحظة",
  "تفسيرية",
  "يظهر",
  "تظهر",
  "يتضمن",
  "تتضمن",
  "يحتوي",
  "تحتوي",
  "ورد",
  "يرد",
  "ضمن",
  "مباشر",
  "مباشرة",
  "واضح",
  "وضوح",
  "مخالفة",
  "مؤشر",
  "قرار",
  "أحد",
  "أخرى",
  "أخرى",
]);

const GENERIC_SNIPPET_FRAGMENTS = [
  "يقاطع",
  "ينظر",
  "ينظرون",
  "يهمس",
  "يتنهد",
  "يبتسم",
  "يضحك",
  "يصرخ",
  "يسكت",
  "يسكتون",
  "شوف",
  "شاهد",
  "متحمس",
  "منخفض",
  "بصوت منخفض",
  "بصوت عال",
  "أمام الطلاب",
  "الآن أنت آمن",
];

function normalizeTokens(value: string): string[] {
  return normalizeDetectionText(value, { stripPunctuation: true })
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function lockTokens(value: string): string[] {
  return (value ?? "")
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);
}

function meaningfulTokens(value: string): string[] {
  return normalizeTokens(value).filter((token) => token.length >= 3 && !GROUNDING_STOPWORDS.has(token));
}

function containsAllNormalized(text: string, needles: string[]): boolean {
  return needles.every((needle) => containsAnyNormalized(text, [needle]));
}

function isWeakSnippet(text: string): boolean {
  const meaningful = meaningfulTokens(text);
  if (meaningful.length === 0) return true;
  if (meaningful.length === 1 && meaningful[0].length <= 4) return true;
  if (GENERIC_SNIPPET_FRAGMENTS.some((fragment) => containsAnyNormalized(text, [fragment]))) return true;
  return false;
}

function categoryHasSignature(category: AuditorV4Category, evidence: string): boolean {
  const text = normalizeText(evidence);
  if (!text) return false;

  switch (category) {
    case "sexual_explicit":
      return (
        containsAnyNormalized(text, ["جنس", "جماع", "مضاجعة", "ممارسة", "عري", "عاري", "مكشوف", "ثدي", "قضيب", "مهبل", "فرج", "زنا"]) &&
        !containsAnyNormalized(text, ["ضرب", "دفع", "قتل", "ركل", "صفع", "تهديد", "عنف"])
      );
    case "sexual_implicit":
      return (
        !containsAnyNormalized(text, ["جنس", "جماع", "مضاجعة", "ممارسة", "عري", "عاري", "مكشوف", "ثدي", "قضيب", "مهبل", "فرج", "زنا"]) &&
        containsAnyNormalized(text, ["غزل", "إيحاء", "إيحائي", "شهوة", "إغراء", "قبلات", "حضن", "عناق", "يلمس", "يلامس", "ينام", "علاقة", "جسد", "شهوانية"])
      );
    case "drugs":
      return containsAnyNormalized(text, ["مخدر", "مخدرات", "حشيش", "خمر", "كحول", "سكران", "سكر", "تعاطي", "مدمن", "تدخين", "سيجارة"]);
    case "national_security":
      return containsAnyNormalized(text, ["أمن", "استقرار", "فوضى", "تمرد", "عصيان", "تخريب", "تفجير", "قنبلة", "هجوم", "شغب", "إرهاب", "حرق", "نسف", "خطف", "إسقاط النظام", "اخرجوا وخربوا", "دعوة للفوضى", "تهديد الأمن"]);
    case "political":
      return containsAnyNormalized(text, ["الملك", "ولي العهد", "القيادة", "القائد", "الحاكم", "الحكم", "السلطة", "الانقلاب", "تمرد", "عصيان", "إسقاط الحكم", "إسقاط القيادة", "إسقاط النظام"]);
    case "religion":
      return (
        containsAnyNormalized(text, ["الدين", "الإسلام", "مسلم", "مسلمين", "قرآن", "سنة", "صلاة", "أذان", "صيام", "حج", "رمضان", "الله", "النبي", "رسول", "شريعة", "مسجد", "عبادة"]) &&
        containsAnyNormalized(text, ["استهزاء", "سخرية", "يشكك", "تشكيك", "يهين", "يقدح", "تحريف", "تطاول", "يسخر", "يسب", "يستهين", "يستهزئ", "لعن", "يلعن"])
      );
    case "historical":
      return (
        containsAnyNormalized(text, ["تاريخ", "تاريخي", "هجرية", "ميلادية", "عهد", "قرن", "الماضي", "ماض", "حقبة", "رواية تاريخية", "في عام", "سنة"]) &&
        containsAnyNormalized(text, ["غير موثوق", "مضلل", "مزوّر", "مزور", "تحريف", "تزوير", "ادعاء", "رواية", "حدث", "تاريخ"])
      );
    case "society":
      return (
        containsAnyNormalized(text, ["السعوديين", "السعودي", "السعودية", "الشعب", "المجتمع", "القبيلة", "القبائل", "العائلة", "العوائل", "الجهات الرسمية", "الموظفين", "الحكومة", "المؤسسات"]) &&
        containsAnyNormalized(text, ["كلهم", "جميع", "دائمًا", "دائماً", "الكل", "العامة", "الجهات الرسمية", "حرامية", "كسالى", "نصابين", "مجرمين", "فاسدين", "كذابين", "كاذبين"])
      );
    case "children":
      return (
        containsAnyNormalized(text, ["طفل", "أطفال", "طفلة", "أولاد", "ولد", "بنت", "طلاب", "طالب", "تلميذ", "قاصر", "قاصرين"]) &&
        containsAnyNormalized(text, ["سرق", "يضحك", "يدخن", "تعاطي", "جرم", "جريمة", "عنف", "تنمر", "إهانة", "ضرب", "إيذاء", "استغلال", "تحرش"])
      );
    case "disability":
      return (
        containsAnyNormalized(text, ["إعاقة", "معاق", "معاقة", "أعمى", "أصم", "بكم", "مقعد", "ذوي الإعاقة"]) &&
        containsAnyNormalized(text, ["إهانة", "سخرية", "ضرب", "إيذاء", "احتقار", "تنمر"])
      );
    case "women":
      return (
        containsAnyNormalized(text, ["امرأة", "المرأة", "نساء", "زوجة", "بنت", "بنات", "أنثى", "نسائية"]) &&
        containsAnyNormalized(text, ["مكانها المطبخ", "مكان المرأة", "المرأة ما تفهم", "المرأة أقل", "أقل من الرجل", "تعنيف", "إهانة", "تحقير", "ضرب", "إيذاء", "احتقار"])
      );
    case "parents":
      return (
        containsAnyNormalized(text, ["أب", "أم", "أبوك", "أمك", "والد", "والدة", "والدين", "أبوي", "أمي"]) &&
        containsAnyNormalized(text, ["إهانة", "تحقير", "سب", "ضرب", "عقوق", "غبي", "فاشل", "حقير", "وسخ", "قذر"])
      );
    case "elderly":
      return (
        containsAnyNormalized(text, ["عجوز", "مسن", "مسنة", "كبير السن", "كبار السن", "شيخ", "جدة", "جد"]) &&
        containsAnyNormalized(text, ["إهانة", "تحقير", "سخرية", "ضرب", "إيذاء", "غبي", "فاشل", "حقير", "وسخ", "قذر"])
      );
    case "family":
      return (
        containsAnyNormalized(text, ["أسرة", "عائلة", "أهل", "أهلك", "الزواج", "زوج", "زوجة", "البيت"]) &&
        containsAnyNormalized(text, ["اقطع علاقتك بأهلك", "اترك أهلك", "العائلة ما لها قيمة", "الزواج مضيعة وقت", "بدونهم", "استغني عن الأسرة", "تفكك الأسرة", "قطع الرحم"])
      );
    case "bullying":
      return containsAnyNormalized(text, ["غبي", "أحمق", "فاشل", "ما تسوى", "لا أحد يبيك", "مقرف", "سخيف", "حقير", "وضيع", "جبان", "تافه", "عديم التربية", "يا فاشل", "يا غبي", "يا أحمق"]);
    case "profanity":
      return containsAnyNormalized(text, ["يلعن", "لعنة", "تبا", "تبًا", "تباً", "خرا", "وسخ", "قذر", "ساقط", "نذل", "خسيس", "لئيم", "يا حمار", "يا كلب", "يا خرا"]);
    case "other":
      return containsAnyNormalized(text, ["فساد", "رشوة", "ابتزاز", "احتيال", "خيانة", "سرقة", "تسريب", "تحريض", "تهديد", "كذب", "كاذب", "فضيحة", "انتهاك", "مخالفة", "مضلل", "معلومات مغلوطة", "غير دقيقة"]);
    default:
      return false;
  }
}

function titleCategory(title: string | null | undefined): AuditorV4Category | null {
  const text = normalizeText(title);
  if (!text) return null;
  for (const category of CATEGORY_ORDER) {
    if (text.includes(CATEGORY_RULES[category].titleAr)) return category;
  }
  return null;
}

function scoreCategory(category: AuditorV4Category, evidence: string): number {
  const rule = CATEGORY_RULES[category];
  if (!rule) return 0;
  const text = normalizeText(evidence);
  if (!text) return 0;
  if (isWeakSnippet(text) && category !== "profanity" && category !== "bullying") return 0;
  if (tokenCount(text) < rule.minTokens && !(category === "profanity" && tokenCount(text) >= 1)) return 0;
  if (!categoryHasSignature(category, text)) return 0;
  const score = rule.score(text);
  return score > 0 ? score : 0;
}

function bestCategoryForEvidence(evidence: string): { category: AuditorV4Category | null; score: number } {
  let winner: AuditorV4Category | null = null;
  let bestScore = 0;
  let bestPriority = Number.POSITIVE_INFINITY;
  for (const category of CATEGORY_ORDER) {
    const score = scoreCategory(category, evidence);
    if (score <= 0) continue;
    const priority = CATEGORY_RULES[category].priority;
    if (score > bestScore || (score === bestScore && priority < bestPriority)) {
      winner = category;
      bestScore = score;
      bestPriority = priority;
    }
  }
  return { category: winner, score: bestScore };
}

function categoryTitle(category: AuditorV4Category): string {
  return CATEGORY_RULES[category]?.titleAr ?? "مخالفة محتوى";
}

function isGroundedRationale(evidence: string, rationale: string | null | undefined): boolean {
  const text = normalizeText(rationale);
  if (!text) return true;
  if (/\bمادة\s+\d+/u.test(text)) return false;
  const extractedNames = ["فهد", "سامي", "مها", "ناصر", "حسام", "ريم", "دلال"];
  if (containsAnyNormalized(text, extractedNames) && !extractedNames.some((name) => evidence.includes(name))) return false;
  const rationaleTokens = lockTokens(text).filter((token) => token.length >= 3 && !GROUNDING_STOPWORDS.has(token));
  if (rationaleTokens.length === 0) return true;
  if (rationaleTokens.some((token) => !normalizeText(evidence).includes(token))) return false;
  return true;
}

function dedupe(findings: Array<HybridFindingLike & { __v4Category?: AuditorV4Category; __v4Score?: number }>): HybridFindingLike[] {
  const byEvidence = new Map<string, typeof findings>();
  for (const finding of findings) {
    const key = normalizeText(finding.evidence_snippet).toLowerCase();
    if (!key) continue;
    if (!byEvidence.has(key)) byEvidence.set(key, []);
    byEvidence.get(key)!.push(finding);
  }

  const selected: HybridFindingLike[] = [];
  for (const group of byEvidence.values()) {
    group.sort((a, b) => {
      const sa = a.__v4Score ?? 0;
      const sb = b.__v4Score ?? 0;
      if (sb !== sa) return sb - sa;
      const pa = CATEGORY_RULES[a.__v4Category ?? "other"].priority;
      const pb = CATEGORY_RULES[b.__v4Category ?? "other"].priority;
      if (pa !== pb) return pa - pb;
      if ((b.confidence ?? 0) !== (a.confidence ?? 0)) return (b.confidence ?? 0) - (a.confidence ?? 0);
      return (a.title_ar ?? "").localeCompare(b.title_ar ?? "", "ar");
    });
    const winner = group[0];
    if (winner) {
      const copy = { ...winner };
      delete (copy as { __v4Category?: AuditorV4Category }).__v4Category;
      delete (copy as { __v4Score?: number }).__v4Score;
      selected.push(copy);
    }
  }

  selected.sort((a, b) => {
    const pa = CATEGORY_RULES[titleCategory(a.title_ar) ?? "other"].priority;
    const pb = CATEGORY_RULES[titleCategory(b.title_ar) ?? "other"].priority;
    return pa - pb;
  });
  return selected;
}

export function runAuditorV4Gate(args: {
  findings: HybridFindingLike[];
  fullText: string | null;
}): AuditorV4Result {
  const accepted: Array<HybridFindingLike & { __v4Category?: AuditorV4Category; __v4Score?: number }> = [];
  const byCategory: Record<string, number> = {};
  let exactMatchRejected = 0;
  let categoryRejected = 0;
  let groundingRejected = 0;
  let signalRejected = 0;

  for (const finding of args.findings) {
    const evidence = finding.evidence_snippet ?? "";
    if (!isDetectionVerbatim(args.fullText ?? "", evidence)) {
      exactMatchRejected++;
      continue;
    }

    const { category, score } = bestCategoryForEvidence(evidence);
    if (!category) {
      categoryRejected++;
      continue;
    }

    if (!isGroundedRationale(evidence, finding.rationale_ar)) {
      groundingRejected++;
      continue;
    }

    if (score <= 0) {
      signalRejected++;
      continue;
    }

    const nextFinding = {
      ...finding,
      title_ar: categoryTitle(category),
      __v4Category: category,
      __v4Score: score,
    };
    accepted.push(nextFinding);
    byCategory[category] = (byCategory[category] ?? 0) + 1;
  }

  const deduped = dedupe(accepted);
  const conflictRejected = Math.max(0, accepted.length - deduped.length);

  return {
    findings: deduped,
    metrics: {
      inputCount: args.findings.length,
      keptCount: deduped.length,
      rejectedCount: args.findings.length - deduped.length,
      exactMatchRejected,
      categoryRejected,
      groundingRejected,
      signalRejected,
      conflictRejected,
      byCategory,
    },
  };
}
