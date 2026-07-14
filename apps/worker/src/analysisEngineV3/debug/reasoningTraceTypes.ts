import type { V3RuntimeFinding } from "../runtime/runtimeTypes.js";

export type V3ReasoningTraceStageName =
  | "detected_concepts"
  | "detected_targets"
  | "detected_actions"
  | "detected_context"
  | "detected_intent"
  | "supporting_evidence"
  | "contradicting_evidence"
  | "reviewer_questions"
  | "confidence_evolution"
  | "applicable_pattern_libraries"
  | "applicable_lessons"
  | "applicable_knowledge_packs"
  | "candidate_gcam_mappings"
  | "final_reviewer_decision";

export type V3ReasoningTraceStage = Readonly<{
  stage: V3ReasoningTraceStageName;
  title: string;
  items: readonly string[];
  confidence: number;
}>;

export type V3ReasoningTrace = Readonly<{
  findingIndex: number;
  findingId: string;
  articleId: number;
  atomId: string | null;
  category: string;
  stages: readonly V3ReasoningTraceStage[];
  hash: string;
}>;

export type V3ReasoningTraceFinding = V3RuntimeFinding & Readonly<{
  category?: string | null;
}>;
