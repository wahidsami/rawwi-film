import { validateReviewerMethodology } from "./reviewerMethodologyValidator.js";
import type { ReviewerMethodology } from "./reviewerMethodologyTypes.js";

const DEFAULT_METHODOLOGY: ReviewerMethodology = Object.freeze({
  id: "universal_reviewer_methodology_v1",
  title: "Universal Reviewer Methodology",
  purpose: "Apply a deterministic evidence-first reasoning process before subject-specific reviewer knowledge packs are consulted.",
  stages: Object.freeze([
    Object.freeze({
      name: "evidence_extraction",
      title: "Evidence Extraction",
      purpose: "Locate and freeze the smallest grounded evidence span.",
      inputs: Object.freeze(["chunk"]),
      outputs: Object.freeze(["grounded_evidence"]),
    }),
    Object.freeze({
      name: "evidence_judge",
      title: "Evidence Judge",
      purpose: "Record the literal facts visible in the grounded evidence.",
      inputs: Object.freeze(["grounded_evidence"]),
      outputs: Object.freeze(["observed_facts"]),
    }),
    Object.freeze({
      name: "concept_identification",
      title: "Concept Identification",
      purpose: "Extract concepts from grounded evidence without naming the final GCAM article.",
      inputs: Object.freeze(["grounded_evidence", "observed_facts"]),
      outputs: Object.freeze(["concepts", "knowledge_domains"]),
    }),
    Object.freeze({
      name: "legal_classification",
      title: "Legal Classification",
      purpose: "Rank the legal consequence of the grounded concepts using Academy knowledge.",
      inputs: Object.freeze(["grounded_evidence", "observed_facts", "concepts", "knowledge_domains"]),
      outputs: Object.freeze(["primary_article", "secondary_articles", "applicable_atoms"]),
    }),
    Object.freeze({
      name: "explanation",
      title: "Explanation",
      purpose: "Generate an explanation that only references grounded evidence and the selected article.",
      inputs: Object.freeze(["grounded_evidence", "concepts", "primary_article", "secondary_articles"]),
      outputs: Object.freeze(["explanation"]),
    }),
    Object.freeze({
      name: "consistency_validation",
      title: "Consistency Validation",
      purpose: "Validate that the explanation still matches the evidence and classification.",
      inputs: Object.freeze(["grounded_evidence", "concepts", "primary_article", "explanation"]),
      outputs: Object.freeze(["validated_finding"]),
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
