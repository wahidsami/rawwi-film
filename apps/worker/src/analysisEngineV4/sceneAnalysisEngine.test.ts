/**
 * Regression tests for the V4 scene analysis graph.
 * Run: node --import tsx apps/worker/src/analysisEngineV4/sceneAnalysisEngine.test.ts
 */
import { strict as assert } from "node:assert";

import { createSceneAnalysisEngine, createNormalizeSceneStateNode, createSceneAnalysisState } from "./index.js";
import { buildSceneAnalysisTrace } from "./sceneAnalysisTraceViewer.js";

function testNodeUpdatesAreImmutable(): void {
  const initial = createSceneAnalysisState({
    sceneId: "scene-immutable",
    sceneText: "حاضر. فهد يتمتم: يا كلب",
  });

  const normalize = createNormalizeSceneStateNode();
  const normalized = normalize(initial);

  assert.notEqual(normalized, initial);
  assert.equal(initial.normalizedSceneText, "");
  assert.equal(normalized.normalizedSceneText, "حاضر. فهد يتمتم: يا كلب");
  assert.equal(Object.isFrozen(initial), true);
  assert.equal(Object.isFrozen(normalized), true);
  assert.equal(initial.trace.length, 0);
  assert.equal(normalized.trace.length, 0);
}

async function testGraphProducesTraceAndEvidenceFirstState(): Promise<void> {
  const engine = createSceneAnalysisEngine();
  const initialText = "حاضر. فهد يتمتم: يا كلب";
  const result = await engine.run("scene-trace", initialText);

  assert.equal(result.status, "complete");
  assert.equal(result.trace.length, 8);
  assert.equal(result.sentences.length > 0, true);
  assert.equal(result.evidenceSpans.length > 0, true);
  assert.equal(result.primaryEvidenceText?.includes("يا كلب"), true);
  assert.equal(result.explanation?.groundedEvidence?.includes("يا كلب"), true);
  assert.equal(result.conceptCollection?.concepts.some((concept) => concept.conceptId === "profanity"), true);
  assert.equal(result.detectedConcepts.some((concept) => concept.conceptId === "profanity"), true);
  assert.equal(result.knowledgeDomains.includes("profanity"), true);
  assert.equal(result.semanticSceneModel?.summary, result.sceneModel?.summary);
  assert.equal((result.semanticSceneResponse?.length ?? 0) > 0, true);
  assert.equal(result.candidateArticles.length > 0, true);
  assert.equal(result.rankedCandidateArticles.length > 0, true);
  assert.equal(result.primaryArticle?.articleId, 4);
  assert.equal(result.findingTruth?.evidenceId, result.primaryEvidenceSpanId);
  assert.equal(result.findingTruth?.rawEvidenceText, result.primaryEvidenceText);
  const trace = buildSceneAnalysisTrace(result);
  assert.equal(trace.verificationSummary?.overallPreservationRate, 100);
  assert.equal(result.candidateAtoms.length, 0);
  assert.equal(result.rankedCandidateAtoms.length, 0);
  assert.equal(result.sceneModel !== null, true);
  assert.equal(result.trace[0]?.node, "understand_scene");
  assert.equal(result.trace[0]?.changedKeys.includes("sceneModel"), true);
  assert.equal(result.trace[1]?.node, "interpret_scene");
  assert.equal(result.trace[1]?.changedKeys.includes("semanticSceneSummary"), true);
  assert.equal(result.trace[2]?.node, "candidate_evidence");
  assert.equal(result.trace[2]?.changedKeys.includes("evidenceSpanCount"), true);
  assert.equal(result.trace[3]?.node, "concept_classification");
  assert.equal(result.trace[3]?.changedKeys.includes("detectedConceptIds"), true);
  assert.equal(result.trace[3]?.changedKeys.includes("conceptCollectionCount"), true);
  assert.equal(result.trace[4]?.node, "legal_mapping");
  assert.equal(result.trace[4]?.changedKeys.includes("legalDecisionCollectionCount"), true);
  assert.equal(result.trace[5]?.node, "explanation");
  assert.equal(result.trace[5]?.changedKeys.includes("explanationSummary"), true);
  assert.equal(result.trace[6]?.node, "quality_judge");
  assert.equal(result.trace[6]?.changedKeys.includes("qualityJudgmentStatus"), true);
  assert.equal(result.trace.at(-1)?.node, "finalize");
  assert.equal(result.trace.every((entry) => entry.verification.verificationResult === "pass"), true);
  assert.equal(trace.steps.every((entry) => entry.verification.verificationResult === "pass"), true);
  assert.equal(result.trace.some((entry) => entry.changedKeys.length > 0), true);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(initialText, "حاضر. فهد يتمتم: يا كلب");
}

async function testEvidenceIdentityIsPreservedAcrossDownstreamNodes(): Promise<void> {
  const engine = createSceneAnalysisEngine();
  const result = await engine.run("scene-evidence-identity", "حاضر. فهد يتمتم: يا كلب");
  const evidence = result.evidenceSpans[0] ?? null;

  assert.ok(evidence);
  assert.equal(result.primaryEvidenceSpanId, evidence?.id ?? null);
  assert.equal(result.primaryEvidenceText, evidence?.text ?? null);
  assert.equal(result.primaryEvidenceReason?.includes("Smallest grounded evidence span selected"), true);

  const trace = buildSceneAnalysisTrace(result);
  const candidateEvidenceIndex = trace.steps.findIndex((entry) => entry.node === "candidate_evidence");
  assert.equal(candidateEvidenceIndex >= 0, true);

  const candidateEvidenceStep = trace.steps[candidateEvidenceIndex];
  assert.ok(candidateEvidenceStep);
  assert.equal(candidateEvidenceStep?.beforeView.evidence.length, 0);
  assert.equal(candidateEvidenceStep?.afterView.evidence[0], evidence);
  assert.equal(candidateEvidenceStep?.afterView.evidence[0]?.id, evidence?.id);
  assert.equal(candidateEvidenceStep?.afterView.evidence[0]?.startOffset, evidence?.startOffset);
  assert.equal(candidateEvidenceStep?.afterView.evidence[0]?.endOffset, evidence?.endOffset);

  for (const entry of trace.steps.slice(candidateEvidenceIndex + 1)) {
    assert.equal(entry.beforeView.evidence[0], evidence);
    assert.equal(entry.afterView.evidence[0], evidence);
    assert.equal(entry.beforeView.evidence[0]?.id, evidence?.id);
    assert.equal(entry.afterView.evidence[0]?.id, evidence?.id);
    assert.equal(entry.beforeView.evidence[0]?.startOffset, evidence?.startOffset);
    assert.equal(entry.afterView.evidence[0]?.endOffset, evidence?.endOffset);
  }

  assert.equal(result.conceptCollection?.concepts.every((concept) => concept.evidenceId === evidence?.id), true);
  assert.equal(result.conceptCollection?.concepts.every((concept) => concept.evidenceSpanId === evidence?.id || concept.evidenceSpanIds.includes(evidence?.id ?? "")), true);
  assert.equal(result.legalDecisionCollection?.decisions.every((decision) => decision.candidateArticles.every((article) => article.evidenceSpanIds.includes(evidence?.id ?? ""))), true);
  assert.equal(result.explanationCollection?.primaryExplanation?.evidenceId, evidence?.id ?? null);
  assert.equal(result.explanation?.groundedEvidence, evidence?.text ?? null);
  assert.equal(result.verifiedFindingCollection?.verifiedFindings.every((finding) => finding.evidenceId === evidence?.id), true);
  assert.equal(trace.decisionProvenanceCollection?.provenance.every((item) => item.evidenceIds.includes(evidence?.id ?? "")), true);
}

async function testTruthVerificationSummaryIsDeterministic(): Promise<void> {
  const engine = createSceneAnalysisEngine();
  const result = await engine.run("scene-truth-summary", "حاضر. فهد يتمتم: يا كلب");
  const second = await engine.run("scene-truth-summary", "حاضر. فهد يتمتم: يا كلب");

  assert.deepStrictEqual(result.findingTruth, second.findingTruth);
  assert.deepStrictEqual(result.verificationSummary, second.verificationSummary);
}

async function testDisabledEngineReturnsInitialState(): Promise<void> {
  const engine = createSceneAnalysisEngine({ enabled: false });
  const result = await engine.run("scene-disabled", "كس امة");

  assert.equal(result.sceneId, "scene-disabled");
  assert.equal(result.sceneText, "كس امة");
  assert.equal(result.status, "pending");
  assert.equal(result.trace.length, 0);
  assert.equal(result.normalizedSceneText, "");
}

async function main(): Promise<void> {
  testNodeUpdatesAreImmutable();
  await testGraphProducesTraceAndEvidenceFirstState();
  await testEvidenceIdentityIsPreservedAcrossDownstreamNodes();
  await testTruthVerificationSummaryIsDeterministic();
  console.log("✓ evidence identity is preserved across downstream V4 nodes");
  await testDisabledEngineReturnsInitialState();
  console.log("\nAll V4 scene analysis graph tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
