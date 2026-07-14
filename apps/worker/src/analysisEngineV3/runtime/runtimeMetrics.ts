let v3FallbackExecutionCount = 0;

export function recordV3FallbackExecution(): number {
  v3FallbackExecutionCount += 1;
  return v3FallbackExecutionCount;
}

export function getV3FallbackExecutionCount(): number {
  return v3FallbackExecutionCount;
}

export function resetV3FallbackExecutionCount(): void {
  v3FallbackExecutionCount = 0;
}
