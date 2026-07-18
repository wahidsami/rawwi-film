import type { LegalDecision } from "../legal/legalDecision.js";
import type { V3ReasonedDecisionArticleEvaluation } from "../provider/providerTypes.js";

export type V3PolicyDisposition = "exception_applied" | "reportable";

export type V3PolicyAssessment = Readonly<{
  articleId: number;
  disposition: V3PolicyDisposition;
  exceptionCodes: readonly string[];
  reasons: readonly string[];
  confidence: number;
}>;

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return Number(value.toFixed(6));
}

function normalizeText(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
}

function collectAppliedExceptionCodes(decision: LegalDecision): readonly string[] {
  return decision.exceptions
    .filter((exception) => exception.applies)
    .map((exception) => exception.code)
    .filter((value, index, array) => array.indexOf(value) === index);
}

function collectPolicyReasons(decision: LegalDecision): readonly string[] {
  const reasons = new Set<string>();
  for (const exception of decision.exceptions) {
    if (exception.applies) {
      reasons.add(exception.reason);
      reasons.add(exception.code);
    }
  }

  if (decision.narrative.condemnation) reasons.add("condemnation");
  if (decision.narrative.historicalContext) reasons.add("historical_context");
  if (decision.narrative.comedy) reasons.add("comedy");
  if (decision.narrative.satire) reasons.add("satire");
  if (decision.narrative.dialogue) reasons.add("dialogue");
  if (decision.narrative.narration) reasons.add("narration");
  if (decision.narrative.documentary) reasons.add("documentary");
  if (decision.narrative.instruction) reasons.add("instruction");

  return Object.freeze([...reasons].filter((value) => value.trim().length > 0));
}

export function evaluatePolicyDisposition(
  decision: LegalDecision,
  evaluation: V3ReasonedDecisionArticleEvaluation,
): V3PolicyAssessment {
  const exceptionCodes = collectAppliedExceptionCodes(decision);
  const reasons = collectPolicyReasons(decision);
  const disposition: V3PolicyDisposition = exceptionCodes.length > 0 || reasons.length > 0
    ? "exception_applied"
    : "reportable";

  return Object.freeze({
    articleId: evaluation.articleId,
    disposition,
    exceptionCodes: Object.freeze(exceptionCodes),
    reasons,
    confidence: clampConfidence(Math.max(decision.confidence, evaluation.confidence)),
  });
}

export function evaluatePolicyDispositionSummary(decision: LegalDecision): Readonly<{
  disposition: V3PolicyDisposition;
  exceptionCodes: readonly string[];
  reasons: readonly string[];
}> {
  const exceptionCodes = collectAppliedExceptionCodes(decision);
  const reasons = collectPolicyReasons(decision);
  return Object.freeze({
    disposition: exceptionCodes.length > 0 || reasons.length > 0 ? "exception_applied" : "reportable",
    exceptionCodes: Object.freeze(exceptionCodes),
    reasons,
  });
}

export function normalizePolicyRole(disposition: V3PolicyDisposition): string {
  return disposition;
}

