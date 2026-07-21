import type { ConceptCollection } from "../concepts/conceptTypes.js";
import type { EvidenceCollection } from "../evidence/evidenceTypes.js";
import type { LegalDecisionCollection } from "../legal/legalDecision.js";
import type { ExplanationRecord, ExplanationValidationResult } from "./explanationTypes.js";

const OTHER_SCENE_PATTERNS: readonly RegExp[] = Object.freeze([
  /\banother scene\b/iu,
  /\bprevious scene\b/iu,
  /\blater scene\b/iu,
  /\bother scene\b/iu,
  /\bscene\s*\d+\b/iu,
  /\bمشهد\s*\d+\b/u,
  /\bالمشهد\s*\d+\b/u,
  /\belsewhere\b/iu,
]);

const OTHER_FINDING_PATTERNS: readonly RegExp[] = Object.freeze([
  /\banother finding\b/iu,
  /\bother finding\b/iu,
  /\bprevious finding\b/iu,
  /\bnext finding\b/iu,
]);

const HALLUCINATION_PATTERNS: readonly RegExp[] = Object.freeze([
  /\binvented\b/iu,
  /\bfake\b/iu,
  /\bfalse\b/iu,
  /\bimaginary\b/iu,
  /\bnot present\b/iu,
  /\bunknown character\b/iu,
]);

const ALLOWED_ACTIONS = new Set<ExplanationRecord["recommendedAction"]>([
  "Delete",
  "Modify",
  "Requires Approval",
  "Refer to Authority",
  "Requires Verification",
  "No Action",
]);

function normalizeText(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
}

function includesNormalized(haystack: string, needle: string | null | undefined): boolean {
  if (!needle) return false;
  return normalizeText(haystack).includes(normalizeText(needle));
}

function collectText(record: ExplanationRecord): string {
  return normalizeText([record.title, record.summary, ...record.reasoning].join(" \n"));
}

function findEvidenceText(evidenceCollection: EvidenceCollection | null, evidenceId: string): string | null {
  const evidence = evidenceCollection?.evidence.find((entry) => entry.id === evidenceId || entry.spanId === evidenceId) ?? null;
  return evidence ? (evidence.text ?? evidence.rawText ?? null) : null;
}

function findConceptLabel(conceptCollection: ConceptCollection | null, conceptId: string): string | null {
  const concept = conceptCollection?.concepts.find((entry) => entry.conceptId === conceptId) ?? null;
  return concept ? concept.label : null;
}

function findDecision(legalDecisionCollection: LegalDecisionCollection | null, legalDecisionId: string) {
  return legalDecisionCollection?.decisions.find((decision) => decision.id === legalDecisionId) ?? null;
}

function validateRecord(
  record: ExplanationRecord,
  evidenceCollection: EvidenceCollection | null,
  conceptCollection: ConceptCollection | null,
  legalDecisionCollection: LegalDecisionCollection | null,
): readonly string[] {
  const reasons: string[] = [];
  const decision = findDecision(legalDecisionCollection, record.legalDecisionId);
  const conceptLabel = findConceptLabel(conceptCollection, record.conceptId);
  const evidenceText = findEvidenceText(evidenceCollection, record.evidenceId);
  const text = collectText(record);

  if (!ALLOWED_ACTIONS.has(record.recommendedAction)) {
    reasons.push("invalid_recommended_action");
  }

  if (!decision) {
    reasons.push("missing_legal_decision");
  }

  if (!conceptLabel) {
    reasons.push("missing_concept");
  }

  if (!evidenceText) {
    reasons.push("missing_evidence");
  }

  if (decision && decision.conceptId !== record.conceptId) {
    reasons.push("concept_mismatch");
  }

  if (evidenceText && !includesNormalized(text, evidenceText)) {
    reasons.push("unsupported_claim");
  }

  if (conceptLabel && !includesNormalized(text, conceptLabel) && !includesNormalized(text, record.conceptId)) {
    reasons.push("concept_not_grounded");
  }

  if (decision) {
    const articleId = decision.primaryArticle?.articleId ?? null;
    const articleTitle = decision.primaryArticle?.titleAr ?? null;
    if (articleId == null) {
      reasons.push("missing_article");
    } else if (!includesNormalized(text, String(articleId)) && !includesNormalized(text, articleTitle)) {
      reasons.push("article_not_grounded");
    }
  }

  const sceneLeak = OTHER_SCENE_PATTERNS.some((pattern) => pattern.test(text));
  const findingLeak = OTHER_FINDING_PATTERNS.some((pattern) => pattern.test(text));
  const hallucinationLeak = HALLUCINATION_PATTERNS.some((pattern) => pattern.test(text));

  if (sceneLeak) {
    reasons.push("references_other_scene");
  }

  if (findingLeak) {
    reasons.push("references_other_finding");
  }

  if (hallucinationLeak) {
    reasons.push("hallucination_detected");
  }

  if ((sceneLeak || findingLeak) && !reasons.includes("hallucination_detected")) {
    reasons.push("hallucination_detected");
  }

  if (conceptCollection) {
    for (const concept of conceptCollection.concepts) {
      if (concept.conceptId !== record.conceptId && includesNormalized(text, concept.label)) {
        reasons.push("new_concept_mentioned");
        break;
      }
    }
  }

  if (legalDecisionCollection) {
    for (const decisionEntry of legalDecisionCollection.decisions) {
      const articleId = decisionEntry.primaryArticle?.articleId ?? null;
      const articleTitle = decisionEntry.primaryArticle?.titleAr ?? null;
      if (decisionEntry.id !== record.legalDecisionId && (includesNormalized(text, String(articleId)) || includesNormalized(text, articleTitle))) {
        reasons.push("new_article_mentioned");
        break;
      }
    }
  }

  return Object.freeze(reasons);
}

export function validateExplanationCollection(input: Readonly<{
  evidenceCollection: EvidenceCollection | null;
  conceptCollection: ConceptCollection | null;
  legalDecisionCollection: LegalDecisionCollection | null;
  explanations: readonly ExplanationRecord[];
}>): ExplanationValidationResult {
  const rejectedReasons = new Set<string>();

  for (const record of input.explanations) {
    for (const reason of validateRecord(record, input.evidenceCollection, input.conceptCollection, input.legalDecisionCollection)) {
      rejectedReasons.add(reason);
    }
  }

  return Object.freeze({
    status: rejectedReasons.size === 0 ? "pass" : "reject",
    rejectedReasons: Object.freeze([...rejectedReasons].sort()),
  });
}
