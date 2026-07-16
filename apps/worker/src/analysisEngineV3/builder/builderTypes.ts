export type V3PromptJsonPrimitive = string | number | boolean | null;
export type V3PromptJsonArray = readonly V3PromptJsonValue[];
export type V3PromptJsonValue = V3PromptJsonPrimitive | V3PromptJsonObject | V3PromptJsonArray;
export type V3PromptJsonObject = { readonly [key: string]: V3PromptJsonValue };

export type V3PromptReasoningStage = {
  readonly key: string;
  readonly title: string;
  readonly purpose: string;
  readonly description?: string;
  readonly inputs?: readonly string[];
  readonly outputs?: readonly string[];
  readonly notes?: readonly string[];
};

export type V3PromptReasoningContract = {
  readonly title: string;
  readonly overview?: string;
  readonly principles?: readonly string[];
  readonly stages: readonly V3PromptReasoningStage[];
};

export type V3PromptDecisionBranch = {
  readonly condition?: string;
  readonly label: string;
  readonly target: string;
};

export type V3PromptDecisionNode = {
  readonly id: string;
  readonly type: "evidence" | "narrative" | "context" | "legal" | "exception" | "reporting";
  readonly title: string;
  readonly purpose: string;
  readonly inputs?: readonly string[];
  readonly outputs?: readonly string[];
  readonly possibleBranches?: readonly V3PromptDecisionBranch[];
  readonly exitConditions?: readonly string[];
  readonly downstreamNodes?: readonly string[];
};

export type V3PromptDecisionEdge = {
  readonly from: string;
  readonly to: string;
  readonly label?: string;
  readonly condition?: string;
  readonly allowed?: boolean;
  readonly reason?: string;
};

export type V3PromptDecisionGraph = {
  readonly title: string;
  readonly overview?: string;
  readonly globalFlow?: readonly string[];
  readonly nodes: readonly V3PromptDecisionNode[];
  readonly edges?: readonly V3PromptDecisionEdge[];
  readonly globalExitConditions?: readonly string[];
  readonly evidencePriority?: readonly string[];
  readonly contextPriority?: readonly string[];
  readonly example?: string;
};

export type V3PromptSemanticLayer = {
  readonly title: string;
  readonly purpose?: string;
  readonly meaningQuestions?: readonly string[];
  readonly narrativeIntentOptions?: readonly string[];
  readonly conversationRoles?: readonly string[];
  readonly sceneRoles?: readonly string[];
  readonly outputs?: readonly string[];
  readonly states?: readonly string[];
  readonly signals?: readonly string[];
  readonly examples?: {
    readonly good?: readonly string[];
    readonly bad?: readonly string[];
    readonly edgeCases?: readonly string[];
    readonly falsePositives?: readonly string[];
    readonly falseNegatives?: readonly string[];
  };
  readonly notes?: readonly string[];
};

export type V3PromptStoryMemory = {
  readonly summary?: string;
  readonly notes?: readonly string[];
  readonly scenes?: readonly string[];
};

export type V3PromptChunkContext = {
  readonly localChunk: string;
  readonly neighboringSentences?: readonly string[];
  readonly sceneMemory?: string | null;
  readonly metadata?: V3PromptJsonObject | null;
};

export type V3PromptGlossaryEntry = {
  readonly term: string;
  readonly articleId?: number | null;
  readonly variants?: readonly string[];
  readonly definition?: string;
};

export type V3PromptGlossary = {
  readonly title: string;
  readonly entries: readonly V3PromptGlossaryEntry[];
  readonly notes?: readonly string[];
};

export type V3PromptSubjectModule = {
  readonly id: string;
  readonly titleAr: string;
  readonly scope?: string;
  readonly rules?: readonly string[];
  readonly exclusions?: readonly string[];
  readonly requiredEvidence?: readonly string[];
  readonly decisionTree?: readonly string[];
  readonly examples?: readonly string[];
  readonly nonExamples?: readonly string[];
  readonly articleIds?: readonly number[];
  readonly notes?: readonly string[];
};

export type V3PromptOutputField = {
  readonly name: string;
  readonly description: string;
  readonly required?: boolean;
};

export type V3PromptOutputSchema = {
  readonly title: string;
  readonly fields: readonly V3PromptOutputField[];
  readonly notes?: readonly string[];
  readonly example?: V3PromptJsonValue;
};

export type V3PromptBuilderInput = {
  readonly reasoningContract: V3PromptReasoningContract;
  readonly decisionGraph: V3PromptDecisionGraph;
  readonly semanticLayer: V3PromptSemanticLayer;
  readonly storyMemory: V3PromptStoryMemory | string;
  readonly chunkContext: V3PromptChunkContext;
  readonly subjectModule: V3PromptSubjectModule;
  readonly glossary: V3PromptGlossary;
  readonly outputSchema: V3PromptOutputSchema;
  readonly compiledReviewerContext?: import("../reviewerCompiler/compilerTypes.js").ReviewerCompiledContext | null;
};

export type V3RenderedPrompt = {
  readonly prompt: string;
  readonly promptHash: string;
};
