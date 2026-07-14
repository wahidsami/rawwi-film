export type V3ReasoningSubjectReference = {
  id: string;
  titleAr: string;
  articleIds: number[];
};

export type V3ReasoningCandidateEvidence = {
  text: string;
  startOffset: number;
  endOffset: number;
  source: "chunk" | "memory" | "glossary";
};

export type V3ReasoningNarrativeUnderstanding = {
  summary: string | null;
  tone: string | null;
  speakerMap: string[];
  sceneNotes: string[];
};

export type V3ReasoningContext = {
  storyMemory: string | null;
  chunk: {
    text: string;
    startOffset: number;
    endOffset: number;
    chunkIndex: number;
  };
  glossary: string[];
  subject: V3ReasoningSubjectReference | null;
  candidateEvidence: V3ReasoningCandidateEvidence[];
  narrativeUnderstanding: V3ReasoningNarrativeUnderstanding | null;
  legalDecision: string | null;
  exceptions: string[];
  finding: {
    titleAr: string | null;
    rationaleAr: string | null;
    confidence: number | null;
    evidenceSnippet: string | null;
    location: { startOffset: number; endOffset: number } | null;
  } | null;
  reporting: {
    jsonReady: boolean;
    notes: string[];
  } | null;
  stageHistory: Array<{
    stage: string;
    summary: string;
  }>;
};

export function createV3ReasoningContext(input: {
  storyMemory: string | null;
  chunk: V3ReasoningContext["chunk"];
  glossary?: string[];
  subject?: V3ReasoningSubjectReference | null;
}): V3ReasoningContext {
  return {
    storyMemory: input.storyMemory,
    chunk: input.chunk,
    glossary: input.glossary ?? [],
    subject: input.subject ?? null,
    candidateEvidence: [],
    narrativeUnderstanding: null,
    legalDecision: null,
    exceptions: [],
    finding: null,
    reporting: null,
    stageHistory: [],
  };
}

