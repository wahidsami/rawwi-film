import { buildContextWindows } from "./segmenter.js";
import { arbitrateContext, type HybridFindingLike } from "./contextArbiter.js";
import { reasonPolicyAtScriptLevel } from "./policyReasoner.js";
import { applyDecisionPolicy } from "./decisionPolicy.js";
import { attachLegalLinkMetadata } from "./legalMapper.js";
import { runDeepAuditorPass } from "./deepAuditor.js";
import { runAuditorV3Gate } from "./auditorV3.js";
import { runAuditorV4Gate } from "./auditorV4.js";
import { config } from "../config.js";
import { logger } from "../logger.js";

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
  const deepAudited = await runDeepAuditorPass({
    findings: withLegal,
    fullText: args.fullText,
    enabled: args.deepAuditorEnabled,
    auditorContext: args.auditorContext,
    signal: args.signal,
  });
  const auditorV3Gate = config.AUDITOR_LAYER_VERSION === "v2"
    ? null
    : runAuditorV3Gate({ findings: deepAudited, fullText: args.fullText });
  if (auditorV3Gate) {
    logger.info("Auditor v3 gate applied", auditorV3Gate.metrics);
  }
  const auditorV4Gate = config.AUDITOR_LAYER_VERSION === "v4"
    ? runAuditorV4Gate({ findings: auditorV3Gate?.findings ?? deepAudited, fullText: args.fullText })
    : null;
  if (auditorV4Gate) {
    logger.info("Auditor v4 gate applied", auditorV4Gate.metrics);
  }
  const final = auditorV4Gate?.findings ?? auditorV3Gate?.findings ?? deepAudited;
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
