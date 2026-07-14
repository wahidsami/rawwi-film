import type {
  IntelligenceContext,
  IntelligenceEntity,
  IntelligenceEntitySource,
  IntelligenceFlags,
  IntelligenceGlossaryReference,
} from "./intelligenceContext.js";
import { canonicalizePromptValue } from "../builder/builderContext.js";
import { normalizeConceptContext } from "../concepts/conceptNormalizer.js";
import type { ConceptContext } from "../concepts/conceptTypes.js";

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return Number(value.toFixed(6));
}

function normalizeText(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}

function freezeReadonlyArray<T>(items: readonly T[]): readonly T[] {
  return Object.freeze(items.map((item) => {
    if (item && typeof item === "object") return Object.freeze({ ...(item as Record<string, unknown>) }) as T;
    return item;
  }));
}

function normalizeConceptContextInput(conceptContext: ConceptContext): ConceptContext {
  return normalizeConceptContext(conceptContext);
}

export function normalizeIntelligenceFlags(flags: Partial<IntelligenceFlags>): IntelligenceFlags {
  return Object.freeze({
    dialogue: Boolean(flags.dialogue),
    narration: Boolean(flags.narration),
    promotion: Boolean(flags.promotion),
    condemnation: Boolean(flags.condemnation),
    description: Boolean(flags.description),
    historical: Boolean(flags.historical),
    educational: Boolean(flags.educational),
    satire: Boolean(flags.satire),
    documentary: Boolean(flags.documentary),
    fiction: Boolean(flags.fiction),
    threat: Boolean(flags.threat),
    instruction: Boolean(flags.instruction),
    news: Boolean(flags.news),
    comedy: Boolean(flags.comedy),
    dream: Boolean(flags.dream),
    flashback: Boolean(flags.flashback),
    quotation: Boolean(flags.quotation),
    approval: Boolean(flags.approval),
    neutrality: Boolean(flags.neutrality),
  });
}

export function normalizeIntelligenceEntities(entities: readonly IntelligenceEntity[]): readonly IntelligenceEntity[] {
  const sorted = [...entities].sort((left, right) =>
    left.role.localeCompare(right.role) ||
    left.label.localeCompare(right.label) ||
    left.source.localeCompare(right.source) ||
    left.id.localeCompare(right.id),
  );

  return Object.freeze(
    sorted.map((entity) =>
      Object.freeze({
        id: normalizeText(entity.id),
        label: normalizeText(entity.label),
        role: entity.role,
        source: entity.source,
        confidence: clampConfidence(entity.confidence),
        evidence: entity.evidence ? normalizeText(entity.evidence) : null,
      }),
    ),
  );
}

export function normalizeIntelligenceGlossaryReferences(
  references: readonly IntelligenceGlossaryReference[],
): readonly IntelligenceGlossaryReference[] {
  const sorted = [...references].sort((left, right) =>
    left.normalizedTerm.localeCompare(right.normalizedTerm) ||
    left.source.localeCompare(right.source) ||
    (left.matchText ?? "").localeCompare(right.matchText ?? ""),
  );

  return Object.freeze(
    sorted.map((reference) =>
      Object.freeze({
        term: normalizeText(reference.term),
        normalizedTerm: normalizeText(reference.normalizedTerm),
        source: reference.source as IntelligenceEntitySource,
        matchText: reference.matchText ? normalizeText(reference.matchText) : null,
        confidence: clampConfidence(reference.confidence),
      }),
    ),
  );
}

export function normalizeIntelligenceContext(context: IntelligenceContext): IntelligenceContext {
  return Object.freeze({
    moduleId: normalizeText(context.moduleId),
    storyMemory: context.storyMemory ? normalizeText(context.storyMemory) : null,
    narrative: context.narrative,
    evidence: context.evidence,
    semantic: context.semantic,
    context: context.context,
    narrativeIntent: normalizeText(context.narrativeIntent),
    speaker: context.speaker ? normalizeText(context.speaker) : null,
    listener: context.listener ? normalizeText(context.listener) : null,
    target: context.target ? normalizeText(context.target) : null,
    victim: context.victim ? normalizeText(context.victim) : null,
    sceneType: normalizeText(context.sceneType),
    dialogueMode: context.dialogueMode,
    interpretationMode: context.interpretationMode,
    flags: normalizeIntelligenceFlags(context.flags),
    entities: normalizeIntelligenceEntities(context.entities),
    glossaryReferences: normalizeIntelligenceGlossaryReferences(context.glossaryReferences),
    evidenceAssessment: Object.freeze({
      primaryText: normalizeText(context.evidenceAssessment.primaryText),
      primaryStartOffset: Math.max(0, Math.floor(context.evidenceAssessment.primaryStartOffset)),
      primaryEndOffset: Math.max(0, Math.floor(context.evidenceAssessment.primaryEndOffset)),
      primaryCandidateIndex: Math.max(0, Math.floor(context.evidenceAssessment.primaryCandidateIndex)),
      candidateCount: Math.max(0, Math.floor(context.evidenceAssessment.candidateCount)),
      admissible: Boolean(context.evidenceAssessment.admissible),
      confidence: clampConfidence(context.evidenceAssessment.confidence),
      source: "chunk" as const,
      notes: Object.freeze([...context.evidenceAssessment.notes].map((note) => normalizeText(note)).filter(Boolean)),
    }),
    contextConfidence: clampConfidence(context.contextConfidence),
    legalConcepts: Object.freeze([...context.legalConcepts].map((concept) => normalizeText(concept)).filter(Boolean).sort((left, right) => left.localeCompare(right))),
    glossary: {
      title: normalizeText(context.glossary.title),
      entries: freezeReadonlyArray(
        [...context.glossary.entries].map((entry) =>
          canonicalizePromptValue({
            term: entry.term,
            articleId: entry.articleId ?? null,
            variants: entry.variants ?? [],
            definition: entry.definition ?? null,
          }),
        ),
      ) as typeof context.glossary.entries,
      notes: context.glossary.notes ? Object.freeze([...context.glossary.notes].map((note) => normalizeText(note)).filter(Boolean)) : undefined,
    },
    conceptContext: normalizeConceptContextInput(context.conceptContext),
  });
}
