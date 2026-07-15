export const V3_INSPECTION_STAGE_ORDER = [
  1,
  2,
  3,
  4,
  5,
  6,
  7,
  8,
  9,
  10,
  11,
] as const;

export type V3InspectionStageOrder = (typeof V3_INSPECTION_STAGE_ORDER)[number];

export const V3_INSPECTION_STAGE_NAMES = Object.freeze({
  1: "semantic_generation",
  2: "knowledge_matching",
  3: "legal_review",
  4: "finding_mapper",
  5: "persistence",
  6: "aggregation",
  7: "final_report",
  8: "knowledge_registry",
  9: "knowledge_ranking",
  10: "reviewer_debate",
  11: "arbitration",
} as const);

export type V3InspectionStageName = (typeof V3_INSPECTION_STAGE_NAMES)[V3InspectionStageOrder];

export type V3InspectionRecordInput = Readonly<{
  jobId: string;
  chunkId: string | null;
  findingKey: string;
  stageOrder: V3InspectionStageOrder;
  stageName: V3InspectionStageName;
  payloadJson: Record<string, unknown>;
  createdAt?: string | null;
}>;

export type V3InspectionRecord = Readonly<{
  id?: string;
  jobId: string;
  chunkId: string | null;
  findingKey: string;
  stageOrder: V3InspectionStageOrder;
  stageName: V3InspectionStageName;
  payloadJson: Readonly<Record<string, unknown>>;
  createdAt: string;
}>;

export type V3InspectionTimelineFinding = Readonly<{
  findingKey: string;
  records: readonly V3InspectionRecord[];
}>;

export type V3InspectionTimeline = Readonly<{
  jobId: string;
  records: readonly V3InspectionRecord[];
  findings: readonly V3InspectionTimelineFinding[];
}>;
