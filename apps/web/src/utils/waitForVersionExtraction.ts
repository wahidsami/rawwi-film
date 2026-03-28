import { scriptsApi } from '@/api';
import type { ScriptVersion } from '@/api/models';

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForVersionExtraction(
  scriptId: string,
  versionId: string,
  options?: { timeoutMs?: number; intervalMs?: number },
): Promise<ScriptVersion> {
  const timeoutMs = Math.max(10_000, options?.timeoutMs ?? 180_000);
  const intervalMs = Math.max(500, options?.intervalMs ?? 2_000);
  const startedAt = Date.now();

  while (Date.now() - startedAt <= timeoutMs) {
    const versions = await scriptsApi.getScriptVersions(scriptId);
    const version = versions.find((row) => row.id === versionId);
    if (!version) {
      throw new Error('Version not found while waiting for extraction');
    }
    if (version.extraction_status === 'done') return version;
    if (version.extraction_status === 'failed') {
      throw new Error('Document extraction failed');
    }
    await delay(intervalMs);
  }

  throw new Error('Document extraction timed out');
}

