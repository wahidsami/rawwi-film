export async function fetchCurrentJobReport<TReport extends { id: string; jobId: string }>(
  jobId: string,
  fetcher: (jobId: string) => Promise<TReport>,
): Promise<TReport> {
  if (!jobId || String(jobId).trim() === '') {
    throw new Error('jobId required for current analysis report');
  }

  const trimmedJobId = String(jobId).trim();
  console.info('[Report] current-job lookup started', { jobId: trimmedJobId });
  const report = await fetcher(trimmedJobId);
  console.info('[Report] current-job lookup completed', {
    jobId: trimmedJobId,
    reportId: report.id,
    reportJobId: report.jobId,
  });

  if (report.jobId !== trimmedJobId) {
    throw new Error(`Report/job mismatch: expected ${trimmedJobId}, received ${report.jobId}`);
  }

  return report;
}
