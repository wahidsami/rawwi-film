/**
 * Semantic categories for analysis report checklist & findings grouping (GCAM-aligned).
 * Each PolicyMap atom maps to one primary category; legal refs (article/atom) stay on cards.
 */
import { getPolicyArticles, normalizeAtomId } from "./policyMap";

export type SemanticCategoryId =
  | "violence"
  | "incitement"
  | "extremism"
  | "abuse_language"
  | "hate_discrimination"
  | "sexual_content"
  | "substances"
  | "vulnerable_groups"
  | "misinformation"
  | "privacy_confidentiality"
  | "public_order_security"
  | "international_relations"
  | "economy_business"
  | "appearance_decency"
  | "other";

const ARTICLE_DEFAULT: Record<number, SemanticCategoryId> = {
  1: "other",
  2: "other",
  3: "other",
  4: "public_order_security",
  5: "vulnerable_groups",
  6: "vulnerable_groups",
  7: "hate_discrimination",
  8: "hate_discrimination",
  9: "violence",
  10: "substances",
  11: "misinformation",
  12: "public_order_security",
  13: "public_order_security",
  14: "incitement",
  15: "extremism",
  16: "misinformation",
  17: "privacy_confidentiality",
  18: "international_relations",
  19: "economy_business",
  20: "economy_business",
  21: "privacy_confidentiality",
  22: "international_relations",
  23: "appearance_decency",
  24: "appearance_decency",
  25: "other",
  26: "other",
};

/** Atoms that differ from their article default. */
const OVERRIDES: Partial<Record<string, SemanticCategoryId>> = {
  "4-1": "appearance_decency",
  "4-4": "hate_discrimination",
  "4-6": "vulnerable_groups",
  "4-7": "sexual_content",
  "4-8": "vulnerable_groups",
  "5-1": "violence",
  "5-2": "abuse_language",
  "5-3": "sexual_content",
  "5-4": "substances",
  "5-5": "vulnerable_groups",
  "7-1": "violence",
  "8-1": "incitement",
  "9-2": "extremism",
  "9-4": "sexual_content",
  "11-3": "privacy_confidentiality",
  "11-4": "privacy_confidentiality",
  "12-1": "incitement",
  "12-3": "violence",
};

function buildAtomToCategory(): Record<string, SemanticCategoryId> {
  const m: Record<string, SemanticCategoryId> = {};
  for (const art of getPolicyArticles()) {
    for (const at of art.atoms) {
      const fullId = at.atomId;
      m[fullId] = OVERRIDES[fullId] ?? ARTICLE_DEFAULT[art.articleId] ?? "other";
    }
  }
  return m;
}

const ATOM_TO_CATEGORY = buildAtomToCategory();

export const SEMANTIC_CATEGORIES: Array<{
  id: SemanticCategoryId;
  titleAr: string;
  titleEn: string;
  order: number;
}> = [
  { id: "violence", titleAr: "العنف والأذى الجسدي", titleEn: "Violence & physical harm", order: 1 },
  { id: "incitement", titleAr: "التحريض", titleEn: "Incitement", order: 2 },
  { id: "extremism", titleAr: "التطرف والإرهاب", titleEn: "Extremism & terrorism", order: 3 },
  { id: "abuse_language", titleAr: "الإساءة اللغوية والألفاظ", titleEn: "Abusive language & wording", order: 4 },
  { id: "hate_discrimination", titleAr: "الكراهية والتمييز", titleEn: "Hate & discrimination", order: 5 },
  { id: "sexual_content", titleAr: "المحتوى الجنسي", titleEn: "Sexual content", order: 6 },
  { id: "substances", titleAr: "المخدرات والكحول والتبغ", titleEn: "Substances (drugs, alcohol, tobacco)", order: 7 },
  { id: "vulnerable_groups", titleAr: "الفئات الهشة", titleEn: "Vulnerable groups (e.g. children)", order: 8 },
  { id: "misinformation", titleAr: "التضليل والمعلومات المغلوطة", titleEn: "Misinformation", order: 9 },
  { id: "privacy_confidentiality", titleAr: "الخصوصية والسرية", titleEn: "Privacy & confidentiality", order: 10 },
  { id: "public_order_security", titleAr: "النظام العام والأمن الوطني", titleEn: "Public order & national security", order: 11 },
  { id: "international_relations", titleAr: "العلاقات الدولية", titleEn: "International relations", order: 12 },
  { id: "economy_business", titleAr: "الاقتصاد والأعمال", titleEn: "Economy & business", order: 13 },
  { id: "appearance_decency", titleAr: "المظهر العام والاحتشام", titleEn: "Appearance & decency", order: 14 },
  { id: "other", titleAr: "أخرى", titleEn: "Other", order: 99 },
];

export function getSemanticCategoriesForChecklist(): typeof SEMANTIC_CATEGORIES {
  return [...SEMANTIC_CATEGORIES].sort((a, b) => a.order - b.order);
}

/**
 * Primary semantic category for a finding from policy atom (or article fallback).
 */
export function getPrimarySemanticCategory(
  articleId: number,
  atomId: string | null | undefined,
  primaryPolicyAtomId?: string | null
): SemanticCategoryId {
  const pk = primaryPolicyAtomId?.trim();
  if (pk && /^\d+-\d+$/.test(pk)) {
    if (ATOM_TO_CATEGORY[pk]) return ATOM_TO_CATEGORY[pk];
    const aid = parseInt(pk.split("-")[0], 10);
    return ARTICLE_DEFAULT[aid] ?? "other";
  }
  const norm =
    atomId != null && String(atomId).trim() !== ""
      ? normalizeAtomId(atomId, articleId)
      : "";
  if (norm && /^\d+-\d+$/.test(norm)) {
    if (ATOM_TO_CATEGORY[norm]) return ATOM_TO_CATEGORY[norm];
    const aid = parseInt(norm.split("-")[0], 10);
    return ARTICLE_DEFAULT[aid] ?? "other";
  }
  return ARTICLE_DEFAULT[articleId] ?? "other";
}

export function categoryLabel(id: SemanticCategoryId, lang: "ar" | "en"): string {
  const c = SEMANTIC_CATEGORIES.find((x) => x.id === id);
  if (!c) return id;
  return lang === "ar" ? c.titleAr : c.titleEn;
}
