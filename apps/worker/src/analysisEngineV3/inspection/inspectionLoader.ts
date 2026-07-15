import { supabase } from "../../db.js";
import type { V3InspectionRecord, V3InspectionTimeline, V3InspectionTimelineFinding } from "./inspectionTypes.js";

function normalizeRecord(record: Record<string, unknown>): V3InspectionRecord {
  return Object.freeze({
    id: typeof record.id === "string" ? record.id : undefined,
    jobId: String(record.job_id ?? ""),
    chunkId: record.chunk_id == null ? null : String(record.chunk_id),
    findingKey: String(record.finding_key ?? ""),
    stageOrder: Number(record.stage_order) as V3InspectionRecord["stageOrder"],
    stageName: String(record.stage_name) as V3InspectionRecord["stageName"],
    payloadJson: Object.freeze((record.payload_json as Record<string, unknown>) ?? {}),
    createdAt: typeof record.created_at === "string" ? record.created_at : new Date(0).toISOString(),
  });
}

export function sortV3InspectionRecords(records: readonly V3InspectionRecord[]): readonly V3InspectionRecord[] {
  return Object.freeze([...records].sort((left, right) =>
    left.findingKey.localeCompare(right.findingKey, "en") ||
    left.stageOrder - right.stageOrder ||
    left.createdAt.localeCompare(right.createdAt, "en") ||
    left.stageName.localeCompare(right.stageName, "en"),
  ));
}

export function groupV3InspectionRecords(records: readonly V3InspectionRecord[]): readonly V3InspectionTimelineFinding[] {
  const grouped = new Map<string, V3InspectionRecord[]>();
  for (const record of records) {
    if (!grouped.has(record.findingKey)) grouped.set(record.findingKey, []);
    grouped.get(record.findingKey)!.push(record);
  }

  return Object.freeze(
    [...grouped.entries()]
      .map(([findingKey, findingRecords]) => Object.freeze({
        findingKey,
        records: sortV3InspectionRecords(findingRecords),
      }))
      .sort((left, right) => left.findingKey.localeCompare(right.findingKey, "en")),
  );
}

export function buildV3InspectionTimeline(jobId: string, records: readonly V3InspectionRecord[]): V3InspectionTimeline {
  const ordered = sortV3InspectionRecords(records);
  return Object.freeze({
    jobId,
    records: ordered,
    findings: groupV3InspectionRecords(ordered),
  });
}

export async function loadV3InspectionRecordsByJobId(jobId: string): Promise<readonly V3InspectionRecord[]> {
  const { data, error } = await supabase
    .from("analysis_v3_inspection")
    .select("id, job_id, chunk_id, finding_key, stage_name, stage_order, payload_json, created_at")
    .eq("job_id", jobId)
    .order("finding_key", { ascending: true })
    .order("stage_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  return Object.freeze((data ?? []).map((record) => normalizeRecord(record as Record<string, unknown>)));
}

export async function loadV3InspectionTimelineByJobId(jobId: string): Promise<V3InspectionTimeline> {
  const records = await loadV3InspectionRecordsByJobId(jobId);
  return buildV3InspectionTimeline(jobId, records);
}
