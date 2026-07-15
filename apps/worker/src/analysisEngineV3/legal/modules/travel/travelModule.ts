import type { LegalDecision } from "../../legalDecision.js";
import type { LegalExceptionResult, LegalFinding } from "../../legalResult.js";
import { createLegalDecision } from "../../legalDecision.js";
import { createLegalExceptionResult, createLegalFinding } from "../../legalResult.js";
import { ReviewerDecisionModuleBase, type ReviewerDecisionModuleInput } from "../../reviewerDecisionModule.js";
import { TRAVEL_DECISION_TREE } from "./travelDecisionTree.js";
import { TRAVEL_RULES } from "./travelRules.js";

export const TRAVEL_MODULE_ID = "v3_13_travel";
const TRAVEL_ARTICLE_IDS = Object.freeze([4, 11, 16, 17]);

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
    input.intelligence.storyMemory ?? "",
    input.intelligence.glossary.title,
    ...input.intelligence.glossary.entries.map((entry) => entry.term),
    ...input.intelligence.glossary.entries.map((entry) => entry.definition ?? ""),
  ].join(" ");
}

function getPrimaryEvidence(input: ReviewerDecisionModuleInput) {
  if (input.intelligence.evidence.primaryCandidateIndex === null) return null;
  return input.intelligence.evidence.candidates[input.intelligence.evidence.primaryCandidateIndex] ?? null;
}

function hasTravelConcept(input: ReviewerDecisionModuleInput): boolean {
  return input.intelligence.conceptContext.conceptIds.some((conceptId) =>
    [
      "travel_reference",
      "travel_destination",
      "travel_origin",
      "travel_abroad",
      "international_travel",
      "domestic_travel",
      "border_crossing",
      "airport",
      "passport",
      "visa",
      "foreign_country",
      "foreign_city",
      "foreign_government_reference",
      "foreign_people",
      "foreign_culture",
      "foreign_religion",
      "foreign_customs",
      "foreign_landmarks",
      "foreign_language",
      "foreign_food",
      "foreign_event",
      "foreign_media",
      "foreign_law",
      "foreign_police",
      "foreign_military",
      "tourism",
      "immigration",
      "emigration",
      "refugee",
      "exile",
      "deportation",
      "international_business",
      "international_study",
      "medical_travel",
      "religious_travel",
      "historical_travel",
      "fictional_travel",
      "dream_travel",
      "flashback_travel",
      "imaginary_country",
      "travel_scene_description",
      "travel_dialogue",
      "travel_observation",
      "country_comparison",
      "country_insult",
      "country_praise",
      "country_mockery",
      "country_stereotype",
      "country_security_reference",
      "country_political_reference",
    ].includes(conceptId),
  );
}

function isTravelAnchor(text: string): boolean {
  return containsAny(text, TRAVEL_RULES.travelAnchors) || containsAny(text, TRAVEL_RULES.directTerms);
}

function isLiteralTravelMeaning(text: string): boolean {
  return (
    containsAny(text, TRAVEL_RULES.directTerms) ||
    containsAny(text, TRAVEL_RULES.travelTerms) ||
    containsAny(text, TRAVEL_RULES.migrationTerms) ||
    containsAny(text, TRAVEL_RULES.countryEvaluationTerms)
  );
}

function isQuoteContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return input.intelligence.flags.quotation === true || containsAny(combinedText, TRAVEL_RULES.quotationSignals);
}

function isEducationalContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return input.intelligence.flags.educational === true || containsAny(combinedText, TRAVEL_RULES.educationalSignals);
}

function isDocumentaryContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return input.intelligence.flags.documentary === true || containsAny(combinedText, TRAVEL_RULES.documentarySignals);
}

function isHistoricalContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return input.intelligence.flags.historical === true || containsAny(combinedText, TRAVEL_RULES.historicalSignals);
}

function isNewsContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return input.intelligence.flags.news === true || containsAny(combinedText, TRAVEL_RULES.newsSignals);
}

function isCourtContext(combinedText: string): boolean {
  return containsAny(combinedText, TRAVEL_RULES.courtSignals);
}

function isReviewContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return (
    input.intelligence.flags.fiction === true ||
    input.intelligence.flags.comedy === true ||
    input.intelligence.flags.satire === true ||
    input.intelligence.flags.dream === true ||
    input.intelligence.flags.flashback === true ||
    containsAny(combinedText, TRAVEL_RULES.fictionSignals) ||
    containsAny(combinedText, TRAVEL_RULES.comedySignals) ||
    containsAny(combinedText, TRAVEL_RULES.satireSignals) ||
    containsAny(combinedText, TRAVEL_RULES.dreamSignals) ||
    containsAny(combinedText, TRAVEL_RULES.flashbackSignals) ||
    containsAny(combinedText, TRAVEL_RULES.rolePlaySignals)
  );
}

function hasCountryEvaluation(combinedText: string): boolean {
  return containsAny(combinedText, TRAVEL_RULES.countryEvaluationTerms);
}

function isTravelObservation(combinedText: string): boolean {
  return containsAny(combinedText, TRAVEL_RULES.travelTerms) || containsAny(combinedText, TRAVEL_RULES.migrationTerms);
}

function inferArticleIds(combinedText: string): readonly number[] {
  const ids = new Set<number>();
  ids.add(11);
  if (containsAny(combinedText, TRAVEL_RULES.migrationTerms)) ids.add(16);
  if (containsAny(combinedText, TRAVEL_RULES.fictionSignals) || containsAny(combinedText, TRAVEL_RULES.dreamSignals) || containsAny(combinedText, TRAVEL_RULES.flashbackSignals)) ids.add(17);
  if (hasCountryEvaluation(combinedText)) ids.add(4);
  return Object.freeze([...ids].sort((left, right) => left - right));
}

function summarizeReason(parts: readonly string[]): string {
  return [...new Set(parts.map((part) => part.trim()).filter(Boolean))].join(" | ");
}

function buildTrace(input: ReviewerDecisionModuleInput, status: LegalDecision["status"], reason: string): readonly string[] {
  const combinedText = buildCombinedText(input);
  return [
    "travel:evidence_exists",
    `travel:admissible:${String(input.intelligence.evidence.admissible)}`,
    `travel:anchor:${String(isTravelAnchor(combinedText) || hasTravelConcept(input) || isLiteralTravelMeaning(combinedText))}`,
    `travel:travel:${String(isTravelObservation(combinedText))}`,
    `travel:migration:${String(containsAny(combinedText, TRAVEL_RULES.migrationTerms))}`,
    `travel:country_eval:${String(hasCountryEvaluation(combinedText))}`,
    `travel:quote:${String(isQuoteContext(input, combinedText))}`,
    `travel:education:${String(isEducationalContext(input, combinedText))}`,
    `travel:documentary:${String(isDocumentaryContext(input, combinedText))}`,
    `travel:historical:${String(isHistoricalContext(input, combinedText))}`,
    `travel:news:${String(isNewsContext(input, combinedText))}`,
    `travel:court:${String(isCourtContext(combinedText))}`,
    `travel:review:${String(isReviewContext(input, combinedText))}`,
    `travel:status:${status}`,
    `travel:reason:${reason}`,
  ];
}

function buildFindingKey(moduleId: string, evidenceText: string, startOffset: number, endOffset: number, articleIds: readonly number[], status: string): string {
  return `${moduleId}:${startOffset}-${endOffset}:${articleIds.join("-")}:${normalizeText(evidenceText)}:${status}`;
}

export class TravelReviewerDecisionModule extends ReviewerDecisionModuleBase {
  constructor() {
    super({
      id: TRAVEL_MODULE_ID,
      title: "السفر والبلدان",
      articleIds: TRAVEL_ARTICLE_IDS,
    });
  }

  applies(input: ReviewerDecisionModuleInput): boolean {
    const primary = getPrimaryEvidence(input);
    if (!primary) return false;
    if (!input.intelligence.evidence.admissible) return false;
    const combinedText = buildCombinedText(input);
    return hasTravelConcept(input) || isTravelAnchor(combinedText) || isLiteralTravelMeaning(primary.text);
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
    const review = isReviewContext(input, combinedText);
    const anchor = hasTravelConcept(input) || isTravelAnchor(combinedText) || isLiteralTravelMeaning(combinedText);
    const countryEval = hasCountryEvaluation(combinedText);
    const travelObservation = isTravelObservation(combinedText);
    const migration = containsAny(combinedText, TRAVEL_RULES.migrationTerms);
    const applies = Boolean(primary && input.intelligence.evidence.admissible && anchor && (countryEval || travelObservation || migration || review));

    const status: LegalDecision["status"] = !primary || !input.intelligence.evidence.admissible || !anchor
      ? "reject"
      : countryEval
        ? "accept"
        : quote || educational || documentary || historical || news || court
          ? "reject"
          : review
            ? "needs_review"
            : travelObservation || migration
              ? "needs_review"
              : "reject";

    const reason = summarizeReason([
      !primary ? "لا توجد أدلة صالحة" : "",
      !input.intelligence.evidence.admissible ? "الأدلة غير مقبولة" : "",
      anchor ? "تم التعرف على سياق سفر أو بلد" : "لا يوجد سياق سفر كافٍ",
      travelObservation ? "توجد إشارة سفر أو حركة" : "",
      migration ? "توجد مؤشرات هجرة أو منفى أو ترحيل" : "",
      countryEval ? "توجد دلالة تقييمية على بلد أو شعب" : "",
      quote ? "السياق اقتباس" : "",
      educational ? "السياق تعليمي" : "",
      documentary ? "السياق وثائقي" : "",
      historical ? "السياق تاريخي" : "",
      news ? "السياق خبري" : "",
      court ? "السياق قضائي" : "",
      review ? "السياق روائي/تمثيلي أو تخييلي ويحتاج مراجعة" : "",
      status === "accept" ? "توجد دلالة تقييمية واضحة" : status === "needs_review" ? "توجد دلالة سفر/بلد ولكن تحتاج مراجعة" : "يُستبعد بسبب الاستثناء أو غياب الأدلة",
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
    const anchor = hasTravelConcept(input) || isTravelAnchor(combinedText) || isLiteralTravelMeaning(primary.text);
    if (!anchor) return [];
    const quote = isQuoteContext(input, combinedText);
    const educational = isEducationalContext(input, combinedText);
    const documentary = isDocumentaryContext(input, combinedText);
    const historical = isHistoricalContext(input, combinedText);
    const news = isNewsContext(input, combinedText);
    const court = isCourtContext(combinedText);
    const review = isReviewContext(input, combinedText);
    const countryEval = hasCountryEvaluation(combinedText);
    const travelObservation = isTravelObservation(combinedText);
    const migration = containsAny(combinedText, TRAVEL_RULES.migrationTerms);

    return [
      createLegalExceptionResult({
        code: "quotation",
        label: "Quotation",
        applies: quote,
        disposition: countryEval ? "allow" : "block",
        reason: "The travel-related phrase is quoted rather than endorsed.",
        confidence: 0.96,
      }),
      createLegalExceptionResult({
        code: "educational",
        label: "Educational usage",
        applies: educational,
        disposition: countryEval ? "allow" : "block",
        reason: "The travel-related phrase is discussed in an educational context.",
        confidence: 0.95,
      }),
      createLegalExceptionResult({
        code: "documentary",
        label: "Documentary usage",
        applies: documentary,
        disposition: countryEval ? "allow" : "block",
        reason: "The travel-related phrase is presented as documentary material.",
        confidence: 0.95,
      }),
      createLegalExceptionResult({
        code: "historical",
        label: "Historical narration",
        applies: historical,
        disposition: countryEval ? "allow" : "block",
        reason: "The travel-related phrase is presented as historical narration.",
        confidence: 0.95,
      }),
      createLegalExceptionResult({
        code: "news",
        label: "News reporting",
        applies: news,
        disposition: countryEval ? "allow" : "block",
        reason: "The travel-related phrase is reported as news.",
        confidence: 0.95,
      }),
      createLegalExceptionResult({
        code: "court",
        label: "Court proceedings",
        applies: court,
        disposition: countryEval ? "allow" : "block",
        reason: "The travel-related phrase appears in a court context.",
        confidence: 0.95,
      }),
      createLegalExceptionResult({
        code: "migration",
        label: "Migration context",
        applies: migration,
        disposition: "allow",
        reason: "The travel-related phrase is about migration, exile, or deportation and remains reviewable.",
        confidence: 0.94,
      }),
      createLegalExceptionResult({
        code: "review",
        label: "Review context",
        applies: review,
        disposition: "allow",
        reason: "The travel-related phrase appears in a fictional, satirical, dreamlike, flashback, or role-play context.",
        confidence: 0.93,
      }),
    ];
  }

  buildFinding(input: ReviewerDecisionModuleInput, decision: LegalDecision, exceptions: readonly LegalExceptionResult[]): LegalFinding | null {
    const primary = getPrimaryEvidence(input);
    if (!primary) return null;
    if (!input.intelligence.evidence.admissible) return null;
    if (!(isTravelAnchor(buildCombinedText(input)) || hasTravelConcept(input) || isLiteralTravelMeaning(primary.text))) return null;
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

export const TRAVEL_MODULE = new TravelReviewerDecisionModule();

export function isTravelEvidenceText(text: string): boolean {
  return isLiteralTravelMeaning(text);
}

export function buildTravelDecisionTree(): readonly import("./travelDecisionTree.js").TravelDecisionStep[] {
  return TRAVEL_DECISION_TREE;
}
