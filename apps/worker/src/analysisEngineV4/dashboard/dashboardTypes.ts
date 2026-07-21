import type { V4ReportAdapterResult } from "../report/reportAdapter.js";
import type { SceneAnalysisTraceDocument, SceneAnalysisTraceDocumentStep } from "../sceneAnalysisTraceViewer.js";

export type CognitiveDashboardNodeId =
  | "understand_scene"
  | "interpret_scene"
  | "candidate_evidence"
  | "concept_classification"
  | "legal_mapping"
  | "explanation"
  | "quality_judge"
  | "report";

export type CognitiveDashboardReplay = Readonly<{
  startingNode: string | null;
  startingNodeIndex: number;
  nodeExecutionOrder: readonly string[];
  remainingNodeExecutionOrder: readonly string[];
  startingView: Readonly<Record<string, unknown>> | null;
}>;

export type CognitiveDashboardNode = Readonly<{
  nodeId: CognitiveDashboardNodeId;
  title: string;
  inputs: Readonly<Record<string, unknown>>;
  outputs: Readonly<Record<string, unknown>>;
  executionTimeMs: number;
  confidence: number | null;
  costUsd: number | null;
  trace: SceneAnalysisTraceDocumentStep | null;
  replay: CognitiveDashboardReplay | null;
  errors: readonly string[];
}>;

export type CognitiveDashboard = Readonly<{
  sceneId: string;
  sceneSummary: string;
  totalExecutionTimeMs: number;
  totalEstimatedCostUsd: number | null;
  traceDocument: SceneAnalysisTraceDocument;
  reportAdapterResult: V4ReportAdapterResult | null;
  nodes: readonly CognitiveDashboardNode[];
  html: string;
  json: string;
}>;

export type CognitiveDashboardInput = Readonly<{
  traceDocument: SceneAnalysisTraceDocument;
  reportAdapterResult?: V4ReportAdapterResult | null;
  estimatedCostUsd?: number | null;
}>;

