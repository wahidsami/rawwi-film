import { scriptsApi } from '@/api';
import type { ScriptVersion } from '@/api/models';

export const PDF_EXTRACTION_TIMEOUT_MS = 20 * 60 * 1000;
export const PDF_EXTRACTION_INTERVAL_MS = 2_500;

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function createAbortError(): Error {
  const error = new Error('Document extraction was aborted');
  error.name = 'AbortError';
  return error;
}

export async function waitForVersionExtraction(
  scriptId: string,
  versionId: string,
  options?: { timeoutMs?: number; intervalMs?: number; signal?: AbortSignal },
): Promise<ScriptVersion> {
  const timeoutMs = Math.max(10_000, options?.timeoutMs ?? 180_000);
  const intervalMs = Math.max(500, options?.intervalMs ?? 2_000);
  const startedAt = Date.now();

  while (Date.now() - startedAt <= timeoutMs) {
    if (options?.signal?.aborted) throw createAbortError();
    const versions = await scriptsApi.getScriptVersions(scriptId, { signal: options?.signal });
    const version = versions.find((row) => row.id === versionId);
    if (!version) {
      throw new Error('Version not found while waiting for extraction');
    }
    if (version.extraction_status === 'done') return version;
    if (version.extraction_status === 'cancelled') {
      throw createAbortError();
    }
    if (version.extraction_status === 'failed') {
      throw new Error('Document extraction failed');
    }
    if (options?.signal?.aborted) throw createAbortError();
    await delay(intervalMs);
  }

  if (options?.signal?.aborted) throw createAbortError();
  throw new Error('Document extraction timed out');
}
