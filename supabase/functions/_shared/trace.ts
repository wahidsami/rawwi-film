type TraceMeta = Record<string, unknown>;

export async function traceEdgeStep<T>(
  scope: string,
  step: string,
  meta: TraceMeta,
  operation: () => Promise<T>,
): Promise<T> {
  const startedAt = Date.now();
  console.log(`${scope} ENTER ${step}`, meta);
  try {
    const result = await operation();
    console.log(`${scope} EXIT ${step}`, {
      ...meta,
      elapsedMs: Date.now() - startedAt,
    });
    return result;
  } catch (error) {
    console.error(`${scope} ERROR ${step}`, {
      ...meta,
      elapsedMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
