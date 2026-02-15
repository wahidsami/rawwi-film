/**
 * Thin wrapper around reportsApi — used by Results page.
 * Re-exports the Report type from models for convenience.
 */
import { reportsApi } from '@/api';
import type { Report, ReportListItem } from '@/api/models';

export type { Report as AnalysisReport } from '@/api/models';

export const reportService = {
  /** Fetch single report by jobId (preferred) or scriptId (fallback, fetches latest). */
  async getReport(params: { jobId?: string; scriptId?: string }): Promise<Report> {
    if (params.jobId) return reportsApi.getByJob(params.jobId);
    if (params.scriptId) {
      // list and return newest
      const list = await reportsApi.listByScript(params.scriptId);
      if (list.length === 0) throw new Error('No reports found for this script');
      return reportsApi.getById(list[0].id);
    }
    throw new Error('jobId or scriptId required');
  },

  /** List reports for a script. Pass a valid scriptId; if missing, returns [] to avoid invalid API calls. */
  async listReports(scriptId: string | undefined): Promise<ReportListItem[]> {
    if (scriptId == null || String(scriptId).trim() === '') {
      return [];
    }
    return reportsApi.listByScript(scriptId);
  },
};
