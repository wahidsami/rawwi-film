/**
 * Legacy/compatibility scaffold.
 *
 * Why this file exists:
 * - Preserves the older V3 subject catalog used by legacy prompt composition.
 * - Keeps historical subject IDs and titles available for compatibility with older entry points.
 *
 * Active V3 reviewer pipeline participation:
 * - Compatibility only. The active reviewer brain now uses the newer structured knowledge layers.
 *
 * Backward compatibility:
 * - Retained intentionally so older subject imports continue to resolve.
 *
 * New functionality:
 * - Do not add new functionality here.
 *
 * Removal guidance:
 * - Safe to remove only after V3 production stabilization and after all callers have migrated away from the legacy subject catalog.
 */
export type V3SubjectModule = {
  id:
    | "v3_01_religious"
    | "v3_02_state"
    | "v3_03_security"
    | "v3_04_history"
    | "v3_05_society"
    | "v3_06_children"
    | "v3_07_drugs"
    | "v3_08_child_safety"
    | "v3_09_sexual"
    | "v3_10_explicit"
    | "v3_11_profanity"
    | "v3_12_other";
  titleAr: string;
  focus: string;
  articleIds: number[];
};

export const V3_SUBJECT_MODULES: V3SubjectModule[] = [
  {
    id: "v3_01_religious",
    titleAr: "المساس بالثوابت الدينية",
    focus: "Placeholder module for faith-related evaluation.",
    articleIds: [4, 16],
  },
  {
    id: "v3_02_state",
    titleAr: "المساس بالقيادة السياسية",
    focus: "Placeholder module for state and leadership evaluation.",
    articleIds: [13, 14],
  },
  {
    id: "v3_03_security",
    titleAr: "الإضرار بالأمن الوطني",
    focus: "Placeholder module for national security evaluation.",
    articleIds: [4, 12, 13, 14, 15],
  },
  {
    id: "v3_04_history",
    titleAr: "المحتوى التاريخي غير الموثوق",
    focus: "Placeholder module for historical reliability evaluation.",
    articleIds: [16],
  },
  {
    id: "v3_05_society",
    titleAr: "الإساءة للمجتمع أو الهوية الوطنية",
    focus: "Placeholder module for group generalization evaluation.",
    articleIds: [4, 8, 12, 17, 18],
  },
  {
    id: "v3_06_children",
    titleAr: "محتوى الجرائم الموجه للأطفال",
    focus: "Placeholder module for child-directed crime framing.",
    articleIds: [6],
  },
  {
    id: "v3_07_drugs",
    titleAr: "الترويج للمخدرات والمسكرات",
    focus: "Placeholder module for substance evaluation.",
    articleIds: [5, 10],
  },
  {
    id: "v3_08_child_safety",
    titleAr: "إيذاء الطفل وذوي الإعاقة",
    focus: "Placeholder module for child safety and disability harm.",
    articleIds: [6, 17],
  },
  {
    id: "v3_09_sexual",
    titleAr: "المحتوى الجنسي غير المناسب",
    focus: "Placeholder module for non-explicit sexual content.",
    articleIds: [5, 9, 23, 24],
  },
  {
    id: "v3_10_explicit",
    titleAr: "المشاهد الجنسية الصريحة",
    focus: "Placeholder module for explicit sexual scenes.",
    articleIds: [9, 23, 24],
  },
  {
    id: "v3_11_profanity",
    titleAr: "الألفاظ النابية",
    focus: "Placeholder module for direct profanity.",
    articleIds: [4, 5, 17],
  },
  {
    id: "v3_12_other",
    titleAr: "أخرى",
    focus: "Placeholder module for any remaining regulated subject.",
    articleIds: [4, 11, 16, 17, 19, 20, 21, 22],
  },
];

export const V3_SUBJECT_MODULE_BY_ID = new Map(V3_SUBJECT_MODULES.map((module) => [module.id, module]));

export function renderV3SubjectCatalog(): string {
  return [
    "Subject Catalog (placeholder):",
    ...V3_SUBJECT_MODULES.map((module) => `- ${module.id}: ${module.titleAr} | ${module.focus}`),
  ].join("\n");
}
