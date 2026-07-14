import type { LegalDecision } from "../../legalDecision.js";
import type { LegalExceptionResult, LegalFinding } from "../../legalResult.js";
import { createLegalDecision } from "../../legalDecision.js";
import { createLegalExceptionResult, createLegalFinding } from "../../legalResult.js";
import { RELIGION_DECISION_TREE } from "./religionDecisionTree.js";
import type { ReligionDecisionStep } from "./religionDecisionTree.js";
import { RELIGION_RULES } from "./religionRules.js";
import { ReviewerDecisionModuleBase, type ReviewerDecisionModuleInput } from "../../reviewerDecisionModule.js";

export const RELIGION_MODULE_ID = "v3_01_religion";
const RELIGION_ARTICLE_IDS = Object.freeze([1, 2, 3]);

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

function hasReligionConcept(input: ReviewerDecisionModuleInput): boolean {
  return input.intelligence.conceptContext.conceptIds.includes("religion");
}

function isReligionAnchor(text: string): boolean {
  return (
    containsAny(text, RELIGION_RULES.religionAnchors) ||
    containsAny(text, RELIGION_RULES.prophetAnchors) ||
    containsAny(text, RELIGION_RULES.holyBookAnchors) ||
    containsAny(text, RELIGION_RULES.sacredPlaceAnchors) ||
    containsAny(text, RELIGION_RULES.companionAnchors) ||
    containsAny(text, RELIGION_RULES.scholarAnchors) ||
    containsAny(text, RELIGION_RULES.ritualAnchors) ||
    containsAny(text, RELIGION_RULES.symbolAnchors) ||
    containsAny(text, RELIGION_RULES.unityAnchors) ||
    containsAny(text, RELIGION_RULES.sectarianAnchors) ||
    containsAny(text, RELIGION_RULES.hateSpeechAnchors)
  );
}

function isLiteralReligionAttack(text: string): boolean {
  return containsAny(text, RELIGION_RULES.directTerms) || containsAny(text, RELIGION_RULES.directPhrases);
}

function isQuoteContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return input.intelligence.flags.quotation === true || containsAny(combinedText, RELIGION_RULES.quotationSignals);
}

function isEducationalContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return input.intelligence.flags.educational === true || containsAny(combinedText, RELIGION_RULES.educationalSignals);
}

function isHistoricalContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return input.intelligence.flags.historical === true || containsAny(combinedText, RELIGION_RULES.historicalSignals);
}

function isDocumentaryContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return input.intelligence.flags.documentary === true || containsAny(combinedText, RELIGION_RULES.documentarySignals);
}

function isNewsContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return input.intelligence.flags.news === true || containsAny(combinedText, RELIGION_RULES.newsSignals);
}

function isCourtContext(combinedText: string): boolean {
  return containsAny(combinedText, RELIGION_RULES.courtSignals);
}

function isCondemnationContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return input.intelligence.narrative.condemnation === true || input.intelligence.flags.condemnation === true || containsAny(combinedText, RELIGION_RULES.condemnationSignals);
}

function isReviewContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return (
    input.intelligence.flags.fiction === true ||
    input.intelligence.flags.comedy === true ||
    input.intelligence.flags.satire === true ||
    input.intelligence.flags.dream === true ||
    input.intelligence.flags.flashback === true ||
    containsAny(combinedText, RELIGION_RULES.fictionSignals) ||
    containsAny(combinedText, RELIGION_RULES.rolePlaySignals) ||
    containsAny(combinedText, RELIGION_RULES.dreamSignals) ||
    containsAny(combinedText, RELIGION_RULES.flashbackSignals) ||
    containsAny(combinedText, RELIGION_RULES.satireSignals)
  );
}

function inferArticleIds(input: ReviewerDecisionModuleInput, combinedText: string): readonly number[] {
  const ids = new Set<number>();

  if (containsAny(combinedText, RELIGION_RULES.sacredPlaceAnchors) || containsAny(combinedText, RELIGION_RULES.holyBookAnchors) || containsAny(combinedText, RELIGION_RULES.symbolAnchors)) {
    ids.add(1);
  }
  if (containsAny(combinedText, RELIGION_RULES.prophetAnchors) || containsAny(combinedText, RELIGION_RULES.companionAnchors) || containsAny(combinedText, RELIGION_RULES.scholarAnchors)) {
    ids.add(2);
  }
  if (hasReligionConcept(input) || containsAny(combinedText, RELIGION_RULES.religionAnchors) || containsAny(combinedText, RELIGION_RULES.unityAnchors) || containsAny(combinedText, RELIGION_RULES.sectarianAnchors) || containsAny(combinedText, RELIGION_RULES.hateSpeechAnchors) || isLiteralReligionAttack(combinedText)) {
    ids.add(3);
  }

  if (ids.size === 0) return RELIGION_ARTICLE_IDS;
  return Object.freeze([...ids].sort((left, right) => left - right));
}

function summarizeReason(parts: readonly string[]): string {
  return [...new Set(parts.map((part) => part.trim()).filter(Boolean))].join(" | ");
}

function buildTrace(input: ReviewerDecisionModuleInput, status: LegalDecision["status"], reason: string): readonly string[] {
  const combinedText = buildCombinedText(input);
  return [
    "religion:evidence_exists",
    `religion:admissible:${String(input.intelligence.evidence.admissible)}`,
    `religion:anchor:${String(isReligionAnchor(combinedText) || hasReligionConcept(input) || isLiteralReligionAttack(combinedText))}`,
    `religion:literal:${String(isLiteralReligionAttack(getPrimaryEvidence(input)?.text ?? combinedText))}`,
    `religion:quote:${String(isQuoteContext(input, combinedText))}`,
    `religion:education:${String(isEducationalContext(input, combinedText))}`,
    `religion:historical:${String(isHistoricalContext(input, combinedText))}`,
    `religion:documentary:${String(isDocumentaryContext(input, combinedText))}`,
    `religion:news:${String(isNewsContext(input, combinedText))}`,
    `religion:court:${String(isCourtContext(combinedText))}`,
    `religion:condemnation:${String(isCondemnationContext(input, combinedText))}`,
    `religion:review:${String(isReviewContext(input, combinedText))}`,
    `religion:status:${status}`,
    `religion:reason:${reason}`,
  ];
}

function buildFindingKey(moduleId: string, evidenceText: string, startOffset: number, endOffset: number, articleIds: readonly number[], status: string): string {
  return `${moduleId}:${startOffset}-${endOffset}:${articleIds.join("-")}:${normalizeText(evidenceText)}:${status}`;
}

export class ReligionReviewerDecisionModule extends ReviewerDecisionModuleBase {
  constructor() {
    super({
      id: RELIGION_MODULE_ID,
      title: "المسائل الدينية الأساسية",
      articleIds: RELIGION_ARTICLE_IDS,
    });
  }

  applies(input: ReviewerDecisionModuleInput): boolean {
    const primary = getPrimaryEvidence(input);
    if (!primary) return false;
    if (!input.intelligence.evidence.admissible) return false;

    const combinedText = buildCombinedText(input);
    return hasReligionConcept(input) || isReligionAnchor(combinedText) || isLiteralReligionAttack(primary.text);
  }

  evaluate(input: ReviewerDecisionModuleInput): LegalDecision {
    const primary = getPrimaryEvidence(input);
    const combinedText = buildCombinedText(input);
    const quote = isQuoteContext(input, combinedText);
    const educational = isEducationalContext(input, combinedText);
    const historical = isHistoricalContext(input, combinedText);
    const documentary = isDocumentaryContext(input, combinedText);
    const news = isNewsContext(input, combinedText);
    const court = isCourtContext(combinedText);
    const condemnation = isCondemnationContext(input, combinedText);
    const review = isReviewContext(input, combinedText);
    const anchor = hasReligionConcept(input) || isReligionAnchor(combinedText) || isLiteralReligionAttack(combinedText);
    const literal = primary ? isLiteralReligionAttack(primary.text) : false;
    const applies = Boolean(primary && input.intelligence.evidence.admissible && anchor);

    const status: LegalDecision["status"] = !primary || !input.intelligence.evidence.admissible || !anchor
      ? "reject"
      : quote || educational || historical || documentary || news || court || condemnation
        ? "reject"
        : review
          ? "needs_review"
          : "accept";

    const reason = summarizeReason([
      !primary ? "لا توجد أدلة صالحة" : "",
      !input.intelligence.evidence.admissible ? "الأدلة غير مقبولة" : "",
      anchor ? "تم التعرف على سياق ديني" : "لا يوجد سياق ديني كافٍ",
      literal ? "توجد إساءة دينية حرفية" : "لا توجد إساءة دينية حرفية",
      quote ? "السياق اقتباس" : "",
      educational ? "السياق تعليمي" : "",
      historical ? "السياق تاريخي" : "",
      documentary ? "السياق وثائقي" : "",
      news ? "السياق خبري" : "",
      court ? "السياق قضائي" : "",
      condemnation ? "السياق إدانة" : "",
      review ? "السياق روائي/تمثيلي ويحتاج مراجعة" : "",
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
    const anchor = hasReligionConcept(input) || isReligionAnchor(combinedText) || isLiteralReligionAttack(primary.text);
    if (!anchor) return [];

    const quote = isQuoteContext(input, combinedText);
    const educational = isEducationalContext(input, combinedText);
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
        reason: "The religion-related line is quoted rather than endorsed.",
        confidence: 0.98,
      }),
      createLegalExceptionResult({
        code: "educational",
        label: "Educational usage",
        applies: educational,
        disposition: "block",
        reason: "The religion-related line is discussed in an educational or explanatory context.",
        confidence: 0.97,
      }),
      createLegalExceptionResult({
        code: "historical",
        label: "Historical usage",
        applies: historical,
        disposition: "block",
        reason: "The religion-related line is part of historical narration.",
        confidence: 0.96,
      }),
      createLegalExceptionResult({
        code: "documentary",
        label: "Documentary usage",
        applies: documentary,
        disposition: "block",
        reason: "The religion-related line is presented as documentary or reportage material.",
        confidence: 0.96,
      }),
      createLegalExceptionResult({
        code: "news",
        label: "News reporting",
        applies: news,
        disposition: "block",
        reason: "The religion-related line is reported as news rather than endorsed.",
        confidence: 0.95,
      }),
      createLegalExceptionResult({
        code: "court",
        label: "Court proceedings",
        applies: court,
        disposition: "block",
        reason: "The religion-related line appears in court testimony or legal proceedings.",
        confidence: 0.95,
      }),
      createLegalExceptionResult({
        code: "condemnation",
        label: "Condemnation",
        applies: condemnation,
        disposition: "block",
        reason: "The religion-related line is condemned rather than endorsed.",
        confidence: 0.97,
      }),
      createLegalExceptionResult({
        code: "fiction",
        label: "Fictional context",
        applies: review && input.intelligence.flags.fiction === true,
        disposition: "review",
        reason: "The religion-related line appears inside fiction and needs reviewer confirmation.",
        confidence: 0.9,
      }),
      createLegalExceptionResult({
        code: "roleplay",
        label: "Role-play context",
        applies: review && containsAny(combinedText, RELIGION_RULES.rolePlaySignals),
        disposition: "review",
        reason: "The religion-related line appears inside role-play and needs reviewer confirmation.",
        confidence: 0.9,
      }),
      createLegalExceptionResult({
        code: "dream",
        label: "Dream sequence",
        applies: review && input.intelligence.flags.dream === true,
        disposition: "review",
        reason: "The religion-related line appears inside a dream sequence and needs reviewer confirmation.",
        confidence: 0.9,
      }),
      createLegalExceptionResult({
        code: "flashback",
        label: "Flashback",
        applies: review && input.intelligence.flags.flashback === true,
        disposition: "review",
        reason: "The religion-related line appears inside a flashback and needs reviewer confirmation.",
        confidence: 0.9,
      }),
      createLegalExceptionResult({
        code: "satire",
        label: "Satire",
        applies: review && input.intelligence.flags.satire === true,
        disposition: "review",
        reason: "The religion-related line appears inside satire and needs reviewer confirmation.",
        confidence: 0.9,
      }),
      createLegalExceptionResult({
        code: "dialogue",
        label: "Dialogue",
        applies: input.intelligence.narrative.dialogue === true && !quote && !educational && !historical && !documentary && !news && !court && !condemnation && !review,
        disposition: "allow",
        reason: "The religion-related line appears in dialogue and remains a direct use.",
        confidence: 0.95,
      }),
      createLegalExceptionResult({
        code: "narration",
        label: "Narration",
        applies: input.intelligence.narrative.narration === true && !quote && !educational && !historical && !documentary && !news && !court && !condemnation && !review,
        disposition: "allow",
        reason: "The religion-related line appears in narration and remains a direct use.",
        confidence: 0.95,
      }),
    ];
  }

  buildFinding(input: ReviewerDecisionModuleInput, decision: LegalDecision, exceptions: readonly LegalExceptionResult[]): LegalFinding | null {
    const primary = getPrimaryEvidence(input);
    if (!primary) return null;
    if (!input.intelligence.evidence.admissible) return null;
    const combinedText = buildCombinedText(input);
    const anchor = hasReligionConcept(input) || isReligionAnchor(combinedText) || isLiteralReligionAttack(primary.text);
    if (!anchor) return null;
    if (exceptions.some((exception) => exception.applies && exception.disposition === "block")) return null;

    const articleIds = inferArticleIds(input, combinedText);
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

export const RELIGION_MODULE = new ReligionReviewerDecisionModule();

export function isReligionEvidenceText(text: string): boolean {
  return isLiteralReligionAttack(text) || isReligionAnchor(text);
}

export function buildReligionDecisionTree(): readonly ReligionDecisionStep[] {
  return RELIGION_DECISION_TREE;
}
