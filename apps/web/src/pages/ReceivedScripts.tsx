import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLangStore } from '@/store/langStore';
import { useAuthStore } from '@/store/authStore';
import { useDataStore } from '@/store/dataStore';
import { useSettingsStore } from '@/store/settingsStore';
import { formatDateTimeValue } from '@/utils/dateFormat';
import { normalizeScriptStatusForDisplay, normalizeScriptStatusForFilter } from '@/utils/scriptStatus';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { AdminTableFilters } from '@/components/ui/AdminTableFilters';
import { FileText, Search } from 'lucide-react';

const PAGE_SIZE = 10;

export function ReceivedScripts() {
  const { lang } = useLangStore();
  const { settings } = useSettingsStore();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { scripts, companies, fetchInitialData } = useDataStore();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);

  useEffect(() => {
    fetchInitialData().catch(() => {});
  }, [fetchInitialData]);

  const assignedScripts = useMemo(() => {
    const uid = user?.id ?? null;
    return scripts
      .filter((script) => script.assigneeId && script.assigneeId === uid)
      .slice()
      .sort((a, b) => new Date(b.receivedAt || b.createdAt || 0).getTime() - new Date(a.receivedAt || a.createdAt || 0).getTime());
  }, [scripts, user?.id]);

  const beneficiaryNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const company of companies) {
      const beneficiaryType = company.beneficiaryType ?? 'company';
      const name =
        beneficiaryType === 'individual'
          ? (company.individualProfile?.fullName || company.representativeName || company.nameAr || company.nameEn || '—')
          : (company.nameAr || company.nameEn || '—');
      map.set(company.companyId, name);
    }
    return map;
  }, [companies]);

  const statusOptions = useMemo(
    () => Array.from(new Set(assignedScripts.map((script) => normalizeScriptStatusForFilter(script.status)).filter(Boolean))).sort(),
    [assignedScripts],
  );

  const filteredScripts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return assignedScripts.filter((script) => {
      const statusKey = normalizeScriptStatusForFilter(script.status);
      const beneficiary = beneficiaryNameById.get(script.companyId) ?? '—';
      const recommendation = String((script as any).recommendationStatus ?? '').toLowerCase();
      const recommender = String((script as any).recommendedByName ?? '').toLowerCase();
      const matchesSearch = !q || [
        script.title ?? '',
        script.id ?? '',
        beneficiary,
        statusKey,
        recommendation,
        recommender,
      ].join(' ').toLowerCase().includes(q);
      const matchesStatus = statusFilter === 'all' || statusKey === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [assignedScripts, beneficiaryNameById, search, statusFilter]);

  const pageCount = Math.max(1, Math.ceil(filteredScripts.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pagedScripts = filteredScripts.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  const getRecommendationBadge = (script: any) => {
    const key = String(script?.recommendationStatus ?? '').toLowerCase();
    if (key === 'recommended_approval') {
      return <Badge variant="success" className="whitespace-nowrap">{lang === 'ar' ? 'توصية بالموافقة' : 'Recommended Approval'}</Badge>;
    }
    if (key === 'recommended_rejection') {
      return <Badge variant="error" className="whitespace-nowrap">{lang === 'ar' ? 'توصية بالرفض' : 'Recommended Rejection'}</Badge>;
    }
    return <span className="text-xs text-text-muted">—</span>;
  };

  const getStatusBadge = (status: string) => {
    const key = normalizeScriptStatusForFilter(status);
    if (key === 'assigned') return <Badge variant="outline" className="bg-info/10 text-info border-info/30">{lang === 'ar' ? 'مُسند' : 'Assigned'}</Badge>;
    if (key === 'approved') return <Badge variant="outline" className="bg-success/10 text-success border-success/30">{lang === 'ar' ? 'مفسوح' : 'Approved'}</Badge>;
    if (key === 'rejected') return <Badge variant="outline" className="bg-error/10 text-error border-error/30">{lang === 'ar' ? 'مرفوض' : 'Rejected'}</Badge>;
    if (['review_required', 'in_review', 'analysis_running'].includes(key)) return <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30">{lang === 'ar' ? 'قيد المراجعة' : 'In Review'}</Badge>;
    if (key === 'draft') return <Badge variant="outline">{lang === 'ar' ? 'مسودة' : 'Draft'}</Badge>;
    return <Badge variant="outline">{normalizeScriptStatusForDisplay(status)}</Badge>;
  };

  return (
    <div className="space-y-6 pb-8">
      <div className="dashboard-page-header flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between md:p-6">
        <div>
          <h1 className="text-2xl font-bold text-text-main">
            {lang === 'ar' ? 'النصوص المستلمة' : 'Received Scripts'}
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            {lang === 'ar'
              ? 'كل النصوص التي تم إسنادها إليك تظهر هنا مع البحث والفلاتر والتصفح.'
              : 'All scripts assigned to you appear here with search, filters, and pagination.'}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void fetchInitialData().catch(() => {})}>
          {lang === 'ar' ? 'تحديث القائمة' : 'Refresh'}
        </Button>
      </div>

      <AdminTableFilters
        onReset={() => {
          setSearch('');
          setStatusFilter('all');
        }}
        resetLabel={lang === 'ar' ? 'إعادة ضبط الفلاتر' : 'Reset Filters'}
      >
        <div className="grid gap-3 md:grid-cols-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={lang === 'ar' ? 'ابحث باسم النص أو المستفيد أو الحالة...' : 'Search by script, beneficiary, or status...'}
              className="pl-10"
            />
          </div>
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={[
              { value: 'all', label: lang === 'ar' ? 'كل الحالات' : 'All statuses' },
              ...statusOptions.map((status) => ({
                value: status,
                label: normalizeScriptStatusForDisplay(status),
              })),
            ]}
          />
        </div>
      </AdminTableFilters>

      <Card className="dashboard-table-card">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left rtl:text-right">
              <thead className="border-b border-border text-xs uppercase text-text-muted">
                <tr>
                  <th className="px-6 py-4 font-medium">{lang === 'ar' ? 'اسم النص' : 'Script Name'}</th>
                  <th className="px-6 py-4 font-medium">{lang === 'ar' ? 'المستفيد' : 'Beneficiary'}</th>
                  <th className="px-6 py-4 font-medium">{lang === 'ar' ? 'تاريخ الاستلام' : 'Received'}</th>
                  <th className="px-6 py-4 font-medium">{lang === 'ar' ? 'الحالة' : 'Status'}</th>
                  <th className="px-6 py-4 font-medium">{lang === 'ar' ? 'التوصية' : 'Recommendation'}</th>
                  <th className="px-6 py-4 font-medium text-end">{lang === 'ar' ? 'الإجراء' : 'Action'}</th>
                </tr>
              </thead>
              <tbody>
                {pagedScripts.map((script) => {
                  const beneficiary = beneficiaryNameById.get(script.companyId) ?? '—';
                  const receivedAt = script.receivedAt || script.createdAt || null;
                  return (
                    <tr
                      key={script.id}
                      className="cursor-pointer border-b border-border/60 bg-transparent transition-colors hover:bg-surface-hover/40"
                      onClick={() => navigate(`/workspace/${script.id}`)}
                    >
                      <td className="px-6 py-4 font-medium text-text-main">{script.title || (lang === 'ar' ? 'بدون عنوان' : 'Untitled')}</td>
                      <td className="px-6 py-4 text-text-muted">{beneficiary}</td>
                      <td className="px-6 py-4 text-text-muted">
                        {formatDateTimeValue(receivedAt, { lang, format: settings?.platform?.dateFormat })}
                      </td>
                      <td className="px-6 py-4">{getStatusBadge(script.status || 'draft')}</td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1">
                          {getRecommendationBadge(script)}
                          {(script as any).recommendedByName || (script as any).recommendedAt ? (
                            <span className="text-[11px] text-text-muted">
                              {(script as any).recommendedByName
                                ? `${lang === 'ar' ? 'بواسطة' : 'By'} ${(script as any).recommendedByName}`
                                : ''}
                              {(script as any).recommendedByName && (script as any).recommendedAt ? ' • ' : ''}
                              {(script as any).recommendedAt
                                ? formatDateTimeValue((script as any).recommendedAt, { lang, format: settings?.platform?.dateFormat })
                                : ''}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/workspace/${script.id}`);
                          }}
                        >
                          <FileText className="w-4 h-4" />
                          {lang === 'ar' ? 'فتح' : 'Open'}
                        </Button>
                      </td>
                    </tr>
                  );
                })}

                {pagedScripts.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-text-muted">
                      {lang === 'ar' ? 'لا توجد نصوص مستلمة حالياً' : 'No received scripts yet'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {filteredScripts.length > PAGE_SIZE && (
            <div className="flex items-center justify-between border-t border-border px-6 py-4">
              <span className="text-sm text-text-muted">
                {lang === 'ar' ? `صفحة ${currentPage} من ${pageCount}` : `Page ${currentPage} of ${pageCount}`}
              </span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setPage((prev) => Math.max(1, prev - 1))}>
                  {lang === 'ar' ? 'السابق' : 'Previous'}
                </Button>
                <Button variant="outline" size="sm" disabled={currentPage >= pageCount} onClick={() => setPage((prev) => Math.min(pageCount, prev + 1))}>
                  {lang === 'ar' ? 'التالي' : 'Next'}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
