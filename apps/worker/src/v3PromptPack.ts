import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const DEFAULT_SHARED_OVERLAY = `=== Violations System v3 ===
هذه النسخة مبنية على دليل المخالفات المحدّث، وتُستخدم كطبقة تشغيلية محافظة فوق النظام الحالي.

قواعد ثابتة في v3:
1. title_ar يجب أن يكون عنوان المخالفة فقط، مثل: "المساس بالثوابت الدينية" أو "التنمر الجارح والسخرية".
2. ممنوع تضمين أرقام المواد أو أكواد atoms داخل title_ar.
3. الاحتفاظ article_id / atom_id يكون فقط لربط النظام الخلفي، وليس كعنوان ظاهر.
4. لا تُسقط المخالفة إلا إذا كان المقتطف نفسه يثبتها بشكل مباشر وواضح.
5. إذا احتاج الحكم إلى فهم الحبكة أو مشهد أوسع أو نية مفترضة، أعد فارغاً.
6. evidence_snippet يجب أن يكون أقصر اقتباس حرفي يثبت المخالفة.
7. لا تعتمد على الشرح العام أو تلخيص الحبكة أو "استنتاج النية" لإنتاج مخالفة.
8. إذا كانت الحالة أقرب إلى مخالفة مختلفة، فلا تفرضها هنا إلا إذا كان النص يثبت ذلك بوضوح.
9. لا تفترض هوية المتحدث أو المستهدف أو العلاقة بين الشخصيات إذا لم تكن مذكورة حرفياً في النص.
10. في rationale_ar، اشرح لماذا العبارة مخالفة من المعنى المباشر أو من السياق القريب فقط، من دون سرد أسماء الشخصيات أو إعادة كتابة الحبكة.
11. إذا كان الدليل ضعيفاً أو غامضاً أو يعتمد على استنتاج، فأعد فارغاً بدل التخمين.`;

const DOC_ROOT = resolve(process.cwd(), "docs", "V3 prompts");

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
