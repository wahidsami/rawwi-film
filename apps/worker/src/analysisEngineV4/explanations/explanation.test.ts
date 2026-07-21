/**
 * Regression tests for the V4 explanation engine.
 * Run: node --import tsx apps/worker/src/analysisEngineV4/explanations/explanation.test.ts
 */
import { strict as assert } from "node:assert";

import { getPolicyArticle } from "../../policyMap.js";
import { createSceneAnalysisState, freezeSceneAnalysisState } from "../sceneAnalysisState.js";
import type { ConceptCollection, ConceptRecord } from "../concepts/conceptTypes.js";
import type { Evidence, EvidenceCollection } from "../evidence/evidenceTypes.js";
import type { LegalDecision, LegalDecisionCollection } from "../legal/legalDecision.js";
import { buildExplanationCollection, createExplanationNode, validateExplanationCollection } from "./index.js";
import type { ExplanationRecord } from "./explanationTypes.js";

function buildEvidence(text: string, id = "evidence-1"): Evidence {
  const pageReferences = Object.freeze([Object.freeze({ pageNumber: 1, startOffsetPage: 0, endOffsetPage: text.length })]);
  return Object.freeze({
    id,
    spanId: id,
    sceneId: "scene-explanation",
    eventId: id,
    speaker: "فهد",
    target: null,
    page: 1,
    scene: text,
    byteStartOffset: 0,
    byteEndOffset: text.length,
    rawText: text,
    normalizedText: text.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase(),
    text,
    startOffset: 0,
    endOffset: text.length,
    lineId: `${id}-line`,
    sentenceIndex: 0,
    sourceType: "Dialogue",
    pageReferences,
    conceptIds: Object.freeze([id]),
    confidence: 1,
    rationale: Object.freeze(["Grounded evidence span selected for explanation."]),
    grounding: Object.freeze({
      sentenceId: `${id}-sentence`,
      lineId: `${id}-line`,
      page: 1,
      startOffset: 0,
      endOffset: text.length,
      byteStartOffset: 0,
      byteEndOffset: text.length,
      matchedText: text,
      method: "exact" as const,
      pageReferences,
    }),
  });
}

function buildEvidenceCollection(evidence: readonly Evidence[]): EvidenceCollection {
  return Object.freeze({
    sceneId: "scene-explanation",
    evidence: Object.freeze([...evidence]),
    primaryEvidenceId: evidence[0]?.id ?? null,
    dedupDecisions: Object.freeze([]),
    grounding: Object.freeze({
      totalCandidates: evidence.length,
      groundedCount: evidence.length,
      unmatchedCount: 0,
    }),
    executionTimeMs: 0,
  });
}

function buildConceptRecord(id: string, label: string, evidenceId: string, severity: ConceptRecord["severity"] = "high"): ConceptRecord {
  return Object.freeze({
    id,
    evidenceId,
    evidenceSpanId: evidenceId,
    conceptId: id,
    conceptName: label,
    conceptCategory: label.toLowerCase(),
    confidence: 0.95,
    severity,
    targets: Object.freeze([]),
    participants: Object.freeze([]),
    reason: `Matched ${label}.`,
    supportingEvidenceIds: Object.freeze([evidenceId]),
    evidenceSpanIds: Object.freeze([evidenceId]),
    knowledgeDomains: Object.freeze([label.toLowerCase()]),
    label,
    rationale: Object.freeze([`Concept ${label} detected from grounded evidence.`]),
  });
}

function buildConceptCollection(concepts: readonly ConceptRecord[]): ConceptCollection {
  return Object.freeze({
    sceneId: "scene-explanation",
    evidenceCollectionId: "scene-explanation",
    concepts: Object.freeze([...concepts]),
    dedupDecisions: Object.freeze([]),
    normalization: Object.freeze([]),
    classificationOutput: Object.freeze([]),
    confidence: 0.95,
    executionTimeMs: 0,
  });
}

function buildLegalDecision(id: string, conceptId: string, articleId: number, titleAr: string, evidenceId: string): LegalDecision {
  const candidate = Object.freeze({
    articleId,
    titleAr,
    matchedKnowledgeDomains: Object.freeze([conceptId]),
    matchedConceptIds: Object.freeze([conceptId]),
    evidenceSpanIds: Object.freeze([evidenceId]),
    score: 100,
    rationale: Object.freeze([`Article ${articleId} selected for ${conceptId}.`]),
  });

  return Object.freeze({
    id,
    conceptId,
    candidateArticles: Object.freeze([candidate]),
    primaryArticle: candidate,
    secondaryArticles: Object.freeze([]),
    mappingReason: `Concept ${conceptId} maps to article ${articleId}.`,
    mappingConfidence: 0.9,
    knowledgeSource: "academy",
  });
}

function buildLegalDecisionCollection(decisions: readonly LegalDecision[]): LegalDecisionCollection {
  const primaryDecision = decisions[0] ?? null;
  const candidates = decisions.flatMap((decision) => decision.candidateArticles);

  return Object.freeze({
    sceneId: "scene-explanation",
    conceptIds: Object.freeze(decisions.map((decision) => decision.conceptId)),
    decisions: Object.freeze([...decisions]),
    candidateArticles: Object.freeze([...candidates]),
    rankedCandidateArticles: Object.freeze([...candidates]),
    primaryArticle: primaryDecision?.primaryArticle ?? null,
    secondaryArticles: Object.freeze([]),
    supportingArticles: Object.freeze([]),
    knowledgeSource: "academy",
    confidence: 0.9,
    executionTimeMs: 0,
  });
}

function buildState(): ReturnType<typeof createSceneAnalysisState> {
  const evidence = buildEvidence("يا كلب");
  const concept = buildConceptRecord("profanity", "Profanity", evidence.id, "critical");
  const legalDecision = buildLegalDecision("legal-profanity", "profanity", 4, getPolicyArticle(4)?.title_ar ?? "الألفاظ النابية", evidence.id);
  const evidenceCollection = buildEvidenceCollection([evidence]);
  const conceptCollection = buildConceptCollection([concept]);
  const legalDecisionCollection = buildLegalDecisionCollection([legalDecision]);

  return freezeSceneAnalysisState({
    ...createSceneAnalysisState({ sceneId: "scene-explanation", sceneText: "يا كلب" }),
    sceneModel: Object.freeze({
      sceneId: "scene-explanation",
      rawSceneText: "يا كلب",
      normalizedSceneText: "يا كلب",
      heading: Object.freeze({ raw: "INT. HOUSE - NIGHT", sceneType: "interior", location: "HOUSE", timeOfDay: "NIGHT" }),
      lines: Object.freeze([]),
      sentences: Object.freeze([]),
      dialogueLines: Object.freeze([]),
      actionLines: Object.freeze([]),
      characters: Object.freeze([]),
      summary: "Grounded scene summary.",
    }),
    evidenceCollection,
    evidenceSpans: Object.freeze([evidence]),
    primaryEvidenceSpanId: evidence.id,
    primaryEvidenceText: evidence.text,
    primaryEvidenceReason: "primary evidence",
    conceptCollection,
    detectedConcepts: Object.freeze([{
      conceptId: concept.conceptId,
      label: concept.label,
      knowledgeDomains: concept.knowledgeDomains,
      evidenceSpanIds: concept.evidenceSpanIds,
      confidence: concept.confidence,
      rationale: concept.rationale,
    }]),
    legalDecisionCollection,
    legalCandidateArticles: legalDecisionCollection.candidateArticles,
    legalPrimaryArticle: legalDecision.primaryArticle,
    legalSecondaryArticles: legalDecisionCollection.secondaryArticles,
    legalSupportingArticles: legalDecisionCollection.supportingArticles,
    candidateArticles: legalDecisionCollection.candidateArticles,
    rankedCandidateArticles: legalDecisionCollection.rankedCandidateArticles,
    primaryArticle: legalDecisionCollection.primaryArticle,
    secondaryArticles: legalDecisionCollection.secondaryArticles,
  });
}

function testExplanationCollectionIsGrounded(): void {
  const state = buildState();
  const next = createExplanationNode()(state);
  const explanationCollection = next.explanationCollection;

  assert.ok(explanationCollection);
  assert.equal(explanationCollection?.explanations.length, 1);
  assert.equal(explanationCollection?.validationResult.status, "pass");
  assert.equal(explanationCollection?.primaryExplanation?.summary.includes("يا كلب"), true);
  assert.equal(explanationCollection?.primaryExplanation?.summary.includes("Profanity"), true);
  assert.equal(explanationCollection?.primaryExplanation?.summary.includes(getPolicyArticle(4)?.title_ar ?? "الألفاظ النابية"), true);
  assert.equal(next.explanation?.summary, explanationCollection?.primaryExplanation?.summary ?? null);
}

function testExplanationCollectionHandlesMultipleDecisions(): void {
  const evidence = buildEvidence("سأقتلك يا رجل", "evidence-1");
  const concepts = buildConceptCollection([
    buildConceptRecord("threat", "Threat", evidence.id, "high"),
    buildConceptRecord("violence", "Violence", evidence.id, "critical"),
  ]);
  const legalDecisions = buildLegalDecisionCollection([
    buildLegalDecision("legal-threat", "threat", 13, getPolicyArticle(13)?.title_ar ?? "العنف الأسري", evidence.id),
    buildLegalDecision("legal-violence", "violence", 6, getPolicyArticle(6)?.title_ar ?? "الاعتداء", evidence.id),
  ]);

  const collection = buildExplanationCollection({
    sceneId: "scene-multi",
    sceneSummary: "Grounded scene summary.",
    evidenceCollection: buildEvidenceCollection([evidence]),
    conceptCollection: concepts,
    legalDecisionCollection: legalDecisions,
  });

  assert.equal(collection.explanations.length, 2);
  assert.equal(collection.primaryExplanationId !== null, true);
  assert.equal(collection.validationResult.status, "pass");
}

function testValidatorRejectsHallucination(): void {
  const invalid: ExplanationRecord = Object.freeze({
    id: "invalid-1",
    legalDecisionId: "legal-profanity",
    conceptId: "profanity",
    evidenceId: "evidence-1",
    title: "Profanity → الألفاظ النابية",
    summary: 'Grounded evidence "يا كلب" expresses Profanity, but another scene with مريم changes the outcome.',
    reasoning: Object.freeze([
      "Evidence: يا كلب",
      "Concept: Profanity (profanity)",
      "Article: 4 (الألفاظ النابية)",
      "Reason: another scene appears later.",
    ]),
    recommendedAction: "Delete",
    confidence: 0.9,
  });

  const validation = validateExplanationCollection({
    evidenceCollection: buildEvidenceCollection([buildEvidence("يا كلب")]),
    conceptCollection: buildConceptCollection([buildConceptRecord("profanity", "Profanity", "evidence-1", "critical")]),
    legalDecisionCollection: buildLegalDecisionCollection([buildLegalDecision("legal-profanity", "profanity", 4, getPolicyArticle(4)?.title_ar ?? "الألفاظ النابية", "evidence-1")]),
    explanations: Object.freeze([invalid]),
  });

  assert.equal(validation.status, "reject");
  assert.equal(validation.rejectedReasons.includes("references_other_scene"), true);
  assert.equal(validation.rejectedReasons.includes("hallucination_detected"), true);
}

function testValidatorRejectsUnsupportedClaim(): void {
  const invalid: ExplanationRecord = Object.freeze({
    id: "invalid-2",
    legalDecisionId: "legal-profanity",
    conceptId: "profanity",
    evidenceId: "evidence-1",
    title: "Profanity → الألفاظ النابية",
    summary: "This scene secretly shows Violence that never appears in the evidence.",
    reasoning: Object.freeze([
      "Concept: Profanity (profanity)",
      "Article: 4 (الألفاظ النابية)",
      "Reason: Violence is implied.",
    ]),
    recommendedAction: "Delete",
    confidence: 0.9,
  });

  const validation = validateExplanationCollection({
    evidenceCollection: buildEvidenceCollection([buildEvidence("يا كلب")]),
    conceptCollection: buildConceptCollection([
      buildConceptRecord("profanity", "Profanity", "evidence-1", "critical"),
      buildConceptRecord("violence", "Violence", "evidence-1", "high"),
    ]),
    legalDecisionCollection: buildLegalDecisionCollection([
      buildLegalDecision("legal-profanity", "profanity", 4, getPolicyArticle(4)?.title_ar ?? "الألفاظ النابية", "evidence-1"),
      buildLegalDecision("legal-violence", "violence", 6, getPolicyArticle(6)?.title_ar ?? "العنف", "evidence-1"),
    ]),
    explanations: Object.freeze([invalid]),
  });

  assert.equal(validation.status, "reject");
  assert.equal(validation.rejectedReasons.includes("unsupported_claim"), true);
  assert.equal(validation.rejectedReasons.includes("new_concept_mentioned"), true);
}

function testExplanationEngineIsDeterministic(): void {
  const state = buildState();
  const left = createExplanationNode()(state);
  const right = createExplanationNode()(state);

  assert.deepEqual(
    {
      ...left.explanationCollection,
      executionTimeMs: 0,
    },
    {
      ...right.explanationCollection,
      executionTimeMs: 0,
    },
  );
  assert.deepEqual(left.explanation, right.explanation);
}

function main(): void {
  testExplanationCollectionIsGrounded();
  testExplanationCollectionHandlesMultipleDecisions();
  testValidatorRejectsHallucination();
  testValidatorRejectsUnsupportedClaim();
  testExplanationEngineIsDeterministic();
  console.log("\nAll V4 explanation engine tests passed.");
}

main();
