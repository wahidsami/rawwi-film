import type { IntelligenceContext, IntelligenceValidationResult } from "./intelligenceContext.js";

function addIssue(issues: Array<{ path: string; message: string }>, path: string, message: string): void {
  issues.push({ path, message });
}

function isValidNumber(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

export function validateIntelligenceContext(context: IntelligenceContext): IntelligenceValidationResult {
  const issues: Array<{ path: string; message: string }> = [];

  if (!context.moduleId.trim()) addIssue(issues, "moduleId", "moduleId is required");
  if (!context.sceneType.trim()) addIssue(issues, "sceneType", "sceneType is required");
  if (!context.narrativeIntent.trim()) addIssue(issues, "narrativeIntent", "narrativeIntent is required");
  if (!isValidNumber(context.contextConfidence)) addIssue(issues, "contextConfidence", "contextConfidence must be between 0 and 1");
  if (!isValidNumber(context.evidenceAssessment.confidence)) addIssue(issues, "evidenceAssessment.confidence", "evidence confidence must be between 0 and 1");

  if (context.evidenceAssessment.candidateCount <= 0) {
    addIssue(issues, "evidenceAssessment.candidateCount", "at least one evidence candidate is required");
  }

  if (context.evidenceAssessment.primaryCandidateIndex < 0 || context.evidenceAssessment.primaryCandidateIndex >= context.evidenceAssessment.candidateCount) {
    addIssue(issues, "evidenceAssessment.primaryCandidateIndex", "primaryCandidateIndex must refer to an existing candidate");
  }

  if (context.evidenceAssessment.primaryEndOffset < context.evidenceAssessment.primaryStartOffset) {
    addIssue(issues, "evidenceAssessment.primaryEndOffset", "primaryEndOffset must be greater than or equal to primaryStartOffset");
  }

  if (!context.evidenceAssessment.primaryText.trim()) {
    addIssue(issues, "evidenceAssessment.primaryText", "primaryText is required");
  }

  if (context.entities.some((entity) => !entity.id.trim() || !entity.label.trim())) {
    addIssue(issues, "entities", "entity ids and labels must be non-empty");
  }

  if (context.glossaryReferences.some((reference) => !reference.term.trim() || !reference.normalizedTerm.trim())) {
    addIssue(issues, "glossaryReferences", "glossary references must contain a term and normalizedTerm");
  }

  if (!context.conceptContext) {
    addIssue(issues, "conceptContext", "conceptContext is required");
  } else {
    if (!isValidNumber(context.conceptContext.confidence)) addIssue(issues, "conceptContext.confidence", "concept context confidence must be between 0 and 1");
    if (context.conceptContext.concepts.some((concept) => !concept.id.trim() || !concept.label.trim())) {
      addIssue(issues, "conceptContext.concepts", "concepts must have non-empty ids and labels");
    }
  }

  return Object.freeze({
    valid: issues.length === 0,
    issues: Object.freeze([...issues]),
  });
}
