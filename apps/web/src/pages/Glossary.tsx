import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { useLangStore } from '@/store/langStore';
import { useDataStore, LexiconTerm } from '@/store/dataStore';
import { useAuthStore } from '@/store/authStore';
import { getPolicyArticles } from '@/data/policyMap';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Textarea } from '@/components/ui/Textarea';
import { Plus, Search, FileDown, FileUp, FileText, Edit2, Trash2, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { useSettingsStore } from '@/store/settingsStore';
import { formatDate } from '@/utils/dateFormat';
import { lexiconApi } from '@/api';
import type { LexiconHistoryEntry } from '@/api/models';
import { downloadGlossaryPdf } from '@/components/reports/glossary/download';

export function Glossary() {
  const { t, lang } = useLangStore();
  const { settings } = useSettingsStore();
  const { lexiconTerms, deactivateLexiconTerm } = useDataStore();
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold text-text-main">{t('lexiconManagement')}</h1>
        <div className="flex items-center gap-3">
          {settings?.features?.enableLexiconCsv !== false && (
            <>
              <Button variant="outline" className="flex items-center gap-2">
                <FileUp className="w-4 h-4" />
                <span className="hidden sm:inline">{t('importCsv')}</span>
              </Button>
              <Button variant="outline" className="flex items-center gap-2">
                <FileDown className="w-4 h-4" />
                <span className="hidden sm:inline">{t('exportCsv')}</span>
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

  const defaultForm: Partial<LexiconTerm> = {
    term: '',
    term_type: 'word',
    category: 'profanity',
    severity_floor: 'Medium',
    enforcement_mode: 'soft_signal',
    gcam_article_id: 1,
    gcam_atom_id: '',
    gcam_article_title_ar: '',
    description: '',
    example_usage: ''
  };

  const [formData, setFormData] = useState<Partial<LexiconTerm>>(defaultForm);

  const [error, setError] = useState('');

  // Reset form when modal opens or termId/lexiconTerms change; derive existingTerm inside effect to avoid stale closure
  useEffect(() => {
    if (isOpen) {
      const existingTerm = termId ? lexiconTerms.find(t => t.id === termId) : null;
      if (existingTerm) {
        setFormData(existingTerm);
      } else {
        setFormData(defaultForm);
      }
      setError('');
    }
  }, [isOpen, termId, lexiconTerms]);

  const handleSubmit = () => {
    setError('');
    if (!formData.term?.trim()) {
      setError(lang === 'ar' ? 'المصطلح مطلوب' : 'Term is required');
      return;
    }

    const normalized = formData.term.trim().toLowerCase();

    // Check duplicates (when editing, exclude current term)
    const exists = lexiconTerms.some(
      t => t.id !== termId && t.is_active && t.normalized_term === normalized
    );
    if (exists) {
      setError(t('termExists'));
      return;
    }

    if (termId) {
      updateLexiconTerm(termId, formData, user?.name || 'System', 'Admin edit');
    } else {
      addLexiconTerm({
        ...(formData as LexiconTerm),
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
          label={t('term')}
          value={formData.term}
          onChange={e => setFormData({ ...formData, term: e.target.value })}
          required
        />
        <p className="text-xs text-text-muted" dir="ltr">
          {lang === 'ar'
            ? 'لا يُطبَّق تطبيع عربي (أ/إ/آ، ى/ي، ة/ه، التشكيل، الكشيدة). يجب أن يطابق المصطلح النص حرفياً.'
            : 'Arabic normalization is not applied (أ/إ/آ, ى/ي, ة/ه, diacritics, kashida). Terms must match script text exactly.'}
        </p>

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

        <div className="grid grid-cols-2 gap-4">
          <Select
            label={t('gcamArticleId')}
            value={formData.gcam_article_id?.toString()}
            onChange={e => {
              const articleId = parseInt(e.target.value) || 1;
              const article = getPolicyArticles().find(a => a.articleId === articleId);
              setFormData({
                ...formData,
                gcam_article_id: articleId,
                gcam_article_title_ar: article?.title_ar || '',
                gcam_atom_id: '' // Reset atom on article change
              });
            }}
            options={getPolicyArticles().map(a => ({
              label: `${lang === 'ar' ? 'مادة' : 'Art'} ${a.articleId} - ${lang === 'ar' ? a.title_ar : ((a as { title_en?: string }).title_en ?? `Art ${a.articleId}`)}`,
              value: String(a.articleId)
            }))}
            className="w-full"
          />

          {/* Show Atom dropdown only if the selected article has atoms */}
          {(() => {
            const selectedArticle = getPolicyArticles().find(a => a.articleId === (formData.gcam_article_id || 1));
            const atoms = selectedArticle?.atoms || [];

            if (atoms.length > 0) {
              return (
                <Select
                  label={t('gcamAtomId')}
                  value={formData.gcam_atom_id || ''}
                  onChange={e => setFormData({ ...formData, gcam_atom_id: e.target.value })}
                  options={[
                    { label: lang === 'ar' ? 'الكل (لا تحديد)' : 'All (None)', value: '' },
                    ...atoms.map(atom => ({
                      label: `${atom.atomId} - ${lang === 'ar' ? atom.title_ar : ((atom as { title_en?: string }).title_en ?? atom.atomId)}`,
                      value: atom.atomId
                    }))
                  ]}
                />
              );
            }
            return null;
          })()}
        </div>
        <Input
          label={t('gcamArticleTitle')}
          value={formData.gcam_article_title_ar || ''}
          onChange={e => setFormData({ ...formData, gcam_article_title_ar: e.target.value })}
        />

        <Textarea
          label={t('description')}
          value={formData.description || ''}
          onChange={e => setFormData({ ...formData, description: e.target.value })}
          rows={2}
        />
        <Textarea
          label={t('exampleUsage')}
          value={formData.example_usage || ''}
          onChange={e => setFormData({ ...formData, example_usage: e.target.value })}
          rows={2}
        />

        <div className="flex justify-end gap-3 pt-4 border-t border-border mt-2">
          <Button variant="outline" onClick={onClose}>{t('cancel')}</Button>
          <Button onClick={handleSubmit}>{t('saveTerm')}</Button>
        </div>
      </div>
    </Modal>
  );
}
