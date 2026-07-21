import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Basic logger with optional correlationId / jobId / chunkId context.
 *
 * The worker processes multiple chunks in parallel, so a single mutable global
 * context can leak chunk IDs between concurrent async flows. AsyncLocalStorage
 * keeps each chunk's log prefix isolated while preserving the existing API.
 */
type Context = { correlationId?: string; jobId?: string; chunkId?: string };

const contextStorage = new AsyncLocalStorage<Context>();
let fallbackContext: Context = {};

function getContext(): Context {
  return contextStorage.getStore() ?? fallbackContext;
}

export function setContext(ctx: Partial<Context>) {
  const next = { ...getContext(), ...ctx };
  fallbackContext = next;
  contextStorage.enterWith(next);
}

export function clearContext() {
  fallbackContext = {};
  contextStorage.enterWith({});
}

function prefix(): string {
  const context = getContext();
  const parts: string[] = [];
  if (context.correlationId) parts.push(`correlationId=${context.correlationId}`);
  if (context.jobId) parts.push(`jobId=${context.jobId}`);
  if (context.chunkId) parts.push(`chunkId=${context.chunkId}`);
  return parts.length ? `[${parts.join(" ")}] ` : "";
}

function isErrorLike(value: unknown): value is Error | (Record<string, unknown> & { name?: unknown; message?: unknown; stack?: unknown; cause?: unknown; code?: unknown }) {
  if (!value || typeof value !== "object") return false;
  if (value instanceof Error) return true;
  const record = value as Record<string, unknown>;
  return "message" in record || "stack" in record || "cause" in record || "code" in record || "name" in record;
}

function serializeErrorLike(error: Error | (Record<string, unknown> & { name?: unknown; message?: unknown; stack?: unknown; cause?: unknown; code?: unknown }), seen: WeakSet<object>): Record<string, unknown> {
  const errorObject = error as Record<string, unknown>;
  const serializedError: Record<string, unknown> = {};
  for (const key of Object.keys(errorObject)) {
    if (key === "name" || key === "message" || key === "stack" || key === "cause" || key === "code") continue;
    serializedError[key] = normalizeLogValue(errorObject[key], seen);
  }

  const code = typeof errorObject.code === "string" ? errorObject.code : null;
  return {
    name: typeof errorObject.name === "string" && errorObject.name.length > 0 ? errorObject.name : "Error",
    message: typeof errorObject.message === "string" ? errorObject.message : String(errorObject.message ?? ""),
    stack: typeof errorObject.stack === "string" && errorObject.stack.length > 0 ? errorObject.stack : null,
    code,
    cause: "cause" in errorObject ? normalizeLogValue(errorObject.cause, seen) : null,
    serializedError,
  };
}

function normalizeLogValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return value;
  }
  if (typeof value === "function") return "[Function]";
  if (typeof value === "symbol") return value.toString();
  if (isErrorLike(value)) {
    return serializeErrorLike(value, seen);
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeLogValue(item, seen));
  }
  if (typeof value === "object") {
    if (seen.has(value)) return "[Circular]";
    seen.add(value);
    const record: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      record[key] = normalizeLogValue(entry, seen);
    }
    return record;
  }
  return String(value);
}

export const logger = {
  info(msg: string, ...args: unknown[]) {
    console.log(prefix() + msg, ...args.map((arg) => normalizeLogValue(arg)));
  },
  warn(msg: string, ...args: unknown[]) {
    console.warn(prefix() + msg, ...args.map((arg) => normalizeLogValue(arg)));
  },
  error(msg: string, ...args: unknown[]) {
    console.error(prefix() + msg, ...args.map((arg) => normalizeLogValue(arg)));
  },
};
