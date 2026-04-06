import { buildContextWindows } from "./segmenter.js";
import { arbitrateContext, type HybridFindingLike } from "./contextArbiter.js";
import { reasonPolicyAtScriptLevel } from "./policyReasoner.js";
import { applyDecisionPolicy } from "./decisionPolicy.js";
import { attachLegalLinkMetadata } from "./legalMapper.js";
import { runDeepAuditorPass } from "./deepAuditor.js";

export type HybridPipelineResult = {
  findings: HybridFindingLike[];
  metrics: {
    candidateCount: number;
    afterContextCount: number;
    contextOkCount: number;
    needsReviewCount: number;
    violationCount: number;
  };
};

export async function runHybridContextPipeline(args: {
  findings: HybridFindingLike[];
  fullText: string | null;
  deepAuditorEnabled?: boolean;
  auditorContext?: string | null;
  signal?: AbortSignal;
}): Promise<HybridPipelineResult> {
  const spans = args.findings.map((f) => ({
    start: Math.max(0, f.start_offset_global ?? 0),
    end: Math.max(Math.max(0, f.start_offset_global ?? 0), f.end_offset_global ?? (f.start_offset_global ?? 0)),
  }));
  const windows = buildContextWindows(args.fullText, spans);
  const withWindows = args.findings.map((f, i) => ({ ...f, context_window_id: f.context_window_id ?? windows[i]?.id ?? null }));
  const context = arbitrateContext(withWindows, windows);
  const policy = reasonPolicyAtScriptLevel(context, args.fullText);
  const decided = applyDecisionPolicy(policy.findings);
  const withLegal = attachLegalLinkMetadata(decided);
  const final = await runDeepAuditorPass({
    findings: withLegal,
    fullText: args.fullText,
    enabled: args.deepAuditorEnabled,
    auditorContext: args.auditorContext,
    signal: args.signal,
  });
  const contextOkCount = final.filter((f) => f.final_ruling === "context_ok").length;
  const needsReviewCount = final.filter((f) => f.final_ruling === "needs_review").length;
  const violationCount = final.filter((f) => f.final_ruling === "violation").length;
  return {
    findings: final,
    metrics: {
      candidateCount: args.findings.length,
      afterContextCount: final.length,
      contextOkCount,
      needsReviewCount,
      violationCount,
    },
  };
}
