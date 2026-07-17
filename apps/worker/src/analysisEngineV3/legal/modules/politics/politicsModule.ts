import type { LegalDecision } from "../../legalDecision.js";
import type { LegalExceptionResult, LegalFinding } from "../../legalResult.js";
import { createLegalDecision } from "../../legalDecision.js";
import { createLegalExceptionResult, createLegalFinding } from "../../legalResult.js";
import { ReviewerDecisionModuleBase, type ReviewerDecisionModuleInput } from "../../reviewerDecisionModule.js";
import { POLITICS_DECISION_TREE } from "./politicsDecisionTree.js";
import { POLITICS_RULES } from "./politicsRules.js";

export const POLITICS_MODULE_ID = "v3_04_politics";
const POLITICS_ARTICLE_IDS = Object.freeze([4, 8, 12, 17, 18]);

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

function hasPoliticsConcept(input: ReviewerDecisionModuleInput): boolean {
  return input.intelligence.conceptContext.conceptIds.some((conceptId) =>
    [
      "state_reference",
      "government_reference",
      "head_of_state",
      "royal_family",
      "government_institution",
      "public_official",
      "constitutional_reference",
      "state_scene_description",
      "state_observation",
      "national_flag",
      "national_anthem",
      "national_symbol",
      "national_identity",
      "national_unity",
      "patriotism",
      "foreign_government",
      "foreign_leader",
      "international_organization",
      "diplomatic_relations",
      "international_conflict",
      "state_security",
      "national_security",
      "treason",
      "espionage",
      "military_reference",
      "armed_forces",
      "intelligence_services",
      "police_institution",
      "political_dialogue",
      "political_debate",
      "political_satire",
      "political_criticism",
      "political_support",
      "political_glorification",
      "political_encouragement",
      "political_propaganda",
      "political_instruction",
      "political_documentary",
      "political_news",
      "political_historical",
      "political_educational",
      "political_rally",
      "public_demonstration",
      "civil_unrest",
      "riot",
      "revolution_reference",
      "coup_reference",
      "election_reference",
      "voting_reference",
    ].includes(conceptId),
  );
}

function isPoliticsAnchor(text: string): boolean {
  return containsAny(text, POLITICS_RULES.politicsAnchors) || containsAny(text, POLITICS_RULES.directTerms);
}

function isLiteralPoliticsMeaning(text: string): boolean {
  return (
    containsAny(text, POLITICS_RULES.directTerms) ||
    containsAny(text, POLITICS_RULES.stateTerms) ||
    containsAny(text, POLITICS_RULES.identityTerms) ||
    containsAny(text, POLITICS_RULES.unrestTerms) ||
    containsAny(text, POLITICS_RULES.authorityTerms) ||
    containsAny(text, POLITICS_RULES.propagandaTerms)
  );
}

function isQuoteContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return input.intelligence.flags.quotation === true || containsAny(combinedText, POLITICS_RULES.quotationSignals);
}

function isEducationalContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return input.intelligence.flags.educational === true || containsAny(combinedText, POLITICS_RULES.educationalSignals);
}

function isDocumentaryContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return input.intelligence.flags.documentary === true || containsAny(combinedText, POLITICS_RULES.documentarySignals);
}

function isHistoricalContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return input.intelligence.flags.historical === true || containsAny(combinedText, POLITICS_RULES.historicalSignals);
}

function isNewsContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return input.intelligence.flags.news === true || containsAny(combinedText, POLITICS_RULES.newsSignals);
}

function isCourtContext(combinedText: string): boolean {
  return containsAny(combinedText, POLITICS_RULES.courtSignals);
}

function isCondemnationContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return input.intelligence.narrative.condemnation === true || input.intelligence.flags.condemnation === true || containsAny(combinedText, POLITICS_RULES.condemnationSignals);
}

function isReviewContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return (
    input.intelligence.flags.fiction === true ||
    input.intelligence.flags.comedy === true ||
    input.intelligence.flags.satire === true ||
    input.intelligence.flags.dream === true ||
    input.intelligence.flags.flashback === true ||
    containsAny(combinedText, POLITICS_RULES.fictionSignals) ||
    containsAny(combinedText, POLITICS_RULES.comedySignals) ||
    containsAny(combinedText, POLITICS_RULES.satireSignals) ||
    containsAny(combinedText, POLITICS_RULES.dreamSignals) ||
    containsAny(combinedText, POLITICS_RULES.flashbackSignals) ||
    containsAny(combinedText, POLITICS_RULES.rolePlaySignals)
  );
}

function inferArticleIds(combinedText: string): readonly number[] {
  const ids = new Set<number>();
  ids.add(4);
  if (containsAny(combinedText, POLITICS_RULES.stateTerms)) ids.add(8);
  if (containsAny(combinedText, POLITICS_RULES.unrestTerms)) ids.add(12);
  if (containsAny(combinedText, POLITICS_RULES.authorityTerms)) ids.add(17);
  if (containsAny(combinedText, POLITICS_RULES.identityTerms)) ids.add(18);
  return Object.freeze([...ids].sort((left, right) => left - right));
}

function summarizeReason(parts: readonly string[]): string {
  return [...new Set(parts.map((part) => part.trim()).filter(Boolean))].join(" | ");
}

function buildTrace(input: ReviewerDecisionModuleInput, status: LegalDecision["status"], reason: string): readonly string[] {
  const combinedText = buildCombinedText(input);
  return [
    "politics:evidence_exists",
    `politics:admissible:${String(input.intelligence.evidence.admissible)}`,
    `politics:anchor:${String(isPoliticsAnchor(combinedText) || hasPoliticsConcept(input) || isLiteralPoliticsMeaning(combinedText))}`,
    `politics:state:${String(containsAny(combinedText, POLITICS_RULES.stateTerms))}`,
    `politics:identity:${String(containsAny(combinedText, POLITICS_RULES.identityTerms))}`,
    `politics:unrest:${String(containsAny(combinedText, POLITICS_RULES.unrestTerms))}`,
    `politics:authority:${String(containsAny(combinedText, POLITICS_RULES.authorityTerms))}`,
    `politics:propaganda:${String(containsAny(combinedText, POLITICS_RULES.propagandaTerms))}`,
    `politics:quote:${String(isQuoteContext(input, combinedText))}`,
    `politics:education:${String(isEducationalContext(input, combinedText))}`,
    `politics:documentary:${String(isDocumentaryContext(input, combinedText))}`,
    `politics:historical:${String(isHistoricalContext(input, combinedText))}`,
    `politics:news:${String(isNewsContext(input, combinedText))}`,
    `politics:court:${String(isCourtContext(combinedText))}`,
    `politics:condemnation:${String(isCondemnationContext(input, combinedText))}`,
    `politics:review:${String(isReviewContext(input, combinedText))}`,
    `politics:status:${status}`,
    `politics:reason:${reason}`,
  ];
}

function buildFindingKey(moduleId: string, evidenceText: string, startOffset: number, endOffset: number, articleIds: readonly number[], status: string): string {
  return `${moduleId}:${startOffset}-${endOffset}:${articleIds.join("-")}:${normalizeText(evidenceText)}:${status}`;
}

export class PoliticsReviewerDecisionModule extends ReviewerDecisionModuleBase {
  constructor() {
    super({
      id: POLITICS_MODULE_ID,
      title: "السياسة والدولة",
      articleIds: POLITICS_ARTICLE_IDS,
    });
  }

  applies(input: ReviewerDecisionModuleInput): boolean {
    const primary = getPrimaryEvidence(input);
    if (!primary) return false;
    if (!input.intelligence.evidence.admissible) return false;
    const combinedText = buildCombinedText(input);
    return hasPoliticsConcept(input) || isPoliticsAnchor(combinedText) || isLiteralPoliticsMeaning(primary.text);
  }

  evaluate(input: ReviewerDecisionModuleInput): LegalDecision {
    const primary = getPrimaryEvidence(input);
    const combinedText = buildCombinedText(input);
    const quote = isQuoteContext(input, combinedText);
    const educational = isEducationalContext(input, combinedText);
    const documentary = isDocumentaryContext(input, combinedText);
    const historical = isHistoricalContext(input, combinedText);
    const news = isNewsContext(input, combinedText);
    const court = isCourtContext(combinedText);
    const condemnation = isCondemnationContext(input, combinedText);
    const review = isReviewContext(input, combinedText);
    const anchor = hasPoliticsConcept(input) || isPoliticsAnchor(combinedText) || isLiteralPoliticsMeaning(combinedText);
    const propaganda = containsAny(combinedText, POLITICS_RULES.propagandaTerms);
    const unrest = containsAny(combinedText, POLITICS_RULES.unrestTerms);
    const authority = containsAny(combinedText, POLITICS_RULES.authorityTerms);
    const identity = containsAny(combinedText, POLITICS_RULES.identityTerms);
    const state = containsAny(combinedText, POLITICS_RULES.stateTerms);
    const harmful = propaganda || unrest || authority || identity || state;
    const applies = Boolean(primary && input.intelligence.evidence.admissible && anchor && (harmful || review));

    const status: LegalDecision["status"] = !primary || !input.intelligence.evidence.admissible || !anchor
      ? "reject"
      : quote || educational || documentary || historical || news || court || condemnation
        ? "reject"
        : review && !harmful
          ? "needs_review"
          : harmful
            ? "accept"
            : "needs_review";

    const reason = summarizeReason([
      !primary ? "لا توجد أدلة صالحة" : "",
      !input.intelligence.evidence.admissible ? "الأدلة غير مقبولة" : "",
      anchor ? "تم التعرف على سياق سياسي/دولي" : "لا يوجد سياق سياسي كافٍ",
      state ? "توجد مؤشرات دولة أو حكومة" : "",
      identity ? "توجد مؤشرات هوية وطنية أو رموز" : "",
      unrest ? "توجد مؤشرات اضطراب أو شغب" : "",
      authority ? "توجد مؤشرات سلطة أو إساءة استخدام سلطة" : "",
      propaganda ? "توجد مؤشرات دعاية أو تحريض سياسي" : "",
      quote ? "السياق اقتباس" : "",
      educational ? "السياق تعليمي" : "",
      documentary ? "السياق وثائقي" : "",
      historical ? "السياق تاريخي" : "",
      news ? "السياق خبري" : "",
      court ? "السياق قضائي" : "",
      condemnation ? "السياق إدانة" : "",
      review ? "السياق روائي/تمثيلي أو تخييلي ويحتاج مراجعة" : "",
      status === "accept" ? "توجد دلالة سياسية واضحة" : status === "needs_review" ? "توجد دلالة سياسية ولكن تحتاج مراجعة" : "يُستبعد بسبب الاستثناء أو غياب الأدلة",
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
    const anchor = hasPoliticsConcept(input) || isPoliticsAnchor(combinedText) || isLiteralPoliticsMeaning(primary.text);
    if (!anchor) return [];

    const quote = isQuoteContext(input, combinedText);
    const educational = isEducationalContext(input, combinedText);
    const documentary = isDocumentaryContext(input, combinedText);
    const historical = isHistoricalContext(input, combinedText);
    const news = isNewsContext(input, combinedText);
    const court = isCourtContext(combinedText);
    const condemnation = isCondemnationContext(input, combinedText);
    const review = isReviewContext(input, combinedText);
    const harmful = containsAny(combinedText, POLITICS_RULES.propagandaTerms) || containsAny(combinedText, POLITICS_RULES.unrestTerms) || containsAny(combinedText, POLITICS_RULES.authorityTerms) || containsAny(combinedText, POLITICS_RULES.identityTerms) || containsAny(combinedText, POLITICS_RULES.stateTerms);

    return [
      createLegalExceptionResult({
        code: "quotation",
        label: "Quotation",
        applies: quote,
        disposition: harmful ? "allow" : "block",
        reason: "The politics-related phrase is quoted rather than endorsed.",
        confidence: 0.96,
      }),
      createLegalExceptionResult({
        code: "educational",
        label: "Educational usage",
        applies: educational,
        disposition: harmful ? "allow" : "block",
        reason: "The politics-related phrase is discussed in an educational context.",
        confidence: 0.95,
      }),
      createLegalExceptionResult({
        code: "documentary",
        label: "Documentary usage",
        applies: documentary,
        disposition: harmful ? "allow" : "block",
        reason: "The politics-related phrase is presented as documentary material.",
        confidence: 0.95,
      }),
      createLegalExceptionResult({
        code: "historical",
        label: "Historical narration",
        applies: historical,
        disposition: harmful ? "allow" : "block",
        reason: "The politics-related phrase is presented as historical narration.",
        confidence: 0.95,
      }),
      createLegalExceptionResult({
        code: "news",
        label: "News reporting",
        applies: news,
        disposition: harmful ? "allow" : "block",
        reason: "The politics-related phrase is reported as news.",
        confidence: 0.95,
      }),
      createLegalExceptionResult({
        code: "court",
        label: "Court proceedings",
        applies: court,
        disposition: harmful ? "allow" : "block",
        reason: "The politics-related phrase is presented in a court context.",
        confidence: 0.95,
      }),
      createLegalExceptionResult({
        code: "condemnation",
        label: "Condemnation",
        applies: condemnation,
        disposition: harmful ? "allow" : "block",
        reason: "The politics-related phrase is condemned rather than endorsed.",
        confidence: 0.95,
      }),
      createLegalExceptionResult({
        code: "review",
        label: "Review context",
        applies: review,
        disposition: "allow",
        reason: "The politics-related phrase appears in a fictional, satirical, dreamlike, flashback, or role-play context.",
        confidence: 0.93,
      }),
    ];
  }

  buildFinding(input: ReviewerDecisionModuleInput, decision: LegalDecision, exceptions: readonly LegalExceptionResult[]): LegalFinding | null {
    const primary = getPrimaryEvidence(input);
    if (!primary) return null;
    if (!input.intelligence.evidence.admissible) return null;
    if (!(isPoliticsAnchor(buildCombinedText(input)) || hasPoliticsConcept(input) || isLiteralPoliticsMeaning(primary.text))) return null;
    if (exceptions.some((exception) => exception.applies && exception.disposition === "block")) return null;

    return createLegalFinding({
      findingKey: buildFindingKey(this.id, primary.text, primary.startOffset, primary.endOffset, decision.articleIds, decision.status),
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

export const POLITICS_MODULE = new PoliticsReviewerDecisionModule();

export function isPoliticsEvidenceText(text: string): boolean {
  return isLiteralPoliticsMeaning(text);
}

export function buildPoliticsDecisionTree(): readonly import("./politicsDecisionTree.js").PoliticsDecisionStep[] {
  return POLITICS_DECISION_TREE;
}
