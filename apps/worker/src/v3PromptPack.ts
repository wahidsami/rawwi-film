import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const DEFAULT_SHARED_OVERLAY = `=== Violations System v3 ===
هذه النسخة مبنية على دليل المخالفات المحدّث، وتُستخدم كطبقة تشغيلية محافظة فوق النظام الحالي.

قواعد ثابتة في v3:
1. title_ar يجب أن يكون عنوان المخالفة فقط، مثل: "المساس بالثوابت الدينية" أو "التنمر الجارح والسخرية".
2. ممنوع تضمين أرقام المواد أو أكواد atoms داخل title_ar.
3. الاحتفاظ article_id / atom_id يكون فقط لربط النظام الخلفي، وليس كعنوان ظاهر.
4. لا تُسقط المخالفة إلا إذا كان المقتطف نفسه يثبتها بشكل مباشر وواضح.
5. استخدم ذاكرة القصة والسياق القريب لتحديد المتحدث أو المستهدف أو العلاقة عندما يكون المقتطف قصيراً.
6. evidence_snippet يجب أن يكون أقصر اقتباس حرفي يثبت المخالفة.
7. لا تعتمد على الشرح العام أو تلخيص الحبكة أو "استنتاج النية" لإنتاج مخالفة.
8. إذا كانت الحالة أقرب إلى مخالفة مختلفة، فلا تفرضها هنا إلا إذا كان النص يثبت ذلك بوضوح.
9. لا تفترض هوية المتحدث أو المستهدف أو العلاقة بين الشخصيات إذا لم تثبتها العبارة أو السياق القريب أو ذاكرة القصة.
10. في rationale_ar، اشرح لماذا العبارة مخالفة من المعنى المباشر أو من السياق القريب فقط، من دون سرد أسماء الشخصيات أو إعادة كتابة الحبكة.
11. إذا كان الدليل ضعيفاً أو غامضاً أو يعتمد على استنتاج، فأعد فارغاً بدل التخمين.
12. أولوية التصنيف المباشر:
   - إذا كان المقتطف عن طفل أو يستهدف طفلاً مباشرة، صنّفه أولاً ضمن مخالفات الطفل (6/8/16 حسب نوع الضرر) وليس ضمن الدين/السياسة/عناوين عامة.
   - إذا كان المقتطف عن المرأة، صنّفه ضمن الإساءة للمرأة، إلا إذا كان الطابع جنسياً صريحاً أو إيحائياً واضحاً فيذهب لمسار جنسي.
   - ذكر الدين وحده لا يكفي. لا تُصنّف "المساس بالثوابت الدينية" إلا عند وجود إساءة/تحقير/تحريض ديني واضح في نفس المقتطف.
   - ذكر الحكومة/الملك/القيادة وحده لا يكفي. لا تُصنّف "المساس بالقيادة" أو "الأمن الوطني" إلا مع عداء/إساءة/تحريض واضح ضدهم.
13. إذا لم يثبت المقتطف موضوع هذا المسار تحديداً، أعد findings فارغة لهذا المسار.`;

function resolveDocRoot(): string {
  const candidates = [
    resolve(process.cwd(), "docs", "V3 prompts"),
    resolve(process.cwd(), "..", "docs", "V3 prompts"),
    resolve(process.cwd(), "..", "..", "docs", "V3 prompts"),
    resolve(process.cwd(), "..", "..", "..", "docs", "V3 prompts"),
    resolve("/app", "docs", "V3 prompts"),
  ];

  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
}

const DOC_ROOT = resolveDocRoot();

const PASS_FILES: Record<string, string[]> = {
  glossary: [],
  insults: ["11_profanity.md", "16_bullying.md"],
  violence: [],
  sexual_content: ["09_inappropriate_sexual_content.md", "10_explicit_sexual_scenes.md"],
  drugs_alcohol: ["07_drugs_alcohol.md"],
  discrimination_incitement: ["05_society_identity.md"],
  women: ["12_women_abuse.md"],
  national_security: ["03_national_security.md"],
  extremism_banned_groups: ["03_national_security.md", "02_political_leadership.md"],
  misinformation: ["04_historical_unreliable.md"],
  international_relations: ["05_society_identity.md"],
};

export type V3SubjectDefinition = {
  name: string;
  titleAr: string;
  fileName: string;
  articleIds: number[];
  model: "gpt-4.1" | "gpt-4.1-mini";
};

export const V3_SUBJECT_DEFINITIONS: V3SubjectDefinition[] = [
  {
    name: "v3_01_religious_fundamentals",
    titleAr: "المساس بالثوابت الدينية",
    fileName: "01_religious_fundamentals.md",
    articleIds: [4, 16],
    model: "gpt-4.1",
  },
  {
    name: "v3_02_political_leadership",
    titleAr: "المساس بالقيادة السياسية",
    fileName: "02_political_leadership.md",
    articleIds: [13, 14],
    model: "gpt-4.1",
  },
  {
    name: "v3_03_national_security",
    titleAr: "الإضرار بالأمن الوطني",
    fileName: "03_national_security.md",
    articleIds: [4, 12, 13, 14, 15],
    model: "gpt-4.1",
  },
  {
    name: "v3_04_historical_unreliable",
    titleAr: "المحتوى التاريخي غير الموثوق",
    fileName: "04_historical_unreliable.md",
    articleIds: [16],
    model: "gpt-4.1",
  },
  {
    name: "v3_05_society_identity",
    titleAr: "الإساءة للمجتمع أو الهوية الوطنية",
    fileName: "05_society_identity.md",
    articleIds: [4, 8, 12, 17, 18],
    model: "gpt-4.1",
  },
  {
    name: "v3_06_children_crime",
    titleAr: "محتوى الجرائم الموجه للأطفال",
    fileName: "06_children_crime.md",
    articleIds: [6],
    model: "gpt-4.1",
  },
  {
    name: "v3_07_drugs_alcohol",
    titleAr: "الترويج للمخدرات والمسكرات",
    fileName: "07_drugs_alcohol.md",
    articleIds: [5, 10],
    model: "gpt-4.1-mini",
  },
  {
    name: "v3_08_child_disability_harm",
    titleAr: "إيذاء الطفل وذوي الإعاقة",
    fileName: "08_child_disability_harm.md",
    articleIds: [6, 17],
    model: "gpt-4.1",
  },
  {
    name: "v3_09_inappropriate_sexual_content",
    titleAr: "المحتوى الجنسي غير المناسب",
    fileName: "09_inappropriate_sexual_content.md",
    articleIds: [5, 9, 23, 24],
    model: "gpt-4.1",
  },
  {
    name: "v3_10_explicit_sexual_scenes",
    titleAr: "المشاهد الجنسية الصريحة",
    fileName: "10_explicit_sexual_scenes.md",
    articleIds: [9, 23, 24],
    model: "gpt-4.1",
  },
  {
    name: "v3_11_profanity",
    titleAr: "الألفاظ النابية",
    fileName: "11_profanity.md",
    articleIds: [4, 5, 17],
    model: "gpt-4.1-mini",
  },
  {
    name: "v3_12_women_abuse",
    titleAr: "الإساءة إلى المرأة أو تعنيفها",
    fileName: "12_women_abuse.md",
    articleIds: [7],
    model: "gpt-4.1",
  },
  {
    name: "v3_13_family_values",
    titleAr: "تقويض قيم الأسرة",
    fileName: "13_family_values.md",
    articleIds: [4, 12],
    model: "gpt-4.1",
  },
  {
    name: "v3_14_parents_abuse",
    titleAr: "الإساءة إلى الوالدين",
    fileName: "14_parents_abuse.md",
    articleIds: [4, 17],
    model: "gpt-4.1",
  },
  {
    name: "v3_15_elderly_abuse",
    titleAr: "الإساءة إلى كبار السن",
    fileName: "15_elderly_abuse.md",
    articleIds: [4, 17],
    model: "gpt-4.1",
  },
  {
    name: "v3_16_bullying",
    titleAr: "التنمر الجارح والسخرية",
    fileName: "16_bullying.md",
    articleIds: [5, 6, 17],
    model: "gpt-4.1-mini",
  },
  {
    name: "v3_17_other",
    titleAr: "أخرى",
    fileName: "17_other.md",
    articleIds: [4, 11, 16, 17, 19, 20, 21, 22],
    model: "gpt-4.1",
  },
];

function loadMarkdown(fileName: string): string | null {
  const filePath = resolve(DOC_ROOT, fileName);
  if (!existsSync(filePath)) return null;
  const content = readFileSync(filePath, "utf8").trim();
  return content.length > 0 ? content : null;
}

function joinSections(sections: Array<string | null | undefined>): string {
  return sections.filter((section): section is string => typeof section === "string" && section.trim().length > 0).join("\n\n");
}

export function buildV3PromptOverlay(passName: string): string | null {
  const shared = loadMarkdown("shared_overview.md") ?? DEFAULT_SHARED_OVERLAY;
  const files = PASS_FILES[passName] ?? [];
  const passSections = files.map((fileName) => loadMarkdown(fileName)).filter((section): section is string => typeof section === "string");

  const overlay = joinSections([
    shared,
    passSections.length > 0 ? `=== Pass: ${passName} ===` : null,
    ...passSections,
  ]);

  return overlay.trim().length > 0 ? overlay : null;
}

export function buildV3SubjectPromptSection(subject: V3SubjectDefinition): string {
  const shared = loadMarkdown("shared_overview.md") ?? DEFAULT_SHARED_OVERLAY;
  const subjectPrompt = loadMarkdown(subject.fileName) ?? `# ${subject.titleAr}

استخرج فقط المخالفات التي تندرج تحت هذا العنوان. إذا لم يكن المقتطف يثبت هذا النوع مباشرة فأرجع {"findings":[]}.`;

  return joinSections([
    shared,
    `=== Violation Subject: ${subject.titleAr} ===`,
    subjectPrompt,
  ]);
}
