import type { LegalDecision } from "../../legalDecision.js";
import type { LegalExceptionResult, LegalFinding } from "../../legalResult.js";
import { createLegalDecision } from "../../legalDecision.js";
import { createLegalExceptionResult, createLegalFinding } from "../../legalResult.js";
import { PROFANITY_DECISION_TREE } from "./profanityDecisionTree.js";
import type { ProfanityDecisionStep } from "./profanityDecisionTree.js";
import { PROFANITY_RULES } from "./profanityRules.js";
import { ReviewerDecisionModuleBase, type ReviewerDecisionModuleInput } from "../../reviewerDecisionModule.js";

export const PROFANITY_MODULE_ID = "v4_11_profanity";

function normalizeText(value: string): string {
  return value
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function containsAny(value: string, terms: readonly string[]): boolean {
  const normalized = normalizeText(value);
  return terms.some((term) => normalized.includes(normalizeText(term)));
}

function getPrimaryEvidence(input: ReviewerDecisionModuleInput) {
  if (input.intelligence.evidence.primaryCandidateIndex === null) return null;
  return input.intelligence.evidence.candidates[input.intelligence.evidence.primaryCandidateIndex] ?? null;
}

function hasProfanityConcept(input: ReviewerDecisionModuleInput): boolean {
  return input.intelligence.conceptContext.conceptIds.includes("profanity");
}

function isLiteralProfanity(evidenceText: string): boolean {
  return containsAny(evidenceText, PROFANITY_RULES.directTerms) || containsAny(evidenceText, PROFANITY_RULES.directPhrases);
}

function isQuoteContext(input: ReviewerDecisionModuleInput): boolean {
  const combined = [
    input.intelligence.semantic.semanticMeaning,
    input.intelligence.semantic.narrativeIntent,
    input.intelligence.narrative.narrativeIntent,
    input.intelligence.narrative.narrativeVoice,
    input.intelligence.context.narrativeContext,
    input.intelligence.context.localContext,
    input.intelligence.evidence.candidates.map((candidate) => candidate.text).join(" "),
  ].join(" ");
  return containsAny(combined, PROFANITY_RULES.quotationSignals);
}

function isEducationalContext(input: ReviewerDecisionModuleInput): boolean {
  const combined = [
    input.intelligence.semantic.semanticMeaning,
    input.intelligence.semantic.narrativeIntent,
    input.intelligence.narrative.narrativeIntent,
    input.intelligence.context.narrativeContext,
    input.intelligence.context.localContext,
  ].join(" ");
  return containsAny(combined, PROFANITY_RULES.educationalSignals);
}

function isCondemnationContext(input: ReviewerDecisionModuleInput): boolean {
  const combined = [
    input.intelligence.semantic.semanticMeaning,
    input.intelligence.semantic.narrativeIntent,
    input.intelligence.narrative.narrativeIntent,
    input.intelligence.narrative.condemnation ? "condemnation" : "",
    input.intelligence.context.narrativeContext,
    input.intelligence.context.localContext,
  ].join(" ");
  return input.intelligence.narrative.condemnation === true || containsAny(combined, PROFANITY_RULES.condemnationSignals);
}

function buildTrace(input: ReviewerDecisionModuleInput, status: LegalDecision["status"], reason: string): readonly string[] {
  return [
    "profanity:evidence_exists",
    `profanity:admissible:${String(input.intelligence.evidence.admissible)}`,
    `profanity:concept:${String(hasProfanityConcept(input))}`,
    `profanity:literal:${String(isLiteralProfanity(getPrimaryEvidence(input)?.text ?? ""))}`,
    `profanity:quote:${String(isQuoteContext(input))}`,
    `profanity:education:${String(isEducationalContext(input))}`,
    `profanity:condemnation:${String(isCondemnationContext(input))}`,
    `profanity:status:${status}`,
    `profanity:reason:${reason}`,
  ];
}

function buildFindingKey(moduleId: string, evidenceText: string, startOffset: number, endOffset: number, status: string): string {
  return `${moduleId}:${startOffset}-${endOffset}:${normalizeText(evidenceText)}:${status}`;
}

function summarizeReason(parts: readonly string[]): string {
  return [...new Set(parts.map((part) => part.trim()).filter(Boolean))].join(" | ");
}

export class ProfanityReviewerDecisionModule extends ReviewerDecisionModuleBase {
  constructor() {
    super({
      id: PROFANITY_MODULE_ID,
      title: "الألفاظ النابية",
      articleIds: [4, 5, 17],
    });
  }

  applies(input: ReviewerDecisionModuleInput): boolean {
    const primary = getPrimaryEvidence(input);
    if (!primary) return false;
    if (!input.intelligence.evidence.admissible) return false;
    return hasProfanityConcept(input) || isLiteralProfanity(primary.text);
  }

  evaluate(input: ReviewerDecisionModuleInput): LegalDecision {
    const primary = getPrimaryEvidence(input);
    const quote = isQuoteContext(input);
    const educational = isEducationalContext(input);
    const condemnation = isCondemnationContext(input);
    const concept = hasProfanityConcept(input);
    const literal = primary ? isLiteralProfanity(primary.text) : false;

    const shouldBlock = quote || educational || condemnation;
    const status = !primary || !input.intelligence.evidence.admissible || !(literal || concept) ? "reject" : shouldBlock ? "reject" : "accept";
    const reason = summarizeReason([
      !primary ? "لا توجد أدلة صالحة" : "",
      !input.intelligence.evidence.admissible ? "الأدلة غير مقبولة" : "",
      concept ? "تم التعرف على مفهوم السبّ" : "",
      literal ? "توجد ألفاظ نابية حرفية" : "لا توجد ألفاظ نابية حرفية",
      quote ? "السياق اقتباس" : "",
      educational ? "السياق تعليمي" : "",
      condemnation ? "السياق إدانة" : "",
      shouldBlock ? "يُستبعد بسبب الاستثناء" : "لا يوجد استثناء مانع",
    ]);

    return createLegalDecision({
      moduleId: this.id,
      moduleTitle: this.title,
      articleIds: [...this.articleIds],
      applies: Boolean(primary && input.intelligence.evidence.admissible && (literal || concept)),
      status,
      reason,
      confidence: Math.min(
        input.intelligence.semantic.confidence,
        input.intelligence.narrative.confidence,
        input.intelligence.evidence.confidence,
        input.intelligence.context.confidence,
      ),
      semantic: input.intelligence.semantic,
      narrative: input.intelligence.narrative,
      evidence: input.intelligence.evidence,
      context: input.intelligence.context,
      exceptions: [],
      finding: null,
      trace: buildTrace(input, status, reason),
    });
  }

  exceptions(input: ReviewerDecisionModuleInput, decision: LegalDecision): readonly LegalExceptionResult[] {
    const primary = getPrimaryEvidence(input);
    const literal = primary ? isLiteralProfanity(primary.text) : false;
    if (!primary || !input.intelligence.evidence.admissible || !(literal || hasProfanityConcept(input))) return [];
    const intelligence = input.intelligence;

    const quote = isQuoteContext(input);
    const educational = isEducationalContext(input);
    const condemnation = isCondemnationContext(input);

    return [
      createLegalExceptionResult({
        code: "quotation",
        label: "Quotation",
        applies: quote,
        disposition: "block",
        reason: "The profane phrase is presented as quoted speech.",
        confidence: 0.98,
      }),
      createLegalExceptionResult({
        code: "educational",
        label: "Educational usage",
        applies: educational,
        disposition: "block",
        reason: "The profane phrase is discussed in an educational or explanatory context.",
        confidence: 0.97,
      }),
      createLegalExceptionResult({
        code: "condemnation",
        label: "Condemnation",
        applies: condemnation,
        disposition: "block",
        reason: "The profane phrase is condemned rather than endorsed.",
        confidence: 0.97,
      }),
      createLegalExceptionResult({
        code: "dialogue",
        label: "Dialogue",
        applies: intelligence.narrative.dialogue === true && !quote && !educational && !condemnation,
        disposition: "allow",
        reason: "The profanity appears in dialogue and remains a direct use.",
        confidence: 0.95,
      }),
      createLegalExceptionResult({
        code: "narration",
        label: "Narration",
        applies: intelligence.narrative.narration === true && !quote && !educational && !condemnation,
        disposition: "allow",
        reason: "The profanity appears in narration and remains a direct use.",
        confidence: 0.95,
      }),
    ];
  }

  buildFinding(input: ReviewerDecisionModuleInput, decision: LegalDecision, exceptions: readonly LegalExceptionResult[]): LegalFinding | null {
    const primary = getPrimaryEvidence(input);
    if (!primary) return null;
    if (!input.intelligence.evidence.admissible) return null;
    if (!(isLiteralProfanity(primary.text) || hasProfanityConcept(input))) return null;
    if (exceptions.some((exception) => exception.applies && exception.disposition === "block")) return null;

    return createLegalFinding({
      findingKey: buildFindingKey(this.id, primary.text, primary.startOffset, primary.endOffset, decision.status),
      moduleId: this.id,
      moduleTitle: this.title,
      articleIds: [...this.articleIds],
      status: decision.status,
      reason: decision.reason,
      confidence: decision.confidence,
      semantic: input.intelligence.semantic,
      narrative: input.intelligence.narrative,
      evidence: primary,
      context: input.intelligence.context,
      exceptionCodes: exceptions.filter((exception) => exception.applies).map((exception) => exception.code),
    });
  }
}

export const PROFANITY_MODULE = new ProfanityReviewerDecisionModule();

export function isProfanityEvidenceText(text: string): boolean {
  return isLiteralProfanity(text);
}

export function buildProfanityDecisionTree(): readonly ProfanityDecisionStep[] {
  return PROFANITY_DECISION_TREE;
}
