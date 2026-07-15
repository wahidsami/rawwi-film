export function buildV3InspectionChunkFindingKey(jobId: string, chunkId: string): string {
  return `job:${jobId}:chunk:${chunkId}`;
}

export function buildV3InspectionJobFindingKey(jobId: string): string {
  return `job:${jobId}:summary`;
}
