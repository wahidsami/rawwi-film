import type { LegalDecision } from "../../legalDecision.js";
import type { LegalExceptionResult, LegalFinding } from "../../legalResult.js";
import { createLegalDecision } from "../../legalDecision.js";
import { createLegalExceptionResult, createLegalFinding } from "../../legalResult.js";
import { ReviewerDecisionModuleBase, type ReviewerDecisionModuleInput } from "../../reviewerDecisionModule.js";
import { SOCIETY_DECISION_TREE } from "./societyDecisionTree.js";
import type { SocietyDecisionStep } from "./societyDecisionTree.js";
import { SOCIETY_RULES } from "./societyRules.js";

export const SOCIETY_MODULE_ID = "v3_05_society";
const SOCIETY_ARTICLE_IDS = Object.freeze([4, 8, 12, 17, 18]);

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

function hasSocietyConcept(input: ReviewerDecisionModuleInput): boolean {
  return input.intelligence.conceptContext.conceptIds.some((conceptId) => conceptId.startsWith("society_") || ["racism", "discrimination", "bullying", "harassment", "hate", "tribalism", "sectarianism"].includes(conceptId));
}

function isSocietyAnchor(text: string): boolean {
  return containsAny(text, SOCIETY_RULES.societyAnchors);
}

function isLiteralSocietyHarm(text: string): boolean {
  return containsAny(text, SOCIETY_RULES.directTerms) || containsAny(text, SOCIETY_RULES.racismTerms) || containsAny(text, SOCIETY_RULES.discriminationTerms) || containsAny(text, SOCIETY_RULES.hateSpeechTerms) || containsAny(text, SOCIETY_RULES.bullyingTerms);
}

function isQuoteContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return input.intelligence.flags.quotation === true || containsAny(combinedText, SOCIETY_RULES.quotationSignals);
}

function isEducationalContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return input.intelligence.flags.educational === true || containsAny(combinedText, SOCIETY_RULES.educationalSignals);
}

function isDocumentaryContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return input.intelligence.flags.documentary === true || containsAny(combinedText, SOCIETY_RULES.documentarySignals);
}

function isHistoricalContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return input.intelligence.flags.historical === true || containsAny(combinedText, SOCIETY_RULES.historicalSignals);
}

function isNewsContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return input.intelligence.flags.news === true || containsAny(combinedText, SOCIETY_RULES.newsSignals);
}

function isCondemnationContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return input.intelligence.narrative.condemnation === true || input.intelligence.flags.condemnation === true || containsAny(combinedText, SOCIETY_RULES.condemnationSignals);
}

function isReviewContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return (
    input.intelligence.flags.fiction === true ||
    input.intelligence.flags.comedy === true ||
    input.intelligence.flags.satire === true ||
    input.intelligence.flags.dream === true ||
    input.intelligence.flags.flashback === true ||
    containsAny(combinedText, SOCIETY_RULES.fictionSignals) ||
    containsAny(combinedText, SOCIETY_RULES.comedySignals) ||
    containsAny(combinedText, SOCIETY_RULES.satireSignals) ||
    containsAny(combinedText, SOCIETY_RULES.dreamSignals) ||
    containsAny(combinedText, SOCIETY_RULES.flashbackSignals) ||
    containsAny(combinedText, SOCIETY_RULES.rolePlaySignals)
  );
}

function isFamilyContext(combinedText: string): boolean {
  return containsAny(combinedText, SOCIETY_RULES.familySignals);
}

function isSupportContext(combinedText: string): boolean {
  return containsAny(combinedText, SOCIETY_RULES.supportSignals);
}

function isDiscriminationContext(combinedText: string): boolean {
  return containsAny(combinedText, SOCIETY_RULES.discriminationTerms) || containsAny(combinedText, SOCIETY_RULES.racismTerms) || containsAny(combinedText, SOCIETY_RULES.hateSpeechTerms) || containsAny(combinedText, SOCIETY_RULES.sectarianTerms) || containsAny(combinedText, SOCIETY_RULES.tribalTerms) || containsAny(combinedText, SOCIETY_RULES.culturalInsultTerms);
}

function inferArticleIds(combinedText: string): readonly number[] {
  const ids = new Set<number>();
  ids.add(4);
  if (isFamilyContext(combinedText)) ids.add(8);
  if (containsAny(combinedText, ["public panic", "rumor spreading", "social media", "cyber bullying", "cyberbullying"])) ids.add(12);
  if (isDiscriminationContext(combinedText) || containsAny(combinedText, SOCIETY_RULES.bullyingTerms)) ids.add(17);
  if (containsAny(combinedText, ["social cohesion", "cultural identity", "national identity", "community", "community support", "kindness", "charity"])) ids.add(18);
  return Object.freeze([...ids].sort((left, right) => left - right));
}

function summarizeReason(parts: readonly string[]): string {
  return [...new Set(parts.map((part) => part.trim()).filter(Boolean))].join(" | ");
}

function buildTrace(input: ReviewerDecisionModuleInput, status: LegalDecision["status"], reason: string): readonly string[] {
  const combinedText = buildCombinedText(input);
  return [
    "society:evidence_exists",
    `society:admissible:${String(input.intelligence.evidence.admissible)}`,
    `society:anchor:${String(isSocietyAnchor(combinedText) || hasSocietyConcept(input) || isLiteralSocietyHarm(combinedText))}`,
    `society:racism:${String(containsAny(combinedText, SOCIETY_RULES.racismTerms))}`,
    `society:discrimination:${String(containsAny(combinedText, SOCIETY_RULES.discriminationTerms))}`,
    `society:hate_speech:${String(containsAny(combinedText, SOCIETY_RULES.hateSpeechTerms))}`,
    `society:stereotyping:${String(containsAny(combinedText, SOCIETY_RULES.stereotypingTerms))}`,
    `society:sectarianism:${String(containsAny(combinedText, SOCIETY_RULES.sectarianTerms))}`,
    `society:tribal:${String(containsAny(combinedText, SOCIETY_RULES.tribalTerms))}`,
    `society:cultural_insult:${String(containsAny(combinedText, SOCIETY_RULES.culturalInsultTerms))}`,
    `society:bullying:${String(containsAny(combinedText, SOCIETY_RULES.bullyingTerms))}`,
    `society:quote:${String(isQuoteContext(input, combinedText))}`,
    `society:education:${String(isEducationalContext(input, combinedText))}`,
    `society:documentary:${String(isDocumentaryContext(input, combinedText))}`,
    `society:historical:${String(isHistoricalContext(input, combinedText))}`,
    `society:news:${String(isNewsContext(input, combinedText))}`,
    `society:condemnation:${String(isCondemnationContext(input, combinedText))}`,
    `society:review:${String(isReviewContext(input, combinedText))}`,
    `society:status:${status}`,
    `society:reason:${reason}`,
  ];
}

function buildFindingKey(moduleId: string, evidenceText: string, startOffset: number, endOffset: number, articleIds: readonly number[], status: string): string {
  return `${moduleId}:${startOffset}-${endOffset}:${articleIds.join("-")}:${normalizeText(evidenceText)}:${status}`;
}

export class SocietyReviewerDecisionModule extends ReviewerDecisionModuleBase {
  constructor() {
    super({
      id: SOCIETY_MODULE_ID,
      title: "المجتمع والهوية",
      articleIds: SOCIETY_ARTICLE_IDS,
    });
  }

  applies(input: ReviewerDecisionModuleInput): boolean {
    const primary = getPrimaryEvidence(input);
    if (!primary) return false;
    if (!input.intelligence.evidence.admissible) return false;
    const combinedText = buildCombinedText(input);
    return (
      hasSocietyConcept(input) ||
      isSocietyAnchor(combinedText) ||
      isLiteralSocietyHarm(primary.text) ||
      isDiscriminationContext(combinedText) ||
      isSupportContext(combinedText)
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
    const condemnation = isCondemnationContext(input, combinedText);
    const review = isReviewContext(input, combinedText);
    const anchor = hasSocietyConcept(input) || isSocietyAnchor(combinedText) || isLiteralSocietyHarm(combinedText) || isSupportContext(combinedText);
    const racism = containsAny(combinedText, SOCIETY_RULES.racismTerms);
    const discrimination = containsAny(combinedText, SOCIETY_RULES.discriminationTerms);
    const hateSpeech = containsAny(combinedText, SOCIETY_RULES.hateSpeechTerms);
    const stereotyping = containsAny(combinedText, SOCIETY_RULES.stereotypingTerms);
    const sectarianism = containsAny(combinedText, SOCIETY_RULES.sectarianTerms);
    const tribal = containsAny(combinedText, SOCIETY_RULES.tribalTerms);
    const culturalInsult = containsAny(combinedText, SOCIETY_RULES.culturalInsultTerms);
    const bullying = containsAny(combinedText, SOCIETY_RULES.bullyingTerms);
    const harmful = racism || discrimination || hateSpeech || stereotyping || sectarianism || tribal || culturalInsult || bullying;
    const support = isSupportContext(combinedText);
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
      anchor ? "تم التعرف على سياق اجتماعي/هوية" : "لا يوجد سياق اجتماعي كافٍ",
      racism ? "توجد مؤشرات عنصرية" : "",
      discrimination ? "توجد مؤشرات تمييز" : "",
      hateSpeech ? "توجد مؤشرات خطاب كراهية" : "",
      stereotyping ? "توجد مؤشرات تعميم نمطي" : "",
      sectarianism ? "توجد مؤشرات طائفية" : "",
      tribal ? "توجد مؤشرات هجوم قبلي" : "",
      culturalInsult ? "توجد مؤشرات إهانة ثقافية" : "",
      bullying ? "توجد مؤشرات تنمر أو إهانة" : "",
      support ? "توجد مؤشرات دعم أو تضامن اجتماعي" : "",
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
    const anchor = hasSocietyConcept(input) || isSocietyAnchor(combinedText) || isLiteralSocietyHarm(primary.text) || isSupportContext(combinedText);
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
        reason: "The society-related line is quoted rather than endorsed.",
        confidence: 0.98,
      }),
      createLegalExceptionResult({
        code: "educational",
        label: "Educational usage",
        applies: educational,
        disposition: "block",
        reason: "The society-related line is discussed in an educational context.",
        confidence: 0.97,
      }),
      createLegalExceptionResult({
        code: "documentary",
        label: "Documentary usage",
        applies: documentary,
        disposition: "block",
        reason: "The society-related line is presented as documentary or reportage material.",
        confidence: 0.96,
      }),
      createLegalExceptionResult({
        code: "historical",
        label: "Historical usage",
        applies: historical,
        disposition: "block",
        reason: "The society-related line is part of historical narration.",
        confidence: 0.96,
      }),
      createLegalExceptionResult({
        code: "news",
        label: "News reporting",
        applies: news,
        disposition: "block",
        reason: "The society-related line is reported as news rather than endorsed.",
        confidence: 0.95,
      }),
      createLegalExceptionResult({
        code: "condemnation",
        label: "Condemnation",
        applies: condemnation,
        disposition: "block",
        reason: "The society-related line is condemned rather than endorsed.",
        confidence: 0.97,
      }),
      createLegalExceptionResult({
        code: "fiction",
        label: "Fictional context",
        applies: review && input.intelligence.flags.fiction === true,
        disposition: "review",
        reason: "The society-related line appears inside fiction and needs reviewer confirmation.",
        confidence: 0.9,
      }),
      createLegalExceptionResult({
        code: "satire",
        label: "Satire context",
        applies: review && input.intelligence.flags.satire === true,
        disposition: "review",
        reason: "The society-related line appears inside satire and needs reviewer confirmation.",
        confidence: 0.9,
      }),
      createLegalExceptionResult({
        code: "dream",
        label: "Dream sequence",
        applies: review && input.intelligence.flags.dream === true,
        disposition: "review",
        reason: "The society-related line appears inside a dream sequence and needs reviewer confirmation.",
        confidence: 0.9,
      }),
      createLegalExceptionResult({
        code: "flashback",
        label: "Flashback",
        applies: review && input.intelligence.flags.flashback === true,
        disposition: "review",
        reason: "The society-related line appears inside a flashback and needs reviewer confirmation.",
        confidence: 0.9,
      }),
      createLegalExceptionResult({
        code: "roleplay",
        label: "Role-play context",
        applies: review && containsAny(combinedText, SOCIETY_RULES.rolePlaySignals),
        disposition: "review",
        reason: "The society-related line appears inside role-play and needs reviewer confirmation.",
        confidence: 0.9,
      }),
      createLegalExceptionResult({
        code: "dialogue",
        label: "Dialogue",
        applies: input.intelligence.narrative.dialogue === true && !quote && !educational && !documentary && !historical && !news && !condemnation && !review,
        disposition: "allow",
        reason: "The society-related line appears in dialogue and remains a direct use.",
        confidence: 0.95,
      }),
      createLegalExceptionResult({
        code: "narration",
        label: "Narration",
        applies: input.intelligence.narrative.narration === true && !quote && !educational && !documentary && !historical && !news && !condemnation && !review,
        disposition: "allow",
        reason: "The society-related line appears in narration and remains a direct use.",
        confidence: 0.95,
      }),
    ];
  }

  buildFinding(input: ReviewerDecisionModuleInput, decision: LegalDecision, exceptions: readonly LegalExceptionResult[]): LegalFinding | null {
    const primary = getPrimaryEvidence(input);
    if (!primary) return null;
    if (!input.intelligence.evidence.admissible) return null;
    const combinedText = buildCombinedText(input);
    const anchor = hasSocietyConcept(input) || isSocietyAnchor(combinedText) || isLiteralSocietyHarm(primary.text) || isSupportContext(combinedText);
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

export const SOCIETY_MODULE = new SocietyReviewerDecisionModule();

export function isSocietyEvidenceText(text: string): boolean {
  return isLiteralSocietyHarm(text) || isSocietyAnchor(text);
}

export function buildSocietyDecisionTree(): readonly SocietyDecisionStep[] {
  return SOCIETY_DECISION_TREE;
}
