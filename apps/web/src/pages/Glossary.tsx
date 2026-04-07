import { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { useLangStore } from '@/store/langStore';
import { useDataStore, LexiconTerm } from '@/store/dataStore';
import { useAuthStore } from '@/store/authStore';
import { getPolicyArticles } from '@/data/policyMap';
import { getCanonicalAtomOptions, inferCanonicalAtomFromGcam } from '@/data/canonicalAtomGcamMap';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Textarea } from '@/components/ui/Textarea';
import { Plus, Search, FileDown, FileUp, FileText, Edit2, Trash2, AlertCircle, ChevronLeft, ChevronRight, Sparkles, X } from 'lucide-react';
import { useSettingsStore } from '@/store/settingsStore';
import { formatDate } from '@/utils/dateFormat';
import { lexiconApi } from '@/api';
import type { LexiconHistoryEntry } from '@/api/models';
import { downloadGlossaryPdf } from '@/components/reports/glossary/download';
import {
  exportGlossaryToCsv,
  parseGlossaryCsv,
  glossaryCsvTemplate,
} from '@/utils/glossaryCsv';

function normalizeLexiconTerm(term: string): string {
  return term
    .normalize('NFC')
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
    .replace(/[\u0640\u200B-\u200F\u2060\uFEFF]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function parseGeneratedVariantsInput(value: string): string[] {
  return value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function serializeGeneratedVariantsInput(values: string[] | null | undefined): string {
  return (values ?? []).join('\n');
}

export function Glossary() {
  const { t, lang } = useLangStore();
  const { settings } = useSettingsStore();
  const { lexiconTerms, deactivateLexiconTerm, fetchInitialData } = useDataStore();
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [csvBusy, setCsvBusy] = useState(false);
  const { user } = useAuthStore();

  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterSeverity, setFilterSeverity] = useState('all');
  const [filterMode, setFilterMode] = useState('all');
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTermId, setEditingTermId] = useState<string | null>(null);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, filterCategory, filterSeverity, filterMode]);

  const isAdminOrRegulator = user?.role === 'Super Admin' || user?.role === 'Admin' || user?.role === 'Regulator';

  if (!isAdminOrRegulator) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <AlertCircle className="w-12 h-12 text-error mb-4" />
        <h2 className="text-xl font-bold text-text-main">{t('accessDenied')}</h2>
      </div>
    );
  }

  const activeTerms = lexiconTerms.filter(t => t.is_active);

  const filteredTerms = activeTerms.filter(term => {
    const matchesSearch = term.term.includes(searchTerm) || term.description?.includes(searchTerm) || term.gcam_article_title_ar?.includes(searchTerm);
    const matchesCategory = filterCategory === 'all' || term.category === filterCategory;
    const matchesSeverity = filterSeverity === 'all' || term.severity_floor === filterSeverity;
    const matchesMode = filterMode === 'all' || term.enforcement_mode === filterMode;
    return matchesSearch && matchesCategory && matchesSeverity && matchesMode;
  });

  const totalFiltered = filteredTerms.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const start = (currentPage - 1) * pageSize;
  const paginatedTerms = filteredTerms.slice(start, start + pageSize);

  const softSignalsCount = activeTerms.filter(t => t.enforcement_mode === 'soft_signal').length;
  const mandatoryCount = activeTerms.filter(t => t.enforcement_mode === 'mandatory_finding').length;

  const handleDeactivate = (id: string) => {
    if (confirm(lang === 'ar' ? 'هل أنت متأكد من حذف هذا المصطلح؟' : 'Are you sure you want to delete this term?')) {
      deactivateLexiconTerm(id, user?.name || 'System', 'User initiated deletion');
    }
  };

  const [historyTermId, setHistoryTermId] = useState<string | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);

  const handleExportPdf = async () => {
    setExportingPdf(true);
    try {
      await downloadGlossaryPdf({
        terms: filteredTerms,
        lang: lang === 'ar' ? 'ar' : 'en',
        dateFormat: settings?.platform?.dateFormat,
      });
      toast.success(lang === 'ar' ? 'تم تنزيل التقرير' : 'Report downloaded');

    } catch (err: unknown) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : 'PDF export failed');
    } finally {
      setExportingPdf(false);
    }
  };

  const openAddModal = () => {
    setEditingTermId(null);
    setIsModalOpen(true);
  };

  const openEditModal = (id: string) => {
    setEditingTermId(id);
    setIsModalOpen(true);
  };

  const openHistoryModal = (id: string) => {
    setHistoryTermId(id);
  };

  const handleExportCsv = () => {
    const csv = '\uFEFF' + exportGlossaryToCsv(filteredTerms);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `glossary_export_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(lang === 'ar' ? 'تم تنزيل CSV' : 'CSV downloaded');
  };

  const handleDownloadTemplateCsv = () => {
    const blob = new Blob([glossaryCsvTemplate()], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'glossary_template.csv';
    a.click();
    URL.revokeObjectURL(url);
    toast.success(lang === 'ar' ? 'تم تنزيل القالب' : 'Template downloaded');
  };

  const handleImportCsvFile = async (file: File) => {
    setCsvBusy(true);
    try {
      const text = await file.text();
      const { rows, errors } = parseGlossaryCsv(text);
      if (errors.length && rows.length === 0) {
        toast.error(errors.join(' '));
        return;
      }
      if (errors.length) {
        toast.error(
          lang === 'ar' ? `تحذير: ${errors.slice(0, 3).join(' ')}` : `Skipped rows: ${errors.slice(0, 3).join(' ')}`,
        );
      }
      let added = 0;
      let dup = 0;
      let fail = 0;
      for (const row of rows) {
        try {
          await lexiconApi.addTerm({
            id: 'csv',
            term: row.term,
            normalized_term: normalizeLexiconTerm(row.term),
            term_type: row.term_type,
            category: row.category,
            severity_floor: row.severity_floor,
            enforcement_mode: row.enforcement_mode,
            gcam_article_id: row.gcam_article_id,
            gcam_atom_id: row.gcam_atom_id || undefined,
            gcam_article_title_ar: row.gcam_article_title_ar,
            description: row.description || undefined,
            example_usage: row.example_usage || undefined,
            term_variants: row.term_variants.length ? row.term_variants : undefined,
            created_by: '',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            is_active: true,
          } as LexiconTerm);
          added++;
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          if (msg.includes('409') || msg.includes('duplicate') || msg.includes('exists')) dup++;
          else fail++;
        }
      }
      await fetchInitialData();
      toast.success(
        lang === 'ar'
          ? `استورد: ${added} | مكرر: ${dup}${fail ? ` | فشل: ${fail}` : ''}`
          : `Imported: ${added} | Duplicates skipped: ${dup}${fail ? ` | Failed: ${fail}` : ''}`,
      );
    } catch {
      toast.error(lang === 'ar' ? 'فشل قراءة الملف' : 'Failed to read file');
    } finally {
      setCsvBusy(false);
      if (csvInputRef.current) csvInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold text-text-main">{t('lexiconManagement')}</h1>
        <div className="flex items-center gap-3">
          {settings?.features?.enableLexiconCsv !== false && (
            <>
              <input
                ref={csvInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleImportCsvFile(f);
                }}
              />
              <Button
                variant="outline"
                className="flex items-center gap-2"
                disabled={csvBusy}
                onClick={() => csvInputRef.current?.click()}
              >
                <FileUp className="w-4 h-4" />
                <span className="hidden sm:inline">{t('importCsv')}</span>
              </Button>
              <Button variant="outline" className="flex items-center gap-2" onClick={handleExportCsv} disabled={csvBusy}>
                <FileDown className="w-4 h-4" />
                <span className="hidden sm:inline">{t('exportCsv')}</span>
              </Button>
              <Button variant="outline" size="sm" className="text-xs" onClick={handleDownloadTemplateCsv} type="button">
                {lang === 'ar' ? 'قالب CSV' : 'CSV template'}
              </Button>
            </>
          )}
          <Button
            variant="outline"
            className="flex items-center gap-2"
            onClick={handleExportPdf}
            disabled={exportingPdf}
          >
            <FileText className="w-4 h-4" />
            <span className="hidden sm:inline">{t('exportPdf')}</span>
          </Button>
          <Button className="flex items-center gap-2" onClick={openAddModal}>
            <Plus className="w-4 h-4" />
            <span>{t('addTerm')}</span>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardContent className="p-6 flex flex-col justify-center">
            <p className="text-sm text-text-muted">{t('totalTerms')}</p>
            <p className="text-3xl font-bold text-text-main mt-1">{activeTerms.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 flex flex-col justify-center">
            <p className="text-sm text-text-muted">{t('softSignals')} <span className="text-[10px] bg-background px-1 py-0.5 rounded">{t('softSignalsSub')}</span></p>
            <p className="text-3xl font-bold text-warning-700 mt-1">{softSignalsCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 flex flex-col justify-center">
            <p className="text-sm text-text-muted">{t('mandatoryViolations')} <span className="text-[10px] bg-background px-1 py-0.5 rounded">{t('mandatoryViolationsSub')}</span></p>
            <p className="text-3xl font-bold text-error mt-1">{mandatoryCount}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col lg:flex-row gap-4">
        <div className="w-full lg:w-1/3">
          <Input
            placeholder={lang === 'ar' ? 'ابحث عن مصطلح...' : 'Search term...'}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            icon={<Search className="w-4 h-4" />}
          />
        </div>
        <div className="w-full lg:w-2/3 flex flex-col sm:flex-row gap-4">
          <Select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            options={[
              { label: t('allCategories'), value: 'all' },
              { label: t('profanity'), value: 'profanity' },
              { label: t('sexual'), value: 'sexual' },
              { label: t('drugs'), value: 'drugs' },
              { label: t('violence'), value: 'violence' },
              { label: t('discrimination'), value: 'discrimination' },
              { label: t('other'), value: 'other' },
            ]}
          />
          <Select
            value={filterSeverity}
            onChange={(e) => setFilterSeverity(e.target.value)}
            options={[
              { label: t('allSeverities'), value: 'all' },
              { label: t('low'), value: 'Low' },
              { label: t('medium'), value: 'Medium' },
              { label: t('high'), value: 'High' },
              { label: t('critical'), value: 'Critical' },
            ]}
          />
          <Select
            value={filterMode}
            onChange={(e) => setFilterMode(e.target.value)}
            options={[
              { label: t('allModes'), value: 'all' },
              { label: t('softSignals'), value: 'soft_signal' },
              { label: t('mandatoryViolations'), value: 'mandatory_finding' },
            ]}
          />
        </div>
      </div>

      <div className="bg-surface border border-border rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-start">
            <thead className="bg-background text-text-muted border-b border-border">
              <tr>
                <th className="px-6 py-4 font-semibold">{t('term')}</th>
                <th className="px-6 py-4 font-semibold">{t('termType')}</th>
                <th className="px-6 py-4 font-semibold">{t('category')}</th>
                <th className="px-6 py-4 font-semibold">{t('severity')}</th>
                <th className="px-6 py-4 font-semibold">{t('enforcementMode')}</th>
                <th className="px-6 py-4 font-semibold">{t('article')}</th>
                <th className="px-6 py-4 font-semibold">{lang === 'ar' ? 'أضافه' : 'Added by'}</th>
                <th className="px-6 py-4 font-semibold text-end">{t('actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {paginatedTerms.map((term) => (
                <tr key={term.id} className="hover:bg-background/50 transition-colors">
                  <td className="px-6 py-4">
                    <p className="font-bold text-text-main">{term.term}</p>
                    {term.description && <p className="text-xs text-text-muted truncate max-w-[200px] mt-1">{term.description}</p>}
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-text-muted text-xs bg-background px-2 py-1 rounded border border-border">
                      {t(term.term_type as any)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <Badge variant="outline" className="capitalize">{t(term.category as any)}</Badge>
                  </td>
                  <td className="px-6 py-4">
                    <Badge variant={
                      term.severity_floor === 'Critical' ? 'error' :
                        term.severity_floor === 'High' ? 'warning' : 'outline'
                    }>
                      {t(term.severity_floor.toLowerCase() as any)}
                    </Badge>
                  </td>
                  <td className="px-6 py-4">
                    <Badge variant={term.enforcement_mode === 'mandatory_finding' ? 'error' : 'warning'}>
                      {term.enforcement_mode === 'mandatory_finding' ? t('mandatoryViolations') : t('softSignals')}
                    </Badge>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-xs">
                      <p className="font-semibold">{t('article')} {term.gcam_article_id} {term.gcam_atom_id ? `(${term.gcam_atom_id})` : ''}</p>
                      {term.gcam_article_title_ar && <p className="text-text-muted mt-0.5">{term.gcam_article_title_ar}</p>}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-text-muted text-xs">
                    {term.created_by_name ?? (lang === 'ar' ? '—' : '—')}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => openHistoryModal(term.id)}
                        className="text-xs text-primary hover:underline px-2"
                      >
                        {lang === 'ar' ? 'السجل' : 'History'}
                      </button>
                      <button
                        onClick={() => openEditModal(term.id)}
                        className="p-1.5 text-text-muted hover:text-primary hover:bg-primary/10 rounded transition-colors"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeactivate(term.id)}
                        className="p-1.5 text-text-muted hover:text-error hover:bg-error/10 rounded transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredTerms.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-text-muted">
                    {lang === 'ar' ? 'لم يتم العثور على مصطلحات تطابق بحثك.' : 'No terms found matching your criteria.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {totalFiltered > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-t border-border bg-background">
            <div className="flex items-center gap-3">
              <span className="text-sm text-text-muted">
                {lang === 'ar' ? 'عرض' : 'Show'}
              </span>
              <Select
                value={String(pageSize)}
                onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                options={[
                  { label: '10', value: '10' },
                  { label: '30', value: '30' },
                  { label: '50', value: '50' },
                  { label: '100', value: '100' },
                ]}
                className="w-20"
              />
              <span className="text-sm text-text-muted">
                {lang === 'ar' ? 'في الصفحة' : 'per page'}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm text-text-muted">
              <span>
                {lang === 'ar'
                  ? `${start + 1}–${Math.min(start + pageSize, totalFiltered)} من ${totalFiltered}`
                  : `${start + 1}–${Math.min(start + pageSize, totalFiltered)} of ${totalFiltered}`}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={currentPage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  aria-label={lang === 'ar' ? 'السابق' : 'Previous'}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  aria-label={lang === 'ar' ? 'التالي' : 'Next'}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      <TermModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        termId={editingTermId}
      />

      <HistoryModal
        isOpen={!!historyTermId}
        onClose={() => setHistoryTermId(null)}
        termId={historyTermId}
      />
    </div>
  );
}

function HistoryModal({ isOpen, onClose, termId }: { isOpen: boolean; onClose: () => void; termId: string | null }) {
  const { t, lang } = useLangStore();
  const { settings } = useSettingsStore();
  const [history, setHistory] = useState<LexiconHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && termId) {
      setLoading(true);
      lexiconApi
        .getHistory(termId)
        .then((entries) => setHistory(entries.sort((a, b) => new Date(b.changed_at).getTime() - new Date(a.changed_at).getTime())))
        .catch(() => setHistory([]))
        .finally(() => setLoading(false));
    } else {
      setHistory([]);
    }
  }, [isOpen, termId]);

  if (!termId) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={lang === 'ar' ? 'سجل التعديلات' : 'Audit History'}>
      <div className="space-y-4">
        {loading ? (
          <p className="text-sm text-text-muted text-center py-4">{lang === 'ar' ? 'جاري التحميل...' : 'Loading...'}</p>
        ) : history.length === 0 ? (
          <p className="text-sm text-text-muted text-center py-4">{lang === 'ar' ? 'لا يوجد سجل' : 'No history found'}</p>
        ) : (
          history.map((entry) => (
            <div key={entry.id} className="border border-border bg-background rounded-lg p-3 text-sm">
              <div className="flex justify-between items-start mb-2 border-b border-border/50 pb-2">
                <Badge variant={entry.operation === 'INSERT' ? 'success' : entry.operation === 'DELETE' ? 'error' : 'warning'} className="text-[10px]">
                  {entry.operation}
                </Badge>
                <span className="text-text-muted text-xs">{formatDate(new Date(entry.changed_at), { lang, format: settings?.platform?.dateFormat })}</span>
              </div>
              <div className="flex justify-between items-center text-xs text-text-main">
                <span className="font-medium">{t('byUser')} {entry.changed_by}</span>
                {entry.change_reason && <span className="text-text-muted italic">&quot;{entry.change_reason}&quot;</span>}
              </div>
            </div>
          ))
        )}
      </div>
    </Modal>
  );
}

function TermModal({ isOpen, onClose, termId }: { isOpen: boolean; onClose: () => void; termId: string | null }) {
  const { t, lang } = useLangStore();
  const { lexiconTerms, addLexiconTerm, updateLexiconTerm } = useDataStore();
  const { user } = useAuthStore();

  type FormState = Partial<LexiconTerm> & { canonical_atom?: string };
  const defaultForm: FormState = {
    term: '',
    term_type: 'word',
    category: 'profanity',
    severity_floor: 'Medium',
    enforcement_mode: 'soft_signal',
    gcam_article_id: 1,
    gcam_atom_id: '',
    gcam_article_title_ar: '',
    description: '',
    example_usage: '',
    term_variants: [],
    canonical_atom: '',
  };

  const [formData, setFormData] = useState<FormState>(defaultForm);
  const [generatingConjugations, setGeneratingConjugations] = useState(false);
  const [promptMode, setPromptMode] = useState(false);
  const [generationPrompt, setGenerationPrompt] = useState('');
  const [generatedVariantsText, setGeneratedVariantsText] = useState('');
  const [generatingFromPrompt, setGeneratingFromPrompt] = useState(false);
  const [error, setError] = useState('');

  // Reset form when modal opens or termId/lexiconTerms change; derive existingTerm inside effect to avoid stale closure
  useEffect(() => {
    if (isOpen) {
      const existingTerm = termId ? lexiconTerms.find(t => t.id === termId) : null;
      if (existingTerm) {
        const inferred = inferCanonicalAtomFromGcam(
          existingTerm.gcam_article_id,
          existingTerm.gcam_atom_id ?? null
        );
        const opt = inferred ? getCanonicalAtomOptions().find((o) => o.id === inferred) : null;
        setFormData({
          ...existingTerm,
          term_variants: existingTerm.term_variants ?? [],
          canonical_atom: inferred || '',
          ...(opt
            ? {
                gcam_article_id: opt.articleId,
                gcam_atom_id: opt.atomId ?? '',
                gcam_article_title_ar:
                  getPolicyArticles().find((a) => a.articleId === opt.articleId)?.title_ar ?? existingTerm.gcam_article_title_ar,
              }
            : {}),
        });
        setGeneratedVariantsText(serializeGeneratedVariantsInput(existingTerm.term_variants ?? []));
        setPromptMode(false);
        setGenerationPrompt('');
      } else {
        setFormData(defaultForm);
        setGeneratedVariantsText('');
        setPromptMode(false);
        setGenerationPrompt('');
      }
      setError('');
    }
  }, [isOpen, termId, lexiconTerms]);

  const handleGenerateConjugations = async () => {
    const raw = formData.term?.trim();
    if (!raw) {
      setError(lang === 'ar' ? 'أدخل المصطلح أولاً' : 'Enter the term first');
      return;
    }
    setError('');
    setGeneratingConjugations(true);
    try {
      const { variants } = await lexiconApi.generateConjugations(raw);
      const existing = formData.term_variants ?? [];
      const combined = [...new Set([...existing, ...variants])].filter((v) => v.trim() && v !== raw);
      setFormData({ ...formData, term_variants: combined });
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message ?? String(e);
      if (msg.includes('503') || msg.includes('not configured') || msg.includes('Conjugation service')) {
        setError(
          lang === 'ar'
            ? 'توليد التصريفات غير مفعّل. في Supabase: الإعدادات → Edge Functions → Secrets → أضف OPENAI_API_KEY (مفتاح OpenAI). المفتاح في إعدادات المشروع وليس في ملف الويب. أو أضف التصريفات يدوياً.'
            : 'Generate conjugations needs OPENAI_API_KEY in Supabase: Project Settings → Edge Functions → Secrets (project secrets, not your web app .env). Or add variants manually.'
        );
      } else {
        setError(lang === 'ar' ? 'فشل توليد التصريفات' : 'Failed to generate conjugations');
      }
    } finally {
      setGeneratingConjugations(false);
    }
  };

  const removeVariant = (v: string) => {
    const nextVariants = (formData.term_variants ?? []).filter((x) => x !== v);
    setFormData({ ...formData, term_variants: nextVariants });
    if (promptMode) {
      setGeneratedVariantsText(serializeGeneratedVariantsInput(nextVariants));
    }
  };

  const handleGenerateFromPrompt = async () => {
    const prompt = generationPrompt.trim();
    if (!prompt) {
      setError(lang === 'ar' ? 'أدخل الطلب أولاً' : 'Enter the prompt first');
      return;
    }
    setError('');
    setGeneratingFromPrompt(true);
    try {
      const { variants } = await lexiconApi.generateFromPrompt(prompt, formData.term?.trim() || undefined);
      setFormData({ ...formData, term_variants: variants });
      setGeneratedVariantsText(serializeGeneratedVariantsInput(variants));
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message ?? String(e);
      if (msg.includes('503') || msg.includes('not configured') || msg.includes('OPENAI_API_KEY')) {
        setError(
          lang === 'ar'
            ? 'توليد الكلمات من الطلب غير مفعّل. في Supabase: الإعدادات → Edge Functions → Secrets → أضف OPENAI_API_KEY، أو أدخل الكلمات يدوياً.'
            : 'Prompt-based glossary generation needs OPENAI_API_KEY in Supabase Edge Function secrets, or enter the variants manually.'
        );
      } else {
        setError(lang === 'ar' ? 'فشل توليد الكلمات من الطلب' : 'Failed to generate variants from prompt');
      }
    } finally {
      setGeneratingFromPrompt(false);
    }
  };

  const handleSubmit = () => {
    setError('');
    if (!formData.term?.trim()) {
      setError(lang === 'ar' ? 'المصطلح مطلوب' : 'Term is required');
      return;
    }
    if (!formData.canonical_atom?.trim()) {
      setError(lang === 'ar' ? 'اختر نوع المخالفة (إطار الذرات)' : 'Select a violation type (canonical atom)');
      return;
    }
    if (promptMode && (formData.term_variants ?? []).length === 0) {
      setError(lang === 'ar' ? 'ولّد الكلمات أولاً أو أدخلها في الصندوق قبل الحفظ' : 'Generate the terms first or enter them in the generated words box before saving');
      return;
    }

    const normalized = normalizeLexiconTerm(formData.term.trim());

    // Check duplicates (when editing, exclude current term)
    const exists = lexiconTerms.some(
      t => t.id !== termId && t.is_active && t.normalized_term === normalized
    );
    if (exists) {
      setError(t('termExists'));
      return;
    }

    const { canonical_atom: _, ...rest } = formData;
    const payload = { ...rest };
    if (Array.isArray(payload.term_variants) && payload.term_variants.length === 0) {
      delete (payload as Partial<LexiconTerm>).term_variants;
    }
    if (termId) {
      updateLexiconTerm(termId, payload, user?.name || 'System', 'Admin edit');
    } else {
      addLexiconTerm({
        ...(payload as LexiconTerm),
        id: `LEX-${Math.floor(Math.random() * 10000)}`,
        normalized_term: normalized,
        created_by: user?.name || 'System',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_active: true
      });
    }

    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={termId ? (lang === 'ar' ? 'تعديل المصطلح' : 'Edit Term') : t('addTerm')}
    >
      <div className="space-y-4">
        {error && (
          <div className="p-3 bg-error/10 border border-error/20 text-error text-sm rounded-md">
            {error}
          </div>
        )}

        <Input
          label={promptMode ? (lang === 'ar' ? 'عنوان المجموعة' : 'Group title') : t('term')}
          value={formData.term}
          onChange={e => setFormData({ ...formData, term: e.target.value })}
          required
        />
        {!termId && (
          <label className="flex items-center gap-2 text-sm text-text-main">
            <input
              type="checkbox"
              checked={promptMode}
              onChange={(e) => {
                const next = e.target.checked;
                setPromptMode(next);
                setError('');
                if (!next) {
                  setGenerationPrompt('');
                }
              }}
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary/20"
            />
            <span>{lang === 'ar' ? 'إضافة من طلب' : 'From prompt'}</span>
          </label>
        )}
        <p className="text-xs text-text-muted" dir="ltr">
          {promptMode
            ? (lang === 'ar'
              ? 'اكتب عنواناً يصف المجموعة الناتجة، مثل: الرتب العسكرية. سيتم حفظ الكلمات المولدة كمتغيرات تحت هذا العنوان.'
              : 'Enter a group title such as “Military ranks”. The generated items will be saved as variants under this title.')
            : (lang === 'ar'
              ? 'يُطبَّق تطبيع كشف عربي محافظ عند المطابقة: إزالة التشكيل والكشيدة وبعض الأحرف المخفية، ودمج المسافات الغريبة بين الحروف، مع توحيد شائع مثل أ/إ/آ→ا و ى→ي. يُفضّل إدخال المصطلح بصيغته العربية الطبيعية.'
              : 'Conservative Arabic detection normalization is applied during matching: diacritics, tatweel, hidden characters, and odd letter spacing are cleaned up, with common normalization such as أ/إ/آ -> ا and ى -> ي. It is still best to enter the term in normal Arabic spelling.')}
        </p>

        {/* Canonical atom: when selected, Article + Atom + Title are set automatically and shown read-only */}
        <div>
          <label className="block text-sm font-medium text-text-main mb-1">
            {lang === 'ar' ? 'نوع المخالفة (إطار الذرات) *' : 'Violation type (canonical atom) *'}
          </label>
          <Select
            value={formData.canonical_atom ?? ''}
            onChange={(e) => {
              const val = e.target.value;
              if (!val) {
                setFormData({ ...formData, canonical_atom: '', gcam_article_id: 1, gcam_atom_id: '', gcam_article_title_ar: '' });
                return;
              }
              const opt = getCanonicalAtomOptions().find((o) => o.id === val);
              if (opt) {
                const article = getPolicyArticles().find((a) => a.articleId === opt.articleId);
                setFormData({
                  ...formData,
                  canonical_atom: val,
                  gcam_article_id: opt.articleId,
                  gcam_atom_id: opt.atomId ?? '',
                  gcam_article_title_ar: article?.title_ar ?? '',
                });
              }
            }}
            options={[
              { label: lang === 'ar' ? '— اختر نوع المخالفة —' : '— Select violation type —', value: '' },
              ...getCanonicalAtomOptions().map((o) => ({
                label: lang === 'ar' ? `${o.labelAr} (م ${o.articleId})` : `${o.labelEn} (Art ${o.articleId})`,
                value: o.id,
              })),
            ]}
            className="w-full"
          />
          {formData.canonical_atom ? (
            <div className="mt-2 p-3 rounded-md bg-muted/50 border border-border text-sm text-text-main">
              {lang === 'ar' ? 'المادة والذرة المرتبطة:' : 'Linked article & atom:'}{' '}
              <span dir="rtl" className="font-medium">
                {lang === 'ar' ? `م ${formData.gcam_article_id}` : `Art ${formData.gcam_article_id}`}
                {formData.gcam_article_title_ar ? ` — ${formData.gcam_article_title_ar}` : ''}
                {formData.gcam_atom_id ? ` (${formData.gcam_atom_id})` : ''}
              </span>
            </div>
          ) : (
            <p className="text-xs text-text-muted mt-0.5">
              {lang === 'ar' ? 'مطلوب. يحدد المادة والذرة تلقائياً.' : 'Required. Sets article and atom automatically.'}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Select
            label={t('termType')}
            value={formData.term_type}
            onChange={e => setFormData({ ...formData, term_type: e.target.value as any })}
            options={[
              { label: t('word'), value: 'word' },
              { label: t('phrase'), value: 'phrase' },
              { label: t('regex'), value: 'regex' },
            ]}
          />
          <Select
            label={t('category')}
            value={formData.category}
            onChange={e => setFormData({ ...formData, category: e.target.value as any })}
            options={[
              { label: t('profanity'), value: 'profanity' },
              { label: t('sexual'), value: 'sexual' },
              { label: t('violence'), value: 'violence' },
              { label: t('drugs'), value: 'drugs' },
              { label: t('discrimination'), value: 'discrimination' },
              { label: t('other'), value: 'other' },
            ]}
          />
          <Select
            label={t('severityFloor')}
            value={formData.severity_floor}
            onChange={e => setFormData({ ...formData, severity_floor: e.target.value as any })}
            options={[
              { label: t('low'), value: 'Low' },
              { label: t('medium'), value: 'Medium' },
              { label: t('high'), value: 'High' },
              { label: t('critical'), value: 'Critical' },
            ]}
          />
          <Select
            label={t('enforcementMode')}
            value={formData.enforcement_mode}
            onChange={e => setFormData({ ...formData, enforcement_mode: e.target.value as any })}
            options={[
              { label: t('softSignals'), value: 'soft_signal' },
              { label: t('mandatoryViolations'), value: 'mandatory_finding' },
            ]}
          />
        </div>
        <p className="text-xs text-text-muted" dir="ltr">
          {formData.term_type === 'word' && (lang === 'ar' ? 'كلمة: مطابقة رمز كامل (حد كلمة)، غير حساسة لحالة الأحرف في اللاتينية.' : 'word: exact token match (word boundary); case-insensitive in Latin.')}
          {formData.term_type === 'phrase' && (lang === 'ar' ? 'عبارة: مطابقة جزء من النص؛ غير حساسة لحالة الأحرف في اللاتينية.' : 'phrase: substring match; case-insensitive in Latin.')}
          {formData.term_type === 'regex' && (lang === 'ar' ? 'تعبير منتظم: نمط خام؛ أعلام gui (لا تحويل لحروف صغيرة).' : 'regex: raw pattern; flags gui (no lowercasing).')}
        </p>

        {promptMode && formData.term_type !== 'regex' && (
          <div className="space-y-4 rounded-xl border border-border bg-background/40 p-4">
            <Textarea
              label={lang === 'ar' ? 'الطلب' : 'Prompt'}
              value={generationPrompt}
              onChange={(e) => setGenerationPrompt(e.target.value)}
              rows={3}
              placeholder={
                lang === 'ar'
                  ? 'مثال: أريد جميع أسماء الرتب العسكرية بالعربية'
                  : 'Example: I need all military rank names in Arabic'
              }
            />
            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={handleGenerateFromPrompt}
                disabled={generatingFromPrompt || !generationPrompt.trim()}
                className="flex items-center gap-1.5"
              >
                {generatingFromPrompt ? (
                  <span className="animate-pulse">{lang === 'ar' ? 'جاري التوليد…' : 'Generating…'}</span>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    {lang === 'ar' ? 'توليد الكلمات' : 'Generate terms'}
                  </>
                )}
              </Button>
            </div>
            <Textarea
              label={lang === 'ar' ? 'الكلمات المولدة' : 'Generated words'}
              value={generatedVariantsText}
              onChange={(e) => {
                const text = e.target.value;
                setGeneratedVariantsText(text);
                setFormData({ ...formData, term_variants: parseGeneratedVariantsInput(text) });
              }}
              rows={8}
              placeholder={
                lang === 'ar'
                  ? 'ستظهر الكلمات هنا، كل كلمة أو عبارة في سطر مستقل'
                  : 'Generated terms will appear here, one word or phrase per line'
              }
            />
            <p className="text-xs text-text-muted">
              {lang === 'ar'
                ? 'يمكنك تعديل القائمة قبل الحفظ. سيُعامل كل سطر كمتغير تابع لهذا العنوان أثناء التحليل.'
                : 'You can edit this list before saving. Each line will be treated as a variant under this title during analysis.'}
            </p>
          </div>
        )}

        {/* Variants / Conjugations: tags + Generate button */}
        {!promptMode && formData.term_type !== 'regex' && (
          <div>
            <label className="block text-sm font-medium text-text-main mb-1">
              {lang === 'ar' ? 'تصريفات / أشكال (اختياري)' : 'Variants / Conjugations (optional)'}
            </label>
            <div className="flex flex-wrap items-center gap-2 p-2 border border-border rounded-md bg-background min-h-[44px]">
              {(formData.term_variants ?? []).map((v) => (
                <span
                  key={v}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-primary/15 text-primary text-sm"
                >
                  <span dir="auto">{v}</span>
                  <button
                    type="button"
                    onClick={() => removeVariant(v)}
                    className="p-0.5 hover:bg-primary/30 rounded"
                    aria-label={lang === 'ar' ? 'إزالة' : 'Remove'}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </span>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleGenerateConjugations}
                disabled={generatingConjugations || !formData.term?.trim()}
                className="flex items-center gap-1.5"
              >
                {generatingConjugations ? (
                  <span className="animate-pulse">{lang === 'ar' ? 'جاري…' : 'Generating…'}</span>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    {lang === 'ar' ? 'توليد تصريفات' : 'Generate conjugations'}
                  </>
                )}
              </Button>
            </div>
            <p className="text-xs text-text-muted mt-0.5">
              {lang === 'ar'
                ? 'مثال: ضرب → يضرب، تضرب، ضربا، مضروب. تُطابق التحليل النص لأي من هذه الأشكال.'
                : 'e.g. ضرب → يضرب، تضرب. Analysis will match any of these forms in the script.'}
            </p>
          </div>
        )}

        <Textarea
          label={t('description')}
          value={formData.description || ''}
          onChange={e => setFormData({ ...formData, description: e.target.value })}
          rows={2}
          placeholder={lang === 'ar' ? 'وصف اختياري للمصطلح (للمرجعية والتقارير)' : 'Optional description (for reference and reports)'}
        />
        <p className="text-xs text-text-muted -mt-2">
          {lang === 'ar' ? 'يُخزَّن للمرجعية ويمكن استخدامه في التقارير أو كسياق للتحليل.' : 'Stored for reference; can be shown in reports or used as context for analysis.'}
        </p>
        <Textarea
          label={t('exampleUsage')}
          value={formData.example_usage || ''}
          onChange={e => setFormData({ ...formData, example_usage: e.target.value })}
          rows={2}
          placeholder={lang === 'ar' ? 'مثال استخدام في جملة' : 'Example sentence using the term'}
        />
        <p className="text-xs text-text-muted -mt-2">
          {lang === 'ar' ? 'يساعد المحللين ويمكن أن يُقدَّم كسياق للذكاء الاصطناعي عند المطابقة.' : 'Helps analysts and can be provided as context to the AI when the term is matched.'}
        </p>

        <div className="flex justify-end gap-3 pt-4 border-t border-border mt-2">
          <Button variant="outline" onClick={onClose}>{t('cancel')}</Button>
          <Button onClick={handleSubmit}>{t('saveTerm')}</Button>
        </div>
      </div>
    </Modal>
  );
}
