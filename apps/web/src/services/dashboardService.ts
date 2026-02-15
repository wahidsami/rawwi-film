import { httpClient } from '../api/httpClient';

export interface DashboardStats {
  pendingTasks: number;
  scriptsInReview: number;
  reportsThisMonth: number;
  highCriticalFindings: number;
  scriptsByStatus: {
    draft: number;
    assigned: number;
    analysis_running: number;
    in_review: number;
    review_required: number;
    approved: number;
    rejected: number;
    completed: number;
  };
  findingsBySeverity: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
}

export const dashboardService = {
  getOverviewStats: (): Promise<DashboardStats> => {
    return httpClient.get('/dashboard/stats') as Promise<DashboardStats>;
  }
};
