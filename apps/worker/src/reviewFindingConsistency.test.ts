import assert from "node:assert/strict";
import { normalizeReviewFindingConsistency } from "./reviewFindingConsistency.js";

function row(overrides: Partial<Parameters<typeof normalizeReviewFindingConsistency>[0]> = {}) {
  return {
    source_kind: "ai" as const,
    primary_article_id: 4,
    title_ar: "المساس بالثوابت الدينية",
    rationale_ar: null,
    evidence_snippet: "",
    start_offset_global: 0,
    end_offset_global: 0,
    anchor_confidence: 1,
    ...overrides,
  };
}

{
  const input = row({
    title_ar: "المساس بالثوابت الدينية",
    evidence_snippet: "حضربك لين اسيل دمك",
    rationale_ar: "المقتطف يظهر في حوار مباشر حيث يستخدم فهد لفظ \"طز\" للتعبير عن احتقاره.",
  });
  const result = normalizeReviewFindingConsistency(input, "ناصر: حضربك لين اسيل دمك. طالب يضحك.");
  assert.equal(result.title_ar, "إيذاء الطفل وذوي الإعاقة");
  assert.equal(result.primary_article_id, 8);
  assert.match(result.rationale_ar ?? "", /إيذاء الطفل/);
  assert.ok((result.anchor_confidence ?? 1) < 1);
}

{
  const input = row({
    title_ar: "المساس بالقيادة السياسية",
    evidence_snippet: "سمعت إنك تتكلمين! تبي تفضحيني؟! يمسك ذراعها بقوة.",
    rationale_ar: "هذا المقتطف يتضمن تحريضًا واضحًا على قلب نظام الحكم.",
  });
  const result = normalizeReviewFindingConsistency(input, "فهد يخاطب مها: سمعت إنك تتكلمين! تبي تفضحيني؟! يمسك ذراعها بقوة.");
  assert.equal(result.title_ar, "الإساءة إلى المرأة أو تعنيفها");
  assert.equal(result.primary_article_id, 12);
  assert.match(result.rationale_ar ?? "", /مرأة/);
}

{
  const input = row({
    title_ar: "المشاهد الجنسية الصريحة",
    evidence_snippet: "أستاذ… عيب… هو طفل.",
    rationale_ar: "الطفل سامي يكرر تهديدًا تلقاه بالعنف إذا أفشى ما يتعرض له.",
  });
  const result = normalizeReviewFindingConsistency(input, "أستاذ… عيب… هو طفل. سامي كان خائفًا من تهديد المعلم.");
  assert.equal(result.title_ar, "إيذاء الطفل وذوي الإعاقة");
  assert.equal(result.primary_article_id, 8);
}

{
  const input = row({
    title_ar: "المساس بالثوابت الدينية",
    evidence_snippet: "يلعن امها دولة",
    rationale_ar: "يظهر المقتطف لفظًا نابيًا كشتيمة عامة ومباشرة.",
  });
  const result = normalizeReviewFindingConsistency(input, "فهد: يلعن امها دولة.");
  assert.equal(result.title_ar, "الإساءة للمجتمع أو الهوية الوطنية");
  assert.equal(result.primary_article_id, 5);
}

console.log("All review finding consistency tests passed.");
