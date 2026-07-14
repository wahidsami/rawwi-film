import type { ConceptContext } from "../concepts/conceptTypes.js";
import type { ReviewerAssessment } from "../reviewerMethodology/reviewerMethodologyTypes.js";
import type { ReviewerKnowledgePack } from "./reviewerKnowledgeTypes.js";
import { createDefaultReviewerKnowledgeRegistry, ReviewerKnowledgeRegistry } from "./reviewerKnowledgeRegistry.js";

const UNIVERSAL_PACK_ID = "v3_00_universal";

function normalizePackId(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
}

export function selectReviewerKnowledgePacks(
  assessment: ReviewerAssessment,
  conceptContext: ConceptContext,
  registry: ReviewerKnowledgeRegistry = createDefaultReviewerKnowledgeRegistry(),
): readonly ReviewerKnowledgePack[] {
  const conceptIds = new Set([
    ...conceptContext.conceptIds,
    ...assessment.applicableConceptIds,
  ].map((conceptId) => normalizePackId(conceptId)));
  const selected = new Map<string, ReviewerKnowledgePack>();

  const universalPack = registry.load(UNIVERSAL_PACK_ID);
  if (universalPack) {
    selected.set(universalPack.id, universalPack);
  }

  for (const pack of registry.list()) {
    if (normalizePackId(pack.id) === UNIVERSAL_PACK_ID) continue;
    if (pack.trigger_concept_ids.some((conceptId) => conceptIds.has(normalizePackId(conceptId)))) {
      selected.set(pack.id, pack);
    }
  }

  return Object.freeze([...selected.values()].sort((left, right) => {
    if (normalizePackId(left.id) === UNIVERSAL_PACK_ID) return -1;
    if (normalizePackId(right.id) === UNIVERSAL_PACK_ID) return 1;
    return left.id.localeCompare(right.id);
  }));
}
