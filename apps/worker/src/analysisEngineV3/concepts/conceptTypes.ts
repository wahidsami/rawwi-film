import type { IntelligenceContext } from "../intelligence/intelligenceContext.js";

export type ConceptSourceType = "narrative" | "semantic" | "story_memory" | "entity" | "glossary" | "evidence";

export type ConceptConfidence = Readonly<{
  narrative: number;
  semantic: number;
  storyMemory: number;
  entity: number;
  glossary: number;
  evidence: number;
  total: number;
}>;

export type ConceptEvidenceSource = Readonly<{
  sourceType: ConceptSourceType;
  sourceText: string;
  originatingSentence: string | null;
  entityId: string | null;
  glossaryTerm: string | null;
  confidence: number;
}>;

export type Concept = Readonly<{
  id: string;
  label: string;
  confidence: ConceptConfidence;
  evidenceSources: readonly ConceptEvidenceSource[];
  originatingSentences: readonly string[];
  entityReferences: readonly string[];
  glossaryReferences: readonly string[];
}>;

export type ConceptContext = Readonly<{
  concepts: readonly Concept[];
  conceptIds: readonly string[];
  primaryConceptId: string | null;
  confidence: number;
  conceptCount: number;
}>;

export type ConceptDefinition = Readonly<{
  id: string;
  label: string;
  aliases: readonly string[];
}>;

export type ConceptRegistryEntry = ConceptDefinition;

export type ConceptRecognitionInput = Omit<IntelligenceContext, "conceptContext">;

