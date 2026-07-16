import type { V3PromptBuilderInput } from "../builder/builderTypes.js";
import { clampConceptConfidence } from "../concepts/conceptConfidence.js";
import type { ConceptContext, ConceptRecognitionInput } from "../concepts/conceptTypes.js";
import { createConceptRecognizer } from "../concepts/conceptRecognizer.js";
import { createDefaultConceptRegistry } from "../concepts/conceptRegistry.js";
import { validateReviewerAssessment } from "./reviewerMethodologyValidator.js";
import { getDefaultReviewerMethodology } from "./reviewerMethodologyRegistry.js";
import type { ReviewerAssessment, ReviewerMethodologyRunnerInput, ReviewerMethodologyStageResult } from "./reviewerMethodologyTypes.js";

function normalizeText(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}

function normalizeLower(value: string): string {
  return normalizeText(value).toLowerCase();
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return Number(value.toFixed(6));
}

function average(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return clampConfidence(values.reduce((sum, value) => sum + clampConfidence(value), 0) / values.length);
}

function hasPattern(text: string, patterns: readonly string[]): boolean {
  const normalized = normalizeLower(text);
  return patterns.some((pattern) => normalized.includes(normalizeLower(pattern)));
}

function dialogueIndicators(text: string): boolean {
  return /(^|\n)\s*[^:\n]{1,40}:\s*/.test(text) || /[«»"]/.test(text);
}

function normalizeStoryMemory(storyMemory: V3PromptBuilderInput["storyMemory"]): string | null {
  if (storyMemory === null || storyMemory === undefined) {
    return null;
  }

  if (typeof storyMemory === "string") {
    const normalized = normalizeText(storyMemory);
    return normalized.length > 0 ? normalized : null;
  }

  const parts = [
    storyMemory.summary ?? "",
    ...(storyMemory.notes ?? []),
    ...(storyMemory.scenes ?? []),
  ]
    .map((value) => normalizeText(value))
    .filter(Boolean);

  return parts.length > 0 ? parts.join(" | ") : null;
}

function buildPromptNarrative(input: V3PromptBuilderInput): ConceptRecognitionInput["narrative"] {
  const chunkText = normalizeText(input.chunkContext.localChunk);
  const dialogue = dialogueIndicators(chunkText);
  const narration = !dialogue;
  return Object.freeze({
    speaker: null,
    listener: null,
    target: null,
    narrativeVoice: dialogue ? "dialogue" : "narration",
    sceneType: dialogue ? "dialogue scene" : "scene description",
    narrativeIntent: "unknown",
    storyPosition: "unknown",
    relationship: null,
    emotionalTone: "neutral",
    condemnation: false,
    approval: false,
    neutrality: true,
    historicalContext: false,
    dream: false,
    flashback: false,
    comedy: false,
    satire: false,
    threat: false,
    instruction: false,
    news: false,
    documentary: false,
    dialogue,
    narration,
    sceneDescription: !dialogue,
    confidence: 0.5,
    notes: [],
  });
}

function buildPromptEvidence(input: V3PromptBuilderInput): ConceptRecognitionInput["evidence"] {
  const text = normalizeText(input.chunkContext.localChunk);
  return Object.freeze({
    candidates: [
      Object.freeze({
        text,
        startOffset: 0,
        endOffset: text.length,
        confidence: 0.5,
        source: "chunk" as const,
        notes: [],
      }),
    ],
    primaryCandidateIndex: 0,
    admissible: true,
    confidence: 0.5,
    notes: [],
  });
}

function buildPromptSemantic(input: V3PromptBuilderInput): ConceptRecognitionInput["semantic"] {
  const chunkText = normalizeText(input.chunkContext.localChunk);
  return Object.freeze({
    semanticMeaning: chunkText,
    narrativeIntent: "unknown",
    conversationRole: "unknown",
    sceneRole: "unknown",
    speaker: null,
    listener: null,
    target: null,
    victim: null,
    emotion: "neutral",
    riskContext: "unknown",
    confidence: 0.5,
    notes: [],
  });
}

function buildPromptContext(input: V3PromptBuilderInput): ConceptRecognitionInput["context"] {
  const chunkText = normalizeText(input.chunkContext.localChunk);
  const storyMemory = normalizeStoryMemory(input.storyMemory);
  const neighboringSentences = (input.chunkContext.neighboringSentences ?? []).map((sentence) => normalizeText(sentence)).filter(Boolean);
  return Object.freeze({
    storyMemory,
    sceneMemory: input.chunkContext.sceneMemory ?? null,
    localContext: chunkText,
    chunkContext: chunkText,
    neighboringSentences,
    narrativeContext: [storyMemory, chunkText, ...neighboringSentences].filter(Boolean).join(" | "),
    confidence: 0.5,
    notes: [],
  });
}

function buildPromptGlossaryReferences(input: V3PromptBuilderInput): ConceptRecognitionInput["glossaryReferences"] {
  return Object.freeze(
    input.glossary.entries.flatMap((entry) => {
      const terms = [entry.term, ...(entry.variants ?? [])]
        .map((term) => normalizeText(term))
        .filter(Boolean);

      return terms.map((term) =>
        Object.freeze({
          term: normalizeText(entry.term),
          normalizedTerm: term,
          source: "glossary" as const,
          matchText: term,
          confidence: 0.85,
        }),
      );
    }),
  );
}

export function createPromptConceptContext(input: V3PromptBuilderInput): ConceptContext {
  const recognitionInput: ConceptRecognitionInput = Object.freeze({
    moduleId: input.subjectModule.id,
    storyMemory: normalizeStoryMemory(input.storyMemory),
    narrative: buildPromptNarrative(input),
    evidence: buildPromptEvidence(input),
    semantic: buildPromptSemantic(input),
    context: buildPromptContext(input),
    narrativeIntent: "unknown",
    speaker: null,
    listener: null,
    target: null,
    victim: null,
    sceneType: "unknown",
    dialogueMode: "unknown",
    interpretationMode: "unknown",
    flags: Object.freeze({
      dialogue: false,
      narration: true,
      promotion: false,
      condemnation: false,
      description: true,
      historical: false,
      educational: false,
      satire: false,
      documentary: false,
      fiction: false,
      threat: false,
      instruction: false,
      news: false,
      comedy: false,
      dream: false,
      flashback: false,
      quotation: false,
      approval: false,
      neutrality: true,
    }),
    entities: Object.freeze([]),
    glossaryReferences: buildPromptGlossaryReferences(input),
    evidenceAssessment: Object.freeze({
      primaryText: normalizeText(input.chunkContext.localChunk),
      primaryStartOffset: 0,
      primaryEndOffset: normalizeText(input.chunkContext.localChunk).length,
      primaryCandidateIndex: 0,
      candidateCount: 1,
      admissible: true,
      confidence: 0.5,
      source: "chunk",
      notes: [],
    }),
    contextConfidence: 0.5,
    legalConcepts: [],
    conceptContext: Object.freeze({
      concepts: [],
      conceptIds: [],
      primaryConceptId: null,
      confidence: 0,
      conceptCount: 0,
    }),
    glossary: input.glossary,
  });

  return createConceptRecognizer(createDefaultConceptRegistry()).recognize(recognitionInput);
}

function extractSpeaker(text: string): string | null {
  const lineMatch = text.match(/(^|\n)\s*([^\n:]{1,40}):\s*/);
  if (lineMatch?.[2]) {
    const candidate = normalizeText(lineMatch[2]);
    return candidate.length > 0 ? candidate : null;
  }
  const quotedMatch = text.match(/\bقال(?:ت|وا)?\s+([^\s،:.!؟]{1,40})/);
  if (quotedMatch?.[1]) {
    const candidate = normalizeText(quotedMatch[1]);
    return candidate.length > 0 ? candidate : null;
  }
  return null;
}

function extractTarget(text: string): string | null {
  const vocativeMatch = text.match(/يا\s+([^\s،:.!؟]{1,40})/);
  if (vocativeMatch?.[1]) {
    const candidate = normalizeText(vocativeMatch[1]);
    return candidate.length > 0 ? candidate : null;
  }
  const youSignals = ["you", "أنت", "انتي", "أنتِ"];
  if (hasPattern(text, youSignals)) return "direct_address";
  return null;
}

function inferNarrativeIntent(input: ReviewerMethodologyRunnerInput): string {
  const text = `${input.promptInput.chunkContext.localChunk} ${normalizeStoryMemory(input.promptInput.storyMemory) ?? ""}`;
  if (hasPattern(text, ["يستنكر", "ينتقد", "يدين", "مرفوض", "لا يجوز", "رفض", "condemn"])) return "condemnation";
  if (hasPattern(text, ["تعليمي", "تعليم", "شرح", "مثال", "أمثلة", "درس", "analysis"])) return "education";
  if (hasPattern(text, ["quote", "quoted", "اقتباس", "اقتبس", "«", "»", "\""])) return "quotation";
  if (hasPattern(text, ["خبر", "تقرير", "news", "وثائقي", "documentary"])) return "documentary";
  if (hasPattern(text, ["سخرية", "ساخر", "satire", "parody", "مضحك"])) return "humor";
  if (hasPattern(text, ["حلم", "منام", "dream"])) return "fiction";
  if (hasPattern(text, ["تحذير", "warning", "threat", "تهديد"])) return "warning";
  if (dialogueIndicators(input.promptInput.chunkContext.localChunk)) return "neutral";
  return "observation";
}

function inferContextClassification(input: ReviewerMethodologyRunnerInput, narrativeIntent: string): string {
  const chunkText = input.promptInput.chunkContext.localChunk;
  if (narrativeIntent === "quotation") return "quoted";
  if (narrativeIntent === "education") return "educational";
  if (narrativeIntent === "condemnation") return "condemnatory";
  if (narrativeIntent === "documentary") return "documentary";
  if (narrativeIntent === "humor") return "satirical";
  if (narrativeIntent === "fiction") return "fictional";
  if (dialogueIndicators(chunkText)) return "dialogue";
  if (hasPattern(chunkText, ["قال", "تقول", "يقول", "said"])) return "reported_speech";
  return "narrative";
}

function inferLiteralVsImpliedMeaning(contextClassification: string, conceptContext: ConceptContext): string {
  if (contextClassification === "quoted") return "quoted";
  if (contextClassification === "educational") return "educational";
  if (contextClassification === "condemnatory") return "condemned";
  if (conceptContext.conceptCount > 0) return "literal";
  return "implied";
}

function inferExceptionSignals(narrativeIntent: string, contextClassification: string): readonly string[] {
  const signals: string[] = [];
  if (contextClassification === "quoted") signals.push("quotation");
  if (contextClassification === "educational") signals.push("educational_usage");
  if (contextClassification === "condemnatory") signals.push("condemnation");
  if (contextClassification === "documentary") signals.push("documentary");
  if (contextClassification === "satirical") signals.push("satire");
  if (contextClassification === "fictional") signals.push("fiction");
  if (narrativeIntent === "warning") signals.push("warning");
  return Object.freeze([...new Set(signals)].sort((left, right) => left.localeCompare(right)));
}

function buildStageResult(
  name: ReviewerMethodologyStageResult["name"],
  title: string,
  purpose: string,
  status: ReviewerMethodologyStageResult["status"],
  summary: string,
  confidence: number,
  inputs: readonly string[],
  outputs: readonly string[],
  notes: readonly string[] = [],
): ReviewerMethodologyStageResult {
  return Object.freeze({
    name,
    title,
    purpose,
    status,
    summary,
    confidence: clampConfidence(confidence),
    inputs: Object.freeze([...inputs]),
    outputs: Object.freeze([...outputs]),
    notes: Object.freeze([...notes]),
  });
}

export function runReviewerMethodology(input: ReviewerMethodologyRunnerInput): ReviewerAssessment {
  const methodology = getDefaultReviewerMethodology();
  const chunkText = normalizeText(input.promptInput.chunkContext.localChunk);
  const storyMemory = normalizeStoryMemory(input.promptInput.storyMemory);
  const speaker = extractSpeaker(chunkText);
  const target = extractTarget(chunkText);
  const victim = input.conceptContext.conceptIds.length > 0 ? (target ?? speaker) : null;
  const narrativeIntent = inferNarrativeIntent(input);
  const contextClassification = inferContextClassification(input, narrativeIntent);
  const literalVsImpliedMeaning = inferLiteralVsImpliedMeaning(contextClassification, input.conceptContext);
  const exceptionSignals = inferExceptionSignals(narrativeIntent, contextClassification);
  const evidenceStrength = clampConfidence(
    average([
      input.conceptContext.confidence,
      input.conceptContext.conceptCount > 0 ? 0.9 : 0.2,
      dialogueIndicators(chunkText) ? 0.75 : 0.45,
    ]),
  );
  const conceptConfidence = clampConceptConfidence(input.conceptContext.confidence);
  const reasoningTrace = Object.freeze([
    `narrative=${contextClassification}`,
    `speaker=${speaker ?? "unknown"}`,
    `target=${target ?? "unknown"}`,
    `victim=${victim ?? "unknown"}`,
    `intent=${narrativeIntent}`,
    `evidence_strength=${evidenceStrength}`,
    `literal_vs_implied=${literalVsImpliedMeaning}`,
    `exceptions=${exceptionSignals.join("|") || "none"}`,
    `concepts=${input.conceptContext.conceptIds.join("|") || "none"}`,
  ]);
  const stageResults = Object.freeze([
    buildStageResult(
      "narrative_understanding",
      "Narrative Understanding",
      "Understand the scene before classification.",
      "complete",
      `${contextClassification} scene with ${dialogueIndicators(chunkText) ? "dialogue" : "narration"} mode.`,
      dialogueIndicators(chunkText) ? 0.82 : 0.7,
      ["chunk", "story_memory", "neighboring_sentences"],
      ["narrative_summary", "scene_mode"],
      storyMemory ? [storyMemory] : [],
    ),
    buildStageResult(
      "speaker_identification",
      "Speaker Identification",
      "Infer the likely speaker when the text provides a cue.",
      speaker ? "complete" : "uncertain",
      speaker ?? "No explicit speaker cue found.",
      speaker ? 0.8 : 0.35,
      ["chunk", "narrative_summary"],
      ["speaker"],
    ),
    buildStageResult(
      "target_identification",
      "Target Identification",
      "Identify the addressed or described target when supported by the text.",
      target ? "complete" : "uncertain",
      target ?? "No explicit target cue found.",
      target ? 0.78 : 0.3,
      ["chunk", "speaker"],
      ["target"],
    ),
    buildStageResult(
      "victim_identification",
      "Victim Identification",
      "Identify any victim role that is explicitly supported.",
      victim ? "complete" : "uncertain",
      victim ?? "No explicit victim cue found.",
      victim ? 0.72 : 0.28,
      ["chunk", "target"],
      ["victim"],
    ),
    buildStageResult(
      "narrative_intent",
      "Narrative Intent",
      "Classify the apparent intent of the statement.",
      narrativeIntent === "observation" ? "partial" : "complete",
      narrativeIntent,
      narrativeIntent === "observation" ? 0.52 : 0.78,
      ["chunk", "story_memory", "narrative_summary"],
      ["narrative_intent"],
    ),
    buildStageResult(
      "evidence_strength",
      "Evidence Strength",
      "Measure how strongly the local chunk supports the reasoning focus.",
      "complete",
      `Evidence strength ${evidenceStrength}.`,
      evidenceStrength,
      ["chunk", "concept_context"],
      ["evidence_strength"],
    ),
    buildStageResult(
      "context_classification",
      "Context Classification",
      "Classify the contextual frame around the evidence.",
      contextClassification === "narrative" ? "partial" : "complete",
      contextClassification,
      contextClassification === "narrative" ? 0.55 : 0.8,
      ["chunk", "story_memory", "neighboring_sentences"],
      ["context_classification"],
    ),
    buildStageResult(
      "literal_vs_implied_meaning",
      "Literal vs Implied Meaning",
      "Distinguish literal wording from implied meaning.",
      literalVsImpliedMeaning === "implied" ? "partial" : "complete",
      literalVsImpliedMeaning,
      literalVsImpliedMeaning === "implied" ? 0.48 : 0.79,
      ["chunk", "context_classification"],
      ["literal_vs_implied_meaning"],
    ),
    buildStageResult(
      "exception_detection",
      "Exception Detection",
      "Detect quotation, educational, condemnation, and similar exceptions.",
      exceptionSignals.length > 0 ? "complete" : "partial",
      exceptionSignals.length > 0 ? exceptionSignals.join(", ") : "No exception signal detected.",
      exceptionSignals.length > 0 ? 0.8 : 0.45,
      ["chunk", "context_classification", "narrative_intent"],
      ["exception_signals"],
    ),
    buildStageResult(
      "confidence_assessment",
      "Confidence Assessment",
      "Combine the reasoning signals into a deterministic confidence score.",
      "complete",
      `Overall confidence ${average([evidenceStrength, conceptConfidence, exceptionSignals.length > 0 ? 0.7 : 0.82])}.`,
      average([evidenceStrength, conceptConfidence, exceptionSignals.length > 0 ? 0.7 : 0.82]),
      ["stage_results"],
      ["confidence"],
    ),
    buildStageResult(
      "applicable_concept_validation",
      "Applicable Concept Validation",
      "Validate which canonical concepts are applicable before packs are selected.",
      input.conceptContext.conceptCount > 0 ? "complete" : "partial",
      input.conceptContext.conceptIds.length > 0 ? input.conceptContext.conceptIds.join(", ") : "No canonical concepts detected.",
      input.conceptContext.conceptCount > 0 ? 0.92 : 0.4,
      ["concept_context", "confidence"],
      ["applicable_concept_ids"],
    ),
  ]);

  const assessment: ReviewerAssessment = Object.freeze({
    methodologyId: methodology.id,
    methodologyTitle: methodology.title,
    narrativeUnderstanding: `${contextClassification} | ${dialogueIndicators(chunkText) ? "dialogue" : "narration"}`,
    speaker,
    target,
    victim,
    narrativeIntent,
    evidenceStrength,
    contextClassification,
    literalVsImpliedMeaning,
    exceptionSignals,
    confidence: average(stageResults.map((stage) => stage.confidence)),
    applicableConceptIds: Object.freeze([...input.conceptContext.conceptIds]),
    conceptConfidence,
    conceptCount: input.conceptContext.conceptCount,
    reasoningTrace,
    stageResults,
  });

  const validation = validateReviewerAssessment(assessment);
  if (!validation.valid) {
    const message = validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
    throw new Error(`Invalid ReviewerAssessment: ${message}`);
  }

  return assessment;
}
