import type { V3PromptBuilderInput, V3PromptChunkContext, V3PromptGlossaryEntry, V3PromptJsonObject, V3PromptJsonValue } from "./builderTypes.js";

export type V3PromptBuilderContext = Readonly<{
  reasoningContract: V3PromptBuilderInput["reasoningContract"];
  decisionGraph: V3PromptBuilderInput["decisionGraph"];
  semanticLayer: V3PromptBuilderInput["semanticLayer"];
  storyMemory: V3PromptBuilderInput["storyMemory"];
  chunkContext: V3PromptChunkContext;
  subjectModule: V3PromptBuilderInput["subjectModule"];
  glossary: V3PromptBuilderInput["glossary"];
  outputSchema: V3PromptBuilderInput["outputSchema"];
}>;

function isPlainObject(value: unknown): value is V3PromptJsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

export function canonicalizePromptValue(value: V3PromptJsonValue): V3PromptJsonValue {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalizePromptValue(item));
  }

  if (isPlainObject(value)) {
    const canonical: Record<string, V3PromptJsonValue> = {};
    for (const key of Object.keys(value).sort((left, right) => left.localeCompare(right))) {
      canonical[key] = canonicalizePromptValue(value[key]);
    }
    return canonical;
  }

  return value;
}

export function stableSerializePromptValue(value: V3PromptJsonValue): string {
  return JSON.stringify(canonicalizePromptValue(value), null, 2);
}

export function normalizeGlossaryEntries(entries: readonly V3PromptGlossaryEntry[]): readonly V3PromptGlossaryEntry[] {
  return [...entries].sort((left, right) => {
    const termCompare = left.term.localeCompare(right.term);
    if (termCompare !== 0) return termCompare;

    const leftArticle = left.articleId ?? Number.POSITIVE_INFINITY;
    const rightArticle = right.articleId ?? Number.POSITIVE_INFINITY;
    if (leftArticle !== rightArticle) return leftArticle - rightArticle;

    const leftDefinition = left.definition ?? "";
    const rightDefinition = right.definition ?? "";
    return leftDefinition.localeCompare(rightDefinition);
  });
}

export function normalizePromptBuilderInput(input: V3PromptBuilderInput): V3PromptBuilderContext {
  return {
    reasoningContract: input.reasoningContract,
    decisionGraph: input.decisionGraph,
    semanticLayer: input.semanticLayer,
    storyMemory: input.storyMemory,
    chunkContext: {
      localChunk: input.chunkContext.localChunk,
      neighboringSentences: input.chunkContext.neighboringSentences ? [...input.chunkContext.neighboringSentences] : undefined,
      sceneMemory: input.chunkContext.sceneMemory ?? null,
      metadata: input.chunkContext.metadata ?? null,
    },
    subjectModule: {
      ...input.subjectModule,
      articleIds: input.subjectModule.articleIds ? [...input.subjectModule.articleIds] : undefined,
      rules: input.subjectModule.rules ? [...input.subjectModule.rules] : undefined,
      exclusions: input.subjectModule.exclusions ? [...input.subjectModule.exclusions] : undefined,
      requiredEvidence: input.subjectModule.requiredEvidence ? [...input.subjectModule.requiredEvidence] : undefined,
      decisionTree: input.subjectModule.decisionTree ? [...input.subjectModule.decisionTree] : undefined,
      examples: input.subjectModule.examples ? [...input.subjectModule.examples] : undefined,
      nonExamples: input.subjectModule.nonExamples ? [...input.subjectModule.nonExamples] : undefined,
      notes: input.subjectModule.notes ? [...input.subjectModule.notes] : undefined,
    },
    glossary: {
      ...input.glossary,
      entries: normalizeGlossaryEntries(input.glossary.entries),
      notes: input.glossary.notes ? [...input.glossary.notes] : undefined,
    },
    outputSchema: {
      ...input.outputSchema,
      fields: [...input.outputSchema.fields],
      notes: input.outputSchema.notes ? [...input.outputSchema.notes] : undefined,
    },
  };
}

