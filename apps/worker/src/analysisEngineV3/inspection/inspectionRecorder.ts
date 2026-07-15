import { supabase } from "../../db.js";
import { config } from "../../config.js";
import { logger } from "../../logger.js";
import type { V3InspectionRecord, V3InspectionRecordInput } from "./inspectionTypes.js";

export type V3InspectionPersistence = (records: readonly V3InspectionRecord[]) => Promise<void>;

export type V3InspectionRecorder = Readonly<{
  isEnabled: () => boolean;
  recordStage: (record: V3InspectionRecordInput) => Promise<void>;
  recordStages: (records: readonly V3InspectionRecordInput[]) => Promise<void>;
}>;

function normalizeCreatedAt(value: string | null | undefined, fallback: () => string): string {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > 0 ? text : fallback();
}

async function persistInspectionRecords(records: readonly V3InspectionRecord[]): Promise<void> {
  const { error } = await supabase.from("analysis_v3_inspection").insert(
    records.map((record) => ({
      job_id: record.jobId,
      chunk_id: record.chunkId,
      finding_key: record.findingKey,
      stage_name: record.stageName,
      stage_order: record.stageOrder,
      payload_json: record.payloadJson,
      created_at: record.createdAt,
    })),
  );

  if (error) {
    throw error;
  }
}

export function createV3InspectionRecorder(deps?: Readonly<{
  enabled?: boolean;
  persist?: V3InspectionPersistence;
  now?: () => string;
}>): V3InspectionRecorder {
  const enabled = deps?.enabled ?? config.V3_INSPECTION_MODE;
  const persist = deps?.persist ?? persistInspectionRecords;
  const now = deps?.now ?? (() => new Date().toISOString());

  async function recordStages(records: readonly V3InspectionRecordInput[]): Promise<void> {
    if (!enabled || records.length === 0) return;

    const payload = records.map((record) => Object.freeze({
      jobId: record.jobId,
      chunkId: record.chunkId,
      findingKey: record.findingKey,
      stageOrder: record.stageOrder,
      stageName: record.stageName,
      payloadJson: Object.freeze({ ...record.payloadJson }),
      createdAt: normalizeCreatedAt(record.createdAt, now),
    }));

    try {
      await persist(payload);
    } catch (error) {
      logger.warn("V3 inspection record persist failed", {
        error: error instanceof Error ? error.message : String(error),
        recordCount: payload.length,
      });
    }
  }

  return Object.freeze({
    isEnabled: () => enabled,
    recordStage: async (record: V3InspectionRecordInput) => {
      await recordStages([record]);
    },
    recordStages: async (records: readonly V3InspectionRecordInput[]) => {
      await recordStages(records);
    },
  });
}

export const v3InspectionRecorder = createV3InspectionRecorder();
