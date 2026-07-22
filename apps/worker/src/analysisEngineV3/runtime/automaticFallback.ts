import { logger } from "../../logger.js";
import { extractV3ProviderError, type V3ProviderErrorDetails } from "../provider/providerError.js";
import { classifyV3AnalysisFailure } from "../provider/analysisFailure.js";

export type V3AutomaticFallbackDiagnostics = Readonly<{
  engineAttempted: "v3";
  engineUsed: "v2_fallback";
  fallbackReason: string;
  exceptionStack: string | null;
  providerError: V3ProviderErrorDetails | null;
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
  const startedAt = Date.now();
  logger.info("V3 instrumentation ENTER: runWithV3AutomaticFallback", {});
  try {
    logger.info("V3 instrumentation ENTER: runPrimary", {});
    const primaryResult = await input.runPrimary();
    logger.info("V3 instrumentation EXIT: runPrimary", {
      durationMs: Date.now() - startedAt,
    });
    return primaryResult;
  } catch (error) {
    if (!input.enabled) throw error;
    if (classifyV3AnalysisFailure(error)) {
      logger.warn("V3 automatic fallback skipped for AI failure", {
        fallbackReason: error instanceof Error ? error.message : String(error),
        providerError: extractV3ProviderError(error),
      });
      throw error;
    }

    const diagnostics: V3AutomaticFallbackDiagnostics = {
      engineAttempted: "v3",
      engineUsed: "v2_fallback",
      fallbackReason: toFailureMessage(error),
      exceptionStack: toFailureStack(error),
      providerError: extractV3ProviderError(error),
    };

    if (input.onFallback) {
      try {
        logger.info("V3 instrumentation ENTER: onFallback", {
          fallbackReason: diagnostics.fallbackReason,
        });
        await input.onFallback(diagnostics);
        logger.info("V3 instrumentation EXIT: onFallback", {
          durationMs: Date.now() - startedAt,
        });
      } catch {
        // The fallback handler is observability-only; the V2 recovery path must still execute.
      }
    }

    logger.info("V3 instrumentation ENTER: runFallback", {
      fallbackReason: diagnostics.fallbackReason,
    });
    const fallbackResult = await input.runFallback(diagnostics);
    logger.info("V3 instrumentation EXIT: runFallback", {
      durationMs: Date.now() - startedAt,
    });
    return fallbackResult;
  }
}
