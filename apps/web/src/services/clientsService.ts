import { supabase } from '@/lib/supabaseClient';
import { API_BASE_URL } from '@/lib/env';

export interface ClientsExportPdfParams {
  lang?: 'ar' | 'en';
  q?: string;
  dateFrom?: string;
  dateTo?: string;
}

/** Export clients report as PDF. Requires manage_companies. v1: real data only (no placeholders). */
export async function exportClientsPdf(params: ClientsExportPdfParams = {}): Promise<Blob> {
  const sp = new URLSearchParams();
  sp.set('lang', params.lang === 'ar' ? 'ar' : 'en');
  if (params.q) sp.set('q', params.q);
  if (params.dateFrom) sp.set('dateFrom', params.dateFrom);
  if (params.dateTo) sp.set('dateTo', params.dateTo);
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token ?? null;
  const res = await fetch(`${API_BASE_URL}/reports/clients.pdf?${sp.toString()}`, {
    method: 'GET',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err?.message || err?.error || 'Clients PDF export failed');
  }
  return res.blob();
}
