import { createCaseLibraryRegistry } from "../caseLibrary/caseLibrary.js";
import type { CaseLibraryRegistry } from "../caseLibrary/caseLibraryTypes.js";
import { createDecisionMemoryRegistry } from "../decisionMemory/decisionMemory.js";
import type { DecisionMemoryRegistry } from "../decisionMemory/decisionMemoryTypes.js";
import { hashDecisionMemoryValue, includesDecisionMemoryText, normalizeDecisionMemoryText, uniqueDecisionMemoryNumbers, uniqueDecisionMemoryStrings } from "../decisionMemory/decisionMemoryUtils.js";
import type {
  PrecedentEngineMatch,
  PrecedentEngineQuery,
  PrecedentEngineRegistry,
  PrecedentEngineReport,
} from "./precedentEngineTypes.js";

function scoreDecisionAgainstQuery(
  decision: DecisionMemoryRegistry["entries"][number],
  caseLibrary: CaseLibraryRegistry,
  query: PrecedentEngineQuery,
): PrecedentEngineMatch {
  const caseEntry = decision.articleIds.length > 0 ? caseLibrary.get(decision.articleIds[0] ?? -1) : null;
  const matchedArticleIds = uniqueDecisionMemoryNumbers([
    ...(query.articleId === null || query.articleId === undefined ? [] : [query.articleId]),
    ...decision.articleIds,
  ]);
  const matchedConcepts = uniqueDecisionMemoryStrings([
    ...decision.concepts,
    ...(caseEntry ? caseEntry.cases.flatMap((item) => item.concepts) : []),
  ]);

  let similarity = 0;
  const reasons: string[] = [];

  if (typeof query.articleId === "number" && decision.articleIds.includes(query.articleId)) {
    similarity += 0.45;
    reasons.push("article");
  }

  if (query.status && decision.status === query.status) {
    similarity += 0.2;
    reasons.push("status");
  }

  if (includesDecisionMemoryText(decision.title, query.concept) || includesDecisionMemoryText(decision.summary, query.concept) || decision.concepts.some((concept) => includesDecisionMemoryText(concept, query.concept))) {
    similarity += 0.2;
    reasons.push("concept");
  }

  if (includesDecisionMemoryText([decision.why, ...decision.reasoning, ...decision.evidence].join(" "), query.keyword)) {
    similarity += 0.15;
    reasons.push("keyword");
  }

  if (caseEntry) {
    const caseTerms = [
      caseEntry.articleTitle,
      caseEntry.titleAr,
      caseEntry.reviewerExplanation,
      ...caseEntry.gcamReasoning,
      ...caseEntry.culturalReasoning,
    ].join(" ");
    if (includesDecisionMemoryText(caseTerms, query.concept)) {
      similarity += 0.1;
      reasons.push("case");
    }
  }

  return Object.freeze({
    decision,
    caseEntry,
    similarity: Math.max(0, Math.min(1, Number(similarity.toFixed(4)))),
    reason: reasons.length > 0 ? reasons.sort((left, right) => left.localeCompare(right)).join(", ") : "similarity",
    matchedArticleIds,
    matchedConcepts,
  });
}

export function createPrecedentEngineRegistry(
  decisionMemory: DecisionMemoryRegistry = createDecisionMemoryRegistry(),
  caseLibrary: CaseLibraryRegistry = createCaseLibraryRegistry(),
): PrecedentEngineRegistry {
  const reportFor = (query: PrecedentEngineQuery): PrecedentEngineReport => {
    const matches = decisionMemory.entries
      .map((entry) => scoreDecisionAgainstQuery(entry, caseLibrary, query))
      .filter((match) => {
        if (typeof query.articleId === "number" && !match.matchedArticleIds.includes(query.articleId)) {
          return false;
        }
        if (query.status && match.decision.status !== query.status) {
          return false;
        }
        if (query.concept && !includesDecisionMemoryText([match.decision.title, match.decision.summary, ...match.matchedConcepts].join(" "), query.concept)) {
          return false;
        }
        if (query.keyword && !includesDecisionMemoryText([match.decision.why, ...match.decision.reasoning, ...match.decision.evidence].join(" "), query.keyword)) {
          return false;
        }
        return match.similarity > 0;
      })
      .sort((left, right) => right.similarity - left.similarity || left.decision.id.localeCompare(right.decision.id));

    const bestMatch = matches[0] ?? null;
    const precedentCoverage = decisionMemory.entries.length > 0 ? Number((Math.min(matches.length, decisionMemory.entries.length) / decisionMemory.entries.length).toFixed(4)) : 0;
    return Object.freeze({
      query,
      matches: Object.freeze(matches.slice(0, 10)),
      bestMatch,
      totalDecisions: decisionMemory.entries.length,
      totalCases: caseLibrary.entries.length,
      precedentCoverage,
      hash: hashDecisionMemoryValue({
        query,
        matches: matches.map((match) => ({
          id: match.decision.id,
          similarity: match.similarity,
          reason: match.reason,
          articleIds: match.matchedArticleIds,
        })),
      }),
    });
  };

  return Object.freeze({
    report: reportFor({}),
    search: reportFor,
  });
}

