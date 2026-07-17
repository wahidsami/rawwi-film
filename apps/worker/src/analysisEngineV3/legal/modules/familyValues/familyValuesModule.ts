import type { LegalDecision } from "../../legalDecision.js";
import type { LegalExceptionResult, LegalFinding } from "../../legalResult.js";
import { createLegalDecision } from "../../legalDecision.js";
import { createLegalExceptionResult, createLegalFinding } from "../../legalResult.js";
import { ReviewerDecisionModuleBase, type ReviewerDecisionModuleInput } from "../../reviewerDecisionModule.js";
import { FAMILY_VALUES_DECISION_TREE } from "./familyValuesDecisionTree.js";
import type { FamilyValuesDecisionStep } from "./familyValuesDecisionTree.js";
import { FAMILY_VALUES_RULES } from "./familyValuesRules.js";

export const FAMILY_VALUES_MODULE_ID = "v3_04_family_values";
const FAMILY_VALUES_ARTICLE_IDS = Object.freeze([4, 8, 17, 18]);

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

function hasFamilyConcept(input: ReviewerDecisionModuleInput): boolean {
  return input.intelligence.conceptContext.conceptIds.some((conceptId) =>
    [
      "family_values",
      "family_breakdown",
      "family_respect",
      "society_family_values",
      "society_family_breakdown",
      "society_family_respect",
      "society_parents",
      "society_mother",
      "society_father",
      "society_caregiving",
      "society_domestic_abuse",
      "society_neglect",
    ].includes(conceptId),
  );
}

function isFamilyAnchor(text: string): boolean {
  return (
    containsAny(text, FAMILY_VALUES_RULES.familyAnchors) ||
    containsAny(text, FAMILY_VALUES_RULES.supportSignals)
  );
}

function isLiteralFamilyHarm(text: string): boolean {
  return (
    containsAny(text, FAMILY_VALUES_RULES.destructionTerms) ||
    containsAny(text, FAMILY_VALUES_RULES.abuseTerms) ||
    containsAny(text, FAMILY_VALUES_RULES.humiliationTerms) ||
    containsAny(text, FAMILY_VALUES_RULES.moralCorruptionTerms) ||
    containsAny(text, FAMILY_VALUES_RULES.neglectTerms) ||
    containsAny(text, FAMILY_VALUES_RULES.glorificationTerms)
  );
}

function isQuoteContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return input.intelligence.flags.quotation === true || containsAny(combinedText, FAMILY_VALUES_RULES.quotationSignals);
}

function isEducationalContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return input.intelligence.flags.educational === true || containsAny(combinedText, FAMILY_VALUES_RULES.educationalSignals);
}

function isDocumentaryContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return input.intelligence.flags.documentary === true || containsAny(combinedText, FAMILY_VALUES_RULES.documentarySignals);
}

function isHistoricalContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return input.intelligence.flags.historical === true || containsAny(combinedText, FAMILY_VALUES_RULES.historicalSignals);
}

function isNewsContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return input.intelligence.flags.news === true || containsAny(combinedText, FAMILY_VALUES_RULES.newsSignals);
}

function isCondemnationContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return input.intelligence.narrative.condemnation === true || input.intelligence.flags.condemnation === true || containsAny(combinedText, FAMILY_VALUES_RULES.condemnationSignals);
}

function isReviewContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return (
    input.intelligence.flags.fiction === true ||
    input.intelligence.flags.comedy === true ||
    input.intelligence.flags.satire === true ||
    input.intelligence.flags.dream === true ||
    input.intelligence.flags.flashback === true ||
    containsAny(combinedText, FAMILY_VALUES_RULES.fictionSignals) ||
    containsAny(combinedText, FAMILY_VALUES_RULES.comedySignals) ||
    containsAny(combinedText, FAMILY_VALUES_RULES.satireSignals) ||
    containsAny(combinedText, FAMILY_VALUES_RULES.dreamSignals) ||
    containsAny(combinedText, FAMILY_VALUES_RULES.flashbackSignals) ||
    containsAny(combinedText, FAMILY_VALUES_RULES.rolePlaySignals)
  );
}

function isFamilyCorruptionContext(combinedText: string): boolean {
  return containsAny(combinedText, FAMILY_VALUES_RULES.moralCorruptionTerms) || containsAny(combinedText, FAMILY_VALUES_RULES.glorificationTerms);
}

function isFamilyAbuseContext(combinedText: string): boolean {
  return containsAny(combinedText, FAMILY_VALUES_RULES.abuseTerms) || containsAny(combinedText, FAMILY_VALUES_RULES.destructionTerms);
}

function inferArticleIds(combinedText: string): readonly number[] {
  const ids = new Set<number>();
  ids.add(8);
  if (isFamilyAbuseContext(combinedText) || containsAny(combinedText, FAMILY_VALUES_RULES.neglectTerms)) ids.add(17);
  if (isFamilyCorruptionContext(combinedText)) ids.add(4);
  if (containsAny(combinedText, FAMILY_VALUES_RULES.supportSignals) || containsAny(combinedText, FAMILY_VALUES_RULES.familyAnchors)) ids.add(18);
  return Object.freeze([...ids].sort((left, right) => left - right));
}

function summarizeReason(parts: readonly string[]): string {
  return [...new Set(parts.map((part) => part.trim()).filter(Boolean))].join(" | ");
}

function buildTrace(input: ReviewerDecisionModuleInput, status: LegalDecision["status"], reason: string): readonly string[] {
  const combinedText = buildCombinedText(input);
  return [
    "family_values:evidence_exists",
    `family_values:admissible:${String(input.intelligence.evidence.admissible)}`,
    `family_values:anchor:${String(isFamilyAnchor(combinedText) || hasFamilyConcept(input) || isLiteralFamilyHarm(combinedText))}`,
    `family_values:abuse:${String(containsAny(combinedText, FAMILY_VALUES_RULES.abuseTerms))}`,
    `family_values:destruction:${String(containsAny(combinedText, FAMILY_VALUES_RULES.destructionTerms))}`,
    `family_values:humiliation:${String(containsAny(combinedText, FAMILY_VALUES_RULES.humiliationTerms))}`,
    `family_values:corruption:${String(containsAny(combinedText, FAMILY_VALUES_RULES.moralCorruptionTerms))}`,
    `family_values:neglect:${String(containsAny(combinedText, FAMILY_VALUES_RULES.neglectTerms))}`,
    `family_values:glorification:${String(containsAny(combinedText, FAMILY_VALUES_RULES.glorificationTerms))}`,
    `family_values:quote:${String(isQuoteContext(input, combinedText))}`,
    `family_values:education:${String(isEducationalContext(input, combinedText))}`,
    `family_values:documentary:${String(isDocumentaryContext(input, combinedText))}`,
    `family_values:historical:${String(isHistoricalContext(input, combinedText))}`,
    `family_values:news:${String(isNewsContext(input, combinedText))}`,
    `family_values:condemnation:${String(isCondemnationContext(input, combinedText))}`,
    `family_values:review:${String(isReviewContext(input, combinedText))}`,
    `family_values:status:${status}`,
    `family_values:reason:${reason}`,
  ];
}

function buildFindingKey(moduleId: string, evidenceText: string, startOffset: number, endOffset: number, articleIds: readonly number[], status: string): string {
  return `${moduleId}:${startOffset}-${endOffset}:${articleIds.join("-")}:${normalizeText(evidenceText)}:${status}`;
}

export class FamilyValuesReviewerDecisionModule extends ReviewerDecisionModuleBase {
  constructor() {
    super({
      id: FAMILY_VALUES_MODULE_ID,
      title: "قيم الأسرة",
      articleIds: FAMILY_VALUES_ARTICLE_IDS,
    });
  }

  applies(input: ReviewerDecisionModuleInput): boolean {
    const primary = getPrimaryEvidence(input);
    if (!primary) return false;
    if (!input.intelligence.evidence.admissible) return false;
    const combinedText = buildCombinedText(input);
    return hasFamilyConcept(input) || isFamilyAnchor(combinedText) || isLiteralFamilyHarm(primary.text);
  }

  evaluate(input: ReviewerDecisionModuleInput): LegalDecision {
    const primary = getPrimaryEvidence(input);
    const combinedText = buildCombinedText(input);
    const quote = isQuoteContext(input, combinedText);
    const educational = isEducationalContext(input, combinedText);
    const documentary = isDocumentaryContext(input, combinedText);
    const historical = isHistoricalContext(input, combinedText);
    const news = isNewsContext(input, combinedText);
    const condemnation = isCondemnationContext(input, combinedText);
    const review = isReviewContext(input, combinedText);
    const anchor = hasFamilyConcept(input) || isFamilyAnchor(combinedText) || isLiteralFamilyHarm(combinedText);
    const abuse = containsAny(combinedText, FAMILY_VALUES_RULES.abuseTerms);
    const destruction = containsAny(combinedText, FAMILY_VALUES_RULES.destructionTerms);
    const humiliation = containsAny(combinedText, FAMILY_VALUES_RULES.humiliationTerms);
    const corruption = containsAny(combinedText, FAMILY_VALUES_RULES.moralCorruptionTerms);
    const neglect = containsAny(combinedText, FAMILY_VALUES_RULES.neglectTerms);
    const glorification = containsAny(combinedText, FAMILY_VALUES_RULES.glorificationTerms);
    const harmful = abuse || destruction || humiliation || corruption || neglect || glorification;
    const support = containsAny(combinedText, FAMILY_VALUES_RULES.supportSignals);
    const applies = Boolean(primary && input.intelligence.evidence.admissible && anchor && (harmful || support));

    const status: LegalDecision["status"] = !primary || !input.intelligence.evidence.admissible || !anchor
      ? "reject"
      : quote || educational || documentary || historical || news || condemnation
        ? "reject"
        : review
          ? "needs_review"
          : "accept";

    const reason = summarizeReason([
      !primary ? "لا توجد أدلة صالحة" : "",
      !input.intelligence.evidence.admissible ? "الأدلة غير مقبولة" : "",
      anchor ? "تم التعرف على سياق عائلي" : "لا يوجد سياق عائلي كافٍ",
      abuse ? "توجد مؤشرات إساءة أسرية" : "",
      destruction ? "توجد مؤشرات تدمير أو تفكيك للأسرة" : "",
      humiliation ? "توجد مؤشرات إذلال أسري" : "",
      corruption ? "توجد مؤشرات فساد أخلاقي" : "",
      neglect ? "توجد مؤشرات إهمال أبوي" : "",
      glorification ? "توجد مؤشرات تمجيد أو ترويج للضرر الأسري" : "",
      support ? "توجد مؤشرات دعم أو رعاية أسرية" : "",
      quote ? "السياق اقتباس" : "",
      educational ? "السياق تعليمي" : "",
      documentary ? "السياق وثائقي" : "",
      historical ? "السياق تاريخي" : "",
      news ? "السياق خبري" : "",
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
    const anchor = hasFamilyConcept(input) || isFamilyAnchor(combinedText) || isLiteralFamilyHarm(primary.text);
    if (!anchor) return [];

    const quote = isQuoteContext(input, combinedText);
    const educational = isEducationalContext(input, combinedText);
    const documentary = isDocumentaryContext(input, combinedText);
    const historical = isHistoricalContext(input, combinedText);
    const news = isNewsContext(input, combinedText);
    const condemnation = isCondemnationContext(input, combinedText);
    const review = isReviewContext(input, combinedText);

    return [
      createLegalExceptionResult({
        code: "quotation",
        label: "Quotation",
        applies: quote,
        disposition: "block",
        reason: "The family-related line is quoted rather than endorsed.",
        confidence: 0.98,
      }),
      createLegalExceptionResult({
        code: "educational",
        label: "Educational usage",
        applies: educational,
        disposition: "block",
        reason: "The family-related line is discussed in an educational context.",
        confidence: 0.97,
      }),
      createLegalExceptionResult({
        code: "documentary",
        label: "Documentary usage",
        applies: documentary,
        disposition: "block",
        reason: "The family-related line is presented as documentary or reportage material.",
        confidence: 0.96,
      }),
      createLegalExceptionResult({
        code: "historical",
        label: "Historical usage",
        applies: historical,
        disposition: "block",
        reason: "The family-related line is part of historical narration.",
        confidence: 0.96,
      }),
      createLegalExceptionResult({
        code: "news",
        label: "News reporting",
        applies: news,
        disposition: "block",
        reason: "The family-related line is reported as news rather than endorsed.",
        confidence: 0.95,
      }),
      createLegalExceptionResult({
        code: "condemnation",
        label: "Condemnation",
        applies: condemnation,
        disposition: "block",
        reason: "The family-related line is condemned rather than endorsed.",
        confidence: 0.97,
      }),
      createLegalExceptionResult({
        code: "fiction",
        label: "Fictional context",
        applies: review && input.intelligence.flags.fiction === true,
        disposition: "review",
        reason: "The family-related line appears inside fiction and needs reviewer confirmation.",
        confidence: 0.9,
      }),
      createLegalExceptionResult({
        code: "roleplay",
        label: "Role-play context",
        applies: review && containsAny(combinedText, FAMILY_VALUES_RULES.rolePlaySignals),
        disposition: "review",
        reason: "The family-related line appears inside role-play and needs reviewer confirmation.",
        confidence: 0.9,
      }),
      createLegalExceptionResult({
        code: "dream",
        label: "Dream sequence",
        applies: review && input.intelligence.flags.dream === true,
        disposition: "review",
        reason: "The family-related line appears inside a dream sequence and needs reviewer confirmation.",
        confidence: 0.9,
      }),
      createLegalExceptionResult({
        code: "flashback",
        label: "Flashback",
        applies: review && input.intelligence.flags.flashback === true,
        disposition: "review",
        reason: "The family-related line appears inside a flashback and needs reviewer confirmation.",
        confidence: 0.9,
      }),
      createLegalExceptionResult({
        code: "satire",
        label: "Satire",
        applies: review && (input.intelligence.flags.satire === true || input.intelligence.flags.comedy === true),
        disposition: "review",
        reason: "The family-related line appears inside satire or comedy and needs reviewer confirmation.",
        confidence: 0.9,
      }),
      createLegalExceptionResult({
        code: "dialogue",
        label: "Dialogue",
        applies: input.intelligence.narrative.dialogue === true && !quote && !educational && !documentary && !historical && !news && !condemnation && !review,
        disposition: "allow",
        reason: "The family-related line appears in dialogue and remains a direct use.",
        confidence: 0.95,
      }),
      createLegalExceptionResult({
        code: "narration",
        label: "Narration",
        applies: input.intelligence.narrative.narration === true && !quote && !educational && !documentary && !historical && !news && !condemnation && !review,
        disposition: "allow",
        reason: "The family-related line appears in narration and remains a direct use.",
        confidence: 0.95,
      }),
    ];
  }

  buildFinding(input: ReviewerDecisionModuleInput, decision: LegalDecision, exceptions: readonly LegalExceptionResult[]): LegalFinding | null {
    const primary = getPrimaryEvidence(input);
    if (!primary) return null;
    if (!input.intelligence.evidence.admissible) return null;
    const combinedText = buildCombinedText(input);
    const anchor = hasFamilyConcept(input) || isFamilyAnchor(combinedText) || isLiteralFamilyHarm(primary.text);
    if (!anchor) return null;
    if (exceptions.some((exception) => exception.applies && exception.disposition === "block")) return null;

    const harmful = isFamilyAbuseContext(combinedText) || containsAny(combinedText, FAMILY_VALUES_RULES.humiliationTerms) || containsAny(combinedText, FAMILY_VALUES_RULES.neglectTerms) || isFamilyCorruptionContext(combinedText);
    if (!harmful) return null;

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

export const FAMILY_VALUES_MODULE = new FamilyValuesReviewerDecisionModule();

export function isFamilyValuesEvidenceText(text: string): boolean {
  return isLiteralFamilyHarm(text) || isFamilyAnchor(text);
}

export function buildFamilyValuesDecisionTree(): readonly FamilyValuesDecisionStep[] {
  return FAMILY_VALUES_DECISION_TREE;
}
