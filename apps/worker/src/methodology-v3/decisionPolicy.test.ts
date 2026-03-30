import assert from "node:assert/strict";
import { applyDecisionPolicy } from "./decisionPolicy.js";
import type { HybridFindingLike } from "./contextArbiter.js";

function baseFinding(overrides: Partial<HybridFindingLike> = {}): HybridFindingLike {
  return {
    source: "ai",
    article_id: 5,
    atom_id: "5-1",
    severity: "high",
    confidence: 0.9,
    title_ar: "مخالفة محتوى",
    description_ar: "",
    evidence_snippet: "نص تجريبي",
    start_offset_global: 0,
    end_offset_global: 10,
    depiction_type: "mention",
    speaker_role: "unknown",
    context_window_id: null,
    context_confidence: 0.7,
    lexical_confidence: 0.5,
    policy_confidence: 0.5,
    rationale_ar: "",
    final_ruling: null,
    narrative_consequence: "unresolved",
    ...overrides,
  };
}

function run() {
  const [needsReview] = applyDecisionPolicy([
    baseFinding({
      depiction_type: "mention",
      narrative_consequence: "unknown",
      severity: "high",
      context_confidence: 0.55,
    }),
  ]);
  assert.equal(needsReview.final_ruling, "needs_review");
  assert.equal(needsReview.severity, "medium");

  const [contextOk] = applyDecisionPolicy([
    baseFinding({
      depiction_type: "condemnation",
      narrative_consequence: "punished",
      severity: "high",
      context_confidence: 0.9,
    }),
  ]);
  assert.equal(contextOk.final_ruling, "context_ok");
  assert.equal(contextOk.severity, "low");

  const [hardBlacklist] = applyDecisionPolicy([
    baseFinding({
      source: "lexicon_mandatory",
      lexical_confidence: 0.99,
      depiction_type: "mention",
      narrative_consequence: "neutralized",
      severity: "high",
    }),
  ]);
  assert.equal(hardBlacklist.final_ruling, "violation");
  assert.equal(hardBlacklist.severity, "high");

  console.log("All decision policy tests passed.");
}

run();
