import type { LegalDecision } from "../../legalDecision.js";
import type { LegalExceptionResult, LegalFinding } from "../../legalResult.js";
import { createLegalDecision } from "../../legalDecision.js";
import { createLegalExceptionResult, createLegalFinding } from "../../legalResult.js";
import { ReviewerDecisionModuleBase, type ReviewerDecisionModuleInput } from "../../reviewerDecisionModule.js";
import { NATIONAL_SECURITY_DECISION_TREE } from "./nationalSecurityDecisionTree.js";
import type { NationalSecurityDecisionStep } from "./nationalSecurityDecisionTree.js";
import { NATIONAL_SECURITY_RULES } from "./nationalSecurityRules.js";

export const NATIONAL_SECURITY_MODULE_ID = "v3_03_national_security";
const NATIONAL_SECURITY_ARTICLE_IDS = Object.freeze([12, 14, 15, 21]);

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

function hasNationalSecurityConcept(input: ReviewerDecisionModuleInput): boolean {
  return input.intelligence.conceptContext.conceptIds.some((conceptId) =>
    [
      "terrorism",
      "extremism",
      "recruitment",
      "banned_group",
      "military",
      "government",
      "violence",
      "organized_crime",
    ].includes(conceptId),
  );
}

function isNationalSecurityAnchor(text: string): boolean {
  return containsAny(text, NATIONAL_SECURITY_RULES.securityAnchors);
}

function isLiteralNationalSecurityAttack(text: string): boolean {
  return (
    containsAny(text, NATIONAL_SECURITY_RULES.terrorismTerms) ||
    containsAny(text, NATIONAL_SECURITY_RULES.recruitmentTerms) ||
    containsAny(text, NATIONAL_SECURITY_RULES.incitementPhrases) ||
    containsAny(text, NATIONAL_SECURITY_RULES.sabotageTerms) ||
    containsAny(text, NATIONAL_SECURITY_RULES.cyberTerms) ||
    containsAny(text, NATIONAL_SECURITY_RULES.disclosureTerms) ||
    containsAny(text, NATIONAL_SECURITY_RULES.publicOrderTerms)
  );
}

function isTerrorismContext(text: string): boolean {
  return containsAny(text, NATIONAL_SECURITY_RULES.terrorismTerms);
}

function isRecruitmentContext(text: string): boolean {
  return containsAny(text, NATIONAL_SECURITY_RULES.recruitmentTerms);
}

function isViolentIncitementContext(text: string): boolean {
  return containsAny(text, NATIONAL_SECURITY_RULES.incitementPhrases);
}

function isSabotageContext(text: string): boolean {
  return containsAny(text, NATIONAL_SECURITY_RULES.sabotageTerms);
}

function isCyberAttackContext(text: string): boolean {
  return containsAny(text, NATIONAL_SECURITY_RULES.cyberTerms);
}

function isMilitaryDisclosureContext(text: string): boolean {
  return containsAny(text, NATIONAL_SECURITY_RULES.disclosureTerms);
}

function isPublicOrderContext(text: string): boolean {
  return containsAny(text, NATIONAL_SECURITY_RULES.publicOrderTerms);
}

function isQuoteContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return input.intelligence.flags.quotation === true || containsAny(combinedText, NATIONAL_SECURITY_RULES.quotationSignals);
}

function isEducationalContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return input.intelligence.flags.educational === true || containsAny(combinedText, NATIONAL_SECURITY_RULES.educationalSignals);
}

function isDocumentaryContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return input.intelligence.flags.documentary === true || containsAny(combinedText, NATIONAL_SECURITY_RULES.documentarySignals);
}

function isHistoricalContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return input.intelligence.flags.historical === true || containsAny(combinedText, NATIONAL_SECURITY_RULES.historicalSignals);
}

function isNewsContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return input.intelligence.flags.news === true || containsAny(combinedText, NATIONAL_SECURITY_RULES.newsSignals);
}

function isCourtContext(combinedText: string): boolean {
  return containsAny(combinedText, NATIONAL_SECURITY_RULES.courtSignals);
}

function isCondemnationContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return input.intelligence.narrative.condemnation === true || input.intelligence.flags.condemnation === true || containsAny(combinedText, NATIONAL_SECURITY_RULES.condemnationSignals);
}

function isReviewContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return (
    input.intelligence.flags.fiction === true ||
    input.intelligence.flags.comedy === true ||
    input.intelligence.flags.satire === true ||
    input.intelligence.flags.dream === true ||
    input.intelligence.flags.flashback === true ||
    containsAny(combinedText, NATIONAL_SECURITY_RULES.fictionSignals) ||
    containsAny(combinedText, NATIONAL_SECURITY_RULES.rolePlaySignals) ||
    containsAny(combinedText, NATIONAL_SECURITY_RULES.dreamSignals) ||
    containsAny(combinedText, NATIONAL_SECURITY_RULES.flashbackSignals) ||
    containsAny(combinedText, NATIONAL_SECURITY_RULES.satireSignals)
  );
}

function inferArticleIds(input: ReviewerDecisionModuleInput, combinedText: string): readonly number[] {
  const ids = new Set<number>();
  if (isPublicOrderContext(combinedText) || isCyberAttackContext(combinedText) || isSabotageContext(combinedText)) ids.add(12);
  if (isTerrorismContext(combinedText) || isViolentIncitementContext(combinedText)) ids.add(14);
  if (isRecruitmentContext(combinedText)) ids.add(15);
  if (isMilitaryDisclosureContext(combinedText)) ids.add(21);
  if (ids.size === 0 && (hasNationalSecurityConcept(input) || isNationalSecurityAnchor(combinedText) || isLiteralNationalSecurityAttack(combinedText))) {
    ids.add(14);
  }
  if (ids.size === 0) return NATIONAL_SECURITY_ARTICLE_IDS;
  return Object.freeze([...ids].sort((left, right) => left - right));
}

function summarizeReason(parts: readonly string[]): string {
  return [...new Set(parts.map((part) => part.trim()).filter(Boolean))].join(" | ");
}

function buildTrace(input: ReviewerDecisionModuleInput, status: LegalDecision["status"], reason: string): readonly string[] {
  const combinedText = buildCombinedText(input);
  return [
    "national_security:evidence_exists",
    `national_security:admissible:${String(input.intelligence.evidence.admissible)}`,
    `national_security:anchor:${String(isNationalSecurityAnchor(combinedText) || hasNationalSecurityConcept(input) || isLiteralNationalSecurityAttack(combinedText))}`,
    `national_security:terrorism:${String(isTerrorismContext(combinedText))}`,
    `national_security:recruitment:${String(isRecruitmentContext(combinedText))}`,
    `national_security:incitement:${String(isViolentIncitementContext(combinedText))}`,
    `national_security:sabotage:${String(isSabotageContext(combinedText))}`,
    `national_security:cyber:${String(isCyberAttackContext(combinedText))}`,
    `national_security:disclosure:${String(isMilitaryDisclosureContext(combinedText))}`,
    `national_security:public_order:${String(isPublicOrderContext(combinedText))}`,
    `national_security:quote:${String(isQuoteContext(input, combinedText))}`,
    `national_security:education:${String(isEducationalContext(input, combinedText))}`,
    `national_security:documentary:${String(isDocumentaryContext(input, combinedText))}`,
    `national_security:historical:${String(isHistoricalContext(input, combinedText))}`,
    `national_security:news:${String(isNewsContext(input, combinedText))}`,
    `national_security:court:${String(isCourtContext(combinedText))}`,
    `national_security:condemnation:${String(isCondemnationContext(input, combinedText))}`,
    `national_security:review:${String(isReviewContext(input, combinedText))}`,
    `national_security:status:${status}`,
    `national_security:reason:${reason}`,
  ];
}

function buildFindingKey(moduleId: string, evidenceText: string, startOffset: number, endOffset: number, articleIds: readonly number[], status: string): string {
  return `${moduleId}:${startOffset}-${endOffset}:${articleIds.join("-")}:${normalizeText(evidenceText)}:${status}`;
}

export class NationalSecurityReviewerDecisionModule extends ReviewerDecisionModuleBase {
  constructor() {
    super({
      id: NATIONAL_SECURITY_MODULE_ID,
      title: "الأمن الوطني",
      articleIds: NATIONAL_SECURITY_ARTICLE_IDS,
    });
  }

  applies(input: ReviewerDecisionModuleInput): boolean {
    const primary = getPrimaryEvidence(input);
    if (!primary) return false;
    if (!input.intelligence.evidence.admissible) return false;
    const combinedText = buildCombinedText(input);
    const harmful = isTerrorismContext(combinedText) || isRecruitmentContext(combinedText) || isViolentIncitementContext(combinedText) || isSabotageContext(combinedText) || isCyberAttackContext(combinedText) || isMilitaryDisclosureContext(combinedText) || isPublicOrderContext(combinedText);
    return (
      (hasNationalSecurityConcept(input) || isNationalSecurityAnchor(combinedText) || isLiteralNationalSecurityAttack(primary.text)) &&
      (harmful || isReviewContext(input, combinedText))
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
    const anchor = hasNationalSecurityConcept(input) || isNationalSecurityAnchor(combinedText) || isLiteralNationalSecurityAttack(combinedText);
    const terrorism = isTerrorismContext(combinedText);
    const recruitment = isRecruitmentContext(combinedText);
    const incitement = isViolentIncitementContext(combinedText);
    const sabotage = isSabotageContext(combinedText);
    const cyber = isCyberAttackContext(combinedText);
    const disclosure = isMilitaryDisclosureContext(combinedText);
    const publicOrder = isPublicOrderContext(combinedText);
    const harmful = terrorism || recruitment || incitement || sabotage || cyber || disclosure || publicOrder;
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
      anchor ? "تم التعرف على سياق الأمن الوطني" : "لا يوجد سياق أمن وطني كافٍ",
      terrorism ? "توجد مؤشرات إرهاب أو تطرف" : "",
      recruitment ? "توجد مؤشرات تجنيد أو انضمام إلى جماعة محظورة" : "",
      incitement ? "توجد دعوة أو تحريض عنيف" : "",
      sabotage ? "توجد مؤشرات تخريب" : "",
      cyber ? "توجد مؤشرات هجوم إلكتروني" : "",
      disclosure ? "توجد مؤشرات تسريب معلومات عسكرية أو سرية" : "",
      publicOrder ? "توجد مؤشرات إخلال بالنظام العام أو شغب" : "",
      quote ? "السياق اقتباس" : "",
      educational ? "السياق تعليمي" : "",
      documentary ? "السياق وثائقي" : "",
      historical ? "السياق تاريخي" : "",
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
    const anchor = hasNationalSecurityConcept(input) || isNationalSecurityAnchor(combinedText) || isLiteralNationalSecurityAttack(primary.text);
    if (!anchor) return [];

    const quote = isQuoteContext(input, combinedText);
    const educational = isEducationalContext(input, combinedText);
    const documentary = isDocumentaryContext(input, combinedText);
    const historical = isHistoricalContext(input, combinedText);
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
        reason: "The national-security line is quoted rather than endorsed.",
        confidence: 0.98,
      }),
      createLegalExceptionResult({
        code: "educational",
        label: "Educational usage",
        applies: educational,
        disposition: "block",
        reason: "The national-security line is discussed in an educational or explanatory context.",
        confidence: 0.97,
      }),
      createLegalExceptionResult({
        code: "documentary",
        label: "Documentary usage",
        applies: documentary,
        disposition: "block",
        reason: "The national-security line is presented as documentary or reportage material.",
        confidence: 0.96,
      }),
      createLegalExceptionResult({
        code: "historical",
        label: "Historical usage",
        applies: historical,
        disposition: "block",
        reason: "The national-security line is part of historical narration.",
        confidence: 0.96,
      }),
      createLegalExceptionResult({
        code: "news",
        label: "News reporting",
        applies: news,
        disposition: "block",
        reason: "The national-security line is reported as news rather than endorsed.",
        confidence: 0.95,
      }),
      createLegalExceptionResult({
        code: "court",
        label: "Court proceedings",
        applies: court,
        disposition: "block",
        reason: "The national-security line appears in court testimony or legal proceedings.",
        confidence: 0.95,
      }),
      createLegalExceptionResult({
        code: "condemnation",
        label: "Condemnation",
        applies: condemnation,
        disposition: "block",
        reason: "The national-security line is condemned rather than endorsed.",
        confidence: 0.97,
      }),
      createLegalExceptionResult({
        code: "fiction",
        label: "Fictional context",
        applies: review && input.intelligence.flags.fiction === true,
        disposition: "review",
        reason: "The national-security line appears inside fiction and needs reviewer confirmation.",
        confidence: 0.9,
      }),
      createLegalExceptionResult({
        code: "roleplay",
        label: "Role-play context",
        applies: review && containsAny(combinedText, NATIONAL_SECURITY_RULES.rolePlaySignals),
        disposition: "review",
        reason: "The national-security line appears inside role-play and needs reviewer confirmation.",
        confidence: 0.9,
      }),
      createLegalExceptionResult({
        code: "dream",
        label: "Dream sequence",
        applies: review && input.intelligence.flags.dream === true,
        disposition: "review",
        reason: "The national-security line appears inside a dream sequence and needs reviewer confirmation.",
        confidence: 0.9,
      }),
      createLegalExceptionResult({
        code: "flashback",
        label: "Flashback",
        applies: review && input.intelligence.flags.flashback === true,
        disposition: "review",
        reason: "The national-security line appears inside a flashback and needs reviewer confirmation.",
        confidence: 0.9,
      }),
      createLegalExceptionResult({
        code: "satire",
        label: "Satire",
        applies: review && input.intelligence.flags.satire === true,
        disposition: "review",
        reason: "The national-security line appears inside satire and needs reviewer confirmation.",
        confidence: 0.9,
      }),
      createLegalExceptionResult({
        code: "dialogue",
        label: "Dialogue",
        applies: input.intelligence.narrative.dialogue === true && !quote && !educational && !documentary && !historical && !news && !court && !condemnation && !review,
        disposition: "allow",
        reason: "The national-security line appears in dialogue and remains a direct use.",
        confidence: 0.95,
      }),
      createLegalExceptionResult({
        code: "narration",
        label: "Narration",
        applies: input.intelligence.narrative.narration === true && !quote && !educational && !documentary && !historical && !news && !court && !condemnation && !review,
        disposition: "allow",
        reason: "The national-security line appears in narration and remains a direct use.",
        confidence: 0.95,
      }),
    ];
  }

  buildFinding(input: ReviewerDecisionModuleInput, decision: LegalDecision, exceptions: readonly LegalExceptionResult[]): LegalFinding | null {
    const primary = getPrimaryEvidence(input);
    if (!primary) return null;
    if (!input.intelligence.evidence.admissible) return null;
    const combinedText = buildCombinedText(input);
    const anchor = hasNationalSecurityConcept(input) || isNationalSecurityAnchor(combinedText) || isLiteralNationalSecurityAttack(primary.text);
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

export const NATIONAL_SECURITY_MODULE = new NationalSecurityReviewerDecisionModule();

export function isNationalSecurityEvidenceText(text: string): boolean {
  return isLiteralNationalSecurityAttack(text) || isNationalSecurityAnchor(text);
}

export function buildNationalSecurityDecisionTree(): readonly NationalSecurityDecisionStep[] {
  return NATIONAL_SECURITY_DECISION_TREE;
}
