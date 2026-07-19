/**
 * Regression tests for deterministic reviewer knowledge ownership.
 */
import { strict as assert } from "node:assert";

import {
  buildCanonicalArticleOwnershipMap,
  createDefaultReviewerKnowledgeRegistry,
  resolveKnowledgeDomainCandidateArticleIds,
} from "./reviewerKnowledgeRegistry.js";

function testKnowledgeDomainCandidateResolver(): void {
  const registry = createDefaultReviewerKnowledgeRegistry();

  assert.deepEqual(
    resolveKnowledgeDomainCandidateArticleIds(registry, "leadership"),
    [17, 18],
    "leadership should resolve to the politics article candidate set",
  );

  assert.deepEqual(
    resolveKnowledgeDomainCandidateArticleIds(registry, "crime"),
    [12, 13],
    "crime should resolve to the crime article candidate set",
  );
}

function testCanonicalOwnershipSupportsOverlap(): void {
  const registry = createDefaultReviewerKnowledgeRegistry();
  const ownership = buildCanonicalArticleOwnershipMap(registry);
  const articleFourteenOwners = ownership["14"] ?? [];

  assert.deepEqual(
    articleFourteenOwners.map((owner) => owner.reviewerId),
    ["v3_03_security", "v3_08_violence", "v3_09_crime"],
    "article 14 should retain all canonical ownership candidates",
  );
}

function main(): void {
  testKnowledgeDomainCandidateResolver();
  testCanonicalOwnershipSupportsOverlap();
  console.log("✓ reviewer knowledge registry resolves overlapping article ownership");
}

main();
