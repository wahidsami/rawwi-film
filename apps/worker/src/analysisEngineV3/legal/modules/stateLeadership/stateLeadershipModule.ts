import type { LegalDecision } from "../../legalDecision.js";
import type { LegalExceptionResult, LegalFinding } from "../../legalResult.js";
import { createLegalDecision } from "../../legalDecision.js";
import { createLegalExceptionResult, createLegalFinding } from "../../legalResult.js";
import { ReviewerDecisionModuleBase, type ReviewerDecisionModuleInput } from "../../reviewerDecisionModule.js";
import { STATE_LEADERSHIP_DECISION_TREE } from "./stateLeadershipDecisionTree.js";
import type { StateLeadershipDecisionStep } from "./stateLeadershipDecisionTree.js";
import { STATE_LEADERSHIP_RULES } from "./stateLeadershipRules.js";

export const STATE_LEADERSHIP_MODULE_ID = "v3_02_state_leadership";
const STATE_LEADERSHIP_ARTICLE_IDS = Object.freeze([14]);

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

function hasStateLeadershipConcept(input: ReviewerDecisionModuleInput): boolean {
  return input.intelligence.conceptContext.conceptIds.some((conceptId) =>
    [
      "government",
      "military",
      "corruption",
      "bribery",
    ].includes(conceptId),
  );
}

function isStateLeadershipAnchor(text: string): boolean {
  return (
    containsAny(text, STATE_LEADERSHIP_RULES.stateAnchors) ||
    containsAny(text, STATE_LEADERSHIP_RULES.politicalContextSignals)
  );
}

function isLiteralStateLeadershipAttack(text: string): boolean {
  return (
    containsAny(text, STATE_LEADERSHIP_RULES.disrespectTerms) ||
    containsAny(text, STATE_LEADERSHIP_RULES.incitementPhrases)
  );
}

function isDisrespectContext(text: string): boolean {
  return containsAny(text, STATE_LEADERSHIP_RULES.disrespectTerms);
}

function isIncitementContext(text: string): boolean {
  return containsAny(text, STATE_LEADERSHIP_RULES.incitementPhrases);
}

function isSatireContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return input.intelligence.flags.satire === true || input.intelligence.flags.comedy === true || containsAny(combinedText, STATE_LEADERSHIP_RULES.satireSignals);
}

function isQuoteContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return input.intelligence.flags.quotation === true || containsAny(combinedText, STATE_LEADERSHIP_RULES.quotationSignals);
}

function isEducationalContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return input.intelligence.flags.educational === true || containsAny(combinedText, STATE_LEADERSHIP_RULES.educationalSignals);
}

function isDocumentaryContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return input.intelligence.flags.documentary === true || containsAny(combinedText, STATE_LEADERSHIP_RULES.documentarySignals);
}

function isHistoricalContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return input.intelligence.flags.historical === true || containsAny(combinedText, STATE_LEADERSHIP_RULES.historicalSignals);
}

function isNewsContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return input.intelligence.flags.news === true || containsAny(combinedText, STATE_LEADERSHIP_RULES.newsSignals);
}

function isCourtContext(combinedText: string): boolean {
  return containsAny(combinedText, STATE_LEADERSHIP_RULES.courtSignals);
}

function isCondemnationContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return input.intelligence.narrative.condemnation === true || input.intelligence.flags.condemnation === true || containsAny(combinedText, STATE_LEADERSHIP_RULES.condemnationSignals);
}

function isReviewContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return (
    input.intelligence.flags.fiction === true ||
    input.intelligence.flags.comedy === true ||
    input.intelligence.flags.satire === true ||
    input.intelligence.flags.dream === true ||
    input.intelligence.flags.flashback === true ||
    containsAny(combinedText, STATE_LEADERSHIP_RULES.fictionSignals) ||
    containsAny(combinedText, STATE_LEADERSHIP_RULES.rolePlaySignals) ||
    containsAny(combinedText, STATE_LEADERSHIP_RULES.dreamSignals) ||
    containsAny(combinedText, STATE_LEADERSHIP_RULES.flashbackSignals) ||
    containsAny(combinedText, STATE_LEADERSHIP_RULES.satireSignals)
  );
}

function inferArticleIds(input: ReviewerDecisionModuleInput, combinedText: string): readonly number[] {
  const ids = new Set<number>();
  if (hasStateLeadershipConcept(input) || isStateLeadershipAnchor(combinedText) || isLiteralStateLeadershipAttack(combinedText)) {
      if (isDisrespectContext(combinedText) || isSatireContext(input, combinedText)) ids.add(17);
      if (isIncitementContext(combinedText)) ids.add(14);
  }
  if (ids.size === 0) return STATE_LEADERSHIP_ARTICLE_IDS;
  return Object.freeze([...ids].sort((left, right) => left - right));
}

function summarizeReason(parts: readonly string[]): string {
  return [...new Set(parts.map((part) => part.trim()).filter(Boolean))].join(" | ");
}

function buildTrace(input: ReviewerDecisionModuleInput, status: LegalDecision["status"], reason: string): readonly string[] {
  const combinedText = buildCombinedText(input);
  return [
    "state_leadership:evidence_exists",
    `state_leadership:admissible:${String(input.intelligence.evidence.admissible)}`,
    `state_leadership:anchor:${String(isStateLeadershipAnchor(combinedText) || hasStateLeadershipConcept(input) || isLiteralStateLeadershipAttack(combinedText))}`,
    `state_leadership:literal:${String(isLiteralStateLeadershipAttack(getPrimaryEvidence(input)?.text ?? combinedText))}`,
    `state_leadership:disrespect:${String(isDisrespectContext(combinedText))}`,
    `state_leadership:incitement:${String(isIncitementContext(combinedText))}`,
    `state_leadership:satire:${String(isSatireContext(input, combinedText))}`,
    `state_leadership:quote:${String(isQuoteContext(input, combinedText))}`,
    `state_leadership:education:${String(isEducationalContext(input, combinedText))}`,
    `state_leadership:documentary:${String(isDocumentaryContext(input, combinedText))}`,
    `state_leadership:historical:${String(isHistoricalContext(input, combinedText))}`,
    `state_leadership:news:${String(isNewsContext(input, combinedText))}`,
    `state_leadership:court:${String(isCourtContext(combinedText))}`,
    `state_leadership:condemnation:${String(isCondemnationContext(input, combinedText))}`,
    `state_leadership:review:${String(isReviewContext(input, combinedText))}`,
    `state_leadership:status:${status}`,
    `state_leadership:reason:${reason}`,
  ];
}

function buildFindingKey(moduleId: string, evidenceText: string, startOffset: number, endOffset: number, articleIds: readonly number[], status: string): string {
  return `${moduleId}:${startOffset}-${endOffset}:${articleIds.join("-")}:${normalizeText(evidenceText)}:${status}`;
}

export class StateLeadershipReviewerDecisionModule extends ReviewerDecisionModuleBase {
  constructor() {
    super({
      id: STATE_LEADERSHIP_MODULE_ID,
      title: "شؤون القيادة السياسية الأساسية",
      articleIds: STATE_LEADERSHIP_ARTICLE_IDS,
    });
  }

  applies(input: ReviewerDecisionModuleInput): boolean {
    const primary = getPrimaryEvidence(input);
    if (!primary) return false;
    if (!input.intelligence.evidence.admissible) return false;
    const combinedText = buildCombinedText(input);
    return (
      (hasStateLeadershipConcept(input) || isStateLeadershipAnchor(combinedText) || isLiteralStateLeadershipAttack(primary.text)) &&
      (isDisrespectContext(combinedText) || isIncitementContext(combinedText) || isSatireContext(input, combinedText))
    );
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
    const satire = isSatireContext(input, combinedText);
    const anchor = hasStateLeadershipConcept(input) || isStateLeadershipAnchor(combinedText) || isLiteralStateLeadershipAttack(combinedText);
    const literal = primary ? isLiteralStateLeadershipAttack(primary.text) : false;
    const disrespect = isDisrespectContext(combinedText);
    const incitement = isIncitementContext(combinedText);
    const harmful = disrespect || incitement || satire;
    const applies = Boolean(primary && input.intelligence.evidence.admissible && anchor && harmful);

    const status: LegalDecision["status"] = !primary || !input.intelligence.evidence.admissible || !anchor
      ? "reject"
      : !harmful
        ? "reject"
      : quote || educational || documentary || historical || news || court || condemnation
        ? "reject"
        : review
          ? "needs_review"
          : "accept";

    const reason = summarizeReason([
      !primary ? "لا توجد أدلة صالحة" : "",
      !input.intelligence.evidence.admissible ? "الأدلة غير مقبولة" : "",
      anchor ? "تم التعرف على سياق قيادي/سياسي" : "لا يوجد سياق قيادي/سياسي كافٍ",
      literal ? "توجد إساءة أو تحريض سياسي حرفي" : "لا توجد إساءة أو تحريض سياسي حرفي",
      disrespect ? "توجد إساءة أو ازدراء سياسي" : "",
      incitement ? "توجد دعوة أو تحريض سياسي" : "",
      satire ? "توجد سخرية أو تهكم سياسي" : "",
      quote ? "السياق اقتباس" : "",
      educational ? "السياق تعليمي" : "",
      documentary ? "السياق وثائقي" : "",
      historical ? "السياق تاريخي" : "",
      news ? "السياق خبري" : "",
      court ? "السياق قضائي" : "",
      condemnation ? "السياق إدانة" : "",
      review ? "السياق ساخر/تمثيلي ويحتاج مراجعة" : "",
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
    const anchor = hasStateLeadershipConcept(input) || isStateLeadershipAnchor(combinedText) || isLiteralStateLeadershipAttack(primary.text);
    if (!anchor) return [];
    if (!(isDisrespectContext(combinedText) || isIncitementContext(combinedText) || isSatireContext(input, combinedText))) return [];

    const quote = isQuoteContext(input, combinedText);
    const educational = isEducationalContext(input, combinedText);
    const documentary = isDocumentaryContext(input, combinedText);
    const historical = isHistoricalContext(input, combinedText);
    const news = isNewsContext(input, combinedText);
    const court = isCourtContext(combinedText);
    const condemnation = isCondemnationContext(input, combinedText);
    const review = isReviewContext(input, combinedText);
    const satire = isSatireContext(input, combinedText);

    return [
      createLegalExceptionResult({
        code: "quotation",
        label: "Quotation",
        applies: quote,
        disposition: "block",
        reason: "The state leadership line is quoted rather than endorsed.",
        confidence: 0.98,
      }),
      createLegalExceptionResult({
        code: "educational",
        label: "Educational usage",
        applies: educational,
        disposition: "block",
        reason: "The state leadership line is discussed in an educational or explanatory context.",
        confidence: 0.97,
      }),
      createLegalExceptionResult({
        code: "documentary",
        label: "Documentary usage",
        applies: documentary,
        disposition: "block",
        reason: "The state leadership line is presented as documentary or reportage material.",
        confidence: 0.96,
      }),
      createLegalExceptionResult({
        code: "historical",
        label: "Historical usage",
        applies: historical,
        disposition: "block",
        reason: "The state leadership line is part of historical narration.",
        confidence: 0.96,
      }),
      createLegalExceptionResult({
        code: "news",
        label: "News reporting",
        applies: news,
        disposition: "block",
        reason: "The state leadership line is reported as news rather than endorsed.",
        confidence: 0.95,
      }),
      createLegalExceptionResult({
        code: "court",
        label: "Court proceedings",
        applies: court,
        disposition: "block",
        reason: "The state leadership line appears in court testimony or legal proceedings.",
        confidence: 0.95,
      }),
      createLegalExceptionResult({
        code: "condemnation",
        label: "Condemnation",
        applies: condemnation,
        disposition: "block",
        reason: "The state leadership line is condemned rather than endorsed.",
        confidence: 0.97,
      }),
      createLegalExceptionResult({
        code: "fiction",
        label: "Fictional context",
        applies: review && input.intelligence.flags.fiction === true,
        disposition: "review",
        reason: "The state leadership line appears inside fiction and needs reviewer confirmation.",
        confidence: 0.9,
      }),
      createLegalExceptionResult({
        code: "roleplay",
        label: "Role-play context",
        applies: review && containsAny(combinedText, STATE_LEADERSHIP_RULES.rolePlaySignals),
        disposition: "review",
        reason: "The state leadership line appears inside role-play and needs reviewer confirmation.",
        confidence: 0.9,
      }),
      createLegalExceptionResult({
        code: "dream",
        label: "Dream sequence",
        applies: review && input.intelligence.flags.dream === true,
        disposition: "review",
        reason: "The state leadership line appears inside a dream sequence and needs reviewer confirmation.",
        confidence: 0.9,
      }),
      createLegalExceptionResult({
        code: "flashback",
        label: "Flashback",
        applies: review && input.intelligence.flags.flashback === true,
        disposition: "review",
        reason: "The state leadership line appears inside a flashback and needs reviewer confirmation.",
        confidence: 0.9,
      }),
      createLegalExceptionResult({
        code: "satire",
        label: "Satire",
        applies: review && satire,
        disposition: "review",
        reason: "The state leadership line appears inside satire and needs reviewer confirmation.",
        confidence: 0.9,
      }),
      createLegalExceptionResult({
        code: "dialogue",
        label: "Dialogue",
        applies: input.intelligence.narrative.dialogue === true && !quote && !educational && !documentary && !historical && !news && !court && !condemnation && !review,
        disposition: "allow",
        reason: "The state leadership line appears in dialogue and remains a direct use.",
        confidence: 0.95,
      }),
      createLegalExceptionResult({
        code: "narration",
        label: "Narration",
        applies: input.intelligence.narrative.narration === true && !quote && !educational && !documentary && !historical && !news && !court && !condemnation && !review,
        disposition: "allow",
        reason: "The state leadership line appears in narration and remains a direct use.",
        confidence: 0.95,
      }),
    ];
  }

  buildFinding(input: ReviewerDecisionModuleInput, decision: LegalDecision, exceptions: readonly LegalExceptionResult[]): LegalFinding | null {
    const primary = getPrimaryEvidence(input);
    if (!primary) return null;
    if (!input.intelligence.evidence.admissible) return null;
    const combinedText = buildCombinedText(input);
    const anchor = hasStateLeadershipConcept(input) || isStateLeadershipAnchor(combinedText) || isLiteralStateLeadershipAttack(primary.text);
    if (!anchor) return null;
    if (exceptions.some((exception) => exception.applies && exception.disposition === "block")) return null;
    if (!(isDisrespectContext(combinedText) || isIncitementContext(combinedText) || isSatireContext(input, combinedText))) return null;

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

export const STATE_LEADERSHIP_MODULE = new StateLeadershipReviewerDecisionModule();

export function isStateLeadershipEvidenceText(text: string): boolean {
  return isLiteralStateLeadershipAttack(text) || isStateLeadershipAnchor(text);
}

export function buildStateLeadershipDecisionTree(): readonly StateLeadershipDecisionStep[] {
  return STATE_LEADERSHIP_DECISION_TREE;
}
