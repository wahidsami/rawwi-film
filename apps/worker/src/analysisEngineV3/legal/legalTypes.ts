import type { IntelligenceContext } from "../intelligence/intelligenceContext.js";

export type LegalModuleId = string;

export type LegalEvaluationStatus = "accept" | "needs_review" | "reject";

export type LegalSemanticResult = {
  readonly semanticMeaning: string;
  readonly narrativeIntent: string;
  readonly conversationRole: string;
  readonly sceneRole: string;
  readonly speaker: string | null;
  readonly listener: string | null;
  readonly target: string | null;
  readonly victim: string | null;
  readonly emotion: string | null;
  readonly riskContext: string | null;
  readonly confidence: number;
  readonly notes?: readonly string[];
};

export type LegalNarrativeResult = {
  readonly speaker: string | null;
  readonly listener: string | null;
  readonly target: string | null;
  readonly narrativeVoice: string;
  readonly sceneType: string;
  readonly narrativeIntent: string;
  readonly storyPosition: string;
  readonly relationship: string | null;
  readonly emotionalTone: string;
  readonly condemnation: boolean | null;
  readonly approval: boolean | null;
  readonly neutrality: boolean | null;
  readonly historicalContext: boolean | null;
  readonly dream: boolean | null;
  readonly flashback: boolean | null;
  readonly comedy: boolean | null;
  readonly satire: boolean | null;
  readonly threat: boolean | null;
  readonly instruction: boolean | null;
  readonly news: boolean | null;
  readonly documentary: boolean | null;
  readonly dialogue: boolean | null;
  readonly narration: boolean | null;
  readonly sceneDescription: boolean | null;
  readonly confidence: number;
  readonly notes?: readonly string[];
};

export type LegalEvidenceCandidate = {
  readonly text: string;
  readonly startOffset: number;
  readonly endOffset: number;
  readonly confidence: number;
  readonly source: "chunk";
  readonly notes?: readonly string[];
};

export type LegalEvidenceResult = {
  readonly candidates: readonly LegalEvidenceCandidate[];
  readonly primaryCandidateIndex: number | null;
  readonly admissible: boolean;
  readonly confidence: number;
  readonly quote?: string | null;
  readonly scene?: string | null;
  readonly page?: number | null;
  readonly evidenceType?: "dialogue" | "scene_description" | "story_context" | "mixed" | "unknown";
  readonly observedFacts?: readonly string[];
  readonly notes?: readonly string[];
};

export type LegalContextResult = {
  readonly storyMemory: string | null;
  readonly sceneMemory: string | null;
  readonly localContext: string;
  readonly chunkContext: string;
  readonly neighboringSentences: readonly string[];
  readonly narrativeContext: string;
  readonly confidence: number;
  readonly notes?: readonly string[];
};

export type LegalModuleInput = Readonly<{
  moduleId: LegalModuleId;
  intelligence: IntelligenceContext;
}>;
