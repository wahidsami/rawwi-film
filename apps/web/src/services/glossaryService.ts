import { supabase } from '@/lib/supabaseClient';
import { API_BASE_URL } from '@/lib/env';

export interface GlossaryExportPdfParams {
  lang?: 'ar' | 'en';
  isActive?: boolean;
  mode?: string;
  severity?: string;
  q?: string;
  clientId?: string;
}

/** Export glossary as PDF. Requires manage_glossary. */
export async function exportGlossaryPdf(params: GlossaryExportPdfParams = {}): Promise<Blob> {
  const sp = new URLSearchParams();
  sp.set('lang', params.lang === 'ar' ? 'ar' : 'en');
  if (params.isActive === true) sp.set('isActive', 'true');
  else if (params.isActive === false) sp.set('isActive', 'false');
  if (params.mode) sp.set('mode', params.mode);
  if (params.severity) sp.set('severity', params.severity);
  if (params.q) sp.set('q', params.q);
  if (params.clientId) sp.set('clientId', params.clientId);
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token ?? null;
  const res = await fetch(`${API_BASE_URL}/reports/glossary.pdf?${sp.toString()}`, {
    method: 'GET',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err?.message || err?.error || 'Glossary PDF export failed');
  }
  return res.blob();
}
