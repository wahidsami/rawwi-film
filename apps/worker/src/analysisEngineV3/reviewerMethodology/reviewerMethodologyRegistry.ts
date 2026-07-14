import { validateReviewerMethodology } from "./reviewerMethodologyValidator.js";
import type { ReviewerMethodology } from "./reviewerMethodologyTypes.js";

const DEFAULT_METHODOLOGY: ReviewerMethodology = Object.freeze({
  id: "universal_reviewer_methodology_v1",
  title: "Universal Reviewer Methodology",
  purpose: "Apply a deterministic reasoning process before subject-specific reviewer knowledge packs are consulted.",
  stages: Object.freeze([
    Object.freeze({
      name: "narrative_understanding",
      title: "Narrative Understanding",
      purpose: "Understand the scene before classification.",
      inputs: Object.freeze(["chunk", "story_memory", "neighboring_sentences"]),
      outputs: Object.freeze(["narrative_summary", "scene_mode"]),
    }),
    Object.freeze({
      name: "speaker_identification",
      title: "Speaker Identification",
      purpose: "Infer the likely speaker when the text provides a cue.",
      inputs: Object.freeze(["chunk", "narrative_summary"]),
      outputs: Object.freeze(["speaker"]),
    }),
    Object.freeze({
      name: "target_identification",
      title: "Target Identification",
      purpose: "Identify the addressed or described target when supported by the text.",
      inputs: Object.freeze(["chunk", "speaker"]),
      outputs: Object.freeze(["target"]),
    }),
    Object.freeze({
      name: "victim_identification",
      title: "Victim Identification",
      purpose: "Identify any victim role that is explicitly supported.",
      inputs: Object.freeze(["chunk", "target"]),
      outputs: Object.freeze(["victim"]),
    }),
    Object.freeze({
      name: "narrative_intent",
      title: "Narrative Intent",
      purpose: "Classify the apparent intent of the statement.",
      inputs: Object.freeze(["chunk", "story_memory", "narrative_summary"]),
      outputs: Object.freeze(["narrative_intent"]),
    }),
    Object.freeze({
      name: "evidence_strength",
      title: "Evidence Strength",
      purpose: "Measure how strongly the local chunk supports the reasoning focus.",
      inputs: Object.freeze(["chunk", "concept_context"]),
      outputs: Object.freeze(["evidence_strength"]),
    }),
    Object.freeze({
      name: "context_classification",
      title: "Context Classification",
      purpose: "Classify the contextual frame around the evidence.",
      inputs: Object.freeze(["chunk", "story_memory", "neighboring_sentences"]),
      outputs: Object.freeze(["context_classification"]),
    }),
    Object.freeze({
      name: "literal_vs_implied_meaning",
      title: "Literal vs Implied Meaning",
      purpose: "Distinguish literal wording from implied meaning.",
      inputs: Object.freeze(["chunk", "context_classification"]),
      outputs: Object.freeze(["literal_vs_implied_meaning"]),
    }),
    Object.freeze({
      name: "exception_detection",
      title: "Exception Detection",
      purpose: "Detect quotation, educational, condemnation, and similar exceptions.",
      inputs: Object.freeze(["chunk", "context_classification", "narrative_intent"]),
      outputs: Object.freeze(["exception_signals"]),
    }),
    Object.freeze({
      name: "confidence_assessment",
      title: "Confidence Assessment",
      purpose: "Combine the reasoning signals into a deterministic confidence score.",
      inputs: Object.freeze(["stage_results"]),
      outputs: Object.freeze(["confidence"]),
    }),
    Object.freeze({
      name: "applicable_concept_validation",
      title: "Applicable Concept Validation",
      purpose: "Validate which canonical concepts are applicable before packs are selected.",
      inputs: Object.freeze(["concept_context", "confidence"]),
      outputs: Object.freeze(["applicable_concept_ids"]),
    }),
  ]),
});

function normalizeText(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values.map((value) => normalizeText(value)).filter(Boolean))].sort((left, right) => left.localeCompare(right)));
}

export class ReviewerMethodologyRegistry {
  private readonly methodologies = new Map<string, ReviewerMethodology>();

  constructor(entries: readonly ReviewerMethodology[] = [DEFAULT_METHODOLOGY]) {
    for (const entry of entries) {
      this.register(entry);
    }
  }

  register(methodology: ReviewerMethodology): this {
    const normalized: ReviewerMethodology = Object.freeze({
      id: normalizeText(methodology.id),
      title: methodology.title.normalize("NFC").replace(/\s+/g, " ").trim(),
      purpose: methodology.purpose.normalize("NFC").replace(/\s+/g, " ").trim(),
      stages: Object.freeze(
        methodology.stages.map((stage) =>
          Object.freeze({
            name: normalizeText(stage.name) as ReviewerMethodology["stages"][number]["name"],
            title: stage.title.normalize("NFC").replace(/\s+/g, " ").trim(),
            purpose: stage.purpose.normalize("NFC").replace(/\s+/g, " ").trim(),
            inputs: uniqueSorted(stage.inputs),
            outputs: uniqueSorted(stage.outputs),
          }),
        ),
      ),
    });

    const validation = validateReviewerMethodology(normalized);
    if (!validation.valid) {
      const message = validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
      throw new Error(`Invalid ReviewerMethodology: ${message}`);
    }

    this.methodologies.set(normalized.id, normalized);
    return this;
  }

  unregister(methodologyId: string): boolean {
    return this.methodologies.delete(normalizeText(methodologyId));
  }

  load(methodologyId: string): ReviewerMethodology | null {
    return this.methodologies.get(normalizeText(methodologyId)) ?? null;
  }

  loadDefault(): ReviewerMethodology {
    return this.load(DEFAULT_METHODOLOGY.id) ?? DEFAULT_METHODOLOGY;
  }

  list(): readonly ReviewerMethodology[] {
    return Object.freeze([...this.methodologies.values()].sort((left, right) => left.id.localeCompare(right.id)));
  }
}

export function createReviewerMethodologyRegistry(entries?: readonly ReviewerMethodology[]): ReviewerMethodologyRegistry {
  return new ReviewerMethodologyRegistry(entries);
}

export function createDefaultReviewerMethodologyRegistry(): ReviewerMethodologyRegistry {
  return new ReviewerMethodologyRegistry([DEFAULT_METHODOLOGY]);
}

export function getDefaultReviewerMethodology(): ReviewerMethodology {
  return DEFAULT_METHODOLOGY;
}
