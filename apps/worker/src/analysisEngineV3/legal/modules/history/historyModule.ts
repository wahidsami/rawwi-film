import type { LegalDecision } from "../../legalDecision.js";
import type { LegalExceptionResult, LegalFinding } from "../../legalResult.js";
import { createLegalDecision } from "../../legalDecision.js";
import { createLegalExceptionResult, createLegalFinding } from "../../legalResult.js";
import { ReviewerDecisionModuleBase, type ReviewerDecisionModuleInput } from "../../reviewerDecisionModule.js";
import { HISTORY_DECISION_TREE } from "./historyDecisionTree.js";
import type { HistoryDecisionStep } from "./historyDecisionTree.js";
import { HISTORY_RULES } from "./historyRules.js";

export const HISTORY_MODULE_ID = "v3_04_history";
const HISTORY_ARTICLE_IDS = Object.freeze([16]);

function normalizeText(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
}

function containsAny(value: string, terms: readonly string[]): boolean {
  const normalized = normalizeText(value);
  return terms.some((term) => normalized.includes(normalizeText(term)));
}

function buildCombinedText(input: ReviewerDecisionModuleInput): string {
  return [
    input.intelligence.semantic.semanticMeaning,
    input.intelligence.semantic.narrativeIntent,
    input.intelligence.narrative.narrativeIntent,
    input.intelligence.narrative.narrativeVoice,
    input.intelligence.context.narrativeContext,
    input.intelligence.context.localContext,
    input.intelligence.context.chunkContext,
    input.intelligence.context.neighboringSentences.join(" "),
    input.intelligence.evidence.candidates.map((candidate) => candidate.text).join(" "),
  ].join(" ");
}

function getPrimaryEvidence(input: ReviewerDecisionModuleInput) {
  if (input.intelligence.evidence.primaryCandidateIndex === null) return null;
  return input.intelligence.evidence.candidates[input.intelligence.evidence.primaryCandidateIndex] ?? null;
}

function hasHistoryConcept(input: ReviewerDecisionModuleInput): boolean {
  return input.intelligence.conceptContext.conceptIds.some((conceptId) =>
    [
      "historical_person",
      "historical_leader",
      "historical_event",
      "historical_battle",
      "historical_conflict",
      "historical_documentary",
      "historical_education",
      "historical_news",
      "historical_reference",
      "historical_quote",
      "historical_narration",
      "historical_fiction",
      "alternate_history",
      "historical_distortion",
      "historical_revisionism",
      "historical_context",
      "historical_timeline",
      "historical_character",
      "historical_government",
      "historical_society",
      "historical_tradition",
      "historical_custom",
      "historical_culture",
      "historical_identity",
    ].includes(conceptId),
  );
}

function isHistoryAnchor(text: string): boolean {
  return containsAny(text, HISTORY_RULES.historyAnchors);
}

function isLiteralHistoryClaim(text: string): boolean {
  return containsAny(text, HISTORY_RULES.fabricatedTerms);
}

function isQuoteContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return input.intelligence.flags.quotation === true || containsAny(combinedText, HISTORY_RULES.quotationSignals);
}

function isEducationalContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return input.intelligence.flags.educational === true || containsAny(combinedText, HISTORY_RULES.educationalSignals);
}

function isDocumentaryContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return input.intelligence.flags.documentary === true || containsAny(combinedText, HISTORY_RULES.documentarySignals);
}

function isHistoricalContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return input.intelligence.flags.historical === true || containsAny(combinedText, HISTORY_RULES.historicalSignals);
}

function isNewsContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return input.intelligence.flags.news === true || containsAny(combinedText, HISTORY_RULES.newsSignals);
}

function isReviewContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return (
    input.intelligence.flags.fiction === true ||
    input.intelligence.flags.comedy === true ||
    input.intelligence.flags.satire === true ||
    input.intelligence.flags.dream === true ||
    input.intelligence.flags.flashback === true ||
    containsAny(combinedText, HISTORY_RULES.fictionSignals) ||
    containsAny(combinedText, HISTORY_RULES.satireSignals) ||
    containsAny(combinedText, HISTORY_RULES.dreamSignals) ||
    containsAny(combinedText, HISTORY_RULES.flashbackSignals) ||
    containsAny(combinedText, HISTORY_RULES.rolePlaySignals)
  );
}

function isFalseDocumentaryContext(combinedText: string): boolean {
  return containsAny(combinedText, HISTORY_RULES.documentarySignals) && containsAny(combinedText, HISTORY_RULES.fabricatedTerms);
}

function isFalseHistoricalContext(combinedText: string): boolean {
  return containsAny(combinedText, HISTORY_RULES.historyAnchors) && containsAny(combinedText, HISTORY_RULES.fabricatedTerms);
}

function inferArticleIds(): readonly number[] {
  return Object.freeze([16]);
}

function summarizeReason(parts: readonly string[]): string {
  return [...new Set(parts.map((part) => part.trim()).filter(Boolean))].join(" | ");
}

function buildTrace(input: ReviewerDecisionModuleInput, status: LegalDecision["status"], reason: string): readonly string[] {
  const combinedText = buildCombinedText(input);
  return [
    "history:evidence_exists",
    `history:admissible:${String(input.intelligence.evidence.admissible)}`,
    `history:anchor:${String(isHistoryAnchor(combinedText) || hasHistoryConcept(input) || isLiteralHistoryClaim(combinedText))}`,
    `history:fabricated:${String(containsAny(combinedText, HISTORY_RULES.fabricatedTerms))}`,
    `history:documentary:${String(isDocumentaryContext(input, combinedText))}`,
    `history:historical:${String(isHistoricalContext(input, combinedText))}`,
    `history:news:${String(isNewsContext(input, combinedText))}`,
    `history:quote:${String(isQuoteContext(input, combinedText))}`,
    `history:education:${String(isEducationalContext(input, combinedText))}`,
    `history:review:${String(isReviewContext(input, combinedText))}`,
    `history:status:${status}`,
    `history:reason:${reason}`,
  ];
}

function buildFindingKey(moduleId: string, evidenceText: string, startOffset: number, endOffset: number, articleIds: readonly number[], status: string): string {
  return `${moduleId}:${startOffset}-${endOffset}:${articleIds.join("-")}:${normalizeText(evidenceText)}:${status}`;
}

export class HistoryReviewerDecisionModule extends ReviewerDecisionModuleBase {
  constructor() {
    super({
      id: HISTORY_MODULE_ID,
      title: "الدقة التاريخية",
      articleIds: HISTORY_ARTICLE_IDS,
    });
  }

  applies(input: ReviewerDecisionModuleInput): boolean {
    const primary = getPrimaryEvidence(input);
    if (!primary) return false;
    if (!input.intelligence.evidence.admissible) return false;
    const combinedText = buildCombinedText(input);
    return hasHistoryConcept(input) || isHistoryAnchor(combinedText) || isLiteralHistoryClaim(primary.text);
  }

  evaluate(input: ReviewerDecisionModuleInput): LegalDecision {
    const primary = getPrimaryEvidence(input);
    const combinedText = buildCombinedText(input);
    const quote = isQuoteContext(input, combinedText);
    const educational = isEducationalContext(input, combinedText);
    const documentary = isDocumentaryContext(input, combinedText);
    const historical = isHistoricalContext(input, combinedText);
    const news = isNewsContext(input, combinedText);
    const review = isReviewContext(input, combinedText);
    const anchor = hasHistoryConcept(input) || isHistoryAnchor(combinedText) || isLiteralHistoryClaim(combinedText);
    const fabricated = containsAny(combinedText, HISTORY_RULES.fabricatedTerms);
    const falseDocumentary = isFalseDocumentaryContext(combinedText);
    const falseHistorical = isFalseHistoricalContext(combinedText);
    const harmful = fabricated || falseDocumentary || falseHistorical;
    const applies = Boolean(primary && input.intelligence.evidence.admissible && anchor && harmful);

    const status: LegalDecision["status"] = !primary || !input.intelligence.evidence.admissible || !anchor
      ? "reject"
      : !harmful
        ? "reject"
        : review
          ? "needs_review"
          : "accept";

    const reason = summarizeReason([
      !primary ? "لا توجد أدلة صالحة" : "",
      !input.intelligence.evidence.admissible ? "الأدلة غير مقبولة" : "",
      anchor ? "تم التعرف على سياق تاريخي" : "لا يوجد سياق تاريخي كافٍ",
      fabricated ? "توجد مؤشرات تاريخ مفبرك أو محرف" : "",
      falseDocumentary ? "توجد مؤشرات ادعاء وثائقي كاذب" : "",
      falseHistorical ? "توجد مؤشرات اقتباس أو عرض تاريخي مضلل" : "",
      quote ? "السياق اقتباس" : "",
      educational ? "السياق تعليمي" : "",
      documentary ? "السياق وثائقي" : "",
      historical ? "السياق تاريخي" : "",
      news ? "السياق خبري" : "",
      review ? "السياق روائي/تمثيلي أو تخييلي ويحتاج مراجعة" : "",
      status === "accept" ? "لا يوجد استثناء مانع" : status === "needs_review" ? "توجد مؤشرات مراجعة" : "يُستبعد بسبب الاستثناء أو غياب الأدلة",
    ]);

    return createLegalDecision({
      moduleId: this.id,
      moduleTitle: this.title,
      articleIds: [...this.articleIds],
      applies,
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
    if (!primary || !input.intelligence.evidence.admissible) return [];

    const combinedText = buildCombinedText(input);
    const anchor = hasHistoryConcept(input) || isHistoryAnchor(combinedText) || isLiteralHistoryClaim(primary.text);
    if (!anchor) return [];

    const quote = isQuoteContext(input, combinedText);
    const educational = isEducationalContext(input, combinedText);
    const documentary = isDocumentaryContext(input, combinedText);
    const historical = isHistoricalContext(input, combinedText);
    const news = isNewsContext(input, combinedText);
    const review = isReviewContext(input, combinedText);

    return [
      createLegalExceptionResult({
        code: "quotation",
        label: "Quotation",
        applies: quote,
        disposition: "allow",
        reason: "The historical claim is quoted; the quoted claim itself may still be the false historical claim.",
        confidence: 0.95,
      }),
      createLegalExceptionResult({
        code: "educational",
        label: "Educational usage",
        applies: educational,
        disposition: "allow",
        reason: "The historical claim is discussed in an educational context; the factual accuracy still matters.",
        confidence: 0.95,
      }),
      createLegalExceptionResult({
        code: "documentary",
        label: "Documentary usage",
        applies: documentary,
        disposition: "allow",
        reason: "The historical claim is presented in documentary form; false documentary claims remain relevant.",
        confidence: 0.95,
      }),
      createLegalExceptionResult({
        code: "historical",
        label: "Historical usage",
        applies: historical,
        disposition: "allow",
        reason: "The historical claim is part of historical narration; distortion still matters if present.",
        confidence: 0.95,
      }),
      createLegalExceptionResult({
        code: "news",
        label: "News reporting",
        applies: news,
        disposition: "allow",
        reason: "The historical claim is reported as news; false documentary claims still matter if present.",
        confidence: 0.95,
      }),
      createLegalExceptionResult({
        code: "fiction",
        label: "Fictional context",
        applies: review && input.intelligence.flags.fiction === true,
        disposition: "review",
        reason: "The historical claim appears inside fiction and needs reviewer confirmation.",
        confidence: 0.9,
      }),
      createLegalExceptionResult({
        code: "roleplay",
        label: "Role-play context",
        applies: review && containsAny(combinedText, HISTORY_RULES.rolePlaySignals),
        disposition: "review",
        reason: "The historical claim appears inside role-play and needs reviewer confirmation.",
        confidence: 0.9,
      }),
      createLegalExceptionResult({
        code: "dream",
        label: "Dream sequence",
        applies: review && input.intelligence.flags.dream === true,
        disposition: "review",
        reason: "The historical claim appears inside a dream sequence and needs reviewer confirmation.",
        confidence: 0.9,
      }),
      createLegalExceptionResult({
        code: "flashback",
        label: "Flashback",
        applies: review && input.intelligence.flags.flashback === true,
        disposition: "review",
        reason: "The historical claim appears inside a flashback and needs reviewer confirmation.",
        confidence: 0.9,
      }),
      createLegalExceptionResult({
        code: "satire",
        label: "Satire",
        applies: review && input.intelligence.flags.satire === true,
        disposition: "review",
        reason: "The historical claim appears inside satire and needs reviewer confirmation.",
        confidence: 0.9,
      }),
    ];
  }

  buildFinding(input: ReviewerDecisionModuleInput, decision: LegalDecision, exceptions: readonly LegalExceptionResult[]): LegalFinding | null {
    const primary = getPrimaryEvidence(input);
    if (!primary) return null;
    if (!input.intelligence.evidence.admissible) return null;
    const combinedText = buildCombinedText(input);
    const anchor = hasHistoryConcept(input) || isHistoryAnchor(combinedText) || isLiteralHistoryClaim(primary.text);
    if (!anchor) return null;

    const fabricated = containsAny(combinedText, HISTORY_RULES.fabricatedTerms);
    const falseDocumentary = isFalseDocumentaryContext(combinedText);
    const falseHistorical = isFalseHistoricalContext(combinedText);
    if (!(fabricated || falseDocumentary || falseHistorical)) return null;

    const articleIds = inferArticleIds();
    return createLegalFinding({
      findingKey: buildFindingKey(this.id, primary.text, primary.startOffset, primary.endOffset, articleIds, decision.status),
      moduleId: this.id,
      moduleTitle: this.title,
      articleIds,
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

export const HISTORY_MODULE = new HistoryReviewerDecisionModule();

export function isHistoryEvidenceText(text: string): boolean {
  return isLiteralHistoryClaim(text) || isHistoryAnchor(text);
}

export function buildHistoryDecisionTree(): readonly HistoryDecisionStep[] {
  return HISTORY_DECISION_TREE;
}
