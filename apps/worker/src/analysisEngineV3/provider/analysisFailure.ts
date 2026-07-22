import { extractV3ProviderError, type V3ProviderErrorDetails } from "./providerError.js";

export type V3AnalysisFailureCode =
  | "AI_PROVIDER_UNAVAILABLE"
  | "AI_QUOTA_EXCEEDED"
  | "AI_TIMEOUT"
  | "AI_INVALID_RESPONSE";

export type V3AnalysisFailureDetails = Readonly<{
  code: V3AnalysisFailureCode;
  reason: string;
  providerError: V3ProviderErrorDetails | null;
  parseErrors: readonly string[];
  zeroFindingsReason: string | null;
  validationIssues: readonly string[];
}>;

export type V3AnalysisFailureCarrier = Readonly<{
  v3AnalysisFailure?: V3AnalysisFailureDetails | null;
}>;

function normalizeMessage(value: unknown): string {
  return typeof value === "string" ? value.toLowerCase() : "";
}

export function attachV3AnalysisFailure<T extends Error>(error: T, failure: V3AnalysisFailureDetails): T {
  Object.defineProperty(error, "v3AnalysisFailure", {
    value: failure,
    enumerable: false,
    configurable: true,
    writable: true,
  });
  return error;
}

export function extractV3AnalysisFailure(error: unknown): V3AnalysisFailureDetails | null {
  return isV3AnalysisFailureCarrier(error) ? (error.v3AnalysisFailure ?? null) : null;
}

export function createV3AnalysisFailure(
  code: V3AnalysisFailureCode,
  reason: string,
  extras?: Partial<Omit<V3AnalysisFailureDetails, "code" | "reason">>,
): Error {
  const error = new Error(reason);
  error.name = code;
  return attachV3AnalysisFailure(error, {
    code,
    reason,
    providerError: extras?.providerError ?? null,
    parseErrors: extras?.parseErrors ?? [],
    zeroFindingsReason: extras?.zeroFindingsReason ?? null,
    validationIssues: extras?.validationIssues ?? [],
  });
}

export function classifyV3AnalysisFailure(error: unknown): V3AnalysisFailureDetails | null {
  const attachedFailure = extractV3AnalysisFailure(error);
  if (attachedFailure) return attachedFailure;

  const providerError = extractV3ProviderError(error);
  if (!providerError) return null;

  const message = normalizeMessage([
    providerError.name,
    providerError.message,
    providerError.type,
    providerError.code,
    providerError.httpStatus,
    providerError.requestId,
  ].filter((value) => value != null).join(" "));

  if (
    providerError.httpStatus === 429 ||
    /rate limit|quota|insufficient[_\s-]?quota|credit|billing|payment required|tokens per min|requests per min/.test(message)
  ) {
    return {
      code: "AI_QUOTA_EXCEEDED",
      reason: providerError.message,
      providerError,
      parseErrors: [],
      zeroFindingsReason: null,
      validationIssues: [],
    };
  }

  if (
    /timeout|timed out|etimedout|aborterror/.test(message) ||
    providerError.httpStatus === 408
  ) {
    return {
      code: "AI_TIMEOUT",
      reason: providerError.message,
      providerError,
      parseErrors: [],
      zeroFindingsReason: null,
      validationIssues: [],
    };
  }

  if (
    providerError.httpStatus === 500 ||
    providerError.httpStatus === 502 ||
    providerError.httpStatus === 503 ||
    providerError.httpStatus === 504 ||
    /unavailable|service unavailable|temporarily unavailable|overload|overloaded|fetch failed|socket hang up|connection error|network error|econnreset|enotfound|unauthorized|authentication|forbidden/.test(message)
  ) {
    return {
      code: "AI_PROVIDER_UNAVAILABLE",
      reason: providerError.message,
      providerError,
      parseErrors: [],
      zeroFindingsReason: null,
      validationIssues: [],
    };
  }

  return null;
}

export function isV3AnalysisFailure(error: unknown): boolean {
  return classifyV3AnalysisFailure(error) !== null;
}

function isV3AnalysisFailureCarrier(value: unknown): value is V3AnalysisFailureCarrier {
  return Boolean(value && typeof value === "object" && "v3AnalysisFailure" in value);
}
