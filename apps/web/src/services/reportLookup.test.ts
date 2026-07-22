import assert from 'node:assert/strict';

import { fetchCurrentJobReport } from './reportLookup.ts';

async function testCurrentJobLookupIsStrict() {
  const calls: string[] = [];

  const goodReport = await fetchCurrentJobReport('job-123', async (jobId) => {
    calls.push(`fetch:${jobId}`);
    return { id: 'report-1', jobId, reportGenerationId: 'gen-1' };
  }, { analysisGenerationId: 'gen-1' });

  assert.equal(goodReport.jobId, 'job-123');
  assert.deepEqual(calls, ['fetch:job-123']);

  calls.length = 0;
  await assert.rejects(() => fetchCurrentJobReport('', async () => ({ id: 'report-x', jobId: 'job-x' })), /jobId required/i);
  assert.deepEqual(calls, []);

  calls.length = 0;
  await assert.rejects(
    () =>
      fetchCurrentJobReport('job-123', async () => {
        calls.push('fetch:mismatch');
        return { id: 'report-2', jobId: 'other-job', reportGenerationId: 'gen-2' };
      }),
    /Report\/job mismatch/i,
  );
  assert.deepEqual(calls, ['fetch:mismatch']);

  await assert.rejects(
    () =>
      fetchCurrentJobReport(
        'job-123',
        async () => ({ id: 'report-3', jobId: 'job-123', reportGenerationId: 'gen-2' }),
        { analysisGenerationId: 'gen-1' },
      ),
    /Report generation mismatch/i,
  );
}

async function main() {
  await testCurrentJobLookupIsStrict();
  console.log('reportLookup current-job lookup tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
