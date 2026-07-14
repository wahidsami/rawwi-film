import type { LegalSemanticResult } from "../legal/legalTypes.js";
import type { LegalEvidenceResult, LegalNarrativeResult } from "../legal/legalTypes.js";

function primaryEvidenceText(evidence: LegalEvidenceResult): string {
  if (evidence.primaryCandidateIndex === null) return "";
  return evidence.candidates[evidence.primaryCandidateIndex]?.text ?? "";
}

export function runSemanticStage(narrative: LegalNarrativeResult, evidence: LegalEvidenceResult): LegalSemanticResult {
  const evidenceText = primaryEvidenceText(evidence);
  const quoted = /«.*»|".*"/.test(evidenceText) || narrative.narrativeIntent === "quoted";
  const instructional = narrative.instruction || /درس|شرح|مثال|أمثلة/.test(evidenceText);
  const condemnation = narrative.condemnation === true;
  const semanticMeaning = condemnation
    ? "The evidence is mentioned in a condemning context."
    : instructional
      ? "The evidence is discussed in an educational context."
      : quoted
        ? "The evidence is quoted as direct speech."
        : narrative.dialogue
          ? "The evidence is delivered as dialogue."
          : "The evidence is narrated as part of the story.";

  return Object.freeze({
    semanticMeaning,
    narrativeIntent: narrative.narrativeIntent,
    conversationRole: narrative.dialogue ? "speaker" : "narrator",
    sceneRole: narrative.sceneType,
    speaker: narrative.speaker,
    listener: narrative.listener,
    target: narrative.target,
    victim: narrative.target,
    emotion: narrative.emotionalTone,
    riskContext: condemnation ? "low" : instructional ? "low" : "medium",
    confidence: Number(Math.min(1, (narrative.confidence + evidence.confidence) / 2).toFixed(6)),
    notes: [],
  });
}
