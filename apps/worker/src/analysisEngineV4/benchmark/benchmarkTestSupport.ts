import type { AnalysisEngine, AnalysisResult } from "../../analysisEngine/types.js";
import type { V3RuntimeFinding } from "../../analysisEngineV3/runtime/runtimeTypes.js";
import type { SceneAnalysisTraceDocument } from "../sceneAnalysisTraceViewer.js";

export function createBenchmarkFinding(input: Readonly<{
  findingId: string;
  articleId: number;
  atomId: string;
  evidenceText: string;
  titleAr: string;
  descriptionAr: string;
}>): V3RuntimeFinding {
  return {
    article_id: input.articleId,
    atom_id: input.atomId,
    category: "profanity",
    confidence: 1,
    description_ar: input.descriptionAr,
    evidence_hash: `${input.findingId}:evidence`,
    evidence_snippet: input.evidenceText,
    final_ruling: "reject",
    lineage_id: "line-1",
    canonical_finding_id: input.findingId,
    canonical_atom: input.atomId,
    title_ar: input.titleAr,
    severity: "medium",
    start_offset_global: 0,
    end_offset_global: input.evidenceText.length,
    primary_article_id: input.articleId,
    related_article_ids: [input.articleId],
    policy_links: [
      {
        article_id: input.articleId,
        atom_concept_id: "profanity",
        role: "primary",
      },
    ],
  } as unknown as V3RuntimeFinding;
}

export function createBenchmarkTraceDocument(sceneId: string, sceneSummary: string): SceneAnalysisTraceDocument {
  return Object.freeze({
    sceneId,
    sceneSummary,
    evidence: [],
    evidenceCollection: null,
    conceptCollection: null,
    legalDecisionCollection: null,
    explanationCollection: null,
    verifiedFindingCollection: null,
    decisionProvenanceCollection: null,
    concepts: [],
    knowledgeDomains: [],
    candidateArticles: [],
    rankedArticles: [],
    selectedArticle: null,
    semanticSceneModel: null,
    semanticSceneResponse: null,
    explanation: null,
    judgeResult: null,
    timing: Object.freeze({
      totalMs: 1,
      nodeTimings: Object.freeze([]),
    }),
    nodeExecutionOrder: Object.freeze(["understand_scene", "interpret_scene", "candidate_evidence", "concept_classification", "legal_mapping", "explanation", "quality_judge"]),
    steps: Object.freeze([]),
  }) as SceneAnalysisTraceDocument;
}

export function createStaticAnalysisEngine(result: AnalysisResult): AnalysisEngine {
  return Object.freeze({
    async execute(): Promise<AnalysisResult> {
      return result;
    },
  });
}
