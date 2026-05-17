import type { SceneAnalysisResult } from "./sceneEventSchema.js";
import { evaluateClauseRules } from "./ruleMatrix.js";

export type PolicyDecisionStatus = "violation" | "needs_review" | "rejected";

export interface PolicyDecision {
  decision_id: string;
  source_event_id: string;
  regulation_clause: string;
  status: PolicyDecisionStatus;
  reason_code: string;
  reason_text_ar: string;
  evidence_snippet: string;
}

/**
 * Phase-1 deterministic policy stub.
 * This is intentionally conservative and can be expanded clause-by-clause in Phase 3.
 */
export function runPolicyEngine(input: SceneAnalysisResult): PolicyDecision[] {
  const out: PolicyDecision[] = [];

  for (const event of input.events) {
    out.push(...evaluateClauseRules(event));
  }

  return out;
}
