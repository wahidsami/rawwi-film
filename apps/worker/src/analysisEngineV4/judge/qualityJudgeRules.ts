import type { ConceptCollection, ConceptRecord } from "../concepts/conceptTypes.js";
import type { Evidence, EvidenceCollection } from "../evidence/evidenceTypes.js";
import type { LegalDecision, LegalDecisionCollection } from "../legal/legalDecision.js";
import type { ExplanationCollection, ExplanationRecord } from "../explanations/explanationTypes.js";
import type { QualityJudgeEngineInput, QualityJudgeRuleEvaluation, QualityJudgeRuleId } from "./qualityJudgeTypes.js";

const OTHER_SCENE_PATTERNS: readonly RegExp[] = Object.freeze([
  /\banother scene\b/iu,
  /\bprevious scene\b/iu,
  /\blater scene\b/iu,
  /\bother scene\b/iu,
  /\bscene\s*\d+\b/iu,
  /\bمشهد\s*\d+\b/u,
  /\bالمشهد\s*\d+\b/u,
  /\belsewhere\b/iu,
]);

const OTHER_FINDING_PATTERNS: readonly RegExp[] = Object.freeze([
  /\banother finding\b/iu,
  /\bother finding\b/iu,
  /\bprevious finding\b/iu,
  /\bnext finding\b/iu,
]);

const HALLUCINATION_PATTERNS: readonly RegExp[] = Object.freeze([
  /\binvented\b/iu,
  /\bfake\b/iu,
  /\bfalse\b/iu,
  /\bimaginary\b/iu,
  /\bnot present\b/iu,
  /\bunknown character\b/iu,
]);

function normalizeText(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
}

function includesNormalized(haystack: string, needle: string | null | undefined): boolean {
  if (!needle) return false;
  return normalizeText(haystack).includes(normalizeText(needle));
}

export function findEvidence(collection: EvidenceCollection | null, evidenceId: string): Evidence | null {
  return collection?.evidence.find((entry) => entry.id === evidenceId || entry.spanId === evidenceId) ?? null;
}

export function findConcept(collection: ConceptCollection | null, conceptId: string): ConceptRecord | null {
  return collection?.concepts.find((entry) => entry.conceptId === conceptId) ?? null;
}

export function findDecision(collection: LegalDecisionCollection | null, legalDecisionId: string): LegalDecision | null {
  return collection?.decisions.find((decision) => decision.id === legalDecisionId) ?? null;
}

export function findExplanation(collection: ExplanationCollection | null, explanationId: string): ExplanationRecord | null {
  return collection?.explanations.find((entry) => entry.id === explanationId) ?? null;
}

export function collectAllowedNames(input: QualityJudgeEngineInput, evidence: Evidence | null): readonly string[] {
  const names = new Set<string>();
  if (evidence?.speaker) names.add(evidence.speaker);
  if (evidence?.target) names.add(evidence.target);
  for (const concept of input.conceptCollection?.concepts ?? []) {
    names.add(concept.label);
    names.add(concept.conceptId);
  }
  for (const decision of input.legalDecisionCollection?.decisions ?? []) {
    if (decision.primaryArticle?.titleAr) names.add(decision.primaryArticle.titleAr);
    names.add(String(decision.primaryArticle?.articleId ?? ""));
  }
  return [...names].filter(Boolean);
}

export function evaluateRuleSet(input: QualityJudgeEngineInput, explanation: ExplanationRecord): Readonly<{
  ruleEvaluations: readonly QualityJudgeRuleEvaluation[];
  verificationReasons: readonly string[];
  overallConfidence: number;
  baseStatus: "pass" | "reject";
}> {
  const evidence = findEvidence(input.evidenceCollection, explanation.evidenceId);
  const concept = findConcept(input.conceptCollection, explanation.conceptId);
  const decision = findDecision(input.legalDecisionCollection, explanation.legalDecisionId);
  const explanationText = [explanation.summary, ...explanation.reasoning].join(" ");
  const evidenceText = evidence?.text ?? evidence?.rawText ?? "";
  const conceptLabel = concept?.label ?? null;
  const articleId = decision?.primaryArticle?.articleId ?? null;
  const articleTitle = decision?.primaryArticle?.titleAr ?? null;
  const allowedNames = collectAllowedNames(input, evidence);
  const evidenceGroundedText = evidence?.grounding?.matchedText ?? "";
  const evidenceSnippetExact = normalizeText(evidenceText).length > 0
    && normalizeText(evidenceText) === normalizeText(evidenceGroundedText || evidenceText);

  const ruleEvaluations: QualityJudgeRuleEvaluation[] = [];
  const pushRule = (ruleId: QualityJudgeRuleId, label: string, passed: boolean, reason: string): void => {
    ruleEvaluations.push(Object.freeze({
      ruleId,
      label,
      passed,
      reason,
      evidenceId: evidence?.id ?? null,
      conceptId: concept?.conceptId ?? null,
      legalDecisionId: decision?.id ?? null,
      explanationId: explanation.id,
    }));
  };

  const evidenceExists = Boolean(evidence);
  pushRule(
    "evidence_exists",
    "Evidence exists",
    evidenceExists,
    evidenceExists ? "Evidence was found in the supplied evidence collection." : "No matching evidence was found for the explanation.",
  );

  const evidenceGrounded = Boolean(evidence?.grounding && normalizeText(evidenceGroundedText || evidenceText).length > 0);
  pushRule(
    "evidence_grounded",
    "Evidence is grounded",
    evidenceGrounded,
    evidenceGrounded ? "Evidence contains grounded offsets and matched text." : "Evidence is missing a grounded span or matched text.",
  );

  const conceptLinksEvidence = Boolean(concept && evidence && (concept.evidenceSpanIds.includes(evidence.id) || concept.evidenceSpanIds.includes(evidence.spanId) || concept.evidenceId === evidence.id));
  pushRule(
    "concept_links_evidence",
    "Concept references evidence",
    conceptLinksEvidence,
    conceptLinksEvidence ? "Concept references the supplied evidence." : "Concept does not reference the supplied evidence.",
  );

  const legalOriginatesFromConcept = Boolean(decision && concept && decision.conceptId === concept.conceptId && decision.primaryArticle);
  pushRule(
    "legal_originates_from_concept",
    "Legal article originates from concept",
    legalOriginatesFromConcept,
    legalOriginatesFromConcept ? "Legal decision originates from the detected concept." : "Legal decision does not originate from the detected concept.",
  );

  const explanationGrounded = Boolean(
    evidenceExists
      && concept
      && decision
      && includesNormalized(explanationText, evidenceText)
      && (conceptLabel ? includesNormalized(explanationText, conceptLabel) || includesNormalized(explanationText, concept.conceptId) : true)
      && (articleId !== null ? includesNormalized(explanationText, String(articleId)) || includesNormalized(explanationText, articleTitle) : true),
  );
  pushRule(
    "explanation_is_grounded",
    "Explanation is grounded",
    explanationGrounded,
    explanationGrounded ? "Explanation references the current evidence, concept, and legal decision." : "Explanation does not fully reference the current evidence, concept, and legal decision.",
  );

  const explanationNoHallucination = Boolean(
    !OTHER_SCENE_PATTERNS.some((pattern) => pattern.test(explanationText))
      && !OTHER_FINDING_PATTERNS.some((pattern) => pattern.test(explanationText))
      && !HALLUCINATION_PATTERNS.some((pattern) => pattern.test(explanationText))
      && allowedNames.every((name) => !name || includesNormalized(explanationText, name) || name === conceptLabel || name === articleTitle),
  );
  pushRule(
    "explanation_no_hallucination",
    "Explanation has no hallucination",
    explanationNoHallucination,
    explanationNoHallucination ? "Explanation only references allowed grounded entities." : "Explanation mentions another scene, finding, or unsupported detail.",
  );

  const evidenceSnippetMatches = evidenceSnippetExact;
  pushRule(
    "evidence_snippet_exact",
    "Evidence snippet exactly matches",
    evidenceSnippetMatches,
    evidenceSnippetMatches ? "Evidence snippet exactly matches the grounded screenplay text." : "Evidence snippet does not exactly match the grounded screenplay text.",
  );

  const confidence = Number(((evidence?.confidence ?? 0) + (concept?.confidence ?? 0) + (decision?.mappingConfidence ?? 0) + (explanation.confidence ?? 0)) / 4 || 0);

  pushRule(
    "confidence_threshold",
    "Confidence meets threshold",
    confidence >= 0.75,
    confidence >= 0.75 ? `Confidence ${confidence.toFixed(6)} is above threshold.` : `Confidence ${confidence.toFixed(6)} is below threshold.`,
  );

  const verificationReasons = ruleEvaluations.filter((rule) => !rule.passed).map((rule) => rule.reason);
  const baseStatus = verificationReasons.length === 0 ? "pass" : "reject";

  return Object.freeze({
    ruleEvaluations: Object.freeze(ruleEvaluations),
    verificationReasons: Object.freeze(verificationReasons),
    overallConfidence: confidence,
    baseStatus,
  });
}

