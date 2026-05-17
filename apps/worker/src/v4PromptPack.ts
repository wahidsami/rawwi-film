import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const DEFAULT_SHARED_OVERLAY = `=== Violations System v4 (Film Commission Regulations) ===
هذه النسخة مبنية على المحظورات العامة لمحتوى الأفلام والمسلسلات + المجتمع والأخلاق.

قواعد ثابتة في v4:
1. لا تُرجع finding إلا عند وجود دليل مباشر في المقتطف نفسه.
2. لا تخلط بين الموضوعات؛ كل مسار يفحص موضوعًا محددًا فقط.
3. ممنوع اختلاق سياق غير مذكور حرفياً في النص المحلي.
4. title_ar يكون اسم المخالفة فقط دون أرقام مواد.
5. إذا كان الدليل غير كافٍ أو مبهمًا فأعد findings فارغة.
6. استخرج evidence_snippet قصيرًا، وحدد offsets بدقة.
7. اذكر rationale_ar عربية واضحة ومحددة مرتبطة بالمقتطف نفسه.
8. إذا كانت الحالة حدّية وغير محسومة فأعد final_ruling = "needs_review".`;

function resolveDocRoot(): string {
  const candidates = [
    resolve(process.cwd(), "docs", "V4 prompts"),
    resolve(process.cwd(), "..", "docs", "V4 prompts"),
    resolve(process.cwd(), "..", "..", "docs", "V4 prompts"),
    resolve(process.cwd(), "..", "..", "..", "docs", "V4 prompts"),
    resolve("/app", "docs", "V4 prompts"),
  ];

  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
}

const DOC_ROOT = resolveDocRoot();

const PASS_FILES: Record<string, string[]> = {
  glossary: [],
  insults: ["11_profanity.md"],
  violence: ["03_national_security.md", "06_children_crime_security.md"],
  sexual_content: ["09_lgbtq_positive_advocacy.md", "10_explicit_sexual_scenes.md"],
  drugs_alcohol: ["07_drugs_alcohol_manufacture.md"],
  discrimination_incitement: ["05_society_identity_generalization.md"],
  women: ["12_other.md"],
  national_security: ["03_national_security.md", "02_state_leadership.md"],
  extremism_banned_groups: ["03_national_security.md"],
  misinformation: ["04_historical_documentary_reliability.md"],
  international_relations: ["05_society_identity_generalization.md"],
};

export type V4SubjectDefinition = {
  name: string;
  titleAr: string;
  fileName: string;
  articleIds: number[];
  model: "gpt-4.1" | "gpt-4.1-mini";
};

export const V4_SUBJECT_DEFINITIONS: V4SubjectDefinition[] = [
  {
    name: "v4_01_religious_fundamentals",
    titleAr: "الإساءة لأصول الشريعة الإسلامية",
    fileName: "01_religious_fundamentals.md",
    articleIds: [4, 16],
    model: "gpt-4.1",
  },
  {
    name: "v4_02_state_leadership",
    titleAr: "المساس بالدولة السعودية والقيادة",
    fileName: "02_state_leadership.md",
    articleIds: [13, 14],
    model: "gpt-4.1",
  },
  {
    name: "v4_03_national_security",
    titleAr: "المساس بالأمن الوطني",
    fileName: "03_national_security.md",
    articleIds: [4, 12, 13, 14, 15],
    model: "gpt-4.1",
  },
  {
    name: "v4_04_historical_documentary_reliability",
    titleAr: "محتوى تاريخي غير موثوق (وثائقي)",
    fileName: "04_historical_documentary_reliability.md",
    articleIds: [16],
    model: "gpt-4.1",
  },
  {
    name: "v4_05_society_identity_generalization",
    titleAr: "الإساءة للمجتمع السعودي أو التعميم السلبي",
    fileName: "05_society_identity_generalization.md",
    articleIds: [4, 8, 12, 17, 18],
    model: "gpt-4.1",
  },
  {
    name: "v4_06_children_crime_security",
    titleAr: "جرائم/أمن موجهة للأطفال أو تجميلها",
    fileName: "06_children_crime_security.md",
    articleIds: [6],
    model: "gpt-4.1",
  },
  {
    name: "v4_07_drugs_alcohol_manufacture",
    titleAr: "تعليم صناعة المخدرات أو المسكرات",
    fileName: "07_drugs_alcohol_manufacture.md",
    articleIds: [5, 10],
    model: "gpt-4.1-mini",
  },
  {
    name: "v4_08_child_disability_harm",
    titleAr: "العنف/الإيذاء/السخرية ضد الطفل أو ذوي الإعاقة",
    fileName: "08_child_disability_harm.md",
    articleIds: [6, 17],
    model: "gpt-4.1",
  },
  {
    name: "v4_09_lgbtq_positive_advocacy",
    titleAr: "الدعوة الإيجابية للمثلية/الشذوذ",
    fileName: "09_lgbtq_positive_advocacy.md",
    articleIds: [9, 23, 24],
    model: "gpt-4.1",
  },
  {
    name: "v4_10_explicit_sexual_scenes",
    titleAr: "المشاهد الجنسية الصريحة",
    fileName: "10_explicit_sexual_scenes.md",
    articleIds: [9, 23, 24],
    model: "gpt-4.1",
  },
  {
    name: "v4_11_profanity",
    titleAr: "الألفاظ النابية",
    fileName: "11_profanity.md",
    articleIds: [4, 5, 17],
    model: "gpt-4.1-mini",
  },
  {
    name: "v4_12_other",
    titleAr: "مخالفات عامة أخرى مرتبطة باللائحة",
    fileName: "12_other.md",
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

export function buildV4PromptOverlay(passName: string): string | null {
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

export function buildV4SubjectPromptSection(subject: V4SubjectDefinition): string {
  const shared = loadMarkdown("shared_overview.md") ?? DEFAULT_SHARED_OVERLAY;
  const subjectPrompt = loadMarkdown(subject.fileName) ?? `# ${subject.titleAr}

استخرج فقط المخالفات التي تندرج تحت هذا العنوان. إذا لم يكن المقتطف يثبت هذا النوع مباشرة فأرجع {"findings":[]}.`;

  return joinSections([
    shared,
    `=== Violation Subject: ${subject.titleAr} ===`,
    subjectPrompt,
  ]);
}
