import type { ValidationCase, ValidationCaseMismatch, ValidationCaseResult, ValidationDifference } from "../types/validationTypes.js";

function normalizeText(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
}

function normalizeList(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values.map((value) => normalizeText(value)).filter(Boolean))].sort((left, right) => left.localeCompare(right)));
}

function extractExpectedEvidence(scriptSnippet: string): string {
  const candidates = [
    "العن أمك",
    "العن امك",
    "العن والديك",
    "يا حمار",
    "يا كلب",
    "يا خرا",
    "يا نصاب",
    "يا حرامي",
    "يا كذاب",
    "عديم التربية",
    "يلعن",
    "العن",
    "لعنة",
    "تبا",
    "تبًا",
    "تباً",
    "خرا",
    "وسخ",
    "قذر",
    "حقير",
    "وضيع",
    "نذل",
    "خسيس",
    "لئيم",
    "جبان",
    "ساقط",
    "غبي",
    "أحمق",
    "سخيف",
    "كلب",
    "حمار",
    "أهبل",
    "اهبل",
    "كذاب",
    "حرامي",
    "نصاب",
    "نابي",
    "نابية",
    "شتيمة",
    "سباب",
    "قذف",
  ];
  const normalized = scriptSnippet.normalize("NFC");
  for (const candidate of candidates) {
    const index = normalized.toLowerCase().indexOf(candidate.normalize("NFC").toLowerCase());
    if (index >= 0) return normalized.slice(index, index + candidate.length);
  }
  return normalized.trim();
}

function normalizeNumberList(values: readonly number[]): readonly number[] {
  return Object.freeze([...new Set(values.map((value) => Number(value.toFixed(6))))].sort((left, right) => left - right));
}

function compareLists(left: readonly string[], right: readonly string[]): boolean {
  const leftNormalized = normalizeList(left);
  const rightNormalized = normalizeList(right);
  return leftNormalized.length === rightNormalized.length && leftNormalized.every((value, index) => value === rightNormalized[index]);
}

function compareNumbers(left: readonly number[], right: readonly number[]): boolean {
  const leftNormalized = normalizeNumberList(left);
  const rightNormalized = normalizeNumberList(right);
  return leftNormalized.length === rightNormalized.length && leftNormalized.every((value, index) => value === rightNormalized[index]);
}

function makeDifference(
  field: ValidationDifference["field"],
  reason: string,
  expected: string,
  actual: string,
  caseId: string,
  missingKnowledge: readonly string[] = [],
): ValidationDifference {
  const suffix = caseId.replace(/[^a-z0-9]+/gi, "_").toLowerCase();
  return Object.freeze({
    field,
    reason,
    expected,
    actual,
    missingKnowledge: Object.freeze([...missingKnowledge]),
    possibleDecisionRecord: `decision_record.${suffix}.${field}`,
    possibleLesson: `lesson_${field}.${suffix}`,
    possiblePattern: `pattern.${suffix}.${field}`,
    possibleBenchmark: `benchmark.${suffix}`,
  });
}

function confidenceWithinRange(confidence: number, min: number, max: number): boolean {
  return confidence >= min && confidence <= max;
}

export function compareValidationCase(
  caseItem: ValidationCase,
  actual: Readonly<{
    concepts: readonly string[];
    intent: string;
    context: string;
    evidence: string;
    judgment: "match" | "review" | "reject";
    articleIds: readonly number[];
    atomId: string | null;
    finding: {
      moduleId: string | null;
      articleIds: readonly number[];
      atomId: string | null;
      disposition: "match" | "review" | "reject";
      summary: string;
      explanation: string;
      confidence: number;
    };
    legalModule: string | null;
    confidence: number;
  }>,
): ValidationCaseResult {
  const mismatches: ValidationCaseMismatch = Object.freeze({
    concepts: !compareLists(actual.concepts, caseItem.expectedConcepts),
    intent: normalizeText(actual.intent) !== normalizeText(caseItem.expectedReviewerAssessment.narrativeIntent),
    context:
      normalizeText(actual.context) !== normalizeText(caseItem.expectedReviewerAssessment.contextClassification) &&
      normalizeText(actual.context) !== normalizeText(caseItem.expectedReviewerAssessment.narrativeUnderstanding),
    evidence: normalizeText(actual.evidence) !== normalizeText(extractExpectedEvidence(caseItem.scriptSnippet)),
    judgment: actual.judgment !== caseItem.expectedFinding.disposition,
    article: !compareNumbers(actual.articleIds, caseItem.expectedArticleMapping),
    atom: normalizeText(actual.atomId ?? "null") !== normalizeText(caseItem.expectedAtomId ?? "null"),
    finding:
      normalizeText(actual.finding.summary) !== normalizeText(caseItem.expectedFinding.summary) ||
      actual.finding.disposition !== caseItem.expectedFinding.disposition,
    explanation: normalizeText(actual.finding.explanation) !== normalizeText(caseItem.expectedExplanation),
    confidence: !confidenceWithinRange(actual.confidence, caseItem.expectedConfidenceRange.min, caseItem.expectedConfidenceRange.max),
  });

  const differences: ValidationDifference[] = [];
  if (mismatches.concepts) {
    differences.push(makeDifference("concepts", "Detected concepts differ from the expected benchmark concepts.", caseItem.expectedConcepts.join(", "), actual.concepts.join(", "), caseItem.id, ["concept recognition", "glossary coverage"]));
  }
  if (mismatches.intent) {
    differences.push(makeDifference("intent", "Narrative intent differs from the expected reviewer assessment.", caseItem.expectedReviewerAssessment.narrativeIntent, actual.intent, caseItem.id, ["intent recognition", "context interpretation"]));
  }
  if (mismatches.context) {
    differences.push(makeDifference("context", "Context classification differs from the expected reviewer assessment.", caseItem.expectedReviewerAssessment.contextClassification, actual.context, caseItem.id, ["context analysis", "scene interpretation"]));
  }
  if (mismatches.evidence) {
    differences.push(makeDifference("evidence", "Evidence text differs from the expected literal evidence span.", extractExpectedEvidence(caseItem.scriptSnippet), actual.evidence, caseItem.id, ["evidence extraction", "chunk anchoring"]));
  }
  if (mismatches.judgment) {
    differences.push(makeDifference("judgment", "Reviewer judgment differs from the expected finding disposition.", caseItem.expectedFinding.disposition, actual.judgment, caseItem.id, ["reviewer methodology", "confidence calibration"]));
  }
  if (mismatches.article) {
    differences.push(makeDifference("article", "GCAM article mapping differs from the expected mapping.", caseItem.expectedArticleMapping.join(", "), actual.articleIds.join(", "), caseItem.id, ["GCAM mapping", "pack selection"]));
  }
  if (mismatches.atom) {
    differences.push(makeDifference("atom", "GCAM atom mapping differs from the expected mapping.", caseItem.expectedAtomId ?? "null", actual.atomId ?? "null", caseItem.id, ["GCAM atom coverage", "mapping debt"]));
  }
  if (mismatches.finding) {
    differences.push(makeDifference("finding", "Final finding summary differs from the expected benchmark finding.", caseItem.expectedFinding.summary, actual.finding.summary, caseItem.id, ["finding generation", "reviewer judgment"]));
  }
  if (mismatches.explanation) {
    differences.push(makeDifference("explanation", "Reviewer explanation differs from the expected benchmark explanation.", caseItem.expectedExplanation, actual.finding.explanation, caseItem.id, ["reasoning trace", "evidence explanation"]));
  }
  if (mismatches.confidence) {
    differences.push(makeDifference("confidence", "Confidence falls outside the expected benchmark range.", `${caseItem.expectedConfidenceRange.min}..${caseItem.expectedConfidenceRange.max}`, actual.confidence.toFixed(6), caseItem.id, ["confidence calibration", "evidence sufficiency"]));
  }

  return Object.freeze({
    case: caseItem,
    actualConcepts: Object.freeze([...actual.concepts]),
    actualIntent: actual.intent,
    actualContext: actual.context,
    actualEvidence: actual.evidence,
    actualJudgment: actual.judgment,
    actualArticleMapping: Object.freeze([...actual.articleIds]),
    actualAtomId: actual.atomId,
    actualLegalModule: actual.legalModule,
    actualFinding: Object.freeze({
      moduleId: actual.finding.moduleId,
      articleIds: Object.freeze([...actual.finding.articleIds]),
      atomId: actual.finding.atomId,
      disposition: actual.finding.disposition,
      summary: actual.finding.summary,
      explanation: actual.finding.explanation,
      confidence: Number(actual.finding.confidence.toFixed(6)),
    }),
    reasoningTrace: null,
    passed: !Object.values(mismatches).some(Boolean),
    mismatches,
    differences: Object.freeze(differences),
  });
}
