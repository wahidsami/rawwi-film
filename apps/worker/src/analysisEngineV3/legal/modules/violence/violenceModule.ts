import type { LegalDecision } from "../../legalDecision.js";
import type { LegalExceptionResult, LegalFinding } from "../../legalResult.js";
import { createLegalDecision } from "../../legalDecision.js";
import { createLegalExceptionResult, createLegalFinding } from "../../legalResult.js";
import { ReviewerDecisionModuleBase, type ReviewerDecisionModuleInput } from "../../reviewerDecisionModule.js";
import { VIOLENCE_DECISION_TREE } from "./violenceDecisionTree.js";
import type { ViolenceDecisionStep } from "./violenceDecisionTree.js";
import { VIOLENCE_RULES } from "./violenceRules.js";

export const VIOLENCE_MODULE_ID = "v3_08_violence";
const VIOLENCE_ARTICLE_IDS = Object.freeze([9, 12, 14, 17]);

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

function hasViolenceConcept(input: ReviewerDecisionModuleInput): boolean {
  return input.intelligence.conceptContext.conceptIds.some((conceptId) => conceptId.includes("violence"));
}

function isViolenceAnchor(text: string): boolean {
  return containsAny(text, VIOLENCE_RULES.violenceAnchors);
}

function isLiteralViolenceContext(text: string): boolean {
  return containsAny(text, VIOLENCE_RULES.directViolenceTerms);
}

function isSelfDefenseContext(text: string): boolean {
  return containsAny(text, VIOLENCE_RULES.selfDefenseTerms);
}

function isLawEnforcementContext(text: string): boolean {
  return containsAny(text, VIOLENCE_RULES.lawEnforcementTerms);
}

function isJustifiedContext(text: string): boolean {
  return containsAny(text, VIOLENCE_RULES.justifiedTerms);
}

function isCondemnationContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return input.intelligence.narrative.condemnation === true || input.intelligence.flags.condemnation === true || containsAny(combinedText, VIOLENCE_RULES.condemnationTerms);
}

function isQuoteContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return input.intelligence.flags.quotation === true || containsAny(combinedText, ["\"", "«", "»", "quoted", "quote", "quotation", "اقتباس", "منقول"]);
}

function isEducationalContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return input.intelligence.flags.educational === true || containsAny(combinedText, ["educational", "education", "instruction", "شرح", "درس", "تعليمي", "تدريب"]);
}

function isHistoricalContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return input.intelligence.flags.historical === true || containsAny(combinedText, VIOLENCE_RULES.historicalTerms);
}

function isDocumentaryContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return input.intelligence.flags.documentary === true || containsAny(combinedText, VIOLENCE_RULES.documentaryTerms);
}

function isNewsContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return input.intelligence.flags.news === true || containsAny(combinedText, ["news", "خبر", "report", "reported"]);
}

function isCourtContext(combinedText: string): boolean {
  return containsAny(combinedText, ["court", "trial", "testimony", "محكمة", "شهادة"]);
}

function isReviewContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return (
    input.intelligence.flags.fiction === true ||
    input.intelligence.flags.comedy === true ||
    input.intelligence.flags.satire === true ||
    input.intelligence.flags.dream === true ||
    input.intelligence.flags.flashback === true ||
    containsAny(combinedText, VIOLENCE_RULES.fictionTerms) ||
    containsAny(combinedText, VIOLENCE_RULES.comedyTerms) ||
    containsAny(combinedText, VIOLENCE_RULES.dreamTerms) ||
    containsAny(combinedText, VIOLENCE_RULES.flashbackTerms) ||
    containsAny(combinedText, VIOLENCE_RULES.rolePlayTerms) ||
    isSelfDefenseContext(combinedText) ||
    isLawEnforcementContext(combinedText) ||
    isJustifiedContext(combinedText)
  );
}

function isGraphicViolenceContext(combinedText: string): boolean {
  return containsAny(combinedText, ["graphic violence", "دموي", "دماء", "gore", "brutal", "وحشي", "مروّع"]);
}

function isDomesticViolenceContext(combinedText: string): boolean {
  return containsAny(combinedText, ["domestic violence", "عنف منزلي", "عنف أسري", "العنف الأسري"]);
}

function hasProtectedTarget(combinedText: string): boolean {
  return (
    containsAny(combinedText, VIOLENCE_RULES.againstChildTerms) ||
    containsAny(combinedText, VIOLENCE_RULES.againstWomanTerms) ||
    containsAny(combinedText, VIOLENCE_RULES.againstDisabledTerms) ||
    containsAny(combinedText, VIOLENCE_RULES.againstPublicTerms) ||
    containsAny(combinedText, VIOLENCE_RULES.againstStateTerms) ||
    isDomesticViolenceContext(combinedText)
  );
}

function inferArticleIds(combinedText: string): readonly number[] {
  const ids = new Set<number>();
  ids.add(9);

  const directViolence =
    containsAny(combinedText, VIOLENCE_RULES.directViolenceTerms) ||
    isGraphicViolenceContext(combinedText) ||
    containsAny(combinedText, VIOLENCE_RULES.weaponTerms);

  if (directViolence) ids.add(14);
  if (isSelfDefenseContext(combinedText) || isLawEnforcementContext(combinedText)) ids.add(12);
  if (hasProtectedTarget(combinedText)) ids.add(17);

  return Object.freeze([...ids].sort((left, right) => left - right));
}

function summarizeReason(parts: readonly string[]): string {
  return [...new Set(parts.map((part) => part.trim()).filter(Boolean))].join(" | ");
}

function buildTrace(input: ReviewerDecisionModuleInput, status: LegalDecision["status"], reason: string): readonly string[] {
  const combinedText = buildCombinedText(input);
  return [
    "violence:evidence_exists",
    `violence:admissible:${String(input.intelligence.evidence.admissible)}`,
    `violence:anchor:${String(isViolenceAnchor(combinedText) || hasViolenceConcept(input) || isLiteralViolenceContext(combinedText))}`,
    `violence:literal:${String(isLiteralViolenceContext(getPrimaryEvidence(input)?.text ?? combinedText))}`,
    `violence:self_defense:${String(isSelfDefenseContext(combinedText))}`,
    `violence:law_enforcement:${String(isLawEnforcementContext(combinedText))}`,
    `violence:justified:${String(isJustifiedContext(combinedText))}`,
    `violence:graphic:${String(isGraphicViolenceContext(combinedText))}`,
    `violence:domestic:${String(isDomesticViolenceContext(combinedText))}`,
    `violence:quote:${String(isQuoteContext(input, combinedText))}`,
    `violence:education:${String(isEducationalContext(input, combinedText))}`,
    `violence:historical:${String(isHistoricalContext(input, combinedText))}`,
    `violence:documentary:${String(isDocumentaryContext(input, combinedText))}`,
    `violence:news:${String(isNewsContext(input, combinedText))}`,
    `violence:court:${String(isCourtContext(combinedText))}`,
    `violence:condemnation:${String(isCondemnationContext(input, combinedText))}`,
    `violence:review:${String(isReviewContext(input, combinedText))}`,
    `violence:status:${status}`,
    `violence:reason:${reason}`,
  ];
}

function buildFindingKey(moduleId: string, evidenceText: string, startOffset: number, endOffset: number, articleIds: readonly number[], status: string): string {
  return `${moduleId}:${startOffset}-${endOffset}:${articleIds.join("-")}:${normalizeText(evidenceText)}:${status}`;
}

export class ViolenceReviewerDecisionModule extends ReviewerDecisionModuleBase {
  constructor() {
    super({
      id: VIOLENCE_MODULE_ID,
      title: "العنف",
      articleIds: VIOLENCE_ARTICLE_IDS,
    });
  }

  applies(input: ReviewerDecisionModuleInput): boolean {
    const primary = getPrimaryEvidence(input);
    if (!primary) return false;
    if (!input.intelligence.evidence.admissible) return false;
    const combinedText = buildCombinedText(input);
    return (
      hasViolenceConcept(input) ||
      isViolenceAnchor(combinedText) ||
      isLiteralViolenceContext(primary.text) ||
      isSelfDefenseContext(combinedText) ||
      isLawEnforcementContext(combinedText) ||
      isJustifiedContext(combinedText) ||
      isDomesticViolenceContext(combinedText) ||
      isGraphicViolenceContext(combinedText)
    );
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
    const selfDefense = isSelfDefenseContext(combinedText);
    const lawEnforcement = isLawEnforcementContext(combinedText);
    const justified = isJustifiedContext(combinedText);
    const graphic = isGraphicViolenceContext(combinedText);
    const domestic = isDomesticViolenceContext(combinedText);
    const anchor = hasViolenceConcept(input) || isViolenceAnchor(combinedText) || isLiteralViolenceContext(combinedText);
    const literal = primary ? isLiteralViolenceContext(primary.text) : false;
    const directViolence = literal || graphic || domestic || containsAny(combinedText, ["murder", "torture", "قتل", "طعن", "ضرب", "اعتداء", "weapon", "weapons", "سلاح", "مسدس", "بندقية"]);
    const applies = Boolean(primary && input.intelligence.evidence.admissible && anchor && (directViolence || selfDefense || lawEnforcement || justified || review));

    const status: LegalDecision["status"] = !primary || !input.intelligence.evidence.admissible || !anchor
      ? "reject"
      : quote || educational || historical || news || court || condemnation
        ? "reject"
        : documentary && directViolence
          ? "reject"
          : selfDefense || lawEnforcement || justified || documentary || review
            ? "needs_review"
            : "accept";

    const reason = summarizeReason([
      !primary ? "لا توجد أدلة صالحة" : "",
      !input.intelligence.evidence.admissible ? "الأدلة غير مقبولة" : "",
      anchor ? "تم التعرف على سياق العنف" : "لا يوجد سياق عنف كافٍ",
      literal ? "توجد إشارة عنف حرفية" : "لا توجد إشارة عنف حرفية",
      selfDefense ? "توجد مؤشرات دفاع عن النفس" : "",
      lawEnforcement ? "توجد مؤشرات استخدام قوة من جهة إنفاذ القانون" : "",
      justified ? "توجد مؤشرات عنف مبرر" : "",
      graphic ? "توجد مؤشرات عنف دموي أو صريح" : "",
      domestic ? "توجد مؤشرات عنف أسري" : "",
      quote ? "السياق اقتباس" : "",
      educational ? "السياق تعليمي" : "",
      historical ? "السياق تاريخي" : "",
      documentary ? "السياق وثائقي" : "",
      news ? "السياق خبري" : "",
      court ? "السياق قضائي" : "",
      condemnation ? "السياق إدانة" : "",
      review ? "السياق روائي/تمثيلي أو يفتقر للحسم" : "",
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
    const anchor = hasViolenceConcept(input) || isViolenceAnchor(combinedText) || isLiteralViolenceContext(primary.text);
    if (!anchor) return [];
    const quote = isQuoteContext(input, combinedText);
    const educational = isEducationalContext(input, combinedText);
    const historical = isHistoricalContext(input, combinedText);
    const documentary = isDocumentaryContext(input, combinedText);
    const news = isNewsContext(input, combinedText);
    const court = isCourtContext(combinedText);
    const condemnation = isCondemnationContext(input, combinedText);
    const review = isReviewContext(input, combinedText);
    const selfDefense = isSelfDefenseContext(combinedText);
    const lawEnforcement = isLawEnforcementContext(combinedText);
    const justified = isJustifiedContext(combinedText);

    return [
      createLegalExceptionResult({
        code: "quotation",
        label: "Quotation",
        applies: quote,
        disposition: "block",
        reason: "The violence line is quoted rather than endorsed.",
        confidence: 0.98,
      }),
      createLegalExceptionResult({
        code: "educational",
        label: "Educational usage",
        applies: educational,
        disposition: "block",
        reason: "The violence line is discussed in an educational or explanatory context.",
        confidence: 0.97,
      }),
      createLegalExceptionResult({
        code: "historical",
        label: "Historical usage",
        applies: historical,
        disposition: "block",
        reason: "The violence line is part of historical narration.",
        confidence: 0.96,
      }),
      createLegalExceptionResult({
        code: "news",
        label: "News reporting",
        applies: news,
        disposition: "block",
        reason: "The violence line is reported as news rather than endorsed.",
        confidence: 0.95,
      }),
      createLegalExceptionResult({
        code: "court",
        label: "Court proceedings",
        applies: court,
        disposition: "block",
        reason: "The violence line appears in court testimony or legal proceedings.",
        confidence: 0.95,
      }),
      createLegalExceptionResult({
        code: "condemnation",
        label: "Condemnation",
        applies: condemnation,
        disposition: "block",
        reason: "The violence line is condemned rather than endorsed.",
        confidence: 0.97,
      }),
      createLegalExceptionResult({
        code: "documentary",
        label: "Documentary usage",
        applies: documentary && containsAny(combinedText, VIOLENCE_RULES.directViolenceTerms),
        disposition: "block",
        reason: "The direct violence line is presented as documentary material and is not a reviewer finding.",
        confidence: 0.96,
      }),
      createLegalExceptionResult({
        code: "self_defense",
        label: "Self-defense",
        applies: selfDefense || justified || lawEnforcement,
        disposition: "review",
        reason: "The violence line may describe self-defense, justified force, or law-enforcement use of force and needs reviewer confirmation.",
        confidence: 0.9,
      }),
      createLegalExceptionResult({
        code: "fiction",
        label: "Fictional context",
        applies: review && input.intelligence.flags.fiction === true,
        disposition: "review",
        reason: "The violence line appears inside fiction and needs reviewer confirmation.",
        confidence: 0.9,
      }),
      createLegalExceptionResult({
        code: "roleplay",
        label: "Role-play context",
        applies: review && containsAny(combinedText, VIOLENCE_RULES.rolePlayTerms),
        disposition: "review",
        reason: "The violence line appears inside role-play and needs reviewer confirmation.",
        confidence: 0.9,
      }),
      createLegalExceptionResult({
        code: "dream",
        label: "Dream sequence",
        applies: review && input.intelligence.flags.dream === true,
        disposition: "review",
        reason: "The violence line appears inside a dream sequence and needs reviewer confirmation.",
        confidence: 0.9,
      }),
      createLegalExceptionResult({
        code: "flashback",
        label: "Flashback",
        applies: review && input.intelligence.flags.flashback === true,
        disposition: "review",
        reason: "The violence line appears inside a flashback and needs reviewer confirmation.",
        confidence: 0.9,
      }),
      createLegalExceptionResult({
        code: "satire",
        label: "Satire",
        applies: review && input.intelligence.flags.satire === true,
        disposition: "review",
        reason: "The violence line appears inside satire and needs reviewer confirmation.",
        confidence: 0.9,
      }),
      createLegalExceptionResult({
        code: "dialogue",
        label: "Dialogue",
        applies: input.intelligence.narrative.dialogue === true && !quote && !educational && !historical && !news && !court && !condemnation && !review && !selfDefense && !lawEnforcement && !justified,
        disposition: "allow",
        reason: "The violence line appears in dialogue and remains a direct use.",
        confidence: 0.95,
      }),
      createLegalExceptionResult({
        code: "narration",
        label: "Narration",
        applies: input.intelligence.narrative.narration === true && !quote && !educational && !historical && !news && !court && !condemnation && !review && !selfDefense && !lawEnforcement && !justified,
        disposition: "allow",
        reason: "The violence line appears in narration and remains a direct use.",
        confidence: 0.95,
      }),
    ];
  }

  buildFinding(input: ReviewerDecisionModuleInput, decision: LegalDecision, exceptions: readonly LegalExceptionResult[]): LegalFinding | null {
    const primary = getPrimaryEvidence(input);
    if (!primary) return null;
    if (!input.intelligence.evidence.admissible) return null;
    const combinedText = buildCombinedText(input);
    const anchor = hasViolenceConcept(input) || isViolenceAnchor(combinedText) || isLiteralViolenceContext(primary.text);
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

export const VIOLENCE_MODULE = new ViolenceReviewerDecisionModule();

export function isViolenceEvidenceText(text: string): boolean {
  return isLiteralViolenceContext(text) || isViolenceAnchor(text);
}

export function buildViolenceDecisionTree(): readonly ViolenceDecisionStep[] {
  return VIOLENCE_DECISION_TREE;
}
