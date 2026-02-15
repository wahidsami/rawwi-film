/**
 * Basic logger with optional correlationId / jobId / chunkId context.
 */
type Context = { correlationId?: string; jobId?: string; chunkId?: string };

let context: Context = {};

export function setContext(ctx: Partial<Context>) {
  context = { ...context, ...ctx };
}

export function clearContext() {
  context = {};
}

function prefix(): string {
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
