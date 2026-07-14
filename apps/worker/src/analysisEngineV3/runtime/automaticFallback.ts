export type V3AutomaticFallbackDiagnostics = Readonly<{
  engineAttempted: "v3";
  engineUsed: "v2_fallback";
  fallbackReason: string;
  exceptionStack: string | null;
}>;

export type V3AutomaticFallbackInput<T> = Readonly<{
  enabled: boolean;
  runPrimary: () => Promise<T>;
  runFallback: (diagnostics: V3AutomaticFallbackDiagnostics) => Promise<T>;
  onFallback?: (diagnostics: V3AutomaticFallbackDiagnostics) => Promise<void> | void;
}>;

function toFailureMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function toFailureStack(error: unknown): string | null {
  return error instanceof Error ? error.stack ?? null : null;
}

export async function runWithV3AutomaticFallback<T>(input: V3AutomaticFallbackInput<T>): Promise<T> {
  try {
    return await input.runPrimary();
  } catch (error) {
    if (!input.enabled) throw error;

    const diagnostics: V3AutomaticFallbackDiagnostics = {
      engineAttempted: "v3",
      engineUsed: "v2_fallback",
      fallbackReason: toFailureMessage(error),
      exceptionStack: toFailureStack(error),
    };

    if (input.onFallback) {
      try {
        await input.onFallback(diagnostics);
      } catch {
        // The fallback handler is observability-only; the V2 recovery path must still execute.
      }
    }

    return input.runFallback(diagnostics);
  }
}
