import type {
  LegalContextResult,
  LegalEvidenceCandidate,
  LegalEvidenceResult,
  LegalNarrativeResult,
  LegalSemanticResult,
} from "../legal/legalTypes.js";
import type { V3PromptGlossary } from "../builder/builderTypes.js";
import type { ConceptContext } from "../concepts/conceptTypes.js";

export type IntelligenceEntitySource = "narrative" | "semantic" | "context" | "evidence" | "story_memory" | "glossary";
export type IntelligenceEntityRole = "speaker" | "listener" | "target" | "victim" | "entity";
export type IntelligenceInterpretationMode =
  | "promotion"
  | "condemnation"
  | "description"
  | "education"
  | "fiction"
  | "warning"
  | "neutral"
  | "unknown";

export type IntelligenceEntity = Readonly<{
  id: string;
  label: string;
  role: IntelligenceEntityRole;
  source: IntelligenceEntitySource;
  confidence: number;
  evidence: string | null;
}>;

export type IntelligenceGlossaryReference = Readonly<{
  term: string;
  normalizedTerm: string;
  source: IntelligenceEntitySource;
  matchText: string | null;
  confidence: number;
}>;

export type IntelligenceFlags = Readonly<{
  dialogue: boolean;
  narration: boolean;
  promotion: boolean;
  condemnation: boolean;
  description: boolean;
  historical: boolean;
  educational: boolean;
  satire: boolean;
  documentary: boolean;
  fiction: boolean;
  threat: boolean;
  instruction: boolean;
  news: boolean;
  comedy: boolean;
  dream: boolean;
  flashback: boolean;
  quotation: boolean;
  approval: boolean;
  neutrality: boolean;
}>;

export type IntelligenceEvidenceAssessment = Readonly<{
  primaryText: string;
  primaryStartOffset: number;
  primaryEndOffset: number;
  primaryCandidateIndex: number;
  candidateCount: number;
  admissible: boolean;
  confidence: number;
  source: "chunk";
  notes: readonly string[];
}>;

export type IntelligenceContext = Readonly<{
  moduleId: string;
  storyMemory: string | null;
  narrative: LegalNarrativeResult;
  evidence: LegalEvidenceResult;
  semantic: LegalSemanticResult;
  context: LegalContextResult;
  narrativeIntent: string;
  speaker: string | null;
  listener: string | null;
  target: string | null;
  victim: string | null;
  sceneType: string;
  dialogueMode: "dialogue" | "narration" | "mixed" | "unknown";
  interpretationMode: IntelligenceInterpretationMode;
  flags: IntelligenceFlags;
  entities: readonly IntelligenceEntity[];
  glossaryReferences: readonly IntelligenceGlossaryReference[];
  evidenceAssessment: IntelligenceEvidenceAssessment;
  contextConfidence: number;
  legalConcepts: readonly string[];
  conceptContext: ConceptContext;
  glossary: V3PromptGlossary;
}>;

export type IntelligenceBuilderInput = Readonly<{
  moduleId: string;
  storyMemory: string | null;
  narrative: LegalNarrativeResult;
  evidence: LegalEvidenceResult;
  semantic: LegalSemanticResult;
  context: LegalContextResult;
  glossary: V3PromptGlossary;
}>;

export type IntelligenceValidationIssue = Readonly<{
  path: string;
  message: string;
}>;

export type IntelligenceValidationResult = Readonly<{
  valid: boolean;
  issues: readonly IntelligenceValidationIssue[];
}>;
