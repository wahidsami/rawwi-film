import type { LegalDecision } from "../../legalDecision.js";
import type { LegalExceptionResult, LegalFinding } from "../../legalResult.js";
import { createLegalDecision } from "../../legalDecision.js";
import { createLegalExceptionResult, createLegalFinding } from "../../legalResult.js";
import { ReviewerDecisionModuleBase, type ReviewerDecisionModuleInput } from "../../reviewerDecisionModule.js";
import { CRIME_DECISION_TREE } from "./crimeDecisionTree.js";
import { CRIME_RULES } from "./crimeRules.js";

export const CRIME_MODULE_ID = "v3_09_crime";
const CRIME_ARTICLE_IDS = Object.freeze([4, 9, 12, 13, 14]);

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

function hasCrimeConcept(input: ReviewerDecisionModuleInput): boolean {
  return input.intelligence.conceptContext.conceptIds.some((conceptId) =>
    [
      "crime_reference",
      "crime_attempt",
      "crime_conspiracy",
      "crime_planning",
      "crime_execution",
      "crime_glorification",
      "crime_encouragement",
      "crime_instruction",
      "crime_normalization",
      "crime_reward",
      "crime_coverup",
      "crime_escape",
      "crime_evasion",
      "crime_theft",
      "crime_robbery",
      "crime_burglary",
      "crime_fraud",
      "crime_forgery",
      "crime_blackmail",
      "crime_extortion",
      "crime_bribery",
      "crime_corruption",
      "crime_money_laundering",
      "crime_kidnapping",
      "crime_hostage",
      "crime_murder",
      "crime_attempted_murder",
      "crime_assault",
      "crime_property_damage",
      "crime_vandalism",
      "crime_arson",
      "crime_human_trafficking",
      "crime_smuggling",
      "crime_organized_crime",
      "crime_cybercrime",
      "crime_identity_theft",
      "crime_documentary",
      "crime_news",
      "crime_historical",
      "crime_educational",
      "crime_police_investigation",
      "crime_court_case",
      "crime_false_accusation",
      "crime_confession",
      "crime_scene_description",
      "crime_dialogue",
      "crime_observation",
      "crime_reported_event",
    ].includes(conceptId),
  );
}

function isCrimeAnchor(text: string): boolean {
  return containsAny(text, CRIME_RULES.crimeAnchors) || containsAny(text, CRIME_RULES.directTerms);
}

function isLiteralCrimeMeaning(text: string): boolean {
  return (
    containsAny(text, CRIME_RULES.directTerms) ||
    containsAny(text, CRIME_RULES.violentTerms) ||
    containsAny(text, CRIME_RULES.propertyTerms) ||
    containsAny(text, CRIME_RULES.financialTerms) ||
    containsAny(text, CRIME_RULES.organizedTerms)
  );
}

function isQuoteContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return input.intelligence.flags.quotation === true || containsAny(combinedText, CRIME_RULES.quotationSignals);
}

function isEducationalContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return input.intelligence.flags.educational === true || containsAny(combinedText, CRIME_RULES.educationalSignals);
}

function isDocumentaryContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return input.intelligence.flags.documentary === true || containsAny(combinedText, CRIME_RULES.documentarySignals);
}

function isHistoricalContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return input.intelligence.flags.historical === true || containsAny(combinedText, CRIME_RULES.historicalSignals);
}

function isNewsContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return input.intelligence.flags.news === true || containsAny(combinedText, CRIME_RULES.newsSignals);
}

function isCourtContext(combinedText: string): boolean {
  return containsAny(combinedText, CRIME_RULES.courtSignals);
}

function isPoliceContext(combinedText: string): boolean {
  return containsAny(combinedText, CRIME_RULES.policeSignals);
}

function isCondemnationContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return input.intelligence.narrative.condemnation === true || input.intelligence.flags.condemnation === true || containsAny(combinedText, CRIME_RULES.condemnationSignals);
}

function isReviewContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return (
    input.intelligence.flags.fiction === true ||
    input.intelligence.flags.comedy === true ||
    input.intelligence.flags.satire === true ||
    input.intelligence.flags.dream === true ||
    input.intelligence.flags.flashback === true ||
    containsAny(combinedText, CRIME_RULES.fictionSignals) ||
    containsAny(combinedText, CRIME_RULES.comedySignals) ||
    containsAny(combinedText, CRIME_RULES.satireSignals) ||
    containsAny(combinedText, CRIME_RULES.dreamSignals) ||
    containsAny(combinedText, CRIME_RULES.flashbackSignals) ||
    containsAny(combinedText, CRIME_RULES.rolePlaySignals)
  );
}

function inferArticleIds(combinedText: string): readonly number[] {
  const ids = new Set<number>();
  ids.add(4);
  if (containsAny(combinedText, CRIME_RULES.violentTerms)) ids.add(9);
  if (containsAny(combinedText, CRIME_RULES.propertyTerms)) ids.add(12);
  if (containsAny(combinedText, CRIME_RULES.financialTerms)) ids.add(13);
  if (containsAny(combinedText, CRIME_RULES.organizedTerms)) ids.add(14);
  return Object.freeze([...ids].sort((left, right) => left - right));
}

function summarizeReason(parts: readonly string[]): string {
  return [...new Set(parts.map((part) => part.trim()).filter(Boolean))].join(" | ");
}

function buildTrace(input: ReviewerDecisionModuleInput, status: LegalDecision["status"], reason: string): readonly string[] {
  const combinedText = buildCombinedText(input);
  return [
    "crime:evidence_exists",
    `crime:admissible:${String(input.intelligence.evidence.admissible)}`,
    `crime:anchor:${String(isCrimeAnchor(combinedText) || hasCrimeConcept(input) || isLiteralCrimeMeaning(combinedText))}`,
    `crime:violent:${String(containsAny(combinedText, CRIME_RULES.violentTerms))}`,
    `crime:property:${String(containsAny(combinedText, CRIME_RULES.propertyTerms))}`,
    `crime:financial:${String(containsAny(combinedText, CRIME_RULES.financialTerms))}`,
    `crime:organized:${String(containsAny(combinedText, CRIME_RULES.organizedTerms))}`,
    `crime:quote:${String(isQuoteContext(input, combinedText))}`,
    `crime:education:${String(isEducationalContext(input, combinedText))}`,
    `crime:documentary:${String(isDocumentaryContext(input, combinedText))}`,
    `crime:historical:${String(isHistoricalContext(input, combinedText))}`,
    `crime:news:${String(isNewsContext(input, combinedText))}`,
    `crime:police:${String(isPoliceContext(combinedText))}`,
    `crime:court:${String(isCourtContext(combinedText))}`,
    `crime:condemnation:${String(isCondemnationContext(input, combinedText))}`,
    `crime:review:${String(isReviewContext(input, combinedText))}`,
    `crime:status:${status}`,
    `crime:reason:${reason}`,
  ];
}

function buildFindingKey(moduleId: string, evidenceText: string, startOffset: number, endOffset: number, articleIds: readonly number[], status: string): string {
  return `${moduleId}:${startOffset}-${endOffset}:${articleIds.join("-")}:${normalizeText(evidenceText)}:${status}`;
}

export class CrimeReviewerDecisionModule extends ReviewerDecisionModuleBase {
  constructor() {
    super({
      id: CRIME_MODULE_ID,
      title: "الجريمة",
      articleIds: CRIME_ARTICLE_IDS,
    });
  }

  applies(input: ReviewerDecisionModuleInput): boolean {
    const primary = getPrimaryEvidence(input);
    if (!primary) return false;
    if (!input.intelligence.evidence.admissible) return false;
    const combinedText = buildCombinedText(input);
    return hasCrimeConcept(input) || isCrimeAnchor(combinedText) || isLiteralCrimeMeaning(primary.text);
  }

  evaluate(input: ReviewerDecisionModuleInput): LegalDecision {
    const primary = getPrimaryEvidence(input);
    const combinedText = buildCombinedText(input);
    const quote = isQuoteContext(input, combinedText);
    const educational = isEducationalContext(input, combinedText);
    const documentary = isDocumentaryContext(input, combinedText);
    const historical = isHistoricalContext(input, combinedText);
    const news = isNewsContext(input, combinedText);
    const police = isPoliceContext(combinedText);
    const court = isCourtContext(combinedText);
    const condemnation = isCondemnationContext(input, combinedText);
    const review = isReviewContext(input, combinedText);
    const anchor = hasCrimeConcept(input) || isCrimeAnchor(combinedText) || isLiteralCrimeMeaning(combinedText);
    const violent = containsAny(combinedText, CRIME_RULES.violentTerms);
    const property = containsAny(combinedText, CRIME_RULES.propertyTerms);
    const financial = containsAny(combinedText, CRIME_RULES.financialTerms);
    const organized = containsAny(combinedText, CRIME_RULES.organizedTerms);
    const harmful = violent || property || financial || organized;
    const applies = Boolean(primary && input.intelligence.evidence.admissible && anchor && (harmful || police || court || review));

    const status: LegalDecision["status"] = !primary || !input.intelligence.evidence.admissible || !anchor
      ? "reject"
      : quote || educational || documentary || historical || news || condemnation
        ? "reject"
        : police || court
          ? "needs_review"
          : review && !harmful
            ? "needs_review"
            : harmful
              ? "accept"
              : "reject";

    const reason = summarizeReason([
      !primary ? "لا توجد أدلة صالحة" : "",
      !input.intelligence.evidence.admissible ? "الأدلة غير مقبولة" : "",
      anchor ? "تم التعرف على سياق جنائي" : "لا يوجد سياق جنائي كافٍ",
      violent ? "توجد مؤشرات عنف أو جريمة عنيفة" : "",
      property ? "توجد مؤشرات جريمة ضد الممتلكات" : "",
      financial ? "توجد مؤشرات جريمة مالية" : "",
      organized ? "توجد مؤشرات جريمة منظمة أو تخطيط" : "",
      police ? "السياق تحقيق شرطي" : "",
      court ? "السياق قضائي" : "",
      quote ? "السياق اقتباس" : "",
      educational ? "السياق تعليمي" : "",
      documentary ? "السياق وثائقي" : "",
      historical ? "السياق تاريخي" : "",
      news ? "السياق خبري" : "",
      condemnation ? "السياق إدانة" : "",
      review ? "السياق روائي/تمثيلي أو تخييلي ويحتاج مراجعة" : "",
      status === "accept" ? "توجد دلالة جنائية واضحة" : status === "needs_review" ? "توجد دلالة جنائية وتحتاج مراجعة" : "يُستبعد بسبب الاستثناء أو غياب الأدلة",
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
    const anchor = hasCrimeConcept(input) || isCrimeAnchor(combinedText) || isLiteralCrimeMeaning(primary.text);
    if (!anchor) return [];

    const quote = isQuoteContext(input, combinedText);
    const educational = isEducationalContext(input, combinedText);
    const documentary = isDocumentaryContext(input, combinedText);
    const historical = isHistoricalContext(input, combinedText);
    const news = isNewsContext(input, combinedText);
    const police = isPoliceContext(combinedText);
    const court = isCourtContext(combinedText);
    const condemnation = isCondemnationContext(input, combinedText);
    const review = isReviewContext(input, combinedText);
    const harmful = containsAny(combinedText, CRIME_RULES.violentTerms) || containsAny(combinedText, CRIME_RULES.propertyTerms) || containsAny(combinedText, CRIME_RULES.financialTerms) || containsAny(combinedText, CRIME_RULES.organizedTerms);

    return [
      createLegalExceptionResult({
        code: "quotation",
        label: "Quotation",
        applies: quote,
        disposition: harmful ? "allow" : "block",
        reason: "The crime-related phrase is quoted rather than endorsed.",
        confidence: 0.96,
      }),
      createLegalExceptionResult({
        code: "educational",
        label: "Educational usage",
        applies: educational,
        disposition: harmful ? "allow" : "block",
        reason: "The crime-related phrase is discussed in an educational context.",
        confidence: 0.95,
      }),
      createLegalExceptionResult({
        code: "documentary",
        label: "Documentary usage",
        applies: documentary,
        disposition: harmful ? "allow" : "block",
        reason: "The crime-related phrase is presented as documentary material.",
        confidence: 0.95,
      }),
      createLegalExceptionResult({
        code: "historical",
        label: "Historical narration",
        applies: historical,
        disposition: harmful ? "allow" : "block",
        reason: "The crime-related phrase is presented as historical narration.",
        confidence: 0.95,
      }),
      createLegalExceptionResult({
        code: "news",
        label: "News reporting",
        applies: news,
        disposition: harmful ? "allow" : "block",
        reason: "The crime-related phrase is reported as news.",
        confidence: 0.95,
      }),
      createLegalExceptionResult({
        code: "police",
        label: "Police investigation",
        applies: police,
        disposition: "review",
        reason: "The crime-related phrase appears in a police investigation context.",
        confidence: 0.93,
      }),
      createLegalExceptionResult({
        code: "court",
        label: "Court proceedings",
        applies: court,
        disposition: "review",
        reason: "The crime-related phrase appears in a court context.",
        confidence: 0.93,
      }),
      createLegalExceptionResult({
        code: "condemnation",
        label: "Condemnation",
        applies: condemnation,
        disposition: harmful ? "allow" : "block",
        reason: "The crime-related phrase is condemned rather than endorsed.",
        confidence: 0.95,
      }),
      createLegalExceptionResult({
        code: "review",
        label: "Review context",
        applies: review,
        disposition: "review",
        reason: "The crime-related phrase appears in a fictional, satirical, dreamlike, flashback, or role-play context.",
        confidence: 0.93,
      }),
    ];
  }

  buildFinding(input: ReviewerDecisionModuleInput, decision: LegalDecision, exceptions: readonly LegalExceptionResult[]): LegalFinding | null {
    const primary = getPrimaryEvidence(input);
    if (!primary) return null;
    if (!input.intelligence.evidence.admissible) return null;
    if (!(isCrimeAnchor(buildCombinedText(input)) || hasCrimeConcept(input) || isLiteralCrimeMeaning(primary.text))) return null;

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

export const CRIME_MODULE = new CrimeReviewerDecisionModule();

export function isCrimeEvidenceText(text: string): boolean {
  return isLiteralCrimeMeaning(text);
}

export function buildCrimeDecisionTree(): readonly import("./crimeDecisionTree.js").CrimeDecisionStep[] {
  return CRIME_DECISION_TREE;
}

