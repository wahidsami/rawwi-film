import type { Concept, ConceptContext, ConceptEvidenceSource, ConceptRecognitionInput } from "./conceptTypes.js";
import { createConceptRecognizer } from "./conceptRecognizer.js";
import { createDefaultConceptRegistry, type ConceptRegistry } from "./conceptRegistry.js";
import { normalizeConceptContext } from "./conceptNormalizer.js";
import { normalizeConceptConfidence } from "./conceptConfidence.js";
import type { ReviewerAssessment } from "../reviewerMethodology/reviewerMethodologyTypes.js";
import type { V3PromptBuilderInput } from "../builder/builderTypes.js";

export type UniversalConceptEvidenceType = "dialogue" | "scene_description" | "story_context" | "mixed" | "unknown";

export type UniversalConceptResolution = Readonly<{
  conceptContext: ConceptContext;
  detectedConceptIds: readonly string[];
  detectedConceptLabels: readonly string[];
  knowledgeDomains: readonly string[];
  detectedEntities: readonly string[];
  detectedActions: readonly string[];
  evidenceType: UniversalConceptEvidenceType;
  sceneDescriptionType: UniversalConceptEvidenceType;
  storyContextType: "story_memory" | "scene_memory" | "mixed" | "none";
  confidence: number;
  reason: string;
}>;

function normalizeText(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
}

function joinTexts(values: readonly (string | null | undefined)[]): string {
  return values.map((value) => (value ? normalizeText(value) : "")).filter(Boolean).join(" ");
}

function normalizeStoryMemory(value: V3PromptBuilderInput["storyMemory"] | ConceptRecognitionInput["storyMemory"]): string {
  if (typeof value === "string") return normalizeText(value);
  if (!value) return "";
  return joinTexts([
    value.summary ?? "",
    ...(value.notes ?? []),
    ...(value.scenes ?? []),
  ]);
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values.map((value) => normalizeText(value)).filter(Boolean))].sort((left, right) => left.localeCompare(right)));
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return Number(value.toFixed(6));
}

function prettifyConceptLabel(conceptId: string): string {
  return conceptId
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase())
    .trim();
}

function resolveConceptLabel(registry: ConceptRegistry, conceptId: string): string {
  return registry.load(conceptId)?.label ?? prettifyConceptLabel(conceptId);
}

function buildEvidenceSource(sourceType: ConceptEvidenceSource["sourceType"], sourceText: string, confidence: number): ConceptEvidenceSource {
  return Object.freeze({
    sourceType,
    sourceText,
    originatingSentence: sourceText || null,
    entityId: null,
    glossaryTerm: null,
    confidence: clampConfidence(confidence),
  });
}

function buildSyntheticConcept(registry: ConceptRegistry, conceptId: string, corpusText: string, confidence: number, sourceType: ConceptEvidenceSource["sourceType"] = "semantic"): Concept {
  const normalizedConfidence = clampConfidence(confidence);
  return Object.freeze({
    id: conceptId,
    label: resolveConceptLabel(registry, conceptId),
    confidence: normalizeConceptConfidence({
      narrative: sourceType === "narrative" ? normalizedConfidence : normalizedConfidence * 0.9,
      semantic: sourceType === "semantic" ? normalizedConfidence : normalizedConfidence * 0.85,
      storyMemory: sourceType === "story_memory" ? normalizedConfidence : normalizedConfidence * 0.75,
      entity: sourceType === "entity" ? normalizedConfidence * 0.8 : 0,
      glossary: sourceType === "glossary" ? normalizedConfidence * 0.9 : 0,
      evidence: normalizedConfidence,
    }),
    evidenceSources: Object.freeze([buildEvidenceSource(sourceType, corpusText, normalizedConfidence)]),
    originatingSentences: Object.freeze([corpusText]),
    entityReferences: Object.freeze([]),
    glossaryReferences: Object.freeze([]),
  });
}

function collectCorpusText(input: Pick<ConceptRecognitionInput, "storyMemory" | "narrative" | "evidence" | "semantic" | "context">): string {
  return joinTexts([
    input.storyMemory,
    input.narrative.speaker,
    input.narrative.listener,
    input.narrative.target,
    input.narrative.narrativeVoice,
    input.narrative.sceneType,
    input.narrative.narrativeIntent,
    input.narrative.storyPosition,
    input.narrative.relationship,
    input.narrative.emotionalTone,
    input.semantic.semanticMeaning,
    input.semantic.narrativeIntent,
    input.semantic.conversationRole,
    input.semantic.sceneRole,
    input.semantic.speaker,
    input.semantic.listener,
    input.semantic.target,
    input.semantic.victim,
    input.semantic.emotion,
    input.semantic.riskContext,
    input.context.storyMemory,
    input.context.sceneMemory,
    input.context.localContext,
    input.context.chunkContext,
    input.context.narrativeContext,
    ...input.evidence.candidates.map((candidate) => candidate.text),
  ]);
}

function collectDetectedEntities(input: Pick<ConceptRecognitionInput, "entities" | "speaker" | "listener" | "target" | "victim">): readonly string[] {
  return uniqueSorted([
    ...(input.entities.map((entity) => entity.label)),
    input.speaker,
    input.listener,
    input.target,
    input.victim,
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0));
}

function inferEvidenceType(input: Pick<ConceptRecognitionInput, "narrative" | "context" | "storyMemory">): UniversalConceptEvidenceType {
  const dialogue = Boolean(input.narrative.dialogue) || /(^|\n)\s*[^:\n]{1,40}:\s*/.test(input.context.localContext) || /[«»"]/u.test(input.context.localContext);
  const description = Boolean(input.narrative.sceneDescription) || Boolean(input.narrative.narration);
  const story = Boolean(input.storyMemory && input.storyMemory.trim().length > 0) || Boolean(input.context.sceneMemory);

  if (dialogue && description) return "mixed";
  if (dialogue) return "dialogue";
  if (description) return "scene_description";
  if (story) return "story_context";
  return "unknown";
}

function inferSceneDescriptionType(input: Pick<ConceptRecognitionInput, "narrative" | "context">): UniversalConceptEvidenceType {
  const dialogue = Boolean(input.narrative.dialogue) || /(^|\n)\s*[^:\n]{1,40}:\s*/.test(input.context.localContext) || /[«»"]/u.test(input.context.localContext);
  const description = Boolean(input.narrative.sceneDescription) || Boolean(input.narrative.narration);

  if (dialogue && description) return "mixed";
  if (dialogue) return "dialogue";
  if (description) return "scene_description";
  return "unknown";
}

function inferStoryContextType(input: Pick<ConceptRecognitionInput, "storyMemory" | "context">): "story_memory" | "scene_memory" | "mixed" | "none" {
  const hasStory = Boolean(input.storyMemory && input.storyMemory.trim().length > 0);
  const hasScene = Boolean(input.context.sceneMemory && input.context.sceneMemory.trim().length > 0);
  if (hasStory && hasScene) return "mixed";
  if (hasStory) return "story_memory";
  if (hasScene) return "scene_memory";
  return "none";
}

function detectSurfaceConceptIds(corpusText: string): readonly string[] {
  const text = normalizeText(corpusText);
  const detected: string[] = [];

  const patterns: readonly (readonly [string, RegExp])[] = [
    ["profanity", /(?:يا[.…\.]{1,}|يا\s+(?:كلب|حمار|خرا|خنزير|غبي|حقير|قذر|سافل|وسخ|وسخة|لعين|نصاب|حرامي)|شتيمة|شتائم|سباب|سب|شتم|قذف|بشتائم|بشتم)/u],
    ["insult", /(?:يا[.…\.]{1,}|يا\s+(?:كلب|حمار|خرا|خنزير|غبي|حقير|قذر|سافل|وسخ|وسخة|لعين|نصاب|حرامي)|أكرهك|أكرهكم|تافه|ساقط|حقير|بشتائم|بشتم)/u],
    ["hostility", /(?:موتوا|موتي|موتو|اخرجوا|اخرجي|انقلع|انقلعي|أكرهك|أكرهكم|خلصوني منكم|سحقا|اذهبوا|اذهبي|يا[.…\.]{1,})/u],
    ["violence", /(?:سأقتلك|أقتلك|سأذبحك|أذبحك|سأضربك|أضربك|اقتل|قتل|طعن|تكسير)/u],
    ["religion", /(?:دين|إسلام|مسلم|مسيحي|صلاة|مسجد|كنيسة|الله|الرسول|النبي)/u],
    ["crime", /(?:سرقة|أسرق|ثب|ابتزاز|رشوة|فساد|مجرم|جريمة|اختلاس)/u],
    ["politics", /(?:حكومة|دولة|وزارة|نظام|رئيس|قيادة|سياسة|انتخابات|سياسي)/u],
    ["children", /(?:طفل|طفلة|قاصر|أطفال|أبناء|أولاد|يا صغير)/u],
    ["sexuality", /(?:جنس|جنسي|عاري|عري|فاحش|إباحية)/u],
    ["drugs", /(?:مخدر|حشيش|خمر|قمار|سكران|مخدرات)/u],
    ["history", /(?:تاريخ|تاريخي|وثائقي|ماضي)/u],
    ["travel", /(?:سفر|رحلة|مطار|جواز|تأشيرة|فندق)/u],
    ["society", /(?:عائلة|أسرة|مجتمع|أب|أم|أخ|أخت|بيت)/u],
    ["security", /(?:إرهاب|إرهابي|انفجار|تفجير|تهديد|أسلحة|شرطة|جيش|عسكري|أمن)/u],
  ];

  for (const [conceptId, pattern] of patterns) {
    if (pattern.test(text)) detected.push(conceptId);
  }

  return uniqueSorted(detected);
}

function inferKnowledgeDomains(conceptIds: readonly string[], corpusText: string): readonly string[] {
  const domains = new Set<string>();
  const text = normalizeText(corpusText);

  const add = (domain: string): void => {
    const normalized = normalizeText(domain);
    if (normalized.length > 0) domains.add(normalized);
  };

  for (const conceptId of conceptIds) {
    switch (conceptId) {
      case "profanity":
      case "insult":
      case "hostility":
        add("profanity");
        break;
      case "violence":
        add("violence");
        break;
      case "religion":
        add("religion");
        break;
      case "crime":
        add("crime");
        break;
      case "politics":
        add("politics");
        break;
      case "children":
        add("children");
        break;
      case "sexuality":
        add("sexuality");
        break;
      case "drugs":
        add("drugs");
        break;
      case "history":
        add("history");
        break;
      case "travel":
        add("travel");
        break;
      case "society":
        add("society");
        break;
      case "security":
        add("security");
        break;
      default:
        break;
    }
  }

  if (domains.size === 0 && (/(?:يا[.…\.]{1,}|يا\s+(?:كلب|حمار|خرا|خنزير|غبي|حقير|قذر|سافل|وسخ|وسخة|لعين|نصاب|حرامي)|شتائم|سباب|سب|شتم|بشتائم|بشتم)/u.test(text) || /(?:أكرهك|أكرهكم|خلصوني منكم|موتوا|موتو)/u.test(text))) {
    add("profanity");
  }

  return Object.freeze([...domains].sort((left, right) => left.localeCompare(right)));
}

function resolveConceptContext(
  registry: ConceptRegistry,
  baseContext: ConceptContext,
  corpusText: string,
  confidenceHint: number,
): ConceptContext {
  const syntheticConceptIds = detectSurfaceConceptIds(corpusText).filter((conceptId) => !baseContext.conceptIds.includes(conceptId));
  const syntheticConcepts = syntheticConceptIds.map((conceptId, index) =>
    buildSyntheticConcept(registry, conceptId, corpusText, Math.max(0.3, confidenceHint - (index * 0.08))),
  );

  return normalizeConceptContext({
    concepts: Object.freeze([...baseContext.concepts, ...syntheticConcepts]),
    conceptIds: Object.freeze([...baseContext.conceptIds, ...syntheticConceptIds]),
    primaryConceptId: baseContext.primaryConceptId ?? syntheticConceptIds[0] ?? null,
    confidence: Math.max(baseContext.confidence, confidenceHint),
    conceptCount: baseContext.conceptCount + syntheticConceptIds.length,
  });
}

function buildResolution(
  registry: ConceptRegistry,
  baseContext: ConceptContext,
  corpusText: string,
  input: Readonly<{
    speaker: string | null;
    listener: string | null;
    target: string | null;
    victim: string | null;
    narrativeIntent: string;
    contextClassification: string;
    exceptionSignals: readonly string[];
    confidenceHint: number;
    dialogueHint: boolean;
    descriptionHint: boolean;
    storyMemoryPresent: boolean;
    sceneMemoryPresent: boolean;
  }>,
): UniversalConceptResolution {
  const conceptContext = resolveConceptContext(registry, baseContext, corpusText, input.confidenceHint);
  const detectedConceptIds = uniqueSorted(conceptContext.conceptIds);
  const knowledgeDomains = inferKnowledgeDomains(detectedConceptIds, corpusText);
  const detectedEntities = uniqueSorted([input.speaker, input.listener, input.target, input.victim].filter((value): value is string => Boolean(value && value.trim().length > 0)));
  const detectedActions = uniqueSorted([
    input.narrativeIntent,
    input.contextClassification,
    ...(input.exceptionSignals ?? []),
    ...(input.dialogueHint ? ["dialogue"] : []),
    ...(input.descriptionHint ? ["scene_description"] : []),
    ...(input.storyMemoryPresent ? ["story_memory"] : []),
    ...(input.sceneMemoryPresent ? ["scene_memory"] : []),
  ]);
  const evidenceType = input.dialogueHint && (input.descriptionHint || input.storyMemoryPresent || input.sceneMemoryPresent)
    ? "mixed"
    : input.dialogueHint
      ? "dialogue"
      : input.descriptionHint
        ? "scene_description"
        : input.storyMemoryPresent || input.sceneMemoryPresent
          ? "story_context"
          : "unknown";
  const sceneDescriptionType = input.dialogueHint && input.descriptionHint
    ? "mixed"
    : input.dialogueHint
      ? "dialogue"
      : input.descriptionHint
        ? "scene_description"
        : "unknown";
  const storyContextType = input.storyMemoryPresent && input.sceneMemoryPresent
    ? "mixed"
    : input.storyMemoryPresent
      ? "story_memory"
      : input.sceneMemoryPresent
        ? "scene_memory"
        : "none";
  const confidence = clampConfidence(conceptContext.conceptCount > 0 ? Math.max(conceptContext.confidence, input.confidenceHint) : 0);
  const reason = knowledgeDomains.length > 0
    ? `Detected concepts ${detectedConceptIds.join(", ")} -> knowledge domains ${knowledgeDomains.join(", ")}.`
    : `No canonical concepts detected; universal guidance only.`;

  return Object.freeze({
    conceptContext,
    detectedConceptIds,
    detectedConceptLabels: uniqueSorted(conceptContext.concepts.map((concept) => concept.label)),
    knowledgeDomains,
    detectedEntities,
    detectedActions,
    evidenceType,
    sceneDescriptionType,
    storyContextType,
    confidence,
    reason,
  });
}

function collectRoutingCorpusText(input: Readonly<{
  promptInput: V3PromptBuilderInput;
  conceptContext: ConceptContext;
  assessment: ReviewerAssessment;
}>): string {
  return joinTexts([
    input.promptInput.chunkContext.localChunk,
    normalizeStoryMemory(input.promptInput.storyMemory),
    input.promptInput.chunkContext.sceneMemory ?? null,
    input.assessment.narrativeUnderstanding,
    input.assessment.narrativeIntent,
    input.assessment.contextClassification,
    input.assessment.literalVsImpliedMeaning,
    input.assessment.speaker,
    input.assessment.target,
    input.assessment.victim,
    ...input.conceptContext.concepts.flatMap((concept) => [
      concept.id,
      concept.label,
      ...(concept.originatingSentences ?? []),
      ...(concept.entityReferences ?? []),
      ...(concept.glossaryReferences ?? []),
    ]),
  ]);
}

export function resolveUniversalConceptsFromRecognitionInput(
  input: ConceptRecognitionInput,
  registry: ConceptRegistry = createDefaultConceptRegistry(),
): UniversalConceptResolution {
  const baseContext = createConceptRecognizer(registry).recognize(input);
  const corpusText = collectCorpusText(input);
  return buildResolution(registry, baseContext, corpusText, {
    speaker: input.narrative.speaker ?? input.semantic.speaker ?? input.speaker,
    listener: input.narrative.listener ?? input.semantic.listener ?? input.listener,
    target: input.narrative.target ?? input.semantic.target ?? input.target,
    victim: input.semantic.victim ?? input.victim ?? input.narrative.target ?? null,
    narrativeIntent: input.narrative.narrativeIntent ?? input.semantic.narrativeIntent ?? input.narrativeIntent ?? "unknown",
    contextClassification: input.context.narrativeContext ? input.context.narrativeContext : input.narrative.sceneType,
    exceptionSignals: [],
    confidenceHint: input.contextConfidence,
    dialogueHint: Boolean(input.narrative.dialogue) || Boolean(input.flags?.dialogue),
    descriptionHint: Boolean(input.narrative.sceneDescription) || Boolean(input.narrative.narration) || Boolean(input.flags?.description),
    storyMemoryPresent: Boolean(input.storyMemory && input.storyMemory.trim().length > 0),
    sceneMemoryPresent: Boolean(input.context.sceneMemory && input.context.sceneMemory.trim().length > 0),
  });
}

export function resolveUniversalConceptsFromRouting(
  input: Readonly<{
    promptInput: V3PromptBuilderInput;
    conceptContext: ConceptContext;
    assessment: ReviewerAssessment;
  }>,
  registry: ConceptRegistry = createDefaultConceptRegistry(),
): UniversalConceptResolution {
  const corpusText = collectRoutingCorpusText(input);
  const dialogueHint = Boolean(input.promptInput.chunkContext.localChunk.includes(":") || /[«»"]/u.test(input.promptInput.chunkContext.localChunk));
  const descriptionHint = Boolean(input.assessment.contextClassification === "narrative" || input.assessment.contextClassification === "documentary" || input.assessment.contextClassification === "educational");
  const storyMemoryPresent = normalizeStoryMemory(input.promptInput.storyMemory).length > 0;
  const sceneMemoryPresent = Boolean(input.promptInput.chunkContext.sceneMemory && input.promptInput.chunkContext.sceneMemory.trim().length > 0);

  return buildResolution(registry, input.conceptContext, corpusText, {
    speaker: input.assessment.speaker,
    listener: null,
    target: input.assessment.target,
    victim: input.assessment.victim,
    narrativeIntent: input.assessment.narrativeIntent,
    contextClassification: input.assessment.contextClassification,
    exceptionSignals: input.assessment.exceptionSignals ?? [],
    confidenceHint: input.assessment.confidence,
    dialogueHint,
    descriptionHint,
    storyMemoryPresent,
    sceneMemoryPresent,
  });
}
