import type { V3PromptGlossaryEntry } from "../builder/builderTypes.js";
import type { LegalContextResult, LegalEvidenceCandidate, LegalEvidenceResult, LegalNarrativeResult, LegalSemanticResult } from "../legal/legalTypes.js";
import type { IntelligenceBuilderInput, IntelligenceContext, IntelligenceEntity, IntelligenceEntityRole, IntelligenceEntitySource, IntelligenceFlags, IntelligenceGlossaryReference, IntelligenceInterpretationMode } from "./intelligenceContext.js";
import { normalizeIntelligenceContext } from "./intelligenceNormalizer.js";
import { validateIntelligenceContext } from "./intelligenceValidator.js";
import { createEmptyConceptContext } from "../concepts/conceptNormalizer.js";
import { createDefaultConceptRegistry, ConceptRegistry } from "../concepts/conceptRegistry.js";
import { createConceptRecognizer } from "../concepts/conceptRecognizer.js";

function normalizeText(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return Number(value.toFixed(6));
}

function primaryEvidence(evidence: LegalEvidenceResult): LegalEvidenceCandidate | null {
  if (evidence.primaryCandidateIndex === null) return null;
  return evidence.candidates[evidence.primaryCandidateIndex] ?? null;
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }

  for (const nested of Object.values(value as Record<string, unknown>)) {
    if (nested && typeof nested === "object") deepFreeze(nested);
  }

  return Object.freeze(value);
}

function buildFlags(narrative: LegalNarrativeResult, semantic: LegalSemanticResult, context: LegalContextResult): IntelligenceFlags {
  const quotation = /«.*»|".*"/.test(semantic.semanticMeaning) || /«.*»|".*"/.test(context.narrativeContext) || narrative.narrativeIntent === "quoted";
  const educational = narrative.instruction === true || semantic.narrativeIntent === "instruction" || /تعليم|تعليمي|شرح|مثال|أمثلة/.test(context.narrativeContext);
  const condemnation = narrative.condemnation === true || semantic.narrativeIntent === "condemnation";
  const approval = narrative.approval === true || semantic.narrativeIntent === "promotion";
  const promotion = approval || semantic.narrativeIntent === "promotion";
  const description = narrative.narration === true || narrative.sceneDescription === true || semantic.sceneRole.toLowerCase().includes("description");
  return Object.freeze({
    dialogue: Boolean(narrative.dialogue),
    narration: Boolean(narrative.narration),
    promotion,
    condemnation,
    description,
    historical: Boolean(narrative.historicalContext),
    educational,
    satire: Boolean(narrative.satire),
    documentary: Boolean(narrative.documentary),
    fiction: Boolean(narrative.dream || narrative.flashback || narrative.comedy || narrative.satire),
    threat: Boolean(narrative.threat),
    instruction: Boolean(narrative.instruction),
    news: Boolean(narrative.news),
    comedy: Boolean(narrative.comedy),
    dream: Boolean(narrative.dream),
    flashback: Boolean(narrative.flashback),
    quotation,
    approval,
    neutrality: Boolean(narrative.neutrality) || (!promotion && !condemnation),
  });
}

function dialogueMode(flags: IntelligenceFlags): IntelligenceContext["dialogueMode"] {
  if (flags.dialogue && flags.narration) return "mixed";
  if (flags.dialogue) return "dialogue";
  if (flags.narration) return "narration";
  return "unknown";
}

function interpretationMode(flags: IntelligenceFlags): IntelligenceInterpretationMode {
  if (flags.condemnation) return "condemnation";
  if (flags.promotion) return "promotion";
  if (flags.educational) return "education";
  if (flags.description) return "description";
  if (flags.fiction) return "fiction";
  if (flags.documentary) return "description";
  if (flags.threat) return "warning";
  if (flags.neutrality) return "neutral";
  return "unknown";
}

function buildEntities(input: IntelligenceBuilderInput): readonly IntelligenceEntity[] {
  const entities: IntelligenceEntity[] = [];
  const primary = primaryEvidence(input.evidence);
  const evidenceText = normalizeText(primary?.text ?? "");

  const addEntity = (label: string | null | undefined, role: IntelligenceEntityRole, source: IntelligenceEntitySource, confidence: number): void => {
    if (!label || !label.trim()) return;
    entities.push({
      id: `${role}:${normalizeText(label).toLowerCase()}`,
      label: normalizeText(label),
      role,
      source,
      confidence: clampConfidence(confidence),
      evidence: evidenceText || null,
    });
  };

  addEntity(input.narrative.speaker, "speaker", "narrative", input.narrative.confidence);
  addEntity(input.narrative.listener, "listener", "narrative", input.narrative.confidence);
  addEntity(input.narrative.target, "target", "semantic", input.semantic.confidence);
  addEntity(input.narrative.target ?? input.semantic.victim, "victim", "semantic", input.semantic.confidence);

  const unique = new Map<string, IntelligenceEntity>();
  for (const entity of entities) {
    unique.set(`${entity.role}:${entity.label.toLowerCase()}:${entity.source}`, entity);
  }

  return Object.freeze([...unique.values()].sort((left, right) =>
    left.role.localeCompare(right.role) ||
    left.label.localeCompare(right.label) ||
    left.source.localeCompare(right.source),
  ));
}

function normalizeCandidateTerms(entry: V3PromptGlossaryEntry): readonly string[] {
  const candidates = [entry.term, ...(entry.variants ?? [])].map((term) => normalizeText(term)).filter(Boolean);
  return Object.freeze([...new Set(candidates)]);
}

function buildGlossaryReferences(input: IntelligenceBuilderInput): readonly IntelligenceGlossaryReference[] {
  const evidenceText = normalizeText(primaryEvidence(input.evidence)?.text ?? "");
  const contextText = normalizeText([
    input.context.localContext,
    input.context.narrativeContext,
    input.semantic.semanticMeaning,
    input.storyMemory ?? "",
  ].join(" "));

  const sources = [
    { source: "evidence" as const, text: evidenceText, confidence: 1 },
    { source: "context" as const, text: contextText, confidence: 0.9 },
  ];

  const references: IntelligenceGlossaryReference[] = [];
  for (const entry of input.glossary.entries) {
    for (const term of normalizeCandidateTerms(entry)) {
      for (const source of sources) {
        if (!term || !source.text) continue;
        if (source.text.toLowerCase().includes(term.toLowerCase())) {
          references.push({
            term: normalizeText(entry.term),
            normalizedTerm: term,
            source: source.source,
            matchText: term,
            confidence: clampConfidence(source.confidence),
          });
          break;
        }
      }
    }
  }

  return Object.freeze(
    references.sort((left, right) =>
      left.normalizedTerm.localeCompare(right.normalizedTerm) ||
      left.source.localeCompare(right.source) ||
      (left.matchText ?? "").localeCompare(right.matchText ?? ""),
    ),
  );
}

function buildLegalConcepts(conceptContext: IntelligenceContext["conceptContext"]): readonly string[] {
  return conceptContext.conceptIds;
}

export function buildIntelligenceContext(input: IntelligenceBuilderInput, conceptRegistry: ConceptRegistry = createDefaultConceptRegistry()): IntelligenceContext {
  const primary = primaryEvidence(input.evidence);
  const flags = buildFlags(input.narrative, input.semantic, input.context);
  const references = buildGlossaryReferences(input);
  const entities = buildEntities(input);
  const evidenceAssessment = {
    primaryText: normalizeText(primary?.text ?? input.context.localContext ?? ""),
    primaryStartOffset: primary?.startOffset ?? 0,
    primaryEndOffset: primary?.endOffset ?? 0,
    primaryCandidateIndex: input.evidence.primaryCandidateIndex,
    candidateCount: input.evidence.candidates.length,
    admissible: input.evidence.admissible,
    confidence: input.evidence.confidence,
    source: "chunk" as const,
    notes: input.evidence.notes ?? [],
  };

  const baseContext: IntelligenceContext = normalizeIntelligenceContext({
    moduleId: input.moduleId,
    storyMemory: input.storyMemory,
    narrative: input.narrative,
    evidence: input.evidence,
    semantic: input.semantic,
    context: input.context,
    narrativeIntent: input.semantic.narrativeIntent || input.narrative.narrativeIntent || "unknown",
    speaker: input.semantic.speaker ?? input.narrative.speaker,
    listener: input.semantic.listener ?? input.narrative.listener,
    target: input.semantic.target ?? input.narrative.target,
    victim: input.semantic.victim ?? input.narrative.target ?? input.semantic.target,
    sceneType: input.narrative.sceneType || input.semantic.sceneRole || "unknown",
    dialogueMode: dialogueMode(flags),
    interpretationMode: interpretationMode(flags),
    flags,
    entities,
    glossaryReferences: references,
    evidenceAssessment,
    contextConfidence: Number(Math.min(input.narrative.confidence, input.evidence.confidence, input.semantic.confidence, input.context.confidence).toFixed(6)),
    legalConcepts: [],
    conceptContext: createEmptyConceptContext(),
    glossary: input.glossary,
  });

  const conceptContext = createConceptRecognizer(conceptRegistry).recognize(baseContext);

  const context: IntelligenceContext = normalizeIntelligenceContext({
    ...baseContext,
    conceptContext,
    legalConcepts: buildLegalConcepts(conceptContext),
  });

  const validation = validateIntelligenceContext(context);
  if (!validation.valid) {
    const message = validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
    throw new Error(`Invalid IntelligenceContext: ${message}`);
  }

  return deepFreeze({
    ...context,
    entities: [...context.entities],
    glossaryReferences: [...context.glossaryReferences],
    legalConcepts: [...context.legalConcepts],
  });
}
