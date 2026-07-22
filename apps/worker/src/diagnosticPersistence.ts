import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { config } from "./config.js";
import { logger } from "./logger.js";

export const DEVELOPER_DIAGNOSTIC_TABLES = Object.freeze([
  "analysis_judge_diagnostics",
  "analysis_runtime_traces",
  "analysis_v3_inspection",
  "analysis_prompt_replays",
  "analysis_engine_evaluations",
  "analysis_memory_traces",
  "analysis_finding_lineage_events",
] as const);

export type DeveloperDiagnosticTable = typeof DEVELOPER_DIAGNOSTIC_TABLES[number];
export type AppMode = "development" | "production";

export type RuntimeDiagnosticArtifactEntry = Readonly<{
  tableName: DeveloperDiagnosticTable;
  operation: "insert" | "upsert";
  createdAt: string;
  payload: unknown;
  metadata: Readonly<Record<string, unknown>>;
}>;

export type RuntimeDiagnosticArtifactBundle = Readonly<{
  jobId: string;
  appMode: AppMode;
  exportedAt: string;
  artifactCount: number;
  entries: readonly RuntimeDiagnosticArtifactEntry[];
}>;

const runtimeDiagnosticArtifactStore = new Map<string, RuntimeDiagnosticArtifactEntry[]>();

function cloneSerializable<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (typeof globalThis.structuredClone === "function") {
    return globalThis.structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

export function isDevelopmentMode(mode: AppMode = config.APP_MODE): boolean {
  return mode === "development";
}

export function shouldPersistDeveloperDiagnostic(
  tableName: DeveloperDiagnosticTable,
  mode: AppMode = config.APP_MODE,
): boolean {
  return isDevelopmentMode(mode) && DEVELOPER_DIAGNOSTIC_TABLES.includes(tableName);
}

export function recordRuntimeDiagnosticArtifact(
  jobId: string,
  entry: Omit<RuntimeDiagnosticArtifactEntry, "createdAt"> & { createdAt?: string },
): void {
  const createdAt = typeof entry.createdAt === "string" && entry.createdAt.trim().length > 0
    ? entry.createdAt
    : new Date().toISOString();
  const record: RuntimeDiagnosticArtifactEntry = Object.freeze({
    tableName: entry.tableName,
    operation: entry.operation,
    createdAt,
    payload: cloneSerializable(entry.payload),
    metadata: Object.freeze(cloneSerializable(entry.metadata)),
  });
  const bucket = runtimeDiagnosticArtifactStore.get(jobId) ?? [];
  bucket.push(record);
  runtimeDiagnosticArtifactStore.set(jobId, bucket);
}

export function getRuntimeDiagnosticArtifacts(jobId: string): readonly RuntimeDiagnosticArtifactEntry[] {
  return Object.freeze([...(runtimeDiagnosticArtifactStore.get(jobId) ?? [])]);
}

export function clearRuntimeDiagnosticArtifacts(jobId: string): void {
  runtimeDiagnosticArtifactStore.delete(jobId);
}

export function buildRuntimeDiagnosticArtifactBundle(jobId: string): RuntimeDiagnosticArtifactBundle {
  const entries = getRuntimeDiagnosticArtifacts(jobId);
  return Object.freeze({
    jobId,
    appMode: config.APP_MODE,
    exportedAt: new Date().toISOString(),
    artifactCount: entries.length,
    entries,
  });
}

export async function exportRuntimeDiagnosticArtifact(jobId: string): Promise<string | null> {
  const bundle = buildRuntimeDiagnosticArtifactBundle(jobId);
  if (bundle.artifactCount === 0) {
    clearRuntimeDiagnosticArtifacts(jobId);
    return null;
  }

  if (!config.EXPORT_RUNTIME_ARTIFACT) {
    clearRuntimeDiagnosticArtifacts(jobId);
    return null;
  }

  const json = JSON.stringify(bundle);
  const compressed = gzipSync(Buffer.from(json, "utf8"));
  const objectPath = `runtime-diagnostics/${jobId}/${Date.now()}-${createHash("sha256").update(json).digest("hex").slice(0, 16)}.json.gz`;

  try {
    const { supabase } = await import("./db.js");
    const { error } = await supabase.storage.from("uploads").upload(objectPath, compressed, {
      contentType: "application/gzip",
      upsert: true,
    });
    if (error) {
      const storageError = error as { message?: string; code?: string; details?: string; hint?: string };
      logger.warn("Failed to export runtime diagnostics artifact", {
        jobId,
        objectPath,
        error: storageError.message ?? "unknown_error",
        errorCode: storageError.code ?? null,
        errorDetails: storageError.details ?? null,
        errorHint: storageError.hint ?? null,
      });
      return null;
    }

    logger.info("Runtime diagnostics artifact exported", {
      jobId,
      objectPath,
      artifactCount: bundle.artifactCount,
    });
    return objectPath;
  } catch (error) {
    logger.warn("Failed to export runtime diagnostics artifact", {
      jobId,
      objectPath,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack ?? null : null,
    });
    return null;
  } finally {
    clearRuntimeDiagnosticArtifacts(jobId);
  }
}
