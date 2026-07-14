import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type {
  GcamMapperCatalog,
  GcamMapperDebt,
  GcamMapperInput,
  GcamMapperRegistry,
  GcamMapperResult,
  GcamMapperRule,
} from "../schemas/gcamMapperTypes.js";
import { canonicalizeGcamMapperCatalog, toCatalogHash } from "../schemas/gcamMapperSchema.js";
import { freezeGcamMapperValue, normalizeGcamMapperKey, normalizeGcamMapperText, stableSerializeGcamMapperValue } from "../schemas/gcamMapperVersioning.js";
import { loadGcamMapperCatalogFromRoot, validateGcamMapperCatalog } from "../validators/gcamMapperValidator.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function defaultRootDir(): string {
  return ROOT;
}

function normalizeList(values: readonly string[] | undefined): readonly string[] {
  return Object.freeze([...(values ?? [])].map((value) => normalizeGcamMapperText(value)).filter(Boolean).sort((left, right) => left.localeCompare(right)));
}

function intersects(left: readonly string[], right: readonly string[]): boolean {
  const set = new Set(left.map((value) => normalizeGcamMapperKey(value)));
  return right.some((value) => set.has(normalizeGcamMapperKey(value)));
}

function scoreRule(rule: GcamMapperRule, input: GcamMapperInput): number {
  const match = rule.match;
  let score = rule.priority;
  const fields = [
    [match.concepts, input.concepts],
    [match.domains, input.domains],
    [match.targets, input.targets],
    [match.actions, input.actions],
    [match.intents, input.intents],
    [match.contexts, input.contexts],
  ] as const;

  for (const [expected, actual] of fields) {
    if (expected.length === 0) continue;
    if (intersects(expected, actual)) score += 10;
  }

  const judgment = normalizeGcamMapperText(String(input.reviewerJudgment ?? "")).toLowerCase();
  if (judgment.length > 0 && normalizeGcamMapperKey(rule.title).includes(judgment)) {
    score += 4;
  }

  score += Math.min(10, normalizeList(input.evidence).length);
  score += Math.max(0, Math.min(10, Math.floor(input.confidence / 10)));
  return score;
}

function ruleMatches(rule: GcamMapperRule, input: GcamMapperInput): boolean {
  const match = rule.match;
  const fields = [
    [match.concepts, input.concepts],
    [match.domains, input.domains],
    [match.targets, input.targets],
    [match.actions, input.actions],
    [match.intents, input.intents],
    [match.contexts, input.contexts],
  ] as const;

  return fields.every(([expected, actual]) => expected.length === 0 || intersects(expected, actual));
}

function buildDebt(input: GcamMapperInput, rule: GcamMapperRule | null, reason: string): readonly GcamMapperDebt[] {
  const concepts = normalizeList(input.concepts);
  if (concepts.length === 0) {
    return Object.freeze([
      freezeGcamMapperValue({
        id: "mapping-debt.empty.concepts",
        concept: "unmapped",
        reason,
        source: normalizeGcamMapperText(String(input.reviewerJudgment ?? "")).length > 0 ? normalizeGcamMapperText(String(input.reviewerJudgment ?? "")) : "unknown",
        confidence: input.confidence,
        relatedRuleIds: rule === null ? [] : [rule.id],
      }),
    ]);
  }

  return Object.freeze(concepts.map((concept) =>
    freezeGcamMapperValue({
      id: `mapping-debt.${normalizeGcamMapperKey(concept)}`,
      concept,
      reason,
      source: normalizeGcamMapperText(String(input.evidence[0] ?? input.reviewerJudgment ?? "")),
      confidence: input.confidence,
      relatedRuleIds: rule === null ? [] : [rule.id],
    }),
  ));
}

function mapInput(catalog: GcamMapperCatalog, input: GcamMapperInput): GcamMapperResult {
  const sortedRules = [...catalog.mappingRules].sort((left, right) => scoreRule(right, input) - scoreRule(left, input) || left.id.localeCompare(right.id));
  const matchedRule = sortedRules.find((rule) => ruleMatches(rule, input)) ?? null;

  if (matchedRule === null) {
    const debt = buildDebt(input, null, "No official GCAM mapping exists for the supplied reviewer conclusion.");
    const hash = createHash("sha256").update(stableSerializeGcamMapperValue({
      input,
      status: "UNMAPPED",
      mappingDebt: debt,
    }), "utf8").digest("hex");
    return freezeGcamMapperValue({
      status: "UNMAPPED" as const,
      articleId: null,
      articleNumber: null,
      articleTitleAr: null,
      atomId: null,
      atomNumber: null,
      atomTitleAr: null,
      findingTitle: "UNMAPPED",
      findingCategory: "UNMAPPED",
      reviewerExplanation: "No official GCAM mapping exists. A mapping debt record was created instead of guessing.",
      supportingEvidence: normalizeList(input.evidence),
      matchedRuleId: null,
      matchedArticleMappingId: null,
      matchedAtomMappingId: null,
      confidence: input.confidence,
      mappingDebt: debt,
      hash,
    });
  }

  const articleMapping = catalog.articleMappings.find((entry) => normalizeGcamMapperKey(entry.id) === normalizeGcamMapperKey(String(matchedRule.articleMappingId ?? ""))) ?? null;
  const atomMapping = matchedRule.atomMappingId === null
    ? null
    : catalog.atomMappings.find((entry) => normalizeGcamMapperKey(entry.id) === normalizeGcamMapperKey(String(matchedRule.atomMappingId ?? ""))) ?? null;

  const debt = articleMapping === null
    ? buildDebt(input, matchedRule, "The selected rule lacks an official article mapping.")
    : atomMapping === null && matchedRule.atomMappingId !== null
      ? buildDebt(input, matchedRule, "The selected rule lacks an official atom mapping.")
      : Object.freeze([]);

  const hash = createHash("sha256").update(stableSerializeGcamMapperValue({
    input,
    matchedRuleId: matchedRule.id,
    articleMappingId: articleMapping?.id ?? null,
    atomMappingId: atomMapping?.id ?? null,
    mappingDebt: debt,
  }), "utf8").digest("hex");

  return freezeGcamMapperValue({
    status: "MAPPED" as const,
    articleId: articleMapping?.articleId ?? null,
    articleNumber: articleMapping?.articleNumber ?? null,
    articleTitleAr: articleMapping?.articleTitleAr ?? null,
    atomId: atomMapping?.atomId ?? null,
    atomNumber: atomMapping?.atomNumber ?? null,
    atomTitleAr: atomMapping?.atomTitleAr ?? null,
    findingTitle: atomMapping?.findingTitle ?? articleMapping?.findingTitle ?? "UNMAPPED",
    findingCategory: atomMapping?.findingCategory ?? articleMapping?.findingCategory ?? "UNMAPPED",
    reviewerExplanation: atomMapping?.reviewerExplanation ?? articleMapping?.reviewerExplanation ?? "Mapped through a deterministic GCAM rule.",
    supportingEvidence: normalizeList(input.evidence),
    matchedRuleId: matchedRule.id,
    matchedArticleMappingId: articleMapping?.id ?? null,
    matchedAtomMappingId: atomMapping?.id ?? null,
    confidence: input.confidence,
    mappingDebt: debt,
    hash,
  });
}

export function createGcamMapperRegistry(rootDir: string = defaultRootDir()): GcamMapperRegistry {
  const catalog = canonicalizeGcamMapperCatalog(loadGcamMapperCatalogFromRoot(rootDir));
  const validation = validateGcamMapperCatalog(catalog);
  const hash = toCatalogHash(catalog);
  const articleMappings = Object.freeze([...catalog.articleMappings]);
  const atomMappings = Object.freeze([...catalog.atomMappings]);
  const rules = Object.freeze([...catalog.mappingRules]);
  const articleById = new Map(articleMappings.map((entry) => [normalizeGcamMapperKey(entry.id), entry] as const));
  const atomById = new Map(atomMappings.map((entry) => [normalizeGcamMapperKey(entry.id), entry] as const));
  const ruleById = new Map(rules.map((entry) => [normalizeGcamMapperKey(entry.id), entry] as const));

  return Object.freeze({
    catalog,
    validation,
    hash,
    listArticleMappings: () => articleMappings,
    listAtomMappings: () => atomMappings,
    listRules: () => rules,
    getArticleMapping: (id: string) => articleById.get(normalizeGcamMapperKey(id)) ?? null,
    getAtomMapping: (id: string) => atomById.get(normalizeGcamMapperKey(id)) ?? null,
    getRule: (id: string) => ruleById.get(normalizeGcamMapperKey(id)) ?? null,
    map: (input: GcamMapperInput) => mapInput(catalog, input),
  });
}

export function createEmptyGcamMapperRegistry(): GcamMapperRegistry {
  const catalog: GcamMapperCatalog = freezeGcamMapperValue({
    version: "1.0.0",
    articleMappings: [],
    atomMappings: [],
    mappingRules: [],
  });
  const validation = validateGcamMapperCatalog(catalog);
  return Object.freeze({
    catalog,
    validation,
    hash: validation.hash,
    listArticleMappings: () => [],
    listAtomMappings: () => [],
    listRules: () => [],
    getArticleMapping: () => null,
    getAtomMapping: () => null,
    getRule: () => null,
    map: (input: GcamMapperInput) => mapInput(catalog, input),
  });
}
