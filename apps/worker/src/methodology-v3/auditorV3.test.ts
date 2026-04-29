import assert from "node:assert/strict";
import { runAuditorV3Gate } from "./auditorV3.js";
import type { HybridFindingLike } from "./contextArbiter.js";

function finding(overrides: Partial<HybridFindingLike> = {}): HybridFindingLike {
  return {
    source: "ai",
    article_id: 5,
    atom_id: "5-2",
    severity: "high",
    confidence: 0.95,
    title_ar: "مخالفة محتوى",
    description_ar: "",
    evidence_snippet: "نص تجريبي",
    start_offset_global: 0,
    end_offset_global: 12,
    depiction_type: "mention",
    speaker_role: "unknown",
    context_window_id: null,
    context_confidence: 0.8,
    lexical_confidence: 0.7,
    policy_confidence: 0.7,
    rationale_ar: "المقتطف يتضمن مخالفة واضحة",
    final_ruling: "violation",
    narrative_consequence: "unknown",
    ...overrides,
  };
}

function run() {
  const text = "يلعن\nالاقتصاد في النازل\nطالب يضحك\nيا كلب";

  const religionRejected = runAuditorV3Gate({
    fullText: text,
    findings: [
      finding({
        title_ar: "المساس بالثوابت الدينية",
        evidence_snippet: "يلعن",
        rationale_ar: "المقتطف يتضمن شتيمة عامة لا إساءة دينية صريحة.",
      }),
    ],
  });
  assert.equal(religionRejected.findings.length, 0, "religion should reject generic curse");

  const profanityAccepted = runAuditorV3Gate({
    fullText: text,
    findings: [
      finding({
        title_ar: "الألفاظ النابية",
        evidence_snippet: "يلعن",
        rationale_ar: "المقتطف يتضمن لفظًا نابيًا مباشرًا.",
      }),
    ],
  });
  assert.equal(profanityAccepted.findings.length, 1, "profanity should accept direct curse");
  assert.equal(profanityAccepted.findings[0].title_ar, "الألفاظ النابية");

  const historicalRejected = runAuditorV3Gate({
    fullText: text,
    findings: [
      finding({
        title_ar: "المحتوى التاريخي غير الموثوق",
        evidence_snippet: "الاقتصاد في النازل",
        rationale_ar: "المقتطف يعبّر عن رأي اقتصادي معاصر لا ادعاء تاريخي.",
      }),
    ],
  });
  assert.equal(historicalRejected.findings.length, 0, "historical should reject modern economic claim");

  const bullyingRejected = runAuditorV3Gate({
    fullText: text,
    findings: [
      finding({
        title_ar: "التنمر الجارح والسخرية",
        evidence_snippet: "طالب يضحك",
        rationale_ar: "المقتطف يصف مشهدًا عامًّا بلا إهانة أو سخرية.",
      }),
    ],
  });
  assert.equal(bullyingRejected.findings.length, 0, "bullying should reject generic scene");

  console.log("All auditor v3 tests passed.");
}

run();
