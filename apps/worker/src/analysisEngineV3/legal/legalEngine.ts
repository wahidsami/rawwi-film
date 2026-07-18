import { createLegalContextResult } from "./legalContext.js";
import { createLegalDecision, finalizeLegalDecision } from "./legalDecision.js";
import { createLegalEvidenceResult } from "./legalEvidence.js";
import type { LegalModule } from "./legalModule.js";
import type { LegalModuleInput } from "./legalTypes.js";
import { LegalModuleLoader } from "./legalModuleLoader.js";
import type { LegalDecision } from "./legalDecision.js";
import type { ReviewerDecisionContext, ReviewerDecisionEvaluationInput } from "./reviewerDecisionTypes.js";

export type LegalEngineInput = Readonly<{
  moduleId: string;
  intelligence: LegalModuleInput["intelligence"];
  reviewerDecision?: ReviewerDecisionContext | null;
}>;

export class LegalEngine {
  constructor(private readonly loader: LegalModuleLoader) {}

  evaluate(input: LegalEngineInput): LegalDecision {
    const module = this.loader.load(input.moduleId);
    if (!module) {
      return createLegalDecision({
        moduleId: input.moduleId,
        moduleTitle: "Unknown module",
        articleIds: [],
        applies: false,
        status: "reject",
        reason: `No legal module registered for ${input.moduleId}.`,
        confidence: 0,
        semantic: input.intelligence.semantic,
        narrative: input.intelligence.narrative,
        evidence: createLegalEvidenceResult(input.intelligence.evidence),
        context: createLegalContextResult(input.intelligence.context),
        exceptions: [],
        finding: null,
        trace: ["module_lookup_failed"],
      });
    }

    return evaluateWithModule(module, input);
  }
}

export function createLegalEngine(loader: LegalModuleLoader): LegalEngine {
  return new LegalEngine(loader);
}

export function evaluateWithModule(module: LegalModule, input: LegalEngineInput): LegalDecision {
  const moduleInput: ReviewerDecisionEvaluationInput = {
    moduleId: input.moduleId,
    intelligence: input.intelligence,
    reviewerDecision: input.reviewerDecision ?? null,
  };

  if (!module.applies(moduleInput)) {
    return finalizeLegalDecision(
      createLegalDecision({
        moduleId: module.id,
        moduleTitle: module.title,
        articleIds: [...module.articleIds],
        applies: false,
        status: "reject",
        reason: "Module does not apply to the supplied semantic and context objects.",
        confidence: 0,
        semantic: input.intelligence.semantic,
        narrative: input.intelligence.narrative,
        evidence: createLegalEvidenceResult(input.intelligence.evidence),
        context: createLegalContextResult(input.intelligence.context),
        exceptions: [],
        finding: null,
        trace: ["applies=false"],
      }),
    );
  }

  const preliminaryDecision = module.evaluate(moduleInput);
  const exceptions = module.exceptions(moduleInput, preliminaryDecision);
  const appliedExceptions = exceptions.filter((exception) => exception.applies);
  const exceptionReason = appliedExceptions.map((exception) => exception.reason);

  const finalStatus = !preliminaryDecision.applies
    ? preliminaryDecision.status
    : appliedExceptions.length > 0 && preliminaryDecision.status === "reject"
      ? "needs_review"
      : preliminaryDecision.status;

  const mitigatedDecision = createLegalDecision({
    ...preliminaryDecision,
    applies: preliminaryDecision.applies,
    status: finalStatus,
    exceptions,
    finding: preliminaryDecision.finding,
    reason: [...new Set([preliminaryDecision.reason, ...exceptionReason].filter(Boolean))].join(" | "),
    trace: [
      ...preliminaryDecision.trace,
      ...exceptions.map((exception) => `exception:${exception.code}:${exception.disposition}:${String(exception.applies)}`),
      appliedExceptions.length > 0 ? "finding_built" : "finding_skipped",
    ],
  });

  const finding = finalStatus === "reject" ? null : module.buildFinding(moduleInput, mitigatedDecision, exceptions);

  const decision = createLegalDecision({
    ...preliminaryDecision,
    applies: true,
    status: finalStatus,
    exceptions,
    finding,
    reason: mitigatedDecision.reason,
    trace: mitigatedDecision.trace,
  });

  return finalizeLegalDecision(decision);
}
