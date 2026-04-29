export type ViolationTypeId =
  | "religious_fundamentals"
  | "political_leadership"
  | "national_security"
  | "historical_unreliable"
  | "society_identity"
  | "children_crime"
  | "drugs_alcohol"
  | "child_disability_harm"
  | "inappropriate_sexual_content"
  | "explicit_sexual_scenes"
  | "profanity"
  | "women_abuse"
  | "family_values"
  | "parents_abuse"
  | "elderly_abuse"
  | "bullying"
  | "other";

export const VIOLATION_TYPES: Array<{
  id: ViolationTypeId;
  titleAr: string;
  titleEn: string;
  order: number;
  aliases: string[];
}> = [
  {
    id: "religious_fundamentals",
    titleAr: "المساس بالثوابت الدينية",
    titleEn: "Religious fundamentals",
    order: 1,
    aliases: ["الثوابت الدينية", "المساس بالثوابت", "الدين"],
  },
  {
    id: "political_leadership",
    titleAr: "المساس بالقيادة السياسية",
    titleEn: "Political leadership",
    order: 2,
    aliases: ["القيادة السياسية", "الرموز الوطنية", "القيادة"],
  },
  {
    id: "national_security",
    titleAr: "الإضرار بالأمن الوطني",
    titleEn: "National security",
    order: 3,
    aliases: ["الأمن الوطني", "الأمن", "النظام العام"],
  },
  {
    id: "historical_unreliable",
    titleAr: "المحتوى التاريخي غير الموثوق",
    titleEn: "Unreliable historical content",
    order: 4,
    aliases: ["التاريخ غير الموثوق", "المحتوى التاريخي", "الروايات التاريخية"],
  },
  {
    id: "society_identity",
    titleAr: "الإساءة للمجتمع أو الهوية الوطنية",
    titleEn: "Society / national identity abuse",
    order: 5,
    aliases: ["المجتمع أو الهوية الوطنية", "الهوية الوطنية", "المجتمع السعودي"],
  },
  {
    id: "children_crime",
    titleAr: "محتوى الجرائم الموجه للأطفال",
    titleEn: "Child-targeted crime content",
    order: 6,
    aliases: ["الجرائم الموجه للأطفال", "الأطفال والجرائم", "جرائم الأطفال"],
  },
  {
    id: "drugs_alcohol",
    titleAr: "الترويج للمخدرات والمسكرات",
    titleEn: "Drugs & alcohol promotion",
    order: 7,
    aliases: ["المخدرات والمسكرات", "المخدرات والكحول", "المسكرات"],
  },
  {
    id: "child_disability_harm",
    titleAr: "إيذاء الطفل وذوي الإعاقة",
    titleEn: "Harm to children & persons with disabilities",
    order: 8,
    aliases: ["إيذاء الطفل", "ذوي الإعاقة", "الطفل والإعاقة", "الأطفال وذوي الإعاقة"],
  },
  {
    id: "inappropriate_sexual_content",
    titleAr: "المحتوى الجنسي غير المناسب",
    titleEn: "Inappropriate sexual content",
    order: 9,
    aliases: ["الجنسي غير المناسب", "المحتوى الجنسي", "إيحاءات جنسية"],
  },
  {
    id: "explicit_sexual_scenes",
    titleAr: "المشاهد الجنسية الصريحة",
    titleEn: "Explicit sexual scenes",
    order: 10,
    aliases: ["المشاهد الجنسية", "الجنسية الصريحة", "مشاهد جنسية صريحة"],
  },
  {
    id: "profanity",
    titleAr: "الألفاظ النابية",
    titleEn: "Profanity",
    order: 11,
    aliases: ["الألفاظ", "الشتائم", "النابية"],
  },
  {
    id: "women_abuse",
    titleAr: "الإساءة إلى المرأة أو تعنيفها",
    titleEn: "Abuse / violence toward women",
    order: 12,
    aliases: ["المرأة أو تعنيفها", "تعنيف المرأة", "الإساءة للمرأة", "المرأة"],
  },
  {
    id: "family_values",
    titleAr: "تقويض قيم الأسرة",
    titleEn: "Family values erosion",
    order: 13,
    aliases: ["قيم الأسرة", "الأسرة", "تفكيك الأسرة"],
  },
  {
    id: "parents_abuse",
    titleAr: "الإساءة إلى الوالدين",
    titleEn: "Abuse toward parents",
    order: 14,
    aliases: ["الوالدين", "الأب والأم", "العقوق"],
  },
  {
    id: "elderly_abuse",
    titleAr: "الإساءة إلى كبار السن",
    titleEn: "Abuse toward the elderly",
    order: 15,
    aliases: ["كبار السن", "المسنين", "الشيخوخة"],
  },
  {
    id: "bullying",
    titleAr: "التنمر الجارح والسخرية",
    titleEn: "Bullying & harmful mockery",
    order: 16,
    aliases: ["التنمر", "السخرية الجارحة", "harmful mockery", "mockery"],
  },
  {
    id: "other",
    titleAr: "أخرى",
    titleEn: "Other",
    order: 99,
    aliases: [],
  },
];

const ARABIC_DIACRITICS_RE = /[\u064B-\u065F\u0670\u0640]/g;

export function normalizeViolationText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKC")
    .replace(ARABIC_DIACRITICS_RE, "")
    .replace(/[(){}\[\]"'`~!?؛،,.:؛\-_/\\|•·]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function resolveViolationTypeId(value: string | null | undefined): ViolationTypeId | null {
  const text = normalizeViolationText(value);
  if (!text) return null;

  const exact = VIOLATION_TYPES.find((item) => normalizeViolationText(item.titleAr) === text);
  if (exact) return exact.id;

  for (const item of VIOLATION_TYPES) {
    if (item.aliases.some((alias) => text.includes(normalizeViolationText(alias)))) {
      return item.id;
    }
  }
  return null;
}

export function violationTypeLabel(id: ViolationTypeId, lang: "ar" | "en"): string {
  const entry = VIOLATION_TYPES.find((item) => item.id === id);
  if (!entry) return id;
  return lang === "ar" ? entry.titleAr : entry.titleEn;
}

export function violationTypesForChecklist(): typeof VIOLATION_TYPES {
  return [...VIOLATION_TYPES].sort((a, b) => a.order - b.order);
}

export function getLegacyPolicyArticleIdForViolationTypeId(id: ViolationTypeId): number {
  switch (id) {
    case "religious_fundamentals":
      return 4;
    case "political_leadership":
      return 13;
    case "national_security":
      return 12;
    case "historical_unreliable":
      return 16;
    case "society_identity":
      return 8;
    case "children_crime":
      return 6;
    case "drugs_alcohol":
      return 10;
    case "child_disability_harm":
      return 6;
    case "inappropriate_sexual_content":
      return 9;
    case "explicit_sexual_scenes":
      return 9;
    case "profanity":
      return 5;
    case "women_abuse":
      return 7;
    case "family_values":
      return 17;
    case "parents_abuse":
      return 17;
    case "elderly_abuse":
      return 17;
    case "bullying":
      return 17;
    case "other":
    default:
      return 4;
  }
}
