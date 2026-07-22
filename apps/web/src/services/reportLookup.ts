export async function fetchCurrentJobReport<TReport extends { id: string; jobId: string }>(
  jobId: string,
  fetcher: (jobId: string) => Promise<TReport>,
  options?: {
    analysisGenerationId?: string | null;
  },
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

  const expectedGenerationId = options?.analysisGenerationId?.trim() ?? "";
  if (expectedGenerationId) {
    const reportGenerationId = String(
      (report as { reportGenerationId?: string | null; analysisGenerationId?: string | null; summaryJson?: { analysis_meta?: { analysis_generation_id?: string | null; report_generation_id?: string | null } } }).reportGenerationId
      ?? (report as { reportGenerationId?: string | null; analysisGenerationId?: string | null; summaryJson?: { analysis_meta?: { analysis_generation_id?: string | null; report_generation_id?: string | null } } }).analysisGenerationId
      ?? (report as { summaryJson?: { analysis_meta?: { analysis_generation_id?: string | null; report_generation_id?: string | null } } }).summaryJson?.analysis_meta?.report_generation_id
      ?? (report as { summaryJson?: { analysis_meta?: { analysis_generation_id?: string | null; report_generation_id?: string | null } } }).summaryJson?.analysis_meta?.analysis_generation_id
      ?? ""
    ).trim();
    if (!reportGenerationId) {
      throw new Error(`Report generation mismatch: expected ${expectedGenerationId}, received empty generation id`);
    }
    if (reportGenerationId !== expectedGenerationId) {
      throw new Error(`Report generation mismatch: expected ${expectedGenerationId}, received ${reportGenerationId}`);
    }
  }

  return report;
}
