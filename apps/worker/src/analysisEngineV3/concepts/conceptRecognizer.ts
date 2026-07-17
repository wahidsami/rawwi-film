import type { Concept, ConceptContext, ConceptEvidenceSource, ConceptRecognitionInput, ConceptRegistryEntry, ConceptSourceType } from "./conceptTypes.js";
import { createDefaultConceptRegistry, ConceptRegistry } from "./conceptRegistry.js";
import { normalizeConceptContext } from "./conceptNormalizer.js";
import { validateConceptContext } from "./conceptValidator.js";
import { normalizeConceptConfidence } from "./conceptConfidence.js";

function normalizeText(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
}

function joinTexts(values: readonly (string | null | undefined)[]): string {
  return values.map((value) => (value ? normalizeText(value) : "")).filter(Boolean).join(" ");
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values.map((value) => value.normalize("NFC").replace(/\s+/g, " ").trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right)));
}

type SourcePool = Readonly<{
  type: ConceptSourceType;
  text: string;
  confidence: number;
}>;

function buildNarrativeSourceText(input: ConceptRecognitionInput): string {
  const flags = input.narrative;
  const flagTerms = [
    flags.condemnation ? "condemnation" : null,
    flags.approval ? "approval" : null,
    flags.neutrality ? "neutrality" : null,
    flags.historicalContext ? "historical" : null,
    flags.dream ? "dream" : null,
    flags.flashback ? "flashback" : null,
    flags.comedy ? "comedy" : null,
    flags.satire ? "satire" : null,
    flags.threat ? "threat" : null,
    flags.instruction ? "instruction" : null,
    flags.news ? "news" : null,
    flags.documentary ? "documentary" : null,
    flags.dialogue ? "dialogue" : null,
    flags.narration ? "narration" : null,
    flags.sceneDescription ? "description" : null,
  ];
  return joinTexts([
    input.narrative.speaker,
    input.narrative.listener,
    input.narrative.target,
    input.narrative.narrativeVoice,
    input.narrative.sceneType,
    input.narrative.narrativeIntent,
    input.narrative.storyPosition,
    input.narrative.relationship,
    input.narrative.emotionalTone,
    ...flagTerms,
  ]);
}

function buildSemanticSourceText(input: ConceptRecognitionInput): string {
  return joinTexts([
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
  ]);
}

function buildEvidenceSourceText(input: ConceptRecognitionInput): string {
  return input.evidence.candidates.map((candidate) => candidate.text).join(" ");
}

function buildEntitySourceText(input: ConceptRecognitionInput): string {
  return input.entities.map((entity) => `${entity.label} ${entity.role}`).join(" ");
}

function buildGlossarySourceText(input: ConceptRecognitionInput): string {
  return joinTexts([
    ...input.glossaryReferences.map((reference) => reference.term),
    ...input.glossaryReferences.map((reference) => reference.normalizedTerm),
    input.glossary.title,
    ...(input.glossary.notes ?? []),
  ]);
}

function buildStoryMemorySourceText(input: ConceptRecognitionInput): string {
  return input.storyMemory ?? "";
}

function candidateSources(input: ConceptRecognitionInput): readonly SourcePool[] {
  return [
    { type: "narrative", text: buildNarrativeSourceText(input), confidence: input.narrative.confidence },
    { type: "semantic", text: buildSemanticSourceText(input), confidence: input.semantic.confidence },
    { type: "entity", text: buildEntitySourceText(input), confidence: 0.85 },
    { type: "glossary", text: buildGlossarySourceText(input), confidence: 0.9 },
    { type: "evidence", text: buildEvidenceSourceText(input), confidence: input.evidence.confidence },
  ];
}

function hasAliasMatch(text: string, alias: string): boolean {
  if (!text || !alias) return false;
  const normalizedText = normalizeText(text);
  const normalizedAlias = normalizeText(alias);
  const index = normalizedText.indexOf(normalizedAlias);
  if (index < 0) return false;

  const prefix = normalizedText.slice(Math.max(0, index - 16), index).trim();
  const negationSignals = [
    "no",
    "not",
    "without",
    "none",
    "لا",
    "ليس",
    "بدون",
    "غير",
    "لم",
    "لن",
    "no signs of",
    "no evidence of",
  ];
  if (negationSignals.some((signal) => prefix.endsWith(signal))) return false;
  return true;
}

function buildEvidenceSource(source: SourcePool, entityId: string | null, glossaryTerm: string | null): ConceptEvidenceSource {
  return Object.freeze({
    sourceType: source.type,
    sourceText: source.text,
    originatingSentence: source.text || null,
    entityId,
    glossaryTerm,
    confidence: source.confidence,
  });
}

function detectConcept(input: ConceptRecognitionInput, definition: ConceptRegistryEntry): Concept | null {
  const sources = candidateSources(input);
  const hits: ConceptEvidenceSource[] = [];
  const originatingSentences: string[] = [];
  const entityReferences: string[] = [];
  const glossaryReferences: string[] = [];

  for (const source of sources) {
    for (const alias of definition.aliases) {
      if (!hasAliasMatch(source.text, alias)) continue;
      hits.push(buildEvidenceSource(source, null, source.type === "glossary" ? alias : null));
      originatingSentences.push(source.text);
      if (source.type === "entity") {
        for (const entity of input.entities) {
          if (hasAliasMatch(entity.label, alias)) entityReferences.push(entity.id);
        }
      }
      break;
    }
  }

  for (const entity of input.entities) {
    for (const alias of definition.aliases) {
      if (hasAliasMatch(entity.label, alias)) entityReferences.push(entity.id);
    }
  }

  for (const reference of input.glossaryReferences) {
    for (const alias of definition.aliases) {
      if (hasAliasMatch(reference.term, alias) || hasAliasMatch(reference.normalizedTerm, alias)) {
        glossaryReferences.push(reference.term);
      }
    }
  }

  if (hits.length === 0) return null;

  const confidence = normalizeConceptConfidence({
    narrative: hits.some((hit) => hit.sourceType === "narrative") ? input.narrative.confidence : 0,
    semantic: hits.some((hit) => hit.sourceType === "semantic") ? input.semantic.confidence : 0,
    entity: hits.some((hit) => hit.sourceType === "entity") ? 0.85 : 0,
    glossary: hits.some((hit) => hit.sourceType === "glossary") ? 0.9 : 0,
    evidence: hits.some((hit) => hit.sourceType === "evidence") ? input.evidence.confidence : 0,
  });

  return Object.freeze({
    id: definition.id,
    label: definition.label,
    confidence,
    evidenceSources: Object.freeze(
      [...new Map(hits.map((hit) => [`${hit.sourceType}|${hit.sourceText}|${hit.entityId ?? ""}|${hit.glossaryTerm ?? ""}`, hit])).values()].sort((left, right) =>
        left.sourceType.localeCompare(right.sourceType) ||
        left.sourceText.localeCompare(right.sourceText) ||
        (left.entityId ?? "").localeCompare(right.entityId ?? "") ||
        (left.glossaryTerm ?? "").localeCompare(right.glossaryTerm ?? ""),
      ),
    ),
    originatingSentences: uniqueSorted(originatingSentences),
    entityReferences: uniqueSorted(entityReferences),
    glossaryReferences: uniqueSorted(glossaryReferences),
  });
}

export class ConceptRecognizer {
  constructor(private readonly registry: ConceptRegistry = createDefaultConceptRegistry()) {}

  recognize(input: ConceptRecognitionInput): ConceptContext {
    const concepts = this.registry.list()
      .map((definition) => detectConcept(input, definition))
      .filter((concept): concept is Concept => Boolean(concept));

    const normalized = normalizeConceptContext({
      concepts,
      conceptIds: concepts.map((concept) => concept.id),
      primaryConceptId: concepts[0]?.id ?? null,
      confidence: concepts[0]?.confidence.total ?? 0,
      conceptCount: concepts.length,
    });

    const validation = validateConceptContext(normalized);
    if (!validation.valid) {
      const message = validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
      throw new Error(`Invalid ConceptContext: ${message}`);
    }

    return normalized;
  }
}

export function createConceptRecognizer(registry?: ConceptRegistry): ConceptRecognizer {
  return new ConceptRecognizer(registry ?? createDefaultConceptRegistry());
}
