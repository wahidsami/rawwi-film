/**
 * Regression tests for the V4 decision provenance graph.
 * Run: node --import tsx apps/worker/src/analysisEngineV4/provenance/decisionProvenance.test.ts
 */
import { strict as assert } from "node:assert";

import type { ConceptCollection, ConceptRecord } from "../concepts/conceptTypes.js";
import type { Evidence, EvidenceCollection } from "../evidence/evidenceTypes.js";
import type { ExplanationCollection, ExplanationRecord } from "../explanations/explanationTypes.js";
import type { LegalDecision, LegalDecisionCollection } from "../legal/legalDecision.js";
import type { VerifiedFinding, VerifiedFindingCollection } from "../judge/qualityJudgeTypes.js";
import {
  buildDecisionProvenanceCollection,
  buildDecisionProvenanceReportAdapter,
} from "./decisionProvenanceBuilder.js";
import { serializeDecisionProvenanceCollection } from "./decisionProvenanceSerializer.js";
import type { DecisionProvenanceCollection } from "./decisionProvenanceTypes.js";

function createPageReferences(text: string) {
  return Object.freeze([
    Object.freeze({ pageNumber: 1, startOffsetPage: 0, endOffsetPage: text.length }),
  ]);
}

function buildEvidence(id: string, text: string, confidence: number): Evidence {
  const pageReferences = createPageReferences(text);
  return Object.freeze({
    id,
    spanId: id,
    sceneId: "scene-provenance",
    eventId: `${id}-event`,
    speaker: "فهد",
    target: null,
    page: 1,
    scene: "Scene for provenance tests.",
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
    conceptIds: Object.freeze([]),
    confidence,
    rationale: Object.freeze([`Evidence ${id}`]),
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

function buildConcept(conceptId: string, label: string, evidenceSpanIds: readonly string[], confidence: number): ConceptRecord {
  return Object.freeze({
    id: `${conceptId}-record`,
    evidenceId: evidenceSpanIds[0] ?? "evidence-1",
    evidenceSpanId: evidenceSpanIds[0] ?? "evidence-1",
    conceptId,
    conceptName: label,
    conceptCategory: conceptId,
    confidence,
    severity: "high",
    targets: Object.freeze([]),
    participants: Object.freeze([]),
    reason: `${label} concept`,
    supportingEvidenceIds: Object.freeze([...evidenceSpanIds]),
    evidenceSpanIds: Object.freeze([...evidenceSpanIds]),
    knowledgeDomains: Object.freeze([conceptId]),
    label,
    rationale: Object.freeze([`${label} rationale`]),
  });
}

function buildArticle(articleId: number, titleAr: string, evidenceSpanIds: readonly string[], score: number) {
  return Object.freeze({
    articleId,
    titleAr,
    matchedKnowledgeDomains: Object.freeze(["profanity"]),
    matchedConceptIds: Object.freeze(["profanity"]),
    evidenceSpanIds: Object.freeze([...evidenceSpanIds]),
    score,
    rationale: Object.freeze([`Article ${articleId}`]),
  });
}

function buildDecision(
  id: string,
  conceptId: string,
  article: ReturnType<typeof buildArticle>,
  secondaryArticles: readonly ReturnType<typeof buildArticle>[],
  confidence: number,
): LegalDecision {
  return Object.freeze({
    id,
    conceptId,
    candidateArticles: Object.freeze([article, ...secondaryArticles]),
    primaryArticle: article,
    secondaryArticles: Object.freeze([...secondaryArticles]),
    mappingReason: `Decision ${id}`,
    mappingConfidence: confidence,
    knowledgeSource: "academy",
  });
}

function buildExplanation(id: string, evidenceId: string, conceptId: string, legalDecisionId: string, summary: string, confidence: number): ExplanationRecord {
  return Object.freeze({
    id,
    legalDecisionId,
    conceptId,
    evidenceId,
    title: `Explanation ${id}`,
    summary,
    reasoning: Object.freeze([summary, `Explanation ${id}`]),
    recommendedAction: "Requires Verification",
    confidence,
  });
}

function buildVerifiedFinding(id: string, evidenceId: string, conceptId: string, legalDecisionId: string, explanationId: string, confidence: number): VerifiedFinding {
  return Object.freeze({
    findingId: id,
    evidenceId,
    conceptId,
    legalDecisionId,
    explanationId,
    verificationResult: "pass",
    verificationReasons: Object.freeze([]),
    overallConfidence: confidence,
  });
}

function freezeCollection<T extends { executionTimeMs: number }>(value: T): T {
  return Object.freeze({
    ...value,
    executionTimeMs: 0,
  });
}

function buildBaseCollections(): Readonly<{
  evidenceCollection: EvidenceCollection;
  conceptCollection: ConceptCollection;
  legalDecisionCollection: LegalDecisionCollection;
  explanationCollection: ExplanationCollection;
  verifiedFindingCollection: VerifiedFindingCollection;
}> {
  const evidence1 = buildEvidence("evidence-1", "يا كلب", 0.93);
  const evidence2 = buildEvidence("evidence-2", "طز فيكم", 0.89);
  const concept = buildConcept("profanity", "Profanity", ["evidence-1", "evidence-2"], 0.95);
  const article = buildArticle(4, "الألفاظ النابية", ["evidence-1", "evidence-2"], 0.9);
  const articleTwo = buildArticle(11, "الإساءة", ["evidence-2"], 0.85);
  const decision = buildDecision("decision-1", concept.conceptId, article, [articleTwo], 0.91);
  const explanation = buildExplanation("explanation-1", evidence1.id, concept.conceptId, decision.id, "Grounded evidence expresses profanity.", 0.88);
  const finding = buildVerifiedFinding("finding-1", evidence1.id, concept.conceptId, decision.id, explanation.id, 0.97);

  return Object.freeze({
    evidenceCollection: freezeCollection({
      sceneId: "scene-provenance",
      evidence: Object.freeze([evidence1, evidence2]),
      primaryEvidenceId: evidence1.id,
      dedupDecisions: Object.freeze([]),
      grounding: Object.freeze({ totalCandidates: 2, groundedCount: 2, unmatchedCount: 0 }),
      executionTimeMs: 0,
    }),
    conceptCollection: freezeCollection({
      sceneId: "scene-provenance",
      evidenceCollectionId: "scene-provenance",
      concepts: Object.freeze([concept]),
      dedupDecisions: Object.freeze([]),
      normalization: Object.freeze([]),
      classificationOutput: Object.freeze([]),
      confidence: concept.confidence,
      executionTimeMs: 0,
    }),
    legalDecisionCollection: freezeCollection({
      sceneId: "scene-provenance",
      conceptIds: Object.freeze([concept.conceptId]),
      decisions: Object.freeze([decision]),
      candidateArticles: Object.freeze([article, articleTwo]),
      rankedCandidateArticles: Object.freeze([article, articleTwo]),
      primaryArticle: article,
      secondaryArticles: Object.freeze([articleTwo]),
      supportingArticles: Object.freeze([]),
      knowledgeSource: "academy",
      confidence: decision.mappingConfidence,
      executionTimeMs: 0,
    }),
    explanationCollection: freezeCollection({
      sceneId: "scene-provenance",
      explanations: Object.freeze([explanation]),
      primaryExplanationId: explanation.id,
      primaryExplanation: explanation,
      prompt: "",
      response: JSON.stringify({ explanations: [explanation] }),
      validationResult: Object.freeze({ status: "pass" as const, rejectedReasons: Object.freeze([]) }),
      confidence: explanation.confidence,
      executionTimeMs: 0,
    }),
    verifiedFindingCollection: freezeCollection({
      sceneId: "scene-provenance",
      verifiedFindings: Object.freeze([finding]),
      primaryVerifiedFindingId: finding.findingId,
      primaryVerifiedFinding: finding,
      ruleEvaluations: Object.freeze([]),
      report: Object.freeze({
        sceneId: "scene-provenance",
        totalFindings: 1,
        passCount: 1,
        rejectCount: 0,
        needsReviewCount: 0,
        duplicateMergedCount: 0,
        overallStatus: "pass" as const,
        overallConfidence: finding.overallConfidence,
        ruleEvaluations: Object.freeze([]),
        rejectionReasons: Object.freeze([]),
      }),
      confidence: finding.overallConfidence,
      executionTimeMs: 0,
    }),
  });
}

function testSingleFindingLineage(): void {
  const collections = buildBaseCollections();
  const provenance = buildDecisionProvenanceCollection({
    sceneId: "scene-provenance",
    evidenceCollection: collections.evidenceCollection,
    conceptCollection: collections.conceptCollection,
    legalDecisionCollection: collections.legalDecisionCollection,
    explanationCollection: collections.explanationCollection,
    verifiedFindingCollection: collections.verifiedFindingCollection,
  });

  assert.equal(provenance.provenance.length, 1);
  assert.deepStrictEqual(provenance.provenance[0]?.executionOrder, [
    "scene:scene-provenance",
    "evidence:evidence-1",
    "evidence:evidence-2",
    "concept:profanity",
    "legalDecision:decision-1",
    "explanation:explanation-1",
    "verifiedFinding:finding-1",
  ]);
  assert.equal(provenance.report.replayableFindingIds[0], "finding-1");
  assert.equal(provenance.graph.nodes.some((node) => node.id === "verifiedFinding:finding-1"), true);
  assert.equal(provenance.graph.edges.some((edge) => edge.fromNodeId === "explanation:explanation-1" && edge.toNodeId === "verifiedFinding:finding-1"), true);

  const first = serializeDecisionProvenanceCollection(provenance);
  const second = serializeDecisionProvenanceCollection(provenance);
  assert.equal(first, second);
}

function testMultipleEvidenceLineage(): void {
  const collections = buildBaseCollections();
  const provenance = buildDecisionProvenanceCollection({
    sceneId: "scene-provenance",
    evidenceCollection: collections.evidenceCollection,
    conceptCollection: collections.conceptCollection,
    legalDecisionCollection: collections.legalDecisionCollection,
    explanationCollection: collections.explanationCollection,
    verifiedFindingCollection: collections.verifiedFindingCollection,
  });

  assert.equal(provenance.provenance[0]?.evidenceIds.length, 2);
  assert.equal(provenance.graph.nodes.filter((node) => node.kind === "evidence").length, 2);
  assert.equal(provenance.graph.nodes.filter((node) => node.kind === "concept").length, 1);
}

function testSharedEvidenceAndConcepts(): void {
  const collections = buildBaseCollections();
  const sharedFinding: VerifiedFinding = Object.freeze({
    findingId: "finding-2",
    evidenceId: "evidence-1",
    conceptId: "profanity",
    legalDecisionId: "decision-1",
    explanationId: "explanation-1",
    verificationResult: "pass",
    verificationReasons: Object.freeze([]),
    overallConfidence: 0.96,
  });

  const verifiedFindingCollection = freezeCollection({
    ...collections.verifiedFindingCollection,
    verifiedFindings: Object.freeze([collections.verifiedFindingCollection.primaryVerifiedFinding!, sharedFinding]),
    primaryVerifiedFindingId: "finding-1",
    primaryVerifiedFinding: collections.verifiedFindingCollection.primaryVerifiedFinding,
    report: Object.freeze({
      ...collections.verifiedFindingCollection.report,
      totalFindings: 2,
      passCount: 2,
      overallConfidence: 0.965,
    }),
    confidence: 0.965,
  });

  const provenance = buildDecisionProvenanceCollection({
    sceneId: "scene-provenance",
    evidenceCollection: collections.evidenceCollection,
    conceptCollection: collections.conceptCollection,
    legalDecisionCollection: collections.legalDecisionCollection,
    explanationCollection: collections.explanationCollection,
    verifiedFindingCollection,
  });

  assert.equal(provenance.provenance.length, 2);
  assert.equal(provenance.graph.nodes.filter((node) => node.kind === "evidence").length, 2);
  assert.equal(provenance.graph.nodes.filter((node) => node.kind === "concept").length, 1);
  assert.equal(provenance.graph.nodes.filter((node) => node.kind === "legalDecision").length, 1);
}

function testReplayChainAndBrokenChainDetection(): void {
  const collections = buildBaseCollections();
  const provenance = buildDecisionProvenanceCollection({
    sceneId: "scene-provenance",
    evidenceCollection: collections.evidenceCollection,
    conceptCollection: collections.conceptCollection,
    legalDecisionCollection: collections.legalDecisionCollection,
    explanationCollection: collections.explanationCollection,
    verifiedFindingCollection: collections.verifiedFindingCollection,
  });

  assert.equal(provenance.report.replayableChains[0]?.path.at(-1), "verifiedFinding:finding-1");

  const brokenReport = buildDecisionProvenanceReportAdapter({
    sceneId: provenance.sceneId,
    provenance: provenance.provenance,
    graph: Object.freeze({
      ...provenance.graph,
      nodes: Object.freeze(provenance.graph.nodes.filter((node) => node.id !== "explanation:explanation-1")),
    }),
  });

  assert.equal(brokenReport.brokenLinkCount > 0, true);
  assert.equal(brokenReport.brokenChainCount > 0, true);
}

function testDeterminism(): void {
  const collections = buildBaseCollections();
  const first = buildDecisionProvenanceCollection({
    sceneId: "scene-provenance",
    evidenceCollection: collections.evidenceCollection,
    conceptCollection: collections.conceptCollection,
    legalDecisionCollection: collections.legalDecisionCollection,
    explanationCollection: collections.explanationCollection,
    verifiedFindingCollection: collections.verifiedFindingCollection,
  });
  const second = buildDecisionProvenanceCollection({
    sceneId: "scene-provenance",
    evidenceCollection: collections.evidenceCollection,
    conceptCollection: collections.conceptCollection,
    legalDecisionCollection: collections.legalDecisionCollection,
    explanationCollection: collections.explanationCollection,
    verifiedFindingCollection: collections.verifiedFindingCollection,
  });

  const normalize = (collection: DecisionProvenanceCollection) => ({
    ...collection,
    executionTimeMs: 0,
  });

  assert.deepStrictEqual(normalize(first), normalize(second));
  assert.equal(serializeDecisionProvenanceCollection(first), serializeDecisionProvenanceCollection(second));
}

function main(): void {
  testSingleFindingLineage();
  console.log("✓ single finding lineage is preserved");
  testMultipleEvidenceLineage();
  console.log("✓ multiple evidence lineage is represented");
  testSharedEvidenceAndConcepts();
  console.log("✓ shared evidence and shared concepts are deduplicated");
  testReplayChainAndBrokenChainDetection();
  console.log("✓ replay chains and broken-chain detection work");
  testDeterminism();
  console.log("✓ provenance serialization is deterministic");
  console.log("\nAll V4 Decision Provenance tests passed.");
}

main();
