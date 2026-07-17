import type { V3ProviderCallJudgeRawInput } from "./providerTypes.js";

const SENSITIVE_KEY_PATTERNS = [
  /authorization/i,
  /proxy-authorization/i,
  /api[_-]?key/i,
  /x-api-key/i,
  /access[_-]?token/i,
  /refresh[_-]?token/i,
  /client[_-]?secret/i,
  /secret/i,
  /password/i,
  /cookie/i,
  /set-cookie/i,
];

export type V3ProviderErrorDetails = Readonly<{
  name: string;
  message: string;
  stack: string | null;
  httpStatus: number | null;
  type: string | null;
  code: string | null;
  param: string | null;
  requestId: string | null;
  modelName: string;
  maxTokens: number | null;
  promptTokenEstimate: number | null;
  retryAttempt: number | null;
  serializedError: Record<string, unknown>;
}>;

export type V3ProviderErrorCarrier = Readonly<{
  v3ProviderError?: V3ProviderErrorDetails | null;
}>;

export function extractV3ProviderError(error: unknown): V3ProviderErrorDetails | null {
  return isV3ProviderErrorCarrier(error) ? (error.v3ProviderError ?? null) : null;
}

export function attachV3ProviderError<T extends Error>(error: T, providerError: V3ProviderErrorDetails): T {
  Object.defineProperty(error, "v3ProviderError", {
    value: providerError,
    enumerable: false,
    configurable: true,
    writable: true,
  });
  return error;
}

export function createV3ProviderErrorDetails(
  error: unknown,
  context: Pick<V3ProviderCallJudgeRawInput, "modelName" | "maxTokens" | "promptTokenEstimate" | "retryAttempt">,
): V3ProviderErrorDetails {
  const serializedError = serializeUnknownValue(error) as Record<string, unknown>;
  const errorObject = toObjectRecord(error);
  const nestedErrorObject = toObjectRecord(errorObject.error);
  const responseObject = toObjectRecord(errorObject.response);
  const responseHeaders = toObjectRecord(responseObject.headers);

  return Object.freeze({
    name: getString(errorObject.name) ?? (error instanceof Error ? error.name : "Error"),
    message: getString(errorObject.message) ?? (error instanceof Error ? error.message : String(error)),
    stack: getString(errorObject.stack) ?? (error instanceof Error ? error.stack ?? null : null),
    httpStatus: getNumber(errorObject.status) ?? getNumber(errorObject.statusCode) ?? getNumber(errorObject.httpStatus) ?? getNumber(responseObject.status),
    type: getString(errorObject.type) ?? getString(nestedErrorObject.type),
    code: getString(errorObject.code) ?? getString(nestedErrorObject.code),
    param: getString(errorObject.param) ?? getString(nestedErrorObject.param),
    requestId: getString(errorObject.request_id) ?? getString(errorObject.requestId) ?? getString(responseHeaders["x-request-id"]) ?? null,
    modelName: context.modelName,
    maxTokens: typeof context.maxTokens === "number" && Number.isFinite(context.maxTokens) ? context.maxTokens : null,
    promptTokenEstimate:
      typeof context.promptTokenEstimate === "number" && Number.isFinite(context.promptTokenEstimate)
        ? context.promptTokenEstimate
        : null,
    retryAttempt:
      typeof context.retryAttempt === "number" && Number.isFinite(context.retryAttempt)
        ? context.retryAttempt
        : null,
    serializedError,
  });
}

function isV3ProviderErrorCarrier(value: unknown): value is V3ProviderErrorCarrier {
  return Boolean(value && typeof value === "object" && "v3ProviderError" in value);
}

function toObjectRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") return {};
  return value as Record<string, unknown>;
}

function getString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function getNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

function serializeUnknownValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "bigint") return value.toString();
  if (typeof value === "undefined") return null;
  if (typeof value === "function") return "[Function]";
  if (typeof value === "symbol") return value.toString();

  if (Array.isArray(value)) {
    return value.map((item) => serializeUnknownValue(item, seen));
  }

  if (value instanceof Error) {
    const errorObject: Record<string, unknown> = {
      name: value.name,
      message: value.message,
      stack: value.stack ?? null,
    };

    for (const key of Object.keys(value)) {
      if (isSensitiveKey(key)) {
        errorObject[key] = "[REDACTED]";
      } else {
      errorObject[key] = serializeUnknownValue((value as unknown as Record<string, unknown>)[key], seen);
      }
    }

    return errorObject;
  }

  if (typeof value === "object") {
    if (seen.has(value)) return "[Circular]";
    seen.add(value);

    const record: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>)) {
      if (isSensitiveKey(key)) {
        record[key] = "[REDACTED]";
        continue;
      }
      record[key] = serializeUnknownValue((value as Record<string, unknown>)[key], seen);
    }
    return record;
  }

  return String(value);
}
