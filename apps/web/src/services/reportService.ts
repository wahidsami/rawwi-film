/**
 * Thin wrapper around reportsApi — used by Results page.
 * Re-exports the Report type from models for convenience.
 */
import { reportsApi } from '@/api';
import type { Report, ReportListItem } from '@/api/models';
import { fetchCurrentJobReport } from './reportLookup';

export type { Report as AnalysisReport } from '@/api/models';

export const reportService = {
  /** Fetch the report for the current job only. Never falls back to history. */
  async getReport(params: { jobId: string; analysisGenerationId?: string | null }): Promise<Report> {
    return fetchCurrentJobReport(
      params.jobId,
      (jobId) => reportsApi.getByJob(jobId),
      { analysisGenerationId: params.analysisGenerationId ?? null },
    );
  },

  /** Explicit history lookup: list reports for a script. */
  async getHistoryReports(scriptId: string | undefined): Promise<ReportListItem[]> {
    if (scriptId == null || String(scriptId).trim() === '') {
      return [];
    }
    const trimmed = String(scriptId).trim();
    console.info('[Report] history lookup started', { scriptId: trimmed });
    return reportsApi.listByScript(trimmed);
  },

  /** List reports for a script. Pass a valid scriptId; if missing, returns [] to avoid invalid API calls. */
  async listReports(scriptId: string | undefined): Promise<ReportListItem[]> {
    if (scriptId == null || String(scriptId).trim() === '') {
      return [];
    }
    return reportsApi.listByScript(scriptId);
  },

  /** List ALL reports visible to current user (RLS-filtered: users see only their reports, admins see all). */
  async listAllReports(): Promise<ReportListItem[]> {
    return reportsApi.listAll();
  },
};
