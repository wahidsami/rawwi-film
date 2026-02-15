import { httpClient } from '../api/httpClient';
import { supabase } from '@/lib/supabaseClient';
import { API_BASE_URL } from '@/lib/env';

export interface AuditEventRow {
  id: string;
  eventType: string;
  actorUserId: string | null;
  actorName: string | null;
  actorRole: string | null;
  occurredAt: string;
  targetType: string;
  targetId: string | null;
  targetLabel: string | null;
  resultStatus: string;
  resultMessage: string | null;
  metadata: Record<string, unknown> | null;
  requestId: string | null;
  correlationId: string | null;
  createdAt: string;
}

export interface AuditListParams {
  page?: number;
  pageSize?: number;
  dateFrom?: string;
  dateTo?: string;
  userId?: string;
  eventType?: string;
  targetType?: string;
  resultStatus?: string;
  q?: string;
}

export interface AuditListResponse {
  data: AuditEventRow[];
  total: number;
  page: number;
  pageSize: number;
}

export const auditService = {
  list: (params: AuditListParams = {}): Promise<AuditListResponse> => {
    const sp = new URLSearchParams();
    if (params.page != null) sp.set('page', String(params.page));
    if (params.pageSize != null) sp.set('pageSize', String(params.pageSize));
    if (params.dateFrom) sp.set('dateFrom', params.dateFrom);
    if (params.dateTo) sp.set('dateTo', params.dateTo);
    if (params.userId) sp.set('userId', params.userId);
    if (params.eventType) sp.set('eventType', params.eventType);
    if (params.targetType) sp.set('targetType', params.targetType);
    if (params.resultStatus) sp.set('resultStatus', params.resultStatus);
    if (params.q) sp.set('q', params.q);
    const qs = sp.toString();
    return httpClient.get(`/audit${qs ? `?${qs}` : ''}`) as Promise<AuditListResponse>;
  },

  exportCsv: async (params: Omit<AuditListParams, 'page' | 'pageSize'> = {}): Promise<Blob> => {
    const sp = new URLSearchParams({ format: 'csv' });
    if (params.dateFrom) sp.set('dateFrom', params.dateFrom);
    if (params.dateTo) sp.set('dateTo', params.dateTo);
    if (params.userId) sp.set('userId', params.userId);
    if (params.eventType) sp.set('eventType', params.eventType);
    if (params.targetType) sp.set('targetType', params.targetType);
    if (params.resultStatus) sp.set('resultStatus', params.resultStatus);
    if (params.q) sp.set('q', params.q);
    const useMock = import.meta.env.VITE_USE_MOCK_API === 'true';
    if (useMock) {
      const csv = await httpClient.get(`/audit/export?${sp.toString()}`) as string;
      return new Blob([csv], { type: 'text/csv; charset=utf-8' });
    }
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token ?? null;
    const res = await fetch(`${API_BASE_URL}/audit/export?${sp.toString()}`, {
      method: 'GET',
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(err.message || err.error || 'Export failed');
    }
    return res.blob();
  },

  /** Export audit log as PDF (same filters + lang). Admin-only. */
  exportPdf: async (
    params: Omit<AuditListParams, 'page' | 'pageSize'> & { lang?: 'ar' | 'en' } = {}
  ): Promise<Blob> => {
    const sp = new URLSearchParams();
    sp.set('lang', params.lang === 'ar' ? 'ar' : 'en');
    if (params.dateFrom) sp.set('dateFrom', params.dateFrom);
    if (params.dateTo) sp.set('dateTo', params.dateTo);
    if (params.eventType) sp.set('eventType', params.eventType);
    if (params.targetType) sp.set('targetType', params.targetType);
    if (params.resultStatus) sp.set('resultStatus', params.resultStatus);
    if (params.q) sp.set('q', params.q);
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token ?? null;
    const res = await fetch(`${API_BASE_URL}/reports/audit.pdf?${sp.toString()}`, {
      method: 'GET',
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      const msg = err?.detail || err?.error || err?.message || 'PDF export failed';
      throw new Error(msg);
    }
    return res.blob();
  },
};
