export type TaskAnalysisEngine = "v2" | "v3" | "v4" | "shadow" | "hybrid" | "policy_v1";

function normalize(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

export function resolveRequestedAnalysisEngine(
  bodyAnalysisEngine: unknown,
  envAnalysisEngine: string | null | undefined,
): TaskAnalysisEngine {
  const normalizedEnv = normalize(envAnalysisEngine);
  if (normalizedEnv === "v3") return "v3";
  if (normalizedEnv === "v4") return "v4";
  if (normalizedEnv === "shadow") return "shadow";
  if (normalizedEnv === "policy_v1") return "policy_v1";
  if (normalizedEnv === "hybrid") return "hybrid";

  const requested = normalize(bodyAnalysisEngine);
  if (requested === "v3") return "v3";
  if (requested === "v4") return "v4";
  if (requested === "shadow") return "shadow";
  if (requested === "policy_v1") return "policy_v1";
  if (requested === "hybrid") return "hybrid";
  return "v2";
}

export function resolveRequestedPipelineVersion(
  bodyPipelineVersion: unknown,
  analysisMemoryMode: string,
  requestedAnalysisEngine: TaskAnalysisEngine,
  envPipelineVersion: string | null | undefined,
): "v1" | "v2" {
  const envDefaultPipelineVersion = normalize(envPipelineVersion) === "v1" ? "v1" : "v2";
  const engineDefaultPipelineVersion = requestedAnalysisEngine === "policy_v1" ? "v1" : envDefaultPipelineVersion;
  const defaultPipelineVersion = analysisMemoryMode === "memory2" ? "v2" : engineDefaultPipelineVersion;
  return bodyPipelineVersion === "v2" || bodyPipelineVersion === "v1"
    ? bodyPipelineVersion
    : defaultPipelineVersion;
}
