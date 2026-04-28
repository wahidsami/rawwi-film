import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

export interface ScriptClassificationOption {
  id: string;
  label_ar: string;
  label_en: string;
  sort_order: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export const LEGACY_SCRIPT_CLASSIFICATION_OPTIONS: ScriptClassificationOption[] = [
  { id: 'legacy-security', label_ar: 'أمني', label_en: 'Security', sort_order: 10, is_active: true },
  { id: 'legacy-documentary', label_ar: 'وثائقي', label_en: 'Documentary', sort_order: 20, is_active: true },
  { id: 'legacy-drama', label_ar: 'درامي', label_en: 'Drama', sort_order: 30, is_active: true },
  { id: 'legacy-comedy', label_ar: 'كوميدي', label_en: 'Comedy', sort_order: 40, is_active: true },
  { id: 'legacy-historical', label_ar: 'تاريخي', label_en: 'Historical', sort_order: 50, is_active: true },
  { id: 'legacy-social', label_ar: 'اجتماعي', label_en: 'Social', sort_order: 60, is_active: true },
  { id: 'legacy-children', label_ar: 'أطفال', label_en: 'Children', sort_order: 70, is_active: true },
  { id: 'legacy-media', label_ar: 'إعلامي', label_en: 'Media', sort_order: 80, is_active: true },
  { id: 'legacy-other', label_ar: 'آخر', label_en: 'Other', sort_order: 90, is_active: true },
];

function normalizeOptionRows(rows: ScriptClassificationOption[] | null | undefined): ScriptClassificationOption[] {
  const unique = new Map<string, ScriptClassificationOption>();
  for (const row of rows ?? []) {
    const key = row.label_ar.trim();
    if (!key) continue;
    unique.set(key, {
      ...row,
      label_ar: row.label_ar.trim(),
      label_en: row.label_en.trim(),
      sort_order: Number.isFinite(row.sort_order) ? row.sort_order : 0,
      is_active: row.is_active !== false,
    });
  }
  return [...unique.values()].sort((a, b) => {
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return a.label_ar.localeCompare(b.label_ar, 'ar');
  });
}

export async function listScriptClassificationOptions(includeInactive = false): Promise<ScriptClassificationOption[]> {
  let query = supabase
    .from('script_classification_options')
    .select('id, label_ar, label_en, sort_order, is_active, created_at, updated_at')
    .order('sort_order', { ascending: true })
    .order('label_ar', { ascending: true });

  if (!includeInactive) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;
  if (error) throw error;
  return normalizeOptionRows((data as ScriptClassificationOption[] | null | undefined) ?? []);
}

export async function createScriptClassificationOption(input: {
  labelAr: string;
  labelEn: string;
  sortOrder?: number;
}): Promise<ScriptClassificationOption> {
  const label_ar = input.labelAr.trim();
  const label_en = input.labelEn.trim();
  const sort_order = Number.isFinite(input.sortOrder) ? Number(input.sortOrder) : 0;

  const { data, error } = await supabase
    .from('script_classification_options')
    .insert({
      label_ar,
      label_en,
      sort_order,
      is_active: true,
    })
    .select('id, label_ar, label_en, sort_order, is_active, created_at, updated_at')
    .single();

  if (error) throw error;
  return data as ScriptClassificationOption;
}

export async function updateScriptClassificationOption(
  id: string,
  updates: {
    labelAr?: string;
    labelEn?: string;
    sortOrder?: number;
    isActive?: boolean;
  },
): Promise<ScriptClassificationOption> {
  const payload: Record<string, unknown> = {};
  if (updates.labelAr !== undefined) payload.label_ar = updates.labelAr.trim();
  if (updates.labelEn !== undefined) payload.label_en = updates.labelEn.trim();
  if (updates.sortOrder !== undefined) payload.sort_order = Number.isFinite(updates.sortOrder) ? Number(updates.sortOrder) : 0;
  if (updates.isActive !== undefined) payload.is_active = updates.isActive;

  const { data, error } = await supabase
    .from('script_classification_options')
    .update(payload)
    .eq('id', id)
    .select('id, label_ar, label_en, sort_order, is_active, created_at, updated_at')
    .single();

  if (error) throw error;
  return data as ScriptClassificationOption;
}

export function buildScriptClassificationSelectOptions(
  lang: 'ar' | 'en',
  options: ScriptClassificationOption[],
  config?: {
    includeBlank?: boolean;
    blankLabelAr?: string;
    blankLabelEn?: string;
    preserveValue?: string | null;
  },
): Array<{ value: string; label: string }> {
  const list: Array<{ value: string; label: string }> = [];
  const seen = new Set<string>();

  if (config?.includeBlank) {
    list.push({
      value: '',
      label: lang === 'ar' ? (config.blankLabelAr ?? 'غير محدد') : (config.blankLabelEn ?? 'Unspecified'),
    });
  }

  for (const option of normalizeOptionRows(options)) {
    if (!option.is_active) continue;
    if (seen.has(option.label_ar)) continue;
    seen.add(option.label_ar);
    list.push({
      value: option.label_ar,
      label: lang === 'ar' ? option.label_ar : option.label_en,
    });
  }

  const preserved = (config?.preserveValue ?? '').trim();
  if (preserved && !seen.has(preserved)) {
    list.push({ value: preserved, label: preserved });
  }

  return list;
}

export function useScriptClassificationOptions(includeInactive = false) {
  const [options, setOptions] = useState<ScriptClassificationOption[]>(LEGACY_SCRIPT_CLASSIFICATION_OPTIONS);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const rows = await listScriptClassificationOptions(includeInactive);
      setOptions(rows.length > 0 ? rows : LEGACY_SCRIPT_CLASSIFICATION_OPTIONS);
    } catch (err: unknown) {
      console.warn('[script-classifications] falling back to legacy options', err);
      setOptions(LEGACY_SCRIPT_CLASSIFICATION_OPTIONS);
      setError(err instanceof Error ? err.message : 'Failed to load script classifications');
    } finally {
      setIsLoading(false);
    }
  }, [includeInactive]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { options, isLoading, error, reload };
}
