import { createHash } from "node:crypto";

import type { CognitiveDashboard, CognitiveDashboardInput, CognitiveDashboardNode, CognitiveDashboardReplay } from "./dashboardTypes.js";
import type { SceneAnalysisTraceDocumentStep } from "../sceneAnalysisTraceViewer.js";
import type { SceneAnalysisTraceDocument } from "../sceneAnalysisTraceViewer.js";

function normalizeJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function hashDashboard(input: CognitiveDashboardInput): string {
  const hash = createHash("sha256");
  hash.update(JSON.stringify({
    traceDocument: input.traceDocument,
    reportAdapterResult: input.reportAdapterResult ?? null,
    estimatedCostUsd: input.estimatedCostUsd ?? null,
  }));
  return hash.digest("hex");
}

function safeNumber(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Number(value.toFixed(6)) : null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatJson(value: unknown): string {
  return escapeHtml(JSON.stringify(value, null, 2));
}

function allocateCost(totalCostUsd: number | null | undefined, totalExecutionTimeMs: number, nodeExecutionTimeMs: number): number | null {
  if (totalCostUsd == null) return null;
  if (totalExecutionTimeMs <= 0) return Number(totalCostUsd.toFixed(6));
  return Number(((totalCostUsd * nodeExecutionTimeMs) / totalExecutionTimeMs).toFixed(6));
}

function createReplay(traceDocument: SceneAnalysisTraceDocument, nodeIndex: number): CognitiveDashboardReplay {
  return Object.freeze({
    startingNode: traceDocument.nodeExecutionOrder[nodeIndex] ?? null,
    startingNodeIndex: nodeIndex,
    nodeExecutionOrder: Object.freeze([...traceDocument.nodeExecutionOrder]),
    remainingNodeExecutionOrder: Object.freeze(traceDocument.nodeExecutionOrder.slice(nodeIndex)),
    startingView: traceDocument.steps[nodeIndex]?.after ?? traceDocument.steps[nodeIndex]?.before ?? null,
  });
}

function buildNodeSource(traceDocument: SceneAnalysisTraceDocument, reportAdapterResult: CognitiveDashboardInput["reportAdapterResult"], totalCostUsd: number | null): readonly CognitiveDashboardNode[] {
  const nodes: CognitiveDashboardNode[] = [];
  const stepsByNode = new Map(traceDocument.steps.map((step) => [step.node, step]));

  const nodeDefinitions = [
    {
      nodeId: "understand_scene" as const,
      title: "Scene Understanding",
      confidence: traceDocument.semanticSceneModel?.confidence ?? (traceDocument.sceneSummary.length > 0 ? 1 : 0),
      inputs: {
        sceneId: traceDocument.sceneId,
        sceneSummary: traceDocument.sceneSummary,
      },
      outputs: {
        sceneSummary: traceDocument.sceneSummary,
        semanticSceneModel: traceDocument.semanticSceneModel,
      },
      errors: traceDocument.sceneSummary ? [] : ["Missing scene summary."],
    },
    {
      nodeId: "interpret_scene" as const,
      title: "Semantic Interpretation",
      confidence: traceDocument.semanticSceneModel?.confidence ?? null,
      inputs: {
        sceneSummary: traceDocument.sceneSummary,
        semanticSceneResponse: traceDocument.semanticSceneResponse,
      },
      outputs: {
        semanticSceneModel: traceDocument.semanticSceneModel,
        semanticSceneResponse: traceDocument.semanticSceneResponse,
      },
      errors: traceDocument.semanticSceneModel ? [] : ["Missing semantic scene model."],
    },
    {
      nodeId: "candidate_evidence" as const,
      title: "Evidence",
      confidence: traceDocument.evidenceCollection
        ? traceDocument.evidenceCollection.grounding.totalCandidates <= 0
          ? 1
          : Number((traceDocument.evidenceCollection.grounding.groundedCount / traceDocument.evidenceCollection.grounding.totalCandidates).toFixed(6))
        : null,
      inputs: {
        semanticSceneModel: traceDocument.semanticSceneModel,
        evidenceCandidates: traceDocument.evidence,
      },
      outputs: {
        evidenceCollection: traceDocument.evidenceCollection,
        evidence: traceDocument.evidence,
      },
      errors: traceDocument.evidenceCollection
        ? traceDocument.evidenceCollection.grounding.unmatchedCount > 0
          ? [`${traceDocument.evidenceCollection.grounding.unmatchedCount} evidence candidate(s) remained unmatched.`]
          : []
        : ["Missing evidence collection."],
    },
    {
      nodeId: "concept_classification" as const,
      title: "Concepts",
      confidence: traceDocument.conceptCollection?.confidence ?? null,
      inputs: {
        evidenceCollection: traceDocument.evidenceCollection,
        evidence: traceDocument.evidence,
      },
      outputs: {
        conceptCollection: traceDocument.conceptCollection,
        concepts: traceDocument.concepts,
        knowledgeDomains: traceDocument.knowledgeDomains,
      },
      errors: traceDocument.conceptCollection
        ? traceDocument.conceptCollection.dedupDecisions.length > 0
          ? [`${traceDocument.conceptCollection.dedupDecisions.length} concept deduplication decision(s) recorded.`]
          : []
        : ["Missing concept collection."],
    },
    {
      nodeId: "legal_mapping" as const,
      title: "Legal Mapping",
      confidence: traceDocument.legalDecisionCollection?.confidence ?? null,
      inputs: {
        concepts: traceDocument.concepts,
        knowledgeDomains: traceDocument.knowledgeDomains,
      },
      outputs: {
        legalDecisionCollection: traceDocument.legalDecisionCollection,
        candidateArticles: traceDocument.candidateArticles,
        rankedArticles: traceDocument.rankedArticles,
        selectedArticle: traceDocument.selectedArticle,
      },
      errors: traceDocument.legalDecisionCollection
        ? traceDocument.legalDecisionCollection.decisions.length === 0
          ? ["No legal decisions were recorded."]
          : []
        : ["Missing legal decision collection."],
    },
    {
      nodeId: "explanation" as const,
      title: "Explanation",
      confidence: traceDocument.explanationCollection?.confidence ?? null,
      inputs: {
        legalDecisionCollection: traceDocument.legalDecisionCollection,
        selectedArticle: traceDocument.selectedArticle,
      },
      outputs: {
        explanationCollection: traceDocument.explanationCollection,
        explanation: traceDocument.explanation,
      },
      errors: traceDocument.explanationCollection
        ? traceDocument.explanationCollection.validationResult.status === "pass"
          ? []
          : [...traceDocument.explanationCollection.validationResult.rejectedReasons]
        : ["Missing explanation collection."],
    },
    {
      nodeId: "quality_judge" as const,
      title: "Judge",
      confidence: traceDocument.verifiedFindingCollection?.confidence ?? null,
      inputs: {
        explanationCollection: traceDocument.explanationCollection,
        legalDecisionCollection: traceDocument.legalDecisionCollection,
        evidenceCollection: traceDocument.evidenceCollection,
      },
      outputs: {
        verifiedFindingCollection: traceDocument.verifiedFindingCollection,
        judgeResult: traceDocument.judgeResult,
      },
      errors: traceDocument.verifiedFindingCollection
        ? traceDocument.verifiedFindingCollection.report.overallStatus === "pass"
          ? []
          : [...traceDocument.verifiedFindingCollection.report.rejectionReasons]
        : ["Missing verified finding collection."],
    },
    {
      nodeId: "report" as const,
      title: "Report",
      confidence: traceDocument.verifiedFindingCollection?.confidence ?? null,
      inputs: {
        verifiedFindingCollection: traceDocument.verifiedFindingCollection,
        decisionProvenanceCollection: traceDocument.decisionProvenanceCollection,
        reportAdapterResult: reportAdapterResult?.analysisReport ?? null,
      },
      outputs: {
        analysisReport: reportAdapterResult?.analysisReport ?? null,
        reportDocument: reportAdapterResult?.reportDocument ?? null,
        truthLayerMeta: reportAdapterResult?.truthLayerMeta ?? null,
      },
      errors: reportAdapterResult
        ? []
        : ["Missing report adapter result."],
    },
  ] as const;

  const totalExecutionTimeMs = traceDocument.timing.totalMs || Math.max(1, traceDocument.steps.reduce((sum, step) => sum + step.durationMs, 0));

  for (const definition of nodeDefinitions) {
    const step = stepsByNode.get(definition.nodeId) ?? null;
    nodes.push({
      nodeId: definition.nodeId,
      title: definition.title,
      inputs: normalizeJson(definition.inputs),
      outputs: normalizeJson(definition.outputs),
      executionTimeMs: step?.durationMs ?? 0,
      confidence: safeNumber(definition.confidence),
      costUsd: allocateCost(totalCostUsd, totalExecutionTimeMs, step?.durationMs ?? 0),
      trace: step,
      replay: step ? createReplay(traceDocument, traceDocument.nodeExecutionOrder.indexOf(definition.nodeId)) : null,
      errors: Object.freeze([...definition.errors]),
    });
  }

  return Object.freeze(nodes);
}

function renderNodeCard(node: CognitiveDashboardNode): string {
  const replay = node.replay
    ? `<pre>${formatJson(node.replay)}</pre>`
    : "<p>Replay unavailable.</p>";
  const trace = node.trace ? `<pre>${formatJson(node.trace)}</pre>` : "<p>No trace entry recorded.</p>";

  return [
    `<section class="node-card" data-node="${escapeHtml(node.nodeId)}">`,
    `<h3>${escapeHtml(node.title)}</h3>`,
    `<dl>`,
    `<dt>Execution Time</dt><dd>${node.executionTimeMs} ms</dd>`,
    `<dt>Confidence</dt><dd>${node.confidence ?? "n/a"}</dd>`,
    `<dt>Cost</dt><dd>${node.costUsd ?? "n/a"}</dd>`,
    `<dt>Errors</dt><dd>${node.errors.length === 0 ? "none" : escapeHtml(node.errors.join("; "))}</dd>`,
    `</dl>`,
    `<details open><summary>Inputs</summary><pre>${formatJson(node.inputs)}</pre></details>`,
    `<details open><summary>Outputs</summary><pre>${formatJson(node.outputs)}</pre></details>`,
    `<details><summary>Trace</summary>${trace}</details>`,
    `<details><summary>Replay</summary>${replay}</details>`,
    `</section>`,
  ].join("");
}

function renderDashboardHtml(dashboard: CognitiveDashboard): string {
  return [
    "<section class=\"v4-cognitive-dashboard\">",
    "<style>",
    ".v4-cognitive-dashboard{font-family:ui-sans-serif,system-ui,sans-serif;color:#111;background:#fafafa;padding:24px;line-height:1.45}",
    ".v4-cognitive-dashboard h1{margin:0 0 12px 0}",
    ".v4-cognitive-dashboard .summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-bottom:20px}",
    ".v4-cognitive-dashboard .summary .tile,.node-card{background:#fff;border:1px solid #d1d5db;border-radius:12px;padding:16px;box-shadow:0 1px 2px rgba(0,0,0,.04)}",
    ".v4-cognitive-dashboard .nodes{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:16px}",
    ".v4-cognitive-dashboard dl{display:grid;grid-template-columns:max-content 1fr;gap:4px 12px}",
    ".v4-cognitive-dashboard dt{font-weight:600}",
    ".v4-cognitive-dashboard pre{white-space:pre-wrap;word-break:break-word;background:#0f172a;color:#e2e8f0;padding:12px;border-radius:10px;overflow:auto}",
    ".v4-cognitive-dashboard details{margin-top:10px}",
    "</style>",
    `<h1>V4 Cognitive Dashboard</h1>`,
    `<p>Read-only developer view for scene <strong>${escapeHtml(dashboard.sceneId)}</strong>.</p>`,
    `<div class="summary">`,
    `<div class="tile"><strong>Scene Summary</strong><p>${escapeHtml(dashboard.sceneSummary)}</p></div>`,
    `<div class="tile"><strong>Total Execution Time</strong><p>${dashboard.totalExecutionTimeMs} ms</p></div>`,
    `<div class="tile"><strong>Estimated Cost</strong><p>${dashboard.totalEstimatedCostUsd ?? "n/a"}</p></div>`,
    `<div class="tile"><strong>Report Findings</strong><p>${dashboard.reportAdapterResult?.analysisReport.findingsCount ?? 0}</p></div>`,
    `</div>`,
    `<div class="nodes">`,
    ...dashboard.nodes.map((node) => renderNodeCard(node)),
    `</div>`,
    `<details><summary>Report</summary><pre>${formatJson(dashboard.reportAdapterResult ?? null)}</pre></details>`,
    `<details><summary>Trace Document</summary><pre>${formatJson(dashboard.traceDocument)}</pre></details>`,
    `</section>`,
  ].join("");
}

export function buildCognitiveDashboard(input: CognitiveDashboardInput): CognitiveDashboard {
  const totalExecutionTimeMs = input.traceDocument.timing.totalMs;
  const totalEstimatedCostUsd = typeof input.estimatedCostUsd === "number" ? Number(input.estimatedCostUsd.toFixed(6)) : null;
  const nodes = buildNodeSource(input.traceDocument, input.reportAdapterResult ?? null, totalEstimatedCostUsd);
  const dashboard: CognitiveDashboard = {
    sceneId: input.traceDocument.sceneId,
    sceneSummary: input.traceDocument.sceneSummary,
    totalExecutionTimeMs,
    totalEstimatedCostUsd,
    traceDocument: input.traceDocument,
    reportAdapterResult: input.reportAdapterResult ?? null,
    nodes,
    html: "",
    json: "",
  };
  const finalized = Object.freeze({
    ...dashboard,
    html: renderDashboardHtml(dashboard),
    json: "",
  });
  const json = JSON.stringify(finalized, null, 2);
  return Object.freeze({
    ...finalized,
    json: `${json}\n`,
  });
}
