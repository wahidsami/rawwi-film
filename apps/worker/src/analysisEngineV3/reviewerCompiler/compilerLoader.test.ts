/**
 * Tests for the production Reviewer Academy compiler loader.
 * Run: node --import tsx apps/worker/src/analysisEngineV3/reviewerCompiler/compilerLoader.test.ts
 */
import { strict as assert } from "node:assert";

import { ensureReviewerAcademyRegistry, reloadReviewerAcademyRegistry } from "./compilerLoader.js";

function assertCondition(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function testRegistryLoadsOnceAndCaches(): void {
  const first = ensureReviewerAcademyRegistry();
  const second = ensureReviewerAcademyRegistry();

  assert.strictEqual(first, second);
  assertCondition(first.universalManuals.length > 0, "universal manuals should load");
  assertCondition(first.reviewerFolders.length > 0, "reviewer folders should load");
  assertCondition(first.articleCount > 0, "article metadata should load");
  assertCondition(first.atomCount > 0, "atom metadata should load");
  assertCondition(Object.keys(first.articlesById).includes("article_04"), "article_04 should exist");
  assertCondition(Object.keys(first.atomsById).includes("atom_4_1"), "atom_4_1 should exist");
  assertCondition((first.relationshipMap.reviewers.General?.articles.article_04?.atoms.length ?? 0) > 0, "General/article_04 relationship should exist");

  const refreshed = reloadReviewerAcademyRegistry();
  assertCondition(refreshed.articleCount === first.articleCount, "reload should preserve article count");
  assertCondition(refreshed.atomCount === first.atomCount, "reload should preserve atom count");
  assertCondition(refreshed !== first, "reload should create a fresh cached registry");
  console.log("✓ reviewer academy registry loads once, validates relationships, and reloads explicitly");
}

function testArticleAtomConsistency(): void {
  const registry = ensureReviewerAcademyRegistry();

  for (const article of Object.values(registry.articlesById)) {
    const reviewerArticles = registry.articlesByReviewer[article.reviewer.toLowerCase()] ?? [];
    assertCondition(reviewerArticles.some((entry) => entry.articleId === article.articleId), `article ${article.articleId} should be indexed under reviewer ${article.reviewer}`);
    for (const atomId of article.atoms) {
      const atom = registry.atomsById[atomId];
      assertCondition(Boolean(atom), `atom ${atomId} should exist`);
      assert.equal(atom?.articleId, article.articleId);
      assert.equal(atom?.reviewer, article.reviewer);
    }
  }

  for (const atom of Object.values(registry.atomsById)) {
    const article = registry.articlesById[atom.articleId];
    assertCondition(Boolean(article), `article ${atom.articleId} should exist for atom ${atom.atomId}`);
    assert.equal(article?.reviewer, atom.reviewer);
  }

  console.log("✓ reviewer academy article/atom relationships are internally consistent");
}

function main(): void {
  testRegistryLoadsOnceAndCaches();
  testArticleAtomConsistency();
  console.log("\nAll reviewer compiler loader tests passed.");
}

main();
