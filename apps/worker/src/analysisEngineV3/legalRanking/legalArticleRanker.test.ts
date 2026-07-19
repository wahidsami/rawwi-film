/**
 * Regression tests for the deterministic legal article ranker.
 */
import { strict as assert } from "node:assert";

import { createEmptyConceptContext } from "../concepts/conceptNormalizer.js";
import type { IntelligenceContext } from "../intelligence/intelligenceContext.js";
import { createDefaultReviewerKnowledgeRegistry, buildCanonicalArticleOwnershipMap } from "../reviewerKnowledge/reviewerKnowledgeRegistry.js";
import { rankLegalArticles, applyLegalArticleRanking } from "./legalArticleRanker.js";

function makeIntelligence(): IntelligenceContext {
  return {
    moduleId: "v4_11_profanity",
    storyMemory: null,
    narrative: {
      speaker: "speaker",
      listener: "listener",
      target: "target",
      narrativeVoice: "dialogue",
      sceneType: "dialogue",
      narrativeIntent: "attack",
      storyPosition: "middle",
      relationship: null,
      emotionalTone: "hostile",
      condemnation: false,
      approval: false,
      neutrality: false,
      historicalContext: false,
      dream: false,
      flashback: false,
      comedy: false,
      satire: false,
      threat: false,
      instruction: false,
      news: false,
      documentary: false,
      dialogue: true,
      narration: false,
      sceneDescription: false,
      confidence: 0.94,
      notes: [],
    },
    evidence: {
      candidates: [
        {
          text: "يا كلب",
          startOffset: 0,
          endOffset: 6,
          confidence: 0.95,
          source: "chunk",
          notes: [],
        },
      ],
      primaryCandidateIndex: 0,
      admissible: true,
      confidence: 0.95,
      notes: [],
    },
    semantic: {
      semanticMeaning: "literal profanity",
      narrativeIntent: "attack",
      conversationRole: "speaker",
      sceneRole: "dialogue",
      speaker: "speaker",
      listener: "listener",
      target: "target",
      victim: "victim",
      emotion: "hostile",
      riskContext: "high",
      confidence: 0.94,
      notes: [],
    },
    context: {
      storyMemory: null,
      sceneMemory: null,
      localContext: "يا كلب",
      chunkContext: "chunk",
      neighboringSentences: [],
      narrativeContext: "dialogue",
      confidence: 0.94,
      notes: [],
    },
    narrativeIntent: "attack",
    speaker: "speaker",
    listener: "listener",
    target: "target",
    victim: "victim",
    sceneType: "dialogue",
    dialogueMode: "dialogue",
    interpretationMode: "unknown",
    flags: {
      dialogue: true,
      narration: false,
      promotion: false,
      condemnation: false,
      description: false,
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
      neutrality: false,
    },
    entities: [],
    glossaryReferences: [],
    evidenceAssessment: {
      primaryText: "يا كلب",
      primaryStartOffset: 0,
      primaryEndOffset: 6,
      primaryCandidateIndex: 0,
      candidateCount: 1,
      admissible: true,
      confidence: 0.95,
      source: "chunk",
      notes: [],
    },
    contextConfidence: 0.94,
    legalConcepts: ["profanity"],
    conceptContext: createEmptyConceptContext(),
    glossary: { title: "Glossary", entries: [] },
  };
}

function makeReasonedDecision(overrides: Record<string, unknown> = {}): any {
  return {
    reasoning: "The quote is direct profanity.",
    alternativeInterpretations: [],
    confidence: 0.94,
    legalConcepts: ["profanity"],
    knowledgeDomains: ["profanity"],
    candidateArticles: [],
    primaryArticle: null,
    secondaryArticles: [],
    articleEvaluations: [],
    supportingEvidence: ["يا كلب"],
    contradictingEvidence: [],
    applicableArticles: [],
    rejectedArticles: [],
    riskAnalysis: "Low risk.",
    narrativeAnalysis: "Direct dialogue.",
    humanLikeExplanation: "A human reviewer would treat this as a straightforward profanity case.",
    recommendation: "Approve",
    ...overrides,
  } as const;
}

function testKnowledgeDomainOverlapRanking(): void {
  const registry = createDefaultReviewerKnowledgeRegistry();
  const ranking = rankLegalArticles({
    promptInput: {
      subjectModule: {
        id: "v4_11_profanity",
        titleAr: "الألفاظ النابية",
        articleIds: [],
      },
    } as never,
    intelligence: makeIntelligence(),
    reasonedDecision: makeReasonedDecision({
      knowledgeDomains: ["leadership", "crime"],
      supportingEvidence: ["هدد الرئيس ثم أشار إلى الانقلاب"],
    }),
    selectedReviewerIds: ["v3_03_security", "v3_09_crime"],
    canonicalArticleOwnershipByArticleId: buildCanonicalArticleOwnershipMap(registry),
  });

  assert.deepEqual(ranking.candidateArticles, [12, 17, 18]);
  assert.equal(ranking.primaryArticle !== null, true);
  assert.equal(ranking.candidateArticles.includes(ranking.primaryArticle ?? -1), true);
  assert.equal(ranking.secondaryArticles.length > 0, true);
  assert.equal(ranking.articleEvaluations.length, 1);
  assert.equal(ranking.articleEvaluations[0]?.status, "PASS");
}

function testSingleArticleFallbackPreserved(): void {
  const registry = createDefaultReviewerKnowledgeRegistry();
  const ranking = rankLegalArticles({
    promptInput: {
      subjectModule: {
        id: "v4_11_profanity",
        titleAr: "الألفاظ النابية",
        articleIds: [4],
      },
    } as never,
    intelligence: makeIntelligence(),
    reasonedDecision: makeReasonedDecision({
      knowledgeDomains: [],
      candidateArticles: [4],
      applicableArticles: [4],
      primaryArticle: 4,
      secondaryArticles: [],
      articleEvaluations: [],
    }),
    selectedReviewerIds: ["v4_11_profanity"],
    canonicalArticleOwnershipByArticleId: buildCanonicalArticleOwnershipMap(registry),
  });

  const enriched = applyLegalArticleRanking(makeReasonedDecision({
    candidateArticles: [4],
    applicableArticles: [4],
    primaryArticle: 4,
  }), ranking);
  assert.equal(ranking.primaryArticle, 4);
  assert.deepEqual(ranking.candidateArticles, [4]);
  assert.equal(enriched.articleEvaluations.length, 1);
  assert.equal(enriched.articleEvaluations[0]?.articleId, 4);
  assert.equal(enriched.articleEvaluations[0]?.status, "PASS");
  assert.deepEqual(enriched.candidateArticles, [4]);
}

function testExistingMultiArticleEvaluationsArePreserved(): void {
  const registry = createDefaultReviewerKnowledgeRegistry();
  const ranking = rankLegalArticles({
    promptInput: {
      subjectModule: {
        id: "v4_11_profanity",
        titleAr: "الألفاظ النابية",
        articleIds: [4, 8, 11],
      },
    } as never,
    intelligence: makeIntelligence(),
    reasonedDecision: makeReasonedDecision({
      knowledgeDomains: ["profanity"],
      candidateArticles: [4, 8, 11],
      applicableArticles: [4, 8, 11],
      articleEvaluations: [
        {
          articleId: 4,
          status: "PASS",
          evidence: ["يا كلب"],
          reason: "Article 4 is supported.",
          confidence: 0.9,
        },
        {
          articleId: 8,
          status: "PASS",
          evidence: ["يا كلب"],
          reason: "Article 8 is also supported.",
          confidence: 0.88,
        },
      ],
      primaryArticle: 4,
      secondaryArticles: [8],
    }),
    selectedReviewerIds: ["v4_11_profanity"],
    canonicalArticleOwnershipByArticleId: buildCanonicalArticleOwnershipMap(registry),
  });

  const enriched = applyLegalArticleRanking(makeReasonedDecision({
    knowledgeDomains: ["profanity"],
    candidateArticles: [4, 8, 11],
    applicableArticles: [4, 8, 11],
    articleEvaluations: [
      {
        articleId: 4,
        status: "PASS",
        evidence: ["يا كلب"],
        reason: "Article 4 is supported.",
        confidence: 0.9,
      },
      {
        articleId: 8,
        status: "PASS",
        evidence: ["يا كلب"],
        reason: "Article 8 is also supported.",
        confidence: 0.88,
      },
    ],
    primaryArticle: 4,
    secondaryArticles: [8],
  }), ranking);

  assert.equal(ranking.primaryArticle, 4);
  assert.equal(ranking.articleEvaluations.length, 1);
  assert.equal(enriched.articleEvaluations.length, 2);
  assert.equal(enriched.articleEvaluations[0]?.articleId, 4);
  assert.equal(enriched.articleEvaluations[1]?.articleId, 8);
}

function main(): void {
  testKnowledgeDomainOverlapRanking();
  testSingleArticleFallbackPreserved();
  testExistingMultiArticleEvaluationsArePreserved();
  console.log("✓ deterministic legal article ranker preserves overlap and single-article fallback");
}

main();
