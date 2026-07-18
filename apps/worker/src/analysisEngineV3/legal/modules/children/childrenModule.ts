import type { LegalDecision } from "../../legalDecision.js";
import type { LegalExceptionResult, LegalFinding } from "../../legalResult.js";
import { createLegalDecision } from "../../legalDecision.js";
import { createLegalExceptionResult, createLegalFinding } from "../../legalResult.js";
import { ReviewerDecisionModuleBase, type ReviewerDecisionModuleInput } from "../../reviewerDecisionModule.js";
import { CHILDREN_DECISION_TREE } from "./childrenDecisionTree.js";
import type { ChildrenDecisionStep } from "./childrenDecisionTree.js";
import { CHILDREN_RULES } from "./childrenRules.js";

export const CHILDREN_MODULE_ID = "v3_05_children";
const CHILDREN_ARTICLE_IDS = Object.freeze([5, 6, 17]);

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

function hasChildrenConcept(input: ReviewerDecisionModuleInput): boolean {
  return input.intelligence.conceptContext.conceptIds.some((conceptId) =>
    [
      "child_harm",
      "children_child",
      "children_minor",
      "children_infant",
      "children_teenager",
      "children_vulnerable_person",
      "children_disabled_child",
      "children_disabled_adult",
      "children_elderly_person",
      "children_grooming",
      "children_neglect",
      "children_exploitation",
      "children_criminal_exploitation",
      "children_physical_abuse",
      "children_psychological_abuse",
      "children_threatening",
      "children_human_trafficking",
      "children_child_recruitment",
    ].includes(conceptId),
  );
}

function isChildAnchor(text: string): boolean {
  return containsAny(text, CHILDREN_RULES.childAnchors);
}

function isLiteralChildHarm(text: string): boolean {
  return (
    containsAny(text, CHILDREN_RULES.abuseTerms) ||
    containsAny(text, CHILDREN_RULES.neglectTerms) ||
    containsAny(text, CHILDREN_RULES.exploitationTerms) ||
    containsAny(text, CHILDREN_RULES.groomingTerms) ||
    containsAny(text, CHILDREN_RULES.violenceTerms) ||
    containsAny(text, CHILDREN_RULES.crimeTerms) ||
    containsAny(text, CHILDREN_RULES.psychologicalAbuseTerms)
  );
}

function isPsychologicalAbuseContext(text: string): boolean {
  return containsAny(text, CHILDREN_RULES.psychologicalAbuseTerms);
}

function isAbuseContext(text: string): boolean {
  return containsAny(text, CHILDREN_RULES.abuseTerms);
}

function isNeglectContext(text: string): boolean {
  return containsAny(text, CHILDREN_RULES.neglectTerms);
}

function isExploitationContext(text: string): boolean {
  return containsAny(text, CHILDREN_RULES.exploitationTerms);
}

function isGroomingContext(text: string): boolean {
  return containsAny(text, CHILDREN_RULES.groomingTerms);
}

function isViolenceContext(text: string): boolean {
  return containsAny(text, CHILDREN_RULES.violenceTerms);
}

function isCrimeContext(text: string): boolean {
  return containsAny(text, CHILDREN_RULES.crimeTerms);
}

function isQuoteContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return input.intelligence.flags.quotation === true || containsAny(combinedText, CHILDREN_RULES.quotationSignals);
}

function isEducationalContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return input.intelligence.flags.educational === true || containsAny(combinedText, CHILDREN_RULES.educationalSignals);
}

function isDocumentaryContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return input.intelligence.flags.documentary === true || containsAny(combinedText, CHILDREN_RULES.documentarySignals);
}

function isHistoricalContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return input.intelligence.flags.historical === true || containsAny(combinedText, CHILDREN_RULES.historicalSignals);
}

function isNewsContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return input.intelligence.flags.news === true || containsAny(combinedText, CHILDREN_RULES.newsSignals);
}

function isCourtContext(combinedText: string): boolean {
  return containsAny(combinedText, CHILDREN_RULES.courtSignals);
}

function isCondemnationContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return input.intelligence.narrative.condemnation === true || input.intelligence.flags.condemnation === true || containsAny(combinedText, CHILDREN_RULES.condemnationSignals);
}

function isReviewContext(input: ReviewerDecisionModuleInput, combinedText: string): boolean {
  return (
    input.intelligence.flags.fiction === true ||
    input.intelligence.flags.comedy === true ||
    input.intelligence.flags.satire === true ||
    input.intelligence.flags.dream === true ||
    input.intelligence.flags.flashback === true ||
    containsAny(combinedText, CHILDREN_RULES.fictionSignals) ||
    containsAny(combinedText, CHILDREN_RULES.rolePlaySignals) ||
    containsAny(combinedText, CHILDREN_RULES.dreamSignals) ||
    containsAny(combinedText, CHILDREN_RULES.flashbackSignals) ||
    containsAny(combinedText, CHILDREN_RULES.satireSignals)
  );
}

function inferArticleIds(combinedText: string): readonly number[] {
  const ids = new Set<number>();
  ids.add(5);
  if (isAbuseContext(combinedText) || isNeglectContext(combinedText) || isExploitationContext(combinedText) || isGroomingContext(combinedText) || isViolenceContext(combinedText) || isCrimeContext(combinedText)) {
    ids.add(6);
  }
  if (
    isPsychologicalAbuseContext(combinedText) ||
    containsAny(combinedText, [
      "humiliation",
      "bullying",
      "fear",
      "mocking disability",
      "disability abuse",
      "isolation",
      "يسخرون",
      "يسخر من الطفل",
      "يذلونه",
      "إذلال",
      "إهانة",
      "تنمر",
      "يخيف الطفل",
      "خوف الطفل",
      "يرهب الطفل",
    ])
  ) {
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
    "children:evidence_exists",
    `children:admissible:${String(input.intelligence.evidence.admissible)}`,
    `children:anchor:${String(isChildAnchor(combinedText) || hasChildrenConcept(input) || isLiteralChildHarm(combinedText))}`,
    `children:abuse:${String(isAbuseContext(combinedText))}`,
    `children:neglect:${String(isNeglectContext(combinedText))}`,
    `children:exploitation:${String(isExploitationContext(combinedText))}`,
    `children:grooming:${String(isGroomingContext(combinedText))}`,
    `children:violence:${String(isViolenceContext(combinedText))}`,
    `children:crime:${String(isCrimeContext(combinedText))}`,
    `children:psychological:${String(isPsychologicalAbuseContext(combinedText))}`,
    `children:quote:${String(isQuoteContext(input, combinedText))}`,
    `children:education:${String(isEducationalContext(input, combinedText))}`,
    `children:documentary:${String(isDocumentaryContext(input, combinedText))}`,
    `children:historical:${String(isHistoricalContext(input, combinedText))}`,
    `children:news:${String(isNewsContext(input, combinedText))}`,
    `children:court:${String(isCourtContext(combinedText))}`,
    `children:condemnation:${String(isCondemnationContext(input, combinedText))}`,
    `children:review:${String(isReviewContext(input, combinedText))}`,
    `children:status:${status}`,
    `children:reason:${reason}`,
  ];
}

function buildFindingKey(moduleId: string, evidenceText: string, startOffset: number, endOffset: number, articleIds: readonly number[], status: string): string {
  return `${moduleId}:${startOffset}-${endOffset}:${articleIds.join("-")}:${normalizeText(evidenceText)}:${status}`;
}

export class ChildrenReviewerDecisionModule extends ReviewerDecisionModuleBase {
  constructor() {
    super({
      id: CHILDREN_MODULE_ID,
      title: "إيذاء الطفل وذوي الإعاقة",
      articleIds: CHILDREN_ARTICLE_IDS,
    });
  }

  applies(input: ReviewerDecisionModuleInput): boolean {
    const primary = getPrimaryEvidence(input);
    if (!primary) return false;
    if (!input.intelligence.evidence.admissible) return false;
    const combinedText = buildCombinedText(input);
    return (
      (isChildAnchor(combinedText) || hasChildrenConcept(input) || isLiteralChildHarm(primary.text)) &&
      (isAbuseContext(combinedText) ||
        isNeglectContext(combinedText) ||
        isExploitationContext(combinedText) ||
        isGroomingContext(combinedText) ||
        isViolenceContext(combinedText) ||
        isCrimeContext(combinedText) ||
        isPsychologicalAbuseContext(combinedText) ||
        isReviewContext(input, combinedText))
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
    const anchor = isChildAnchor(combinedText) || hasChildrenConcept(input) || isLiteralChildHarm(combinedText);
    const abuse = isAbuseContext(combinedText);
    const neglect = isNeglectContext(combinedText);
    const exploitation = isExploitationContext(combinedText);
    const grooming = isGroomingContext(combinedText);
    const violence = isViolenceContext(combinedText);
    const crime = isCrimeContext(combinedText);
    const psychological = isPsychologicalAbuseContext(combinedText);
    const harmful = abuse || neglect || exploitation || grooming || violence || crime || psychological;
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
      anchor ? "تم التعرف على سياق طفل أو شخص ضعيف" : "لا يوجد سياق طفل أو شخص ضعيف كافٍ",
      abuse ? "توجد إساءة جسدية أو مباشرة" : "",
      neglect ? "توجد مؤشرات إهمال أو ترك" : "",
      exploitation ? "توجد مؤشرات استغلال أو اتجار" : "",
      grooming ? "توجد مؤشرات استدراج أو تغرير" : "",
      violence ? "توجد مؤشرات عنف موجه" : "",
      crime ? "توجد مؤشرات استغلال جنائي أو إجبار على الجريمة" : "",
      psychological ? "توجد إساءة نفسية أو تنمر" : "",
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
    const anchor = isChildAnchor(combinedText) || hasChildrenConcept(input) || isLiteralChildHarm(primary.text);
    if (!anchor) return [];
    if (!(isAbuseContext(combinedText) || isNeglectContext(combinedText) || isExploitationContext(combinedText) || isGroomingContext(combinedText) || isViolenceContext(combinedText) || isCrimeContext(combinedText) || isPsychologicalAbuseContext(combinedText))) return [];

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
        reason: "The child-safety line is quoted rather than endorsed.",
        confidence: 0.98,
      }),
      createLegalExceptionResult({
        code: "educational",
        label: "Educational usage",
        applies: educational,
        disposition: "block",
        reason: "The child-safety line is discussed in an educational or explanatory context.",
        confidence: 0.97,
      }),
      createLegalExceptionResult({
        code: "documentary",
        label: "Documentary usage",
        applies: documentary,
        disposition: "block",
        reason: "The child-safety line is presented as documentary or reportage material.",
        confidence: 0.96,
      }),
      createLegalExceptionResult({
        code: "historical",
        label: "Historical usage",
        applies: historical,
        disposition: "block",
        reason: "The child-safety line is part of historical narration.",
        confidence: 0.96,
      }),
      createLegalExceptionResult({
        code: "news",
        label: "News reporting",
        applies: news,
        disposition: "block",
        reason: "The child-safety line is reported as news rather than endorsed.",
        confidence: 0.95,
      }),
      createLegalExceptionResult({
        code: "court",
        label: "Court proceedings",
        applies: court,
        disposition: "block",
        reason: "The child-safety line appears in court testimony or legal proceedings.",
        confidence: 0.95,
      }),
      createLegalExceptionResult({
        code: "condemnation",
        label: "Condemnation",
        applies: condemnation,
        disposition: "block",
        reason: "The child-safety line is condemned rather than endorsed.",
        confidence: 0.97,
      }),
      createLegalExceptionResult({
        code: "fiction",
        label: "Fictional context",
        applies: review && input.intelligence.flags.fiction === true,
        disposition: "review",
        reason: "The child-safety line appears inside fiction and needs reviewer confirmation.",
        confidence: 0.9,
      }),
      createLegalExceptionResult({
        code: "roleplay",
        label: "Role-play context",
        applies: review && containsAny(combinedText, CHILDREN_RULES.rolePlaySignals),
        disposition: "review",
        reason: "The child-safety line appears inside role-play and needs reviewer confirmation.",
        confidence: 0.9,
      }),
      createLegalExceptionResult({
        code: "dream",
        label: "Dream sequence",
        applies: review && input.intelligence.flags.dream === true,
        disposition: "review",
        reason: "The child-safety line appears inside a dream sequence and needs reviewer confirmation.",
        confidence: 0.9,
      }),
      createLegalExceptionResult({
        code: "flashback",
        label: "Flashback",
        applies: review && input.intelligence.flags.flashback === true,
        disposition: "review",
        reason: "The child-safety line appears inside a flashback and needs reviewer confirmation.",
        confidence: 0.9,
      }),
      createLegalExceptionResult({
        code: "satire",
        label: "Satire",
        applies: review && input.intelligence.flags.satire === true,
        disposition: "review",
        reason: "The child-safety line appears inside satire and needs reviewer confirmation.",
        confidence: 0.9,
      }),
      createLegalExceptionResult({
        code: "dialogue",
        label: "Dialogue",
        applies: input.intelligence.narrative.dialogue === true && !quote && !educational && !documentary && !historical && !news && !court && !condemnation && !review,
        disposition: "allow",
        reason: "The child-safety line appears in dialogue and remains a direct use.",
        confidence: 0.95,
      }),
      createLegalExceptionResult({
        code: "narration",
        label: "Narration",
        applies: input.intelligence.narrative.narration === true && !quote && !educational && !documentary && !historical && !news && !court && !condemnation && !review,
        disposition: "allow",
        reason: "The child-safety line appears in narration and remains a direct use.",
        confidence: 0.95,
      }),
    ];
  }

  buildFinding(input: ReviewerDecisionModuleInput, decision: LegalDecision, exceptions: readonly LegalExceptionResult[]): LegalFinding | null {
    const primary = getPrimaryEvidence(input);
    if (!primary) return null;
    if (!input.intelligence.evidence.admissible) return null;
    const combinedText = buildCombinedText(input);
    const anchor = isChildAnchor(combinedText) || hasChildrenConcept(input) || isLiteralChildHarm(primary.text);
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

export const CHILDREN_MODULE = new ChildrenReviewerDecisionModule();

export function isChildrenEvidenceText(text: string): boolean {
  return isLiteralChildHarm(text) || isChildAnchor(text);
}

export function buildChildrenDecisionTree(): readonly ChildrenDecisionStep[] {
  return CHILDREN_DECISION_TREE;
}

