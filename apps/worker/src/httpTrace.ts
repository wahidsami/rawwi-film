import { logger } from "./logger.js";

const FETCH_TRACE_PATCH_FLAG = Symbol.for("raawi.worker.httpTrace.patchInstalled");
const ORIGINAL_FETCH_FLAG = Symbol.for("raawi.worker.httpTrace.originalFetch");
const PREVIEW_CHAR_LIMIT = 200;

type FetchLike = typeof fetch;

function getCallerFunction(stack?: string | null): string | null {
  if (!stack) return null;
  const lines = stack.split("\n").map((line) => line.trim()).filter(Boolean);
  for (const line of lines.slice(1)) {
    if (/httpTrace|tracedFetch|traceFetchRequest|Object\.fetch|node:internal|internal\/|processTicksAndRejections/i.test(line)) {
      continue;
    }
    const match = line.match(/^at\s+(.*?)\s+\(/i) ?? line.match(/^at\s+(.*)$/i);
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

function getRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  if (typeof Request !== "undefined" && input instanceof Request) return input.url;
  return String(input);
}

function getRequestMethod(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) return init.method.toUpperCase();
  if (typeof Request !== "undefined" && input instanceof Request) return input.method.toUpperCase();
  return "GET";
}

async function readPreview(response: Response): Promise<string | null> {
  const clone = response.clone();
  if (!clone.body) {
    try {
      const text = await clone.text();
      return text.slice(0, PREVIEW_CHAR_LIMIT);
    } catch {
      return null;
    }
  }

  const reader = clone.body.getReader();
  const decoder = new TextDecoder();
  let preview = "";
  try {
    while (preview.length < PREVIEW_CHAR_LIMIT) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) {
        preview += decoder.decode(value, { stream: true });
      }
    }
    preview += decoder.decode();
  } catch {
    return null;
  } finally {
    try {
      await reader.cancel();
    } catch {
      /* ignore */
    }
  }
  return preview.slice(0, PREVIEW_CHAR_LIMIT);
}

async function traceFetchResponse(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  response: Response,
  callerFunction: string | null,
): Promise<void> {
  const url = getRequestUrl(input);
  const method = getRequestMethod(input, init);
  const contentType = response.headers.get("content-type") ?? null;
  const isJson = Boolean(contentType && /(^|[+/])json\b/i.test(contentType));

  if (!isJson) {
    const preview = await readPreview(response);
    logger.info("[HTTP TRACE] response", {
      url,
      method,
      status: response.status,
      ok: response.ok,
      contentType,
      callerFunction,
      nonJsonPreview: preview,
    });
    return;
  }

  logger.info("[HTTP TRACE] response", {
    url,
    method,
    status: response.status,
    ok: response.ok,
    contentType,
    callerFunction,
  });
}

export function installHttpTrace(): void {
  if ((globalThis as typeof globalThis & { [FETCH_TRACE_PATCH_FLAG]?: boolean })[FETCH_TRACE_PATCH_FLAG]) {
    return;
  }

  const originalFetch = globalThis.fetch.bind(globalThis) as FetchLike;
  (globalThis as typeof globalThis & { [FETCH_TRACE_PATCH_FLAG]?: boolean; [ORIGINAL_FETCH_FLAG]?: FetchLike })[FETCH_TRACE_PATCH_FLAG] = true;
  (globalThis as typeof globalThis & { [FETCH_TRACE_PATCH_FLAG]?: boolean; [ORIGINAL_FETCH_FLAG]?: FetchLike })[ORIGINAL_FETCH_FLAG] = originalFetch;

  const tracedFetch: FetchLike = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = getRequestUrl(input);
    const method = getRequestMethod(input, init);
    const callerFunction = getCallerFunction(new Error().stack ?? null);

    logger.info("[HTTP TRACE] request", {
      url,
      method,
      callerFunction,
    });

    try {
      const response = await originalFetch(input as Parameters<FetchLike>[0], init as Parameters<FetchLike>[1]);
      void traceFetchResponse(input, init, response, callerFunction).catch((error) => {
        logger.warn("[HTTP TRACE] response logging failed", {
          url,
          method,
          callerFunction,
          error: error instanceof Error ? error.message : String(error),
        });
      });
      return response;
    } catch (error) {
      logger.error("[HTTP TRACE] request failed", {
        url,
        method,
        callerFunction,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack ?? null : null,
      });
      throw error;
    }
  }) as FetchLike;

  globalThis.fetch = tracedFetch;
}
