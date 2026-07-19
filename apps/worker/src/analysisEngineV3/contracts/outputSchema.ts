/**
 * Legacy/compatibility scaffold.
 *
 * Why this file exists:
 * - Keeps the earlier output-schema contract available for existing V3 prompt assembly paths.
 * - Preserves the older report contract wording while the newer builder stack remains in place.
 *
 * Active V3 reviewer pipeline participation:
 * - Compatibility only. This is not a reasoning or mapping module.
 *
 * Backward compatibility:
 * - Retained intentionally for older prompt and schema consumers.
 *
 * New functionality:
 * - Do not add new functionality here.
 *
 * Removal guidance:
 * - Safe to remove only after V3 production stabilization and after all callers move to the new builder contract.
 */
export type V3OutputSchemaField = {
  name: string;
  description: string;
};

export const V3_OUTPUT_SCHEMA_FIELDS: V3OutputSchemaField[] = [
  { name: "narrative", description: "Narrative interpretation object with speaker, listener, target, scene type, and confidence." },
  { name: "evidence", description: "Evidence object containing exact quoted evidence candidates and the primary candidate index." },
  { name: "semantic", description: "Semantic interpretation object with meaning, role, target, victim, and confidence." },
  { name: "context", description: "Context object with scene memory, neighboring sentences, and narrative context." },
  { name: "reasoned_decision", description: "Article-by-article legal reasoning with PASS or FAIL evaluations and recommendations." },
];

export function renderV3OutputSchemaContract(): string {
  return [
    "Output Schema Contract (placeholder):",
    "- narrative: { speaker, listener, target, narrativeVoice, sceneType, narrativeIntent, storyPosition, relationship, emotionalTone, condemnation, approval, neutrality, historicalContext, dream, flashback, comedy, satire, threat, instruction, news, documentary, dialogue, narration, sceneDescription, confidence, notes }",
    "- evidence: { candidates: [{ text, startOffset, endOffset, confidence, source, notes }], primaryCandidateIndex, admissible, confidence, notes }",
    "- evidence candidates are sentence-level and each candidate must be evaluated independently before findings are merged.",
    "- semantic: { semanticMeaning, narrativeIntent, conversationRole, sceneRole, speaker, listener, target, victim, emotion, riskContext, confidence, notes }",
    "- context: { storyMemory, sceneMemory, localContext, chunkContext, neighboringSentences, narrativeContext, confidence, notes }",
    "- reasoned_decision: { reasoning, alternativeInterpretations, confidence, articleEvaluations: [{ articleId, status, evidence, reason, confidence }], supportingEvidence, contradictingEvidence, applicableArticles, rejectedArticles, riskAnalysis, narrativeAnalysis, humanLikeExplanation, recommendation }",
    "- The parser consumes this canonical shape directly and normalizes snake_case or camelCase aliases for compatibility.",
  ].join("\n");
}
