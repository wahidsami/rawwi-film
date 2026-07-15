/**
 * Run: node --import tsx apps/worker/src/analysisEngineV3/reviewerKnowledge/knowledgeRanking/knowledgeRanking.test.ts
 */
import { strict as assert } from "node:assert";

import { createKnowledgeRegistryFromEntries } from "../knowledgeRegistry/index.js";
import type { KnowledgeRegistryEntry } from "../knowledgeRegistry/knowledgeRegistryTypes.js";
import { createKnowledgeRankingReport } from "./knowledgeRanking.js";
import type { KnowledgeRankingQuery } from "./knowledgeRankingTypes.js";
import type { AnalysisResponse } from "../../engine/analysisResponse.js";
import type { AnalysisRequest } from "../../engine/analysisRequest.js";

function makeEntry(input: Readonly<{
  kind: KnowledgeRegistryEntry["metadata"]["kind"];
  id: string;
  title: string;
  description: string;
  domain?: string | null;
  category?: string | null;
  tags?: readonly string[];
  relatedIds?: readonly string[];
  articleIds?: readonly number[];
  confidence?: number | null;
}>): KnowledgeRegistryEntry {
  return Object.freeze({
    registryKey: `${input.kind}:${input.id}`,
    metadata: Object.freeze({
      id: input.id,
      title: input.title,
      description: input.description,
      version: "1.0.0",
      kind: input.kind,
      domain: input.domain ?? null,
      category: input.category ?? null,
      tags: Object.freeze([...(input.tags ?? [])]),
      aliases: Object.freeze([]),
      relatedIds: Object.freeze([...(input.relatedIds ?? [])]),
      createdAt: null,
      updatedAt: null,
      hash: "hash",
    }),
    traceability: Object.freeze({
      source: "test",
      sourceKind: input.kind,
      sourcePath: `${input.kind}/${input.id}.json`,
      sourceDocumentId: null,
      sourcePage: null,
      reviewer: null,
      meeting: null,
      date: null,
    }),
    explainability: Object.freeze({
      summary: input.description,
      evidence: Object.freeze([input.description]),
      reasoning: Object.freeze([input.description]),
      decision: input.description,
      confidence: input.confidence ?? 0.9,
      alternativeInterpretations: Object.freeze([]),
      rejectedInterpretations: Object.freeze([]),
    }),
    payload: Object.freeze({
      articleIds: Object.freeze([...(input.articleIds ?? [])]),
      title: input.title,
      domain: input.domain ?? null,
      relatedIds: Object.freeze([...(input.relatedIds ?? [])]),
    }),
  });
}

function makeAnalysisResponse(): AnalysisResponse {
  return ({
    promptHash: "prompt-hash",
    semanticHash: "semantic-hash",
    legalHash: "legal-hash",
    stageHashes: [],
    stageTimings: [],
    narrative: {
      speaker: "speaker",
      listener: "listener",
      target: "target",
      narrativeVoice: "dialogue",
      sceneType: "dialogue",
      narrativeIntent: "attack",
      storyPosition: "escalation",
      relationship: "hostile",
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
      confidence: 0.9,
    },
    evidence: {
      candidates: [
        {
          text: "هذا الدين باطل",
          startOffset: 0,
          endOffset: 12,
          confidence: 0.98,
          source: "chunk",
        },
      ],
      primaryCandidateIndex: 0,
      admissible: true,
      confidence: 0.98,
    },
    semantic: {
      semanticMeaning: "religion insult and violence",
      narrativeIntent: "attack",
      conversationRole: "speaker",
      sceneRole: "dialogue",
      speaker: "speaker",
      listener: "listener",
      target: "religion",
      victim: "religion",
      emotion: "hostile",
      riskContext: "religion insult",
      confidence: 0.95,
      notes: ["semantic note"],
    },
    context: {
      storyMemory: "Story memory",
      sceneMemory: "Scene memory",
      localContext: "religion insult",
      chunkContext: "religion insult in chunk",
      neighboringSentences: ["before", "after"],
      narrativeContext: "Narrative context",
      confidence: 0.92,
      notes: ["context note"],
    },
    intelligence: {
      moduleId: "v3_01_religion",
      storyMemory: "Story memory",
      narrative: {
        speaker: "speaker",
        listener: "listener",
        target: "target",
        narrativeVoice: "dialogue",
        sceneType: "dialogue",
        narrativeIntent: "attack",
        storyPosition: "escalation",
        relationship: "hostile",
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
        confidence: 0.9,
      },
      evidence: {
        candidates: [
          {
            text: "هذا الدين باطل",
            startOffset: 0,
            endOffset: 12,
            confidence: 0.98,
            source: "chunk",
          },
        ],
        primaryCandidateIndex: 0,
        admissible: true,
        confidence: 0.98,
      },
      semantic: {
        semanticMeaning: "religion insult and violence",
        narrativeIntent: "attack",
        conversationRole: "speaker",
        sceneRole: "dialogue",
        speaker: "speaker",
        listener: "listener",
        target: "religion",
        victim: "religion",
        emotion: "hostile",
        riskContext: "religion insult",
        confidence: 0.95,
        notes: ["semantic note"],
      },
      context: {
        storyMemory: "Story memory",
        sceneMemory: "Scene memory",
        localContext: "religion insult",
        chunkContext: "religion insult in chunk",
        neighboringSentences: ["before", "after"],
        narrativeContext: "Narrative context",
        confidence: 0.92,
        notes: ["context note"],
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
        primaryText: "هذا الدين باطل",
        primaryStartOffset: 0,
        primaryEndOffset: 12,
        primaryCandidateIndex: 0,
        candidateCount: 1,
        admissible: true,
        confidence: 0.98,
        source: "chunk",
        notes: [],
      },
      contextConfidence: 0.92,
      legalConcepts: ["religion", "profanity", "violence"],
      conceptContext: {
        concepts: [
          {
            id: "profanity",
            label: "Profanity",
            confidence: {
              narrative: 0.5,
              semantic: 0.98,
              storyMemory: 0.2,
              entity: 0.1,
              glossary: 0.2,
              evidence: 0.4,
              total: 0.98,
            },
            evidenceSources: [],
            originatingSentences: ["هذا الدين باطل"],
            entityReferences: [],
            glossaryReferences: [],
          },
          {
            id: "religion",
            label: "Religion",
            confidence: {
              narrative: 0.5,
              semantic: 0.92,
              storyMemory: 0.2,
              entity: 0.1,
              glossary: 0.2,
              evidence: 0.4,
              total: 0.92,
            },
            evidenceSources: [],
            originatingSentences: ["هذا الدين باطل"],
            entityReferences: [],
            glossaryReferences: [],
          },
          {
            id: "violence",
            label: "Violence",
            confidence: {
              narrative: 0.5,
              semantic: 0.61,
              storyMemory: 0.2,
              entity: 0.1,
              glossary: 0.2,
              evidence: 0.4,
              total: 0.61,
            },
            evidenceSources: [],
            originatingSentences: ["هذا الدين باطل"],
            entityReferences: [],
            glossaryReferences: [],
          },
        ],
        conceptIds: ["profanity", "religion", "violence"],
        primaryConceptId: "profanity",
        confidence: 0.95,
        conceptCount: 3,
      },
      glossary: {
        title: "Glossary",
        entries: [],
        notes: [],
      },
    },
  } as unknown) as AnalysisResponse;
}

function testRankingPrioritizesRelevantKnowledge(): void {
  const registry = createKnowledgeRegistryFromEntries([
    makeEntry({
      kind: "academy_pack",
      id: "v3_01_religion",
      title: "Religion Domain",
      description: "Religion knowledge pack",
      domain: "v3_01_religion",
      tags: ["religion", "profanity"],
      relatedIds: ["lesson:lesson_religion_intro"],
      articleIds: [3],
      confidence: 0.95,
    }),
    makeEntry({
      kind: "academy_pack",
      id: "v3_09_crime",
      title: "Crime Domain",
      description: "Crime knowledge pack",
      domain: "v3_09_crime",
      tags: ["crime"],
      relatedIds: ["lesson:lesson_crime_intro"],
      articleIds: [42],
      confidence: 0.4,
    }),
    makeEntry({
      kind: "lesson",
      id: "lesson_religion_intro",
      title: "Religion Intro",
      description: "Religion lesson",
      domain: "v3_01_religion",
      category: "lesson",
      tags: ["religion"],
      relatedIds: ["academy_pack:v3_01_religion"],
      articleIds: [3],
      confidence: 0.9,
    }),
    makeEntry({
      kind: "pattern_entry",
      id: "pattern_religion_insult",
      title: "Religion Insult Pattern",
      description: "Direct insult to religion",
      domain: "v3_01_religion",
      category: "pattern",
      tags: ["religion", "profanity"],
      relatedIds: ["academy_pack:v3_01_religion"],
      articleIds: [3],
      confidence: 0.93,
    }),
    makeEntry({
      kind: "blueprint_entry",
      id: "religion_blueprint_concept",
      title: "Religion Blueprint Concept",
      description: "Blueprint concept for religion",
      domain: "v3_01_religion",
      category: "blueprint",
      tags: ["religion"],
      relatedIds: ["academy_pack:v3_01_religion"],
      articleIds: [3],
      confidence: 0.88,
    }),
  ]);

  const report = createKnowledgeRankingReport({
    jobId: "job-1",
    chunkId: "chunk-1",
    analysisEngine: "v3",
    pipelineVersion: "v2",
    chunkText: "هذا الدين باطل",
    analysisPromptContext: "Religion insult analysis",
    storyMemory: "Story memory",
    sceneMemory: "Scene memory",
    neighboringSentences: ["before", "after"],
    subjectModule: {
      id: "v3_01_religion",
      titleAr: "المسائل الدينية الأساسية",
      scope: "Religion fundamentals",
      rules: ["Detect religion insults"],
      exclusions: ["Ignore neutral discussion"],
      requiredEvidence: ["Religion signal"],
      decisionTree: ["Religion?"],
      examples: ["Direct insult"],
      nonExamples: ["Educational mention"],
      articleIds: [3],
      notes: ["Test module"],
    },
    analysisRequest: {
      jobId: "job-1",
      chunkId: "chunk-1",
      scriptId: "script-1",
      versionId: "version-1",
      chunkText: "هذا الدين باطل",
      chunkStart: 0,
      chunkEnd: 13,
      chunkIndex: 0,
      startLine: 1,
      endLine: 1,
      storyMemory: "Story memory",
      sceneMemory: "Scene memory",
      neighboringSentences: ["before", "after"],
      analysisPromptContext: "Religion insult analysis",
      promptLexiconTerms: [],
      analysisSignatureContext: null,
      diagnosticsEnabled: false,
    } as unknown as AnalysisRequest,
    analysisResponse: makeAnalysisResponse(),
    registry,
  });

  assert.equal(report.domainScores[0]?.id, "academy_pack:v3_01_religion");
  assert.equal(report.domainScores[0]?.score > (report.domainScores[1]?.score ?? 0), true);
  assert.equal(report.conceptScores[0]?.id, "profanity");
  assert.equal(report.articleScores[0]?.id, "3");
  assert.equal(report.relationshipScores.length > 0, true);
  assert.equal(report.knowledgeConfidence > 0, true);
  console.log("✓ knowledge ranking prioritizes relevant knowledge");
}

async function main(): Promise<void> {
  testRankingPrioritizesRelevantKnowledge();
  console.log("\nAll knowledge ranking tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
