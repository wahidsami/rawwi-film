import assert from "node:assert/strict";
import { runAuditorV4Gate } from "./auditorV4.js";
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

function assertSingleCategory(result: ReturnType<typeof runAuditorV4Gate>, title: string, message: string): void {
  assert.equal(result.findings.length, 1, message);
  assert.equal(result.findings[0].title_ar, title);
}

function run() {
  const text = [
    "يقاطع، بصوت منخفض",
    "قوم يا عديم التربية",
    "انتي ما لك كلمة. انتي ملك هنا",
    "يا فاشل",
    "عديم التربية",
    "اسكتي",
    "اللي ما يحترم النظام… ينكسر",
    "يلعن",
  ].join("\n");

  const sexualRejected = runAuditorV4Gate({
    fullText: text,
    findings: [
      finding({
        title_ar: "المشاهد الجنسية الصريحة",
        evidence_snippet: "يقاطع، بصوت منخفض",
      }),
    ],
  });
  assert.equal(sexualRejected.findings.length, 0, "sexual should reject non-sexual dialogue");

  const sexualRejected2 = runAuditorV4Gate({
    fullText: text,
    findings: [
      finding({
        title_ar: "المشاهد الجنسية الصريحة",
        evidence_snippet: "قوم يا عديم التربية",
      }),
    ],
  });
  assertSingleCategory(sexualRejected2, "التنمر الجارح والسخرية", "family/bullying text should resolve to bullying");

  const historicalRejected = runAuditorV4Gate({
    fullText: text,
    findings: [
      finding({
        title_ar: "المحتوى التاريخي غير الموثوق",
        evidence_snippet: "انتي ما لك كلمة. انتي ملك هنا",
      }),
    ],
  });
  assert.equal(historicalRejected.findings.length, 0, "historical should reject generic social dialogue");

  const familyRejected = runAuditorV4Gate({
    fullText: text,
    findings: [
      finding({
        title_ar: "تقويض قيم الأسرة",
        evidence_snippet: "يا فاشل",
      }),
    ],
  });
  assertSingleCategory(familyRejected, "التنمر الجارح والسخرية", "simple insult should resolve to bullying");

  const familyRejected2 = runAuditorV4Gate({
    fullText: text,
    findings: [
      finding({
        title_ar: "تقويض قيم الأسرة",
        evidence_snippet: "عديم التربية",
      }),
    ],
  });
  assertSingleCategory(familyRejected2, "التنمر الجارح والسخرية", "bullying term should resolve to bullying");

  const familyRejected3 = runAuditorV4Gate({
    fullText: text,
    findings: [
      finding({
        title_ar: "تقويض قيم الأسرة",
        evidence_snippet: "اسكتي",
      }),
    ],
  });
  assert.equal(familyRejected3.findings.length, 0, "isolated imperative should be rejected as too weak");

  const profanityRejected = runAuditorV4Gate({
    fullText: text,
    findings: [
      finding({
        title_ar: "الألفاظ النابية",
        evidence_snippet: "اللي ما يحترم النظام… ينكسر",
      }),
    ],
  });
  assert.equal(profanityRejected.findings.length, 0, "profanity should reject non-profanity threat language");

  const profanityAccepted = runAuditorV4Gate({
    fullText: text,
    findings: [
      finding({
        title_ar: "الألفاظ النابية",
        evidence_snippet: "يلعن",
      }),
    ],
  });
  assert.equal(profanityAccepted.findings.length, 1, "profanity should accept direct curse");
  assert.equal(profanityAccepted.findings[0].title_ar, "الألفاظ النابية");

  const bullyingFromInsult = runAuditorV4Gate({
    fullText: text,
    findings: [
      finding({
        title_ar: "تقويض قيم الأسرة",
        evidence_snippet: "يا فاشل",
      }),
    ],
  });
  assertSingleCategory(bullyingFromInsult, "التنمر الجارح والسخرية", "insult should resolve to bullying");

  console.log("All auditor v4 tests passed.");
}

run();
