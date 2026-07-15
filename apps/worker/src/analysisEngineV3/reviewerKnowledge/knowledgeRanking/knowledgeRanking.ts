import type { AnalysisResponse } from "../../engine/analysisResponse.js";
import type { Concept } from "../../concepts/conceptTypes.js";
import type { V3PromptSubjectModule } from "../../builder/builderTypes.js";
import type { KnowledgeRegistryEntry, KnowledgeRegistryReport } from "../knowledgeRegistry/knowledgeRegistryTypes.js";
import type { KnowledgeRankingItem, KnowledgeRankingQuery, KnowledgeRankingReport } from "./knowledgeRankingTypes.js";
import {
  buildKnowledgeRankingCorpus,
  clampScore,
  extractArticleIds,
  registryIdentity,
  scoreOverlap,
  scoreTerms,
  uniqueNumbers,
  uniqueStrings,
} from "./knowledgeRankingUtils.js";

type KnowledgeRankingBucket = Readonly<{
  key: string;
  kind: string;
  label: string;
  domain: string | null;
  entries: readonly KnowledgeRegistryEntry[];
  score: number;
  reasons: readonly string[];
  relatedIds: readonly string[];
  conceptIds: readonly string[];
  articleIds: readonly number[];
}>;

function toText(value: string | null | undefined): string {
  return typeof value === "string" ? value : "";
}

function collectSubjectTerms(subjectModule: V3PromptSubjectModule): readonly string[] {
  return uniqueStrings([
    subjectModule.id,
    subjectModule.titleAr,
    subjectModule.scope ?? "",
    ...(subjectModule.rules ?? []),
    ...(subjectModule.exclusions ?? []),
    ...(subjectModule.requiredEvidence ?? []),
    ...(subjectModule.decisionTree ?? []),
    ...(subjectModule.examples ?? []),
    ...(subjectModule.nonExamples ?? []),
    ...(subjectModule.notes ?? []),
    ...((subjectModule.articleIds ?? []).map((articleId) => String(articleId))),
  ]);
}

function collectSemanticTerms(response: AnalysisResponse): readonly string[] {
  const semantic = response.semantic;
  const narrative = response.narrative;
  const context = response.context;
  const evidence = response.evidence;
  const intelligence = response.intelligence;
  const terms = [
    semantic.semanticMeaning,
    semantic.narrativeIntent,
    semantic.conversationRole,
    semantic.sceneRole,
    semantic.speaker ?? "",
    semantic.listener ?? "",
    semantic.target ?? "",
    semantic.victim ?? "",
    semantic.emotion ?? "",
    semantic.riskContext ?? "",
    ...(semantic.notes ?? []),
    narrative.narrativeVoice,
    narrative.sceneType,
    narrative.narrativeIntent,
    narrative.storyPosition,
    narrative.relationship ?? "",
    narrative.emotionalTone,
    context.storyMemory ?? "",
    context.sceneMemory ?? "",
    context.localContext,
    context.chunkContext,
    context.narrativeContext,
    ...(context.neighboringSentences ?? []),
    ...(evidence.candidates.map((candidate) => candidate.text)),
    ...(intelligence.legalConcepts?.map((concept) => String(concept)) ?? []),
    ...(intelligence.flags ? Object.keys(intelligence.flags) : []),
  ];
  return uniqueStrings(terms);
}

function collectConceptSignals(response: AnalysisResponse): readonly string[] {
  const concepts = response.intelligence.conceptContext.concepts;
  const terms: string[] = [];
  for (const concept of concepts) {
    terms.push(concept.id, concept.label);
    terms.push(...concept.originatingSentences);
    terms.push(...concept.entityReferences);
    terms.push(...concept.glossaryReferences);
    for (const evidenceSource of concept.evidenceSources) {
      terms.push(evidenceSource.sourceText, evidenceSource.originatingSentence ?? "", evidenceSource.glossaryTerm ?? "", evidenceSource.entityId ?? "");
    }
  }
  return uniqueStrings(terms);
}

function bucketKey(entry: KnowledgeRegistryEntry): string {
  return registryIdentity(entry.metadata.kind, entry.metadata.id);
}

function buildEntryCorpus(entry: KnowledgeRegistryEntry): string {
  return buildKnowledgeRankingCorpus([
    entry.registryKey,
    entry.metadata.id,
    entry.metadata.title,
    entry.metadata.description,
    entry.metadata.version ?? "",
    entry.metadata.kind,
    entry.metadata.domain ?? "",
    entry.metadata.category ?? "",
    entry.metadata.tags,
    entry.metadata.aliases,
    entry.metadata.relatedIds,
    entry.traceability.source ?? "",
    entry.traceability.sourceKind,
    entry.traceability.sourcePath ?? "",
    entry.traceability.sourceDocumentId ?? "",
    entry.traceability.reviewer ?? "",
    entry.traceability.meeting ?? "",
    entry.traceability.date ?? "",
    entry.explainability.summary,
    entry.explainability.evidence,
    entry.explainability.reasoning,
    entry.explainability.decision ?? "",
    entry.explainability.alternativeInterpretations,
    entry.explainability.rejectedInterpretations,
    entry.payload,
  ]);
}

function computeEntryScore(entry: KnowledgeRegistryEntry, queryTerms: readonly string[], conceptTerms: readonly string[], subjectTerms: readonly string[], articleIds: readonly number[]): { score: number; reasons: readonly string[]; conceptIds: readonly string[]; articleIds: readonly number[] } {
  const corpus = buildEntryCorpus(entry);
  const scoreParts: number[] = [];
  const reasons: string[] = [];

  const subjectMatch = scoreTerms(corpus, subjectTerms, 0.08, 0.32);
  if (subjectMatch.score > 0) {
    scoreParts.push(subjectMatch.score);
    reasons.push("subject");
  }

  const semanticMatch = scoreTerms(corpus, queryTerms, 0.03, 0.24);
  if (semanticMatch.score > 0) {
    scoreParts.push(semanticMatch.score);
    reasons.push("semantic");
  }

  const conceptMatch = scoreTerms(corpus, conceptTerms, 0.06, 0.36);
  if (conceptMatch.score > 0) {
    scoreParts.push(conceptMatch.score);
    reasons.push("concept");
  }

  const entryArticleIds = extractArticleIds(entry.payload);
  const articleMatch = scoreOverlap(entryArticleIds, articleIds, 0.14, 0.42);
  if (articleMatch.score > 0) {
    scoreParts.push(articleMatch.score);
    reasons.push("article");
  }

  if (entry.explainability.confidence !== null && entry.explainability.confidence !== undefined) {
    const confidenceBoost = Math.min(0.12, Math.max(0, entry.explainability.confidence) * 0.08);
    if (confidenceBoost > 0) {
      scoreParts.push(confidenceBoost);
      reasons.push("confidence");
    }
  }

  const score = clampScore(scoreParts.reduce((total, value) => total + value, 0));
  return {
    score,
    reasons: Object.freeze([...new Set(reasons)].sort((left, right) => left.localeCompare(right))),
    conceptIds: Object.freeze([...new Set(entry.metadata.tags.filter((value) => conceptTerms.includes(value) || queryTerms.includes(value)))].sort((left, right) => left.localeCompare(right))),
    articleIds: articleMatch.matched,
  };
}

function groupByBucket(entries: readonly KnowledgeRegistryEntry[], queryTerms: readonly string[], conceptTerms: readonly string[], subjectTerms: readonly string[], articleIds: readonly number[]): readonly KnowledgeRankingBucket[] {
  const buckets = new Map<string, {
    kind: string;
    label: string;
    domain: string | null;
    entries: KnowledgeRegistryEntry[];
    score: number;
    reasons: Set<string>;
    relatedIds: Set<string>;
    conceptIds: Set<string>;
    articleIds: Set<number>;
  }>();

  for (const entry of entries) {
    const key = bucketKey(entry);
    const scored = computeEntryScore(entry, queryTerms, conceptTerms, subjectTerms, articleIds);
    const current = buckets.get(key) ?? {
      kind: entry.metadata.kind,
      label: entry.metadata.title,
      domain: entry.metadata.domain ?? null,
      entries: [],
      score: 0,
      reasons: new Set<string>(),
      relatedIds: new Set<string>(),
      conceptIds: new Set<string>(),
      articleIds: new Set<number>(),
    };

    current.entries.push(entry);
    current.score = Math.max(current.score, scored.score);
    for (const reason of scored.reasons) current.reasons.add(reason);
    for (const relatedId of entry.metadata.relatedIds) current.relatedIds.add(relatedId);
    for (const conceptId of scored.conceptIds) current.conceptIds.add(conceptId);
    for (const articleId of scored.articleIds) current.articleIds.add(articleId);
    buckets.set(key, current);
  }

  return Object.freeze(
    [...buckets.entries()].map(([key, bucket]) => Object.freeze({
      key,
      kind: bucket.kind,
      label: bucket.label,
      domain: bucket.domain,
      entries: Object.freeze([...bucket.entries]),
      score: bucket.score,
      reasons: Object.freeze([...bucket.reasons].sort((left, right) => left.localeCompare(right))),
      relatedIds: Object.freeze([...bucket.relatedIds].sort((left, right) => left.localeCompare(right))),
      conceptIds: Object.freeze([...bucket.conceptIds].sort((left, right) => left.localeCompare(right))),
      articleIds: Object.freeze([...bucket.articleIds].sort((left, right) => left - right)),
    })).sort((left, right) => right.score - left.score || left.kind.localeCompare(right.kind) || left.key.localeCompare(right.key)),
  );
}

function buildRankingItems(
  buckets: readonly KnowledgeRankingBucket[],
  sourceKinds: readonly string[],
  kind: KnowledgeRankingItem["kind"],
  topLimit = 10,
): readonly KnowledgeRankingItem[] {
  return Object.freeze(
    buckets
      .filter((bucket) => sourceKinds.includes(bucket.kind))
      .slice()
      .sort((left, right) => right.score - left.score || left.key.localeCompare(right.key))
      .slice(0, topLimit)
      .map((bucket) => Object.freeze({
        id: bucket.key,
        label: bucket.label,
        kind,
        score: bucket.score,
        confidence: bucket.score,
        reasons: bucket.reasons,
        registryKeys: Object.freeze(bucket.entries.map((entry) => entry.registryKey)),
        conceptIds: bucket.conceptIds,
        articleIds: bucket.articleIds,
        relatedIds: bucket.relatedIds,
        domain: bucket.domain,
      })),
  );
}

function buildConceptRankingItems(response: AnalysisResponse, registryEntries: readonly KnowledgeRegistryEntry[], queryTerms: readonly string[]): readonly KnowledgeRankingItem[] {
  const conceptSupport = new Map<string, { concept: Concept; score: number; reasons: Set<string>; registryKeys: Set<string>; articleIds: Set<number>; relatedIds: Set<string> }>();

  const registryCorpus = registryEntries.map((entry) => ({
    entry,
    corpus: buildEntryCorpus(entry),
  }));

  for (const concept of response.intelligence.conceptContext.concepts) {
    const conceptTerms = uniqueStrings([
      concept.id,
      concept.label,
      ...concept.originatingSentences,
      ...concept.entityReferences,
      ...concept.glossaryReferences,
      ...concept.evidenceSources.flatMap((source) => [source.sourceText, source.originatingSentence ?? "", source.glossaryTerm ?? "", source.entityId ?? ""]),
    ]);

    const queryMatch = scoreTerms(buildKnowledgeRankingCorpus([conceptTerms]), queryTerms, 0.02, 0.12);
    let supportScore = 0;
    const reasons = new Set<string>();
    const registryKeys = new Set<string>();
    const relatedIds = new Set<string>();
    const articleIds = new Set<number>();

    for (const { entry, corpus } of registryCorpus) {
      const match = scoreTerms(corpus, conceptTerms, 0.08, 0.24);
      if (match.score <= 0) continue;
      supportScore = Math.max(supportScore, match.score);
      reasons.add("registry");
      registryKeys.add(entry.registryKey);
      for (const relatedId of entry.metadata.relatedIds) relatedIds.add(relatedId);
      for (const articleId of extractArticleIds(entry.payload)) articleIds.add(articleId);
    }
    if (queryMatch.score > 0) {
      reasons.add("query");
    }

    const score = clampScore(Math.min(1, (concept.confidence.total * 0.65) + (supportScore * 0.2) + (queryMatch.score * 0.15)));
    conceptSupport.set(concept.id, {
      concept,
      score,
      reasons,
      registryKeys,
      articleIds,
      relatedIds,
    });
  }

  return Object.freeze(
    [...conceptSupport.values()].sort((left, right) => right.score - left.score || left.concept.id.localeCompare(right.concept.id)).map((item) => Object.freeze({
      id: item.concept.id,
      label: item.concept.label,
      kind: "concept" as const,
      score: item.score,
      confidence: item.score,
      reasons: Object.freeze([
        "semantic confidence",
        ...item.reasons,
      ].sort((left, right) => left.localeCompare(right))),
      registryKeys: Object.freeze([...item.registryKeys].sort((left, right) => left.localeCompare(right))),
      conceptIds: Object.freeze([item.concept.id]),
      articleIds: Object.freeze([...item.articleIds].sort((left, right) => left - right)),
      relatedIds: Object.freeze([...item.relatedIds].sort((left, right) => left.localeCompare(right))),
      domain: null,
    })),
  );
}

function buildArticleRankingItems(entries: readonly KnowledgeRegistryEntry[], articleIds: readonly number[], queryTerms: readonly string[]): readonly KnowledgeRankingItem[] {
  const articleScores = new Map<number, { score: number; reasons: Set<string>; registryKeys: Set<string>; conceptIds: Set<string>; relatedIds: Set<string>; label: string }>();

  for (const articleId of articleIds) {
    articleScores.set(articleId, {
      score: 0,
      reasons: new Set<string>(),
      registryKeys: new Set<string>(),
      conceptIds: new Set<string>(),
      relatedIds: new Set<string>(),
      label: `Article ${articleId}`,
    });
  }

  for (const entry of entries) {
    const corpus = buildEntryCorpus(entry);
    const extractedArticleIds = extractArticleIds(entry.payload);
    const articleHits = scoreOverlap(extractedArticleIds, articleIds, 0.2, 0.6);
    if (articleHits.score <= 0) continue;
    for (const articleId of articleHits.matched) {
      const current = articleScores.get(articleId) ?? {
        score: 0,
        reasons: new Set<string>(),
        registryKeys: new Set<string>(),
        conceptIds: new Set<string>(),
        relatedIds: new Set<string>(),
        label: `Article ${articleId}`,
      };
      current.score = Math.max(current.score, clampScore(articleHits.score + scoreTerms(corpus, queryTerms, 0.02, 0.12).score));
      current.reasons.add("article");
      current.registryKeys.add(entry.registryKey);
      for (const relatedId of entry.metadata.relatedIds) current.relatedIds.add(relatedId);
      for (const conceptId of entry.metadata.tags) current.conceptIds.add(conceptId);
      articleScores.set(articleId, current);
    }
  }

  return Object.freeze(
    [...articleScores.entries()].sort((left, right) => right[1].score - left[1].score || left[0] - right[0]).map(([articleId, value]) => Object.freeze({
      id: String(articleId),
      label: value.label,
      kind: "article" as const,
      score: clampScore(value.score),
      confidence: clampScore(value.score),
      reasons: Object.freeze([...value.reasons].sort((left, right) => left.localeCompare(right))),
      registryKeys: Object.freeze([...value.registryKeys].sort((left, right) => left.localeCompare(right))),
      conceptIds: Object.freeze([...value.conceptIds].sort((left, right) => left.localeCompare(right))),
      articleIds: Object.freeze([articleId]),
      relatedIds: Object.freeze([...value.relatedIds].sort((left, right) => left.localeCompare(right))),
      domain: null,
    })),
  );
}

function buildRelationshipRankingItems(entries: readonly KnowledgeRegistryEntry[], buckets: readonly KnowledgeRankingBucket[], topLimit = 10): readonly KnowledgeRankingItem[] {
  const bucketScores = new Map<string, { score: number; reasons: Set<string>; registryKeys: Set<string>; conceptIds: Set<string>; articleIds: Set<number>; relatedIds: Set<string>; label: string; domain: string | null; kind: string }>();
  const bucketLookup = new Map<string, KnowledgeRankingBucket>();
  for (const bucket of buckets) {
    bucketLookup.set(bucket.key, bucket);
  }

  const seedKeys = buckets.filter((bucket) => bucket.score > 0.25).slice(0, 20).map((bucket) => bucket.key);
  const adjacency = new Map<string, Set<string>>();
  for (const entry of entries) {
    const key = bucketKey(entry);
    const related = adjacency.get(key) ?? new Set<string>();
    for (const relatedId of entry.metadata.relatedIds) {
      const relatedKey = relatedId.includes(":") ? normalizeKey(relatedId) : keyFromLooseId(entries, relatedId);
      if (relatedKey) {
        related.add(relatedKey);
      }
    }
    adjacency.set(key, related);
  }

  const queue: Array<{ key: string; distance: number; seedScore: number }> = [];
  for (const seedKey of seedKeys) {
    const seedBucket = bucketLookup.get(seedKey);
    if (!seedBucket) continue;
    queue.push({ key: seedKey, distance: 0, seedScore: seedBucket.score });
  }

  const visited = new Set<string>();
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current.key)) continue;
    visited.add(current.key);

    const nodeBucket = bucketLookup.get(current.key);
    if (nodeBucket) {
      const currentScore = bucketScores.get(current.key) ?? {
        score: 0,
        reasons: new Set<string>(),
        registryKeys: new Set<string>(),
        conceptIds: new Set<string>(),
        articleIds: new Set<number>(),
        relatedIds: new Set<string>(),
        label: nodeBucket.label,
        domain: nodeBucket.domain,
        kind: nodeBucket.kind,
      };
      const traversalScore = clampScore(Math.min(1, current.seedScore * (current.distance === 0 ? 0.25 : 0.2 / current.distance)));
      currentScore.score = Math.max(currentScore.score, traversalScore);
      currentScore.reasons.add(current.distance === 0 ? "seed" : `distance:${current.distance}`);
      currentScore.registryKeys.add(current.key);
      for (const relatedId of nodeBucket.relatedIds) currentScore.relatedIds.add(relatedId);
      for (const conceptId of nodeBucket.conceptIds) currentScore.conceptIds.add(conceptId);
      for (const articleId of nodeBucket.articleIds) currentScore.articleIds.add(articleId);
      bucketScores.set(current.key, currentScore);
    }

    if (current.distance >= 2) continue;
    for (const nextKey of adjacency.get(current.key) ?? []) {
      if (!visited.has(nextKey)) {
        queue.push({ key: nextKey, distance: current.distance + 1, seedScore: current.seedScore });
      }
    }
  }

  return Object.freeze(
    [...bucketScores.entries()].sort((left, right) => right[1].score - left[1].score || left[0].localeCompare(right[0])).slice(0, topLimit).map(([key, value]) => Object.freeze({
      id: key,
      label: value.label,
      kind: "relationship" as const,
      score: clampScore(value.score),
      confidence: clampScore(value.score),
      reasons: Object.freeze([...value.reasons].sort((left, right) => left.localeCompare(right))),
      registryKeys: Object.freeze([...value.registryKeys].sort((left, right) => left.localeCompare(right))),
      conceptIds: Object.freeze([...value.conceptIds].sort((left, right) => left.localeCompare(right))),
      articleIds: Object.freeze([...value.articleIds].sort((left, right) => left - right)),
      relatedIds: Object.freeze([...value.relatedIds].sort((left, right) => left.localeCompare(right))),
      domain: value.domain,
    })),
  );
}

function normalizeKey(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
}

function keyFromLooseId(entries: readonly KnowledgeRegistryEntry[], id: string): string | null {
  const normalized = normalizeKey(id);
  const matches = entries.filter((entry) => normalizeKey(entry.metadata.id) === normalized);
  if (matches.length === 0) return null;
  return bucketKey(matches[0] ?? matches.at(0)!);
}

function computeKnowledgeConfidence(items: ReadonlyArray<readonly KnowledgeRankingItem[]>): number {
  const scores = items.flatMap((group) => group.slice(0, 3).map((item) => item.score)).filter((score) => score > 0);
  if (scores.length === 0) return 0;
  const average = scores.slice(0, 5).reduce((total, value) => total + value, 0) / Math.min(scores.length, 5);
  return clampScore(average);
}

function computeRetrievalCoverage(domainScores: readonly KnowledgeRankingItem[], conceptScores: readonly KnowledgeRankingItem[], lessonScores: readonly KnowledgeRankingItem[], blueprintScores: readonly KnowledgeRankingItem[], patternScores: readonly KnowledgeRankingItem[], articleScores: readonly KnowledgeRankingItem[]): number {
  const categories = [domainScores, conceptScores, lessonScores, blueprintScores, patternScores, articleScores];
  const covered = categories.filter((group) => group.some((item) => item.score > 0.2)).length;
  return categories.length > 0 ? clampScore(covered / categories.length) : 0;
}

function buildQueryTerms(input: KnowledgeRankingQuery): readonly string[] {
  const subjectTerms = collectSubjectTerms(input.subjectModule);
  const semanticTerms = collectSemanticTerms(input.analysisResponse);
  const conceptTerms = collectConceptSignals(input.analysisResponse);
  const query = uniqueStrings([
    input.chunkText,
    input.analysisPromptContext ?? "",
    input.storyMemory ?? "",
    input.sceneMemory ?? "",
    ...input.neighboringSentences,
    ...subjectTerms,
    ...semanticTerms,
    ...conceptTerms,
  ]);
  return query;
}

function buildConceptIds(response: AnalysisResponse): readonly string[] {
  return uniqueStrings(response.intelligence.conceptContext.conceptIds);
}

function buildArticleIds(subjectModule: V3PromptSubjectModule): readonly number[] {
  return uniqueNumbers(subjectModule.articleIds ?? []);
}

export function createKnowledgeRankingReport(input: KnowledgeRankingQuery): KnowledgeRankingReport {
  const registryEntries = input.registry.list();
  const subjectTerms = collectSubjectTerms(input.subjectModule);
  const conceptTerms = collectConceptSignals(input.analysisResponse);
  const queryTerms = buildQueryTerms(input);
  const articleIds = buildArticleIds(input.subjectModule);
  const buckets = groupByBucket(registryEntries, queryTerms, conceptTerms, subjectTerms, articleIds);
  const domainScores = buildRankingItems(buckets, ["academy_pack", "academy_pack_document"], "domain", 10);
  const lessonScores = buildRankingItems(buckets, ["lesson"], "lesson", 10);
  const blueprintScores = buildRankingItems(buckets, ["blueprint_document", "blueprint_entry"], "blueprint", 10);
  const patternScores = buildRankingItems(buckets, ["pattern_document", "pattern_entry"], "pattern", 10);
  const conceptScores = buildConceptRankingItems(input.analysisResponse, registryEntries, queryTerms);
  const articleScores = buildArticleRankingItems(registryEntries, articleIds, queryTerms);
  const relationshipScores = buildRelationshipRankingItems(registryEntries, buckets, 12);
  const knowledgeConfidence = computeKnowledgeConfidence([domainScores, conceptScores, lessonScores, blueprintScores, patternScores, articleScores, relationshipScores]);
  const retrievalCoverage = computeRetrievalCoverage(domainScores, conceptScores, lessonScores, blueprintScores, patternScores, articleScores);
  const selectedRegistryKeys = uniqueStrings([
    ...domainScores.flatMap((item) => item.registryKeys),
    ...conceptScores.flatMap((item) => item.registryKeys),
    ...lessonScores.flatMap((item) => item.registryKeys),
    ...blueprintScores.flatMap((item) => item.registryKeys),
    ...patternScores.flatMap((item) => item.registryKeys),
    ...articleScores.flatMap((item) => item.registryKeys),
    ...relationshipScores.flatMap((item) => item.registryKeys),
  ]).slice(0, 50);

  return Object.freeze({
    jobId: input.jobId,
    chunkId: input.chunkId,
    analysisEngine: input.analysisEngine,
    pipelineVersion: input.pipelineVersion,
    querySummary: Object.freeze({
      subjectModuleId: input.subjectModule.id,
    subjectModuleTitle: toText(input.subjectModule.titleAr),
      conceptIds: buildConceptIds(input.analysisResponse),
      articleIds,
      semanticConfidence: input.analysisResponse.semantic.confidence,
      evidenceConfidence: input.analysisResponse.evidence.confidence,
      queryTerms,
    }),
    domainScores,
    conceptScores,
    lessonScores,
    blueprintScores,
    patternScores,
    relationshipScores,
    articleScores,
    selectedRegistryKeys: Object.freeze(selectedRegistryKeys),
    knowledgeConfidence,
    retrievalCoverage,
    totalRegistryEntries: registryEntries.length,
  });
}
