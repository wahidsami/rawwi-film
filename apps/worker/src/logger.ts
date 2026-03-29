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

export const logger = {
  info(msg: string, ...args: unknown[]) {
    console.log(prefix() + msg, ...args);
  },
  warn(msg: string, ...args: unknown[]) {
    console.warn(prefix() + msg, ...args);
  },
  error(msg: string, ...args: unknown[]) {
    console.error(prefix() + msg, ...args);
  },
};
