import type { LegalDecision } from "../../legalDecision.js";
import type { LegalExceptionResult, LegalFinding } from "../../legalResult.js";
import { createLegalDecision } from "../../legalDecision.js";
import { createLegalExceptionResult, createLegalFinding } from "../../legalResult.js";
import { ReviewerDecisionModuleBase, type ReviewerDecisionModuleInput } from "../../reviewerDecisionModule.js";
import { DRUGS_DECISION_TREE } from "./drugsDecisionTree.js";
import type { DrugsDecisionStep } from "./drugsDecisionTree.js";
import { DRUGS_RULES } from "./drugsRules.js";

export const DRUGS_MODULE_ID = "v3_12_drugs";
const DRUGS_ARTICLE_IDS = Object.freeze([10]);

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

function hasDrugsConcept(input: ReviewerDecisionModuleInput): boolean {
  return input.intelligence.conceptContext.conceptIds.some((conceptId) => conceptId.startsWith("drug_") || conceptId === "drug_use");
}

function isDrugAnchor(text: string): boolean {
  return containsAny(text, DRUGS_RULES.drugAnchors);
}

function isLiteralDrugContent(text: string): boolean {
  return containsAny(text, DRUGS_RULES.directTerms) || containsAny(text, DRUGS_RULES.manufacturingTerms) || containsAny(text, DRUGS_RULES.traffickingTerms) || containsAny(text, DRUGS_RULES.useTerms) || containsAny(text, DRUGS_RULES.promotionTerms);
}

function isPromotionContext(text: string): boolean {
  return containsAny(text, DRUGS_RULES.promotionTerms);
}

function isMedicalContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return input.intelligence.flags.educational === true && containsAny(combinedText, DRUGS_RULES.medicalSignals) ? true : containsAny(combinedText, DRUGS_RULES.medicalSignals);
}

function isEducationalContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return input.intelligence.flags.educational === true || containsAny(combinedText, DRUGS_RULES.educationalSignals);
}

function isRehabilitationContext(combinedText: string): boolean {
  return containsAny(combinedText, DRUGS_RULES.rehabilitationSignals);
}

function isHistoricalContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return input.intelligence.flags.historical === true || containsAny(combinedText, DRUGS_RULES.historicalSignals);
}

function isDocumentaryContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return input.intelligence.flags.documentary === true || containsAny(combinedText, DRUGS_RULES.documentarySignals);
}

function isNewsContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return input.intelligence.flags.news === true || containsAny(combinedText, DRUGS_RULES.newsSignals);
}

function isCourtContext(combinedText: string): boolean {
  return containsAny(combinedText, DRUGS_RULES.courtSignals);
}

function isCondemnationContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return input.intelligence.narrative.condemnation === true || input.intelligence.flags.condemnation === true || containsAny(combinedText, DRUGS_RULES.condemnationSignals);
}

function isQuoteContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return input.intelligence.flags.quotation === true || containsAny(combinedText, DRUGS_RULES.quotationSignals);
}

function isReviewContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return (
    input.intelligence.flags.fiction === true ||
    input.intelligence.flags.comedy === true ||
    input.intelligence.flags.satire === true ||
    input.intelligence.flags.dream === true ||
    input.intelligence.flags.flashback === true ||
    input.intelligence.flags.approval === true ||
    containsAny(combinedText, DRUGS_RULES.fictionSignals) ||
    containsAny(combinedText, DRUGS_RULES.comedySignals) ||
    containsAny(combinedText, DRUGS_RULES.satireSignals) ||
    containsAny(combinedText, DRUGS_RULES.dreamSignals) ||
    containsAny(combinedText, DRUGS_RULES.flashbackSignals) ||
    containsAny(combinedText, DRUGS_RULES.hallucinationSignals)
  );
}

function inferArticleIds(combinedText: string): readonly number[] {
  const ids = new Set<number>();
  ids.add(10);
  if (containsAny(combinedText, DRUGS_RULES.manufacturingTerms) || containsAny(combinedText, DRUGS_RULES.traffickingTerms) || containsAny(combinedText, DRUGS_RULES.useTerms) || isPromotionContext(combinedText)) {
    ids.add(10);
  }
  return Object.freeze([...ids].sort((left, right) => left - right));
}

function summarizeReason(parts: readonly string[]): string {
  return [...new Set(parts.map((part) => part.trim()).filter(Boolean))].join(" | ");
}

function buildTrace(input: ReviewerDecisionModuleInput, status: LegalDecision["status"], reason: string): readonly string[] {
  const combinedText = buildCombinedText(input);
  return [
    "drugs:evidence_exists",
    `drugs:admissible:${String(input.intelligence.evidence.admissible)}`,
    `drugs:anchor:${String(isDrugAnchor(combinedText) || hasDrugsConcept(input) || isLiteralDrugContent(combinedText))}`,
    `drugs:manufacturing:${String(containsAny(combinedText, DRUGS_RULES.manufacturingTerms))}`,
    `drugs:trafficking:${String(containsAny(combinedText, DRUGS_RULES.traffickingTerms))}`,
    `drugs:use:${String(containsAny(combinedText, DRUGS_RULES.useTerms))}`,
    `drugs:promotion:${String(isPromotionContext(combinedText))}`,
    `drugs:medical:${String(isMedicalContext(input, combinedText))}`,
    `drugs:educational:${String(isEducationalContext(input, combinedText))}`,
    `drugs:rehabilitation:${String(isRehabilitationContext(combinedText))}`,
    `drugs:historical:${String(isHistoricalContext(input, combinedText))}`,
    `drugs:documentary:${String(isDocumentaryContext(input, combinedText))}`,
    `drugs:news:${String(isNewsContext(input, combinedText))}`,
    `drugs:court:${String(isCourtContext(combinedText))}`,
    `drugs:condemnation:${String(isCondemnationContext(input, combinedText))}`,
    `drugs:quote:${String(isQuoteContext(input, combinedText))}`,
    `drugs:review:${String(isReviewContext(input, combinedText))}`,
    `drugs:status:${status}`,
    `drugs:reason:${reason}`,
  ];
}

function buildFindingKey(moduleId: string, evidenceText: string, startOffset: number, endOffset: number, articleIds: readonly number[], status: string): string {
  return `${moduleId}:${startOffset}-${endOffset}:${articleIds.join("-")}:${normalizeText(evidenceText)}:${status}`;
}

export class DrugsReviewerDecisionModule extends ReviewerDecisionModuleBase {
  constructor() {
    super({
      id: DRUGS_MODULE_ID,
      title: "المخدرات",
      articleIds: DRUGS_ARTICLE_IDS,
    });
  }

  applies(input: ReviewerDecisionModuleInput): boolean {
    const primary = getPrimaryEvidence(input);
    if (!primary) return false;
    if (!input.intelligence.evidence.admissible) return false;
    const combinedText = buildCombinedText(input);
    return (
      hasDrugsConcept(input) ||
      isDrugAnchor(combinedText) ||
      isLiteralDrugContent(primary.text) ||
      containsAny(combinedText, DRUGS_RULES.rehabilitationSignals)
    );
  }

  evaluate(input: ReviewerDecisionModuleInput): LegalDecision {
    const primary = getPrimaryEvidence(input);
    const combinedText = buildCombinedText(input);
    const quote = isQuoteContext(input, combinedText);
    const medical = isMedicalContext(input, combinedText);
    const educational = isEducationalContext(input, combinedText);
    const rehabilitation = isRehabilitationContext(combinedText);
    const historical = isHistoricalContext(input, combinedText);
    const documentary = isDocumentaryContext(input, combinedText);
    const news = isNewsContext(input, combinedText);
    const court = isCourtContext(combinedText);
    const condemnation = isCondemnationContext(input, combinedText);
    const review = isReviewContext(input, combinedText);
    const anchor = hasDrugsConcept(input) || isDrugAnchor(combinedText) || isLiteralDrugContent(combinedText) || rehabilitation;
    const manufacturing = containsAny(combinedText, DRUGS_RULES.manufacturingTerms);
    const trafficking = containsAny(combinedText, DRUGS_RULES.traffickingTerms);
    const use = containsAny(combinedText, DRUGS_RULES.useTerms);
    const promotion = isPromotionContext(combinedText);
    const literal = primary ? isLiteralDrugContent(primary.text) : false;
    const applies = Boolean(primary && input.intelligence.evidence.admissible && anchor && (manufacturing || trafficking || use || promotion));

    const status: LegalDecision["status"] = !primary || !input.intelligence.evidence.admissible || !anchor
      ? "reject"
      : quote || medical || educational || rehabilitation || historical || documentary || news || court || condemnation
        ? "reject"
        : review
          ? "needs_review"
          : "accept";

    const reason = summarizeReason([
      !primary ? "لا توجد أدلة صالحة" : "",
      !input.intelligence.evidence.admissible ? "الأدلة غير مقبولة" : "",
      anchor ? "تم التعرف على سياق المخدرات" : "لا يوجد سياق مخدرات كافٍ",
      manufacturing ? "توجد مؤشرات تصنيع" : "",
      trafficking ? "توجد مؤشرات تهريب أو اتجار" : "",
      use ? "توجد مؤشرات تعاطٍ أو استخدام" : "",
      promotion ? "توجد مؤشرات ترويج أو تمجيد" : "",
      literal ? "توجد إشارة حرفية" : "لا توجد إشارة حرفية كافية",
      quote ? "السياق اقتباس" : "",
      medical ? "السياق طبي" : "",
      educational ? "السياق تعليمي" : "",
      rehabilitation ? "السياق تأهيلي" : "",
      historical ? "السياق تاريخي" : "",
      documentary ? "السياق وثائقي" : "",
      news ? "السياق خبري" : "",
      court ? "السياق قضائي" : "",
      condemnation ? "السياق إدانة" : "",
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
    const anchor = hasDrugsConcept(input) || isDrugAnchor(combinedText) || isLiteralDrugContent(primary.text) || containsAny(combinedText, DRUGS_RULES.rehabilitationSignals);
    if (!anchor) return [];
    const quote = isQuoteContext(input, combinedText);
    const medical = isMedicalContext(input, combinedText);
    const educational = isEducationalContext(input, combinedText);
    const rehabilitation = isRehabilitationContext(combinedText);
    const historical = isHistoricalContext(input, combinedText);
    const documentary = isDocumentaryContext(input, combinedText);
    const news = isNewsContext(input, combinedText);
    const court = isCourtContext(combinedText);
    const condemnation = isCondemnationContext(input, combinedText);
    const review = isReviewContext(input, combinedText);

    return [
      createLegalExceptionResult({
        code: "quotation",
        label: "Quotation",
        applies: quote,
        disposition: "block",
        reason: "The drug-related line is quoted rather than endorsed.",
        confidence: 0.98,
      }),
      createLegalExceptionResult({
        code: "medical",
        label: "Medical usage",
        applies: medical,
        disposition: "block",
        reason: "The drug-related line is part of medical or clinical discussion.",
        confidence: 0.97,
      }),
      createLegalExceptionResult({
        code: "educational",
        label: "Educational usage",
        applies: educational,
        disposition: "block",
        reason: "The drug-related line is discussed in an educational context.",
        confidence: 0.97,
      }),
      createLegalExceptionResult({
        code: "rehabilitation",
        label: "Rehabilitation",
        applies: rehabilitation,
        disposition: "block",
        reason: "The drug-related line is framed as recovery or rehabilitation.",
        confidence: 0.96,
      }),
      createLegalExceptionResult({
        code: "historical",
        label: "Historical usage",
        applies: historical,
        disposition: "block",
        reason: "The drug-related line is part of historical narration.",
        confidence: 0.96,
      }),
      createLegalExceptionResult({
        code: "documentary",
        label: "Documentary usage",
        applies: documentary,
        disposition: "block",
        reason: "The drug-related line is presented as documentary or reportage material.",
        confidence: 0.96,
      }),
      createLegalExceptionResult({
        code: "news",
        label: "News reporting",
        applies: news,
        disposition: "block",
        reason: "The drug-related line is reported as news rather than endorsed.",
        confidence: 0.95,
      }),
      createLegalExceptionResult({
        code: "court",
        label: "Court proceedings",
        applies: court,
        disposition: "block",
        reason: "The drug-related line appears in court testimony or legal proceedings.",
        confidence: 0.95,
      }),
      createLegalExceptionResult({
        code: "condemnation",
        label: "Condemnation",
        applies: condemnation,
        disposition: "block",
        reason: "The drug-related line is condemned rather than endorsed.",
        confidence: 0.97,
      }),
      createLegalExceptionResult({
        code: "fiction",
        label: "Fictional context",
        applies: review && input.intelligence.flags.fiction === true,
        disposition: "review",
        reason: "The drug-related line appears inside fiction and needs reviewer confirmation.",
        confidence: 0.9,
      }),
      createLegalExceptionResult({
        code: "comedy",
        label: "Comedy context",
        applies: review && input.intelligence.flags.comedy === true,
        disposition: "review",
        reason: "The drug-related line appears inside comedy and needs reviewer confirmation.",
        confidence: 0.9,
      }),
      createLegalExceptionResult({
        code: "satire",
        label: "Satire context",
        applies: review && input.intelligence.flags.satire === true,
        disposition: "review",
        reason: "The drug-related line appears inside satire and needs reviewer confirmation.",
        confidence: 0.9,
      }),
      createLegalExceptionResult({
        code: "dream",
        label: "Dream sequence",
        applies: review && input.intelligence.flags.dream === true,
        disposition: "review",
        reason: "The drug-related line appears inside a dream sequence and needs reviewer confirmation.",
        confidence: 0.9,
      }),
      createLegalExceptionResult({
        code: "flashback",
        label: "Flashback",
        applies: review && input.intelligence.flags.flashback === true,
        disposition: "review",
        reason: "The drug-related line appears inside a flashback and needs reviewer confirmation.",
        confidence: 0.9,
      }),
      createLegalExceptionResult({
        code: "hallucination",
        label: "Hallucination",
        applies: review && containsAny(combinedText, DRUGS_RULES.hallucinationSignals),
        disposition: "review",
        reason: "The drug-related line appears inside a hallucination and needs reviewer confirmation.",
        confidence: 0.9,
      }),
      createLegalExceptionResult({
        code: "dialogue",
        label: "Dialogue",
        applies: input.intelligence.narrative.dialogue === true && !quote && !medical && !educational && !rehabilitation && !historical && !documentary && !news && !court && !condemnation && !review,
        disposition: "allow",
        reason: "The drug-related line appears in dialogue and remains a direct use.",
        confidence: 0.95,
      }),
      createLegalExceptionResult({
        code: "narration",
        label: "Narration",
        applies: input.intelligence.narrative.narration === true && !quote && !medical && !educational && !rehabilitation && !historical && !documentary && !news && !court && !condemnation && !review,
        disposition: "allow",
        reason: "The drug-related line appears in narration and remains a direct use.",
        confidence: 0.95,
      }),
    ];
  }

  buildFinding(input: ReviewerDecisionModuleInput, decision: LegalDecision, exceptions: readonly LegalExceptionResult[]): LegalFinding | null {
    const primary = getPrimaryEvidence(input);
    if (!primary) return null;
    if (!input.intelligence.evidence.admissible) return null;
    const combinedText = buildCombinedText(input);
    const anchor = hasDrugsConcept(input) || isDrugAnchor(combinedText) || isLiteralDrugContent(primary.text) || containsAny(combinedText, DRUGS_RULES.rehabilitationSignals);
    if (!anchor) return null;

    const articleIds = inferArticleIds(combinedText);
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

export const DRUGS_MODULE = new DrugsReviewerDecisionModule();

export function isDrugsEvidenceText(text: string): boolean {
  return isLiteralDrugContent(text) || isDrugAnchor(text);
}

export function buildDrugsDecisionTree(): readonly DrugsDecisionStep[] {
  return DRUGS_DECISION_TREE;
}

