import type { LegalDecision } from "../../legalDecision.js";
import type { LegalExceptionResult, LegalFinding } from "../../legalResult.js";
import { createLegalDecision } from "../../legalDecision.js";
import { createLegalExceptionResult, createLegalFinding } from "../../legalResult.js";
import { ReviewerDecisionModuleBase, type ReviewerDecisionModuleInput } from "../../reviewerDecisionModule.js";
import { SEXUALITY_DECISION_TREE } from "./sexualityDecisionTree.js";
import type { SexualityDecisionStep } from "./sexualityDecisionTree.js";
import { SEXUALITY_RULES } from "./sexualityRules.js";

export const SEXUALITY_MODULE_ID = "v3_07_sexuality";
const SEXUALITY_ARTICLE_IDS = Object.freeze([5, 6, 7, 9, 17]);

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

function hasSexualityConcept(input: ReviewerDecisionModuleInput): boolean {
  return input.intelligence.conceptContext.conceptIds.some((conceptId) => conceptId === "sexuality" || conceptId.startsWith("sexual_"));
}

function isSexualAnchor(text: string): boolean {
  return containsAny(text, SEXUALITY_RULES.sexualityAnchors);
}

function isLiteralSexualContent(text: string): boolean {
  return containsAny(text, SEXUALITY_RULES.directTerms) || containsAny(text, SEXUALITY_RULES.nudityTerms) || containsAny(text, SEXUALITY_RULES.explicitTerms);
}

function isImpliedSexualContent(text: string): boolean {
  return containsAny(text, SEXUALITY_RULES.impliedTerms) || containsAny(text, SEXUALITY_RULES.bodyFocusTerms) || containsAny(text, SEXUALITY_RULES.clothingTerms) || containsAny(text, SEXUALITY_RULES.soundTerms);
}

function isQuoteContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return input.intelligence.flags.quotation === true || containsAny(combinedText, SEXUALITY_RULES.quotationSignals);
}

function isEducationalContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return input.intelligence.flags.educational === true || containsAny(combinedText, SEXUALITY_RULES.educationalSignals);
}

function isMedicalContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return containsAny(combinedText, SEXUALITY_RULES.medicalSignals) || containsAny(combinedText, ["medical", "clinic", "doctor", "health", "فحص طبي", "طبي"]);
}

function isArtisticContext(combinedText: string): boolean {
  return containsAny(combinedText, SEXUALITY_RULES.artisticSignals);
}

function isHistoricalContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return input.intelligence.flags.historical === true || containsAny(combinedText, SEXUALITY_RULES.historicalSignals);
}

function isDocumentaryContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return input.intelligence.flags.documentary === true || containsAny(combinedText, SEXUALITY_RULES.documentarySignals);
}

function isNewsContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return input.intelligence.flags.news === true || containsAny(combinedText, SEXUALITY_RULES.newsSignals);
}

function isCourtContext(combinedText: string): boolean {
  return containsAny(combinedText, SEXUALITY_RULES.courtSignals);
}

function isCondemnationContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return input.intelligence.narrative.condemnation === true || input.intelligence.flags.condemnation === true || containsAny(combinedText, SEXUALITY_RULES.condemnationSignals);
}

function isReviewContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return (
    input.intelligence.flags.fiction === true ||
    input.intelligence.flags.comedy === true ||
    input.intelligence.flags.satire === true ||
    input.intelligence.flags.dream === true ||
    input.intelligence.flags.flashback === true ||
    input.intelligence.flags.quotation === true ||
    containsAny(combinedText, SEXUALITY_RULES.fictionSignals) ||
    containsAny(combinedText, SEXUALITY_RULES.rolePlaySignals) ||
    containsAny(combinedText, SEXUALITY_RULES.dreamSignals) ||
    containsAny(combinedText, SEXUALITY_RULES.flashbackSignals) ||
    containsAny(combinedText, SEXUALITY_RULES.imaginationSignals) ||
    containsAny(combinedText, SEXUALITY_RULES.artisticSignals)
  );
}

function isChildRiskContext(combinedText: string): boolean {
  return containsAny(combinedText, SEXUALITY_RULES.childSignals) || containsAny(combinedText, SEXUALITY_RULES.groomingSignals);
}

function isHarassmentOrExploitationContext(combinedText: string): boolean {
  return containsAny(combinedText, SEXUALITY_RULES.harassmentSignals) || containsAny(combinedText, SEXUALITY_RULES.exploitationSignals);
}

function isFalseAccusationContext(combinedText: string): boolean {
  return containsAny(combinedText, SEXUALITY_RULES.falseAccusationSignals);
}

function inferArticleIds(combinedText: string): readonly number[] {
  const ids = new Set<number>();
  ids.add(9);

  if (
    containsAny(combinedText, SEXUALITY_RULES.explicitTerms) ||
    containsAny(combinedText, SEXUALITY_RULES.nudityTerms) ||
    containsAny(combinedText, SEXUALITY_RULES.bodyFocusTerms) ||
    containsAny(combinedText, SEXUALITY_RULES.clothingTerms) ||
    containsAny(combinedText, SEXUALITY_RULES.soundTerms)
  ) {
    ids.add(5);
  }

  if (isHarassmentOrExploitationContext(combinedText)) {
    ids.add(7);
  }

  if (isChildRiskContext(combinedText)) {
    ids.add(6);
  }

  if (isFalseAccusationContext(combinedText) || containsAny(combinedText, ["privacy", "dignity", "false accusation", "كذب", "افتراء"])) {
    ids.add(17);
  }

  return Object.freeze([...ids].sort((left, right) => left - right));
}

function summarizeReason(parts: readonly string[]): string {
  return [...new Set(parts.map((part) => part.trim()).filter(Boolean))].join(" | ");
}

function buildTrace(input: ReviewerDecisionModuleInput, status: LegalDecision["status"], reason: string): readonly string[] {
  const combinedText = buildCombinedText(input);
  return [
    "sexuality:evidence_exists",
    `sexuality:admissible:${String(input.intelligence.evidence.admissible)}`,
    `sexuality:anchor:${String(isSexualAnchor(combinedText) || hasSexualityConcept(input) || isLiteralSexualContent(combinedText) || isImpliedSexualContent(combinedText))}`,
    `sexuality:literal:${String(isLiteralSexualContent(getPrimaryEvidence(input)?.text ?? combinedText))}`,
    `sexuality:implied:${String(isImpliedSexualContent(combinedText))}`,
    `sexuality:nudity:${String(containsAny(combinedText, SEXUALITY_RULES.nudityTerms))}`,
    `sexuality:explicit:${String(containsAny(combinedText, SEXUALITY_RULES.explicitTerms))}`,
    `sexuality:education:${String(isEducationalContext(input, combinedText))}`,
    `sexuality:medical:${String(isMedicalContext(input, combinedText))}`,
    `sexuality:artistic:${String(isArtisticContext(combinedText))}`,
    `sexuality:quote:${String(isQuoteContext(input, combinedText))}`,
    `sexuality:historical:${String(isHistoricalContext(input, combinedText))}`,
    `sexuality:documentary:${String(isDocumentaryContext(input, combinedText))}`,
    `sexuality:news:${String(isNewsContext(input, combinedText))}`,
    `sexuality:court:${String(isCourtContext(combinedText))}`,
    `sexuality:condemnation:${String(isCondemnationContext(input, combinedText))}`,
    `sexuality:review:${String(isReviewContext(input, combinedText))}`,
    `sexuality:status:${status}`,
    `sexuality:reason:${reason}`,
  ];
}

function buildFindingKey(moduleId: string, evidenceText: string, startOffset: number, endOffset: number, articleIds: readonly number[], status: string): string {
  return `${moduleId}:${startOffset}-${endOffset}:${articleIds.join("-")}:${normalizeText(evidenceText)}:${status}`;
}

export class SexualityReviewerDecisionModule extends ReviewerDecisionModuleBase {
  constructor() {
    super({
      id: SEXUALITY_MODULE_ID,
      title: "المحتوى الجنسي",
      articleIds: SEXUALITY_ARTICLE_IDS,
    });
  }

  applies(input: ReviewerDecisionModuleInput): boolean {
    const primary = getPrimaryEvidence(input);
    if (!primary) return false;
    if (!input.intelligence.evidence.admissible) return false;
    const combinedText = buildCombinedText(input);
    return (
      hasSexualityConcept(input) ||
      isSexualAnchor(combinedText) ||
      isLiteralSexualContent(primary.text) ||
      isImpliedSexualContent(combinedText)
    );
  }

  evaluate(input: ReviewerDecisionModuleInput): LegalDecision {
    const primary = getPrimaryEvidence(input);
    const combinedText = buildCombinedText(input);
    const quote = isQuoteContext(input, combinedText);
    const educational = isEducationalContext(input, combinedText);
    const medical = isMedicalContext(input, combinedText);
    const artistic = isArtisticContext(combinedText);
    const historical = isHistoricalContext(input, combinedText);
    const documentary = isDocumentaryContext(input, combinedText);
    const news = isNewsContext(input, combinedText);
    const court = isCourtContext(combinedText);
    const condemnation = isCondemnationContext(input, combinedText);
    const review = isReviewContext(input, combinedText);
    const anchor = hasSexualityConcept(input) || isSexualAnchor(combinedText) || isLiteralSexualContent(combinedText) || isImpliedSexualContent(combinedText);
    const literal = primary ? isLiteralSexualContent(primary.text) : false;
    const implied = isImpliedSexualContent(combinedText);
    const explicit = containsAny(combinedText, SEXUALITY_RULES.explicitTerms) || containsAny(combinedText, SEXUALITY_RULES.nudityTerms);
    const applies = Boolean(primary && input.intelligence.evidence.admissible && anchor && (literal || implied));

    const status: LegalDecision["status"] = !primary || !input.intelligence.evidence.admissible || !anchor
      ? "reject"
      : quote || educational || medical || historical || documentary || news || court || condemnation
        ? "reject"
        : artistic || review
          ? "needs_review"
          : "accept";

    const reason = summarizeReason([
      !primary ? "لا توجد أدلة صالحة" : "",
      !input.intelligence.evidence.admissible ? "الأدلة غير مقبولة" : "",
      anchor ? "تم التعرف على سياق جنسي" : "لا يوجد سياق جنسي كافٍ",
      literal ? "توجد دلالة جنسية حرفية" : "لا توجد دلالة جنسية حرفية",
      implied ? "توجد دلالة جنسية ضمنية" : "",
      explicit ? "توجد دلالة صريحة أو عري" : "",
      quote ? "السياق اقتباس" : "",
      educational ? "السياق تعليمي" : "",
      medical ? "السياق طبي" : "",
      artistic ? "السياق فني/جمالي" : "",
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
    const anchor = hasSexualityConcept(input) || isSexualAnchor(combinedText) || isLiteralSexualContent(primary.text) || isImpliedSexualContent(combinedText);
    if (!anchor) return [];

    const quote = isQuoteContext(input, combinedText);
    const educational = isEducationalContext(input, combinedText);
    const medical = isMedicalContext(input, combinedText);
    const artistic = isArtisticContext(combinedText);
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
        reason: "The sexual content line is quoted rather than endorsed.",
        confidence: 0.98,
      }),
      createLegalExceptionResult({
        code: "educational",
        label: "Educational usage",
        applies: educational,
        disposition: "block",
        reason: "The sexual content line is discussed in an educational context.",
        confidence: 0.97,
      }),
      createLegalExceptionResult({
        code: "medical",
        label: "Medical usage",
        applies: medical,
        disposition: "block",
        reason: "The sexual content line is part of medical or clinical discussion.",
        confidence: 0.97,
      }),
      createLegalExceptionResult({
        code: "historical",
        label: "Historical usage",
        applies: historical,
        disposition: "block",
        reason: "The sexual content line is part of historical narration.",
        confidence: 0.96,
      }),
      createLegalExceptionResult({
        code: "documentary",
        label: "Documentary usage",
        applies: documentary,
        disposition: "block",
        reason: "The sexual content line is presented as documentary or reportage material.",
        confidence: 0.96,
      }),
      createLegalExceptionResult({
        code: "news",
        label: "News reporting",
        applies: news,
        disposition: "block",
        reason: "The sexual content line is reported as news rather than endorsed.",
        confidence: 0.95,
      }),
      createLegalExceptionResult({
        code: "court",
        label: "Court proceedings",
        applies: court,
        disposition: "block",
        reason: "The sexual content line appears in court testimony or legal proceedings.",
        confidence: 0.95,
      }),
      createLegalExceptionResult({
        code: "condemnation",
        label: "Condemnation",
        applies: condemnation,
        disposition: "block",
        reason: "The sexual content line is condemned rather than endorsed.",
        confidence: 0.97,
      }),
      createLegalExceptionResult({
        code: "artistic",
        label: "Artistic context",
        applies: artistic,
        disposition: "review",
        reason: "The sexual content line appears in an artistic or cinematic framing and needs reviewer confirmation.",
        confidence: 0.9,
      }),
      createLegalExceptionResult({
        code: "fiction",
        label: "Fictional context",
        applies: review && input.intelligence.flags.fiction === true,
        disposition: "review",
        reason: "The sexual content line appears inside fiction and needs reviewer confirmation.",
        confidence: 0.9,
      }),
      createLegalExceptionResult({
        code: "roleplay",
        label: "Role-play context",
        applies: review && containsAny(combinedText, SEXUALITY_RULES.rolePlaySignals),
        disposition: "review",
        reason: "The sexual content line appears inside role-play and needs reviewer confirmation.",
        confidence: 0.9,
      }),
      createLegalExceptionResult({
        code: "dream",
        label: "Dream sequence",
        applies: review && input.intelligence.flags.dream === true,
        disposition: "review",
        reason: "The sexual content line appears inside a dream sequence and needs reviewer confirmation.",
        confidence: 0.9,
      }),
      createLegalExceptionResult({
        code: "flashback",
        label: "Flashback",
        applies: review && input.intelligence.flags.flashback === true,
        disposition: "review",
        reason: "The sexual content line appears inside a flashback and needs reviewer confirmation.",
        confidence: 0.9,
      }),
      createLegalExceptionResult({
        code: "imagination",
        label: "Imagination",
        applies: review && containsAny(combinedText, SEXUALITY_RULES.imaginationSignals),
        disposition: "review",
        reason: "The sexual content line appears inside imagination and needs reviewer confirmation.",
        confidence: 0.9,
      }),
      createLegalExceptionResult({
        code: "dialogue",
        label: "Dialogue",
        applies: input.intelligence.narrative.dialogue === true && !quote && !educational && !medical && !historical && !documentary && !news && !court && !condemnation && !artistic && !review,
        disposition: "allow",
        reason: "The sexual content appears in dialogue and remains a direct use.",
        confidence: 0.95,
      }),
      createLegalExceptionResult({
        code: "narration",
        label: "Narration",
        applies: input.intelligence.narrative.narration === true && !quote && !educational && !medical && !historical && !documentary && !news && !court && !condemnation && !artistic && !review,
        disposition: "allow",
        reason: "The sexual content appears in narration and remains a direct use.",
        confidence: 0.95,
      }),
    ];
  }

  buildFinding(input: ReviewerDecisionModuleInput, decision: LegalDecision, exceptions: readonly LegalExceptionResult[]): LegalFinding | null {
    const primary = getPrimaryEvidence(input);
    if (!primary) return null;
    if (!input.intelligence.evidence.admissible) return null;
    const combinedText = buildCombinedText(input);
    const anchor = hasSexualityConcept(input) || isSexualAnchor(combinedText) || isLiteralSexualContent(primary.text) || isImpliedSexualContent(combinedText);
    if (!anchor) return null;
    if (exceptions.some((exception) => exception.applies && exception.disposition === "block")) return null;

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

export const SEXUALITY_MODULE = new SexualityReviewerDecisionModule();

export function isSexualityEvidenceText(text: string): boolean {
  return isLiteralSexualContent(text) || isImpliedSexualContent(text) || isSexualAnchor(text);
}

export function buildSexualityDecisionTree(): readonly SexualityDecisionStep[] {
  return SEXUALITY_DECISION_TREE;
}
