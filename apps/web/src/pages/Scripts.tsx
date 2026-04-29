import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLangStore } from '@/store/langStore';
import { useDataStore } from '@/store/dataStore';
import { useSettingsStore } from '@/store/settingsStore';
import { formatDate } from '@/utils/dateFormat';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { CheckCircle, Clock, FileText, Filter, Grid2X2, List, Search, XCircle } from 'lucide-react';
import { cn } from '@/utils/cn';
import { normalizeScriptStatusForDisplay, normalizeScriptStatusForFilter } from '@/utils/scriptStatus';

type StatusFilter = 'all' | 'approved' | 'rejected' | 'pending';
type ViewMode = 'cards' | 'table';
const PAGE_SIZE = 10;
const VIEW_STORAGE_KEY = 'raawi-admin-scripts-view';

export function Scripts() {
  const { lang } = useLangStore();
  const { settings } = useSettingsStore();
  const navigate = useNavigate();
  const { scripts, companies, isLoading } = useDataStore();
  const [searchParams, setSearchParams] = useSearchParams();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>((searchParams.get('status') as StatusFilter) || 'all');
  const [sortBy, setSortBy] = useState<'date' | 'title' | 'client'>('date');
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = window.localStorage.getItem(VIEW_STORAGE_KEY);
    return saved === 'table' ? 'table' : 'cards';
  });
  const [page, setPage] = useState(1);

  useEffect(() => {
    window.localStorage.setItem(VIEW_STORAGE_KEY, viewMode);
  }, [viewMode]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, sortBy, viewMode]);

  useEffect(() => {
    if (statusFilter !== 'all') setSearchParams({ status: statusFilter });
    else setSearchParams({});
  }, [statusFilter, setSearchParams]);

  const filteredScripts = useMemo(() => {
    let filtered = scripts;
    const norm = (st: string) => normalizeScriptStatusForFilter(st);
    if (statusFilter === 'approved') filtered = filtered.filter((s) => norm(s.status) === 'approved');
    else if (statusFilter === 'rejected') filtered = filtered.filter((s) => norm(s.status) === 'rejected');
    else if (statusFilter === 'pending') filtered = filtered.filter((s) => ['draft', 'pending', 'review_required', 'in_review'].includes(norm(s.status)));

    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter((s) =>
        s.title?.toLowerCase().includes(q) ||
        companies.find((c) => c.companyId === s.companyId)?.nameEn?.toLowerCase().includes(q) ||
        companies.find((c) => c.companyId === s.companyId)?.nameAr?.includes(search),
      );
    }

    return [...filtered].sort((a, b) => {
      if (sortBy === 'date') return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      if (sortBy === 'title') return (a.title || '').localeCompare(b.title || '');
      const clientA = companies.find((c) => c.companyId === a.companyId)?.nameEn || '';
      const clientB = companies.find((c) => c.companyId === b.companyId)?.nameEn || '';
      return clientA.localeCompare(clientB);
    });
  }, [companies, scripts, search, sortBy, statusFilter]);

  const pageCount = Math.max(1, Math.ceil(filteredScripts.length / PAGE_SIZE));
  const pagedScripts = filteredScripts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const counts = {
    all: scripts.length,
    approved: scripts.filter((s) => normalizeScriptStatusForFilter(s.status) === 'approved').length,
    rejected: scripts.filter((s) => normalizeScriptStatusForFilter(s.status) === 'rejected').length,
    pending: scripts.filter((s) => ['draft', 'pending', 'review_required', 'in_review'].includes(normalizeScriptStatusForFilter(s.status))).length,
  };

  const tabs: Array<{ key: StatusFilter; label: string; icon: any }> = [
    { key: 'all', label: lang === 'ar' ? 'الكل' : 'All', icon: FileText },
    { key: 'approved', label: lang === 'ar' ? 'مقبول' : 'Approved', icon: CheckCircle },
    { key: 'rejected', label: lang === 'ar' ? 'مرفوض' : 'Rejected', icon: XCircle },
    { key: 'pending', label: lang === 'ar' ? 'قيد المراجعة' : 'Pending', icon: Clock },
  ];

  const getStatusBadge = (status: string) => {
    const n = normalizeScriptStatusForFilter(status);
    if (n === 'approved') return <Badge variant="outline" className="bg-success/10 text-success border-success/30">{lang === 'ar' ? 'مقبول' : 'Approved'}</Badge>;
    if (n === 'rejected') return <Badge variant="outline" className="bg-error/10 text-error border-error/30">{lang === 'ar' ? 'مرفوض' : 'Rejected'}</Badge>;
    if (n === 'review_required' || n === 'in_review') return <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30">{lang === 'ar' ? 'قيد المراجعة' : 'Pending'}</Badge>;
    if (n === 'draft') return <Badge variant="outline">{lang === 'ar' ? 'مسودة' : 'Draft'}</Badge>;
    return <Badge variant="outline">{normalizeScriptStatusForDisplay(status)}</Badge>;
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-surface-hover rounded animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="h-40 bg-surface-main rounded-lg animate-pulse" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      <div className="dashboard-page-header flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between md:p-6">
        <h1 className="text-2xl font-bold text-text-main">{lang === 'ar' ? 'إدارة النصوص' : 'Scripts Management'}</h1>
        <div className="flex items-center gap-2">
          <Button variant={viewMode === 'cards' ? 'primary' : 'outline'} size="sm" onClick={() => setViewMode('cards')} aria-label="Card view">
            <Grid2X2 className="h-4 w-4" />
          </Button>
          <Button variant={viewMode === 'table' ? 'primary' : 'outline'} size="sm" onClick={() => setViewMode('table')} aria-label="Table view">
            <List className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="dashboard-panel flex items-center gap-2 overflow-x-auto rounded-[calc(var(--radius)+0.55rem)] border border-border/70 p-3 shadow-[0_16px_40px_rgba(31,23,36,0.04)]">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = statusFilter === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
              className={cn('flex items-center gap-2 px-4 py-2 rounded-lg whitespace-nowrap transition-colors', isActive ? 'bg-primary text-white' : 'bg-white/70 hover:bg-surface-hover text-text-muted')}
            >
              <Icon className="w-4 h-4" />
              <span className="font-medium">{tab.label}</span>
              <Badge variant="outline" className={cn('ml-1', isActive ? 'bg-white/20 text-white border-white/30' : '')}>{counts[tab.key]}</Badge>
            </button>
          );
        })}
      </div>

      <div className="dashboard-panel flex flex-col gap-4 rounded-[calc(var(--radius)+0.55rem)] border border-border/70 p-4 shadow-[0_16px_40px_rgba(31,23,36,0.04)] sm:flex-row">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={lang === 'ar' ? 'بحث عن نص أو عميل...' : 'Search scripts or clients...'} className="pl-10" />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-text-muted" />
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)} className="px-4 py-2 rounded-lg border border-border bg-surface/80 text-text-main focus:outline-none focus:ring-2 focus:ring-primary/20">
            <option value="date">{lang === 'ar' ? 'الأحدث' : 'Newest'}</option>
            <option value="title">{lang === 'ar' ? 'العنوان' : 'Title'}</option>
            <option value="client">{lang === 'ar' ? 'العميل' : 'Client'}</option>
          </select>
        </div>
      </div>

      <div className="text-sm text-text-muted">
        {lang === 'ar' ? `عرض ${filteredScripts.length} من ${counts[statusFilter]} نص` : `Showing ${filteredScripts.length} of ${counts[statusFilter]} scripts`}
      </div>

      {filteredScripts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <FileText className="w-12 h-12 text-text-muted mb-4" />
            <h3 className="text-lg font-semibold text-text-main mb-2">{lang === 'ar' ? 'لا توجد نصوص' : 'No Scripts Found'}</h3>
            <p className="text-text-muted max-w-md">
              {statusFilter === 'all'
                ? lang === 'ar' ? 'لم يتم العثور على نصوص مطابقة لبحثك' : 'No scripts match your search'
                : lang === 'ar' ? `لا توجد نصوص ${tabs.find((t) => t.key === statusFilter)?.label}` : `No ${tabs.find((t) => t.key === statusFilter)?.label} scripts`}
            </p>
          </CardContent>
        </Card>
      ) : viewMode === 'cards' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {pagedScripts.map((script) => {
            const client = companies.find((c) => c.companyId === script.companyId);
            return (
              <Card key={script.id} className="cursor-pointer transition-shadow hover:shadow-[0_20px_50px_rgba(31,23,36,0.08)]" onClick={() => navigate(`/scripts/${script.id}/workspace`)}>
                <CardContent className="p-6 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-text-main truncate">{script.title || (lang === 'ar' ? 'بدون عنوان' : 'Untitled')}</h3>
                      <p className="text-sm text-text-muted truncate">{client ? (lang === 'ar' ? client.nameAr : client.nameEn) : '—'}</p>
                    </div>
                    {getStatusBadge(script.status || 'draft')}
                  </div>
                  <div className="space-y-2 text-xs text-text-muted">
                    <div className="flex items-center justify-between">
                      <span>{lang === 'ar' ? 'تاريخ الإنشاء' : 'Created'}</span>
                      <span>{formatDate(new Date(script.createdAt || Date.now()), { lang, format: settings?.platform?.dateFormat })}</span>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-border">
                    <Button variant="ghost" size="sm" className="w-full" onClick={(e) => { e.stopPropagation(); navigate(`/scripts/${script.id}/workspace`); }}>
                      {lang === 'ar' ? 'فتح النص' : 'Open Script'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="dashboard-table-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left rtl:text-right">
              <thead className="border-b border-border text-xs uppercase text-text-muted">
                <tr>
                  <th className="px-6 py-4 font-medium">{lang === 'ar' ? 'العنوان' : 'Title'}</th>
                  <th className="px-6 py-4 font-medium">{lang === 'ar' ? 'العميل' : 'Client'}</th>
                  <th className="px-6 py-4 font-medium">{lang === 'ar' ? 'الحالة' : 'Status'}</th>
                  <th className="px-6 py-4 font-medium">{lang === 'ar' ? 'تاريخ الإنشاء' : 'Created'}</th>
                  <th className="px-6 py-4 font-medium text-end"></th>
                </tr>
              </thead>
              <tbody>
                {pagedScripts.map((script) => {
                  const client = companies.find((c) => c.companyId === script.companyId);
                  return (
                    <tr key={script.id} className="cursor-pointer border-b border-border bg-transparent transition-colors" onClick={() => navigate(`/scripts/${script.id}/workspace`)}>
                      <td className="px-6 py-4 font-medium text-text-main">{script.title || (lang === 'ar' ? 'بدون عنوان' : 'Untitled')}</td>
                      <td className="px-6 py-4 text-text-muted">{client ? (lang === 'ar' ? client.nameAr : client.nameEn) : '—'}</td>
                      <td className="px-6 py-4">{getStatusBadge(script.status || 'draft')}</td>
                      <td className="px-6 py-4 text-text-muted">{formatDate(new Date(script.createdAt || Date.now()), { lang, format: settings?.platform?.dateFormat })}</td>
                      <td className="px-6 py-4 text-end">
                        <Button variant="ghost" size="sm">{lang === 'ar' ? 'فتح' : 'Open'}</Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
      {pageCount > 1 && (
        <div className="flex items-center justify-between border-t border-border px-6 py-4">
          <span className="text-sm text-text-muted">{filteredScripts.length} {lang === 'ar' ? 'نتيجة' : 'results'}</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((v) => v - 1)}>{lang === 'ar' ? 'السابق' : 'Previous'}</Button>
            <span className="text-sm text-text-muted">{page} / {pageCount}</span>
            <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => setPage((v) => v + 1)}>{lang === 'ar' ? 'التالي' : 'Next'}</Button>
          </div>
        </div>
      )}
        </Card>
      )}

      {viewMode === 'cards' && pageCount > 1 && (
        <Card className="dashboard-table-card">
          <div className="flex items-center justify-between px-6 py-4">
            <span className="text-sm text-text-muted">{filteredScripts.length} {lang === 'ar' ? 'نتيجة' : 'results'}</span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((v) => v - 1)}>{lang === 'ar' ? 'السابق' : 'Previous'}</Button>
              <span className="text-sm text-text-muted">{page} / {pageCount}</span>
              <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => setPage((v) => v + 1)}>{lang === 'ar' ? 'التالي' : 'Next'}</Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
