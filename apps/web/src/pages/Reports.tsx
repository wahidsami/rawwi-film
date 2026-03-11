import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLangStore } from '@/store/langStore';
import { useAuthStore } from '@/store/authStore';
import { reportService } from '@/services/reportService';
import { useDataStore } from '@/store/dataStore';
import { useSettingsStore } from '@/store/settingsStore';
import { formatDate } from '@/utils/dateFormat';
import { downloadAnalysisPdf } from '@/components/reports/analysis/download';
import toast from 'react-hot-toast';
import { reportsApi, findingsApi, type AnalysisFinding } from '@/api';
import { usersApi } from '@/api';
import { ReportListItem } from '@/api/models';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import {
  FileText, Search, FileDown, Eye, Calendar, Building2, User, RefreshCw, XCircle, CheckCircle, AlertTriangle, Loader2, ChevronLeft, ChevronRight
} from 'lucide-react';

function Reports() {
  const { t, lang } = useLangStore();
  const navigate = useNavigate();
  const { user, hasPermission } = useAuthStore();
  const { companies, fetchInitialData } = useDataStore();
  const { settings } = useSettingsStore();

  const [reports, setReports] = useState<ReportListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usersList, setUsersList] = useState<{ id: string; name: string }[]>([]);
  const [downloadingReportId, setDownloadingReportId] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [companyId, setCompanyId] = useState('all');
  const [decision, setDecision] = useState('all');
  const [userFilter, setUserFilter] = useState('all');
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  const loadReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // NEW: Use listAllReports - RLS policies handle filtering automatically
      // Regular users: see only their reports
      // Admins: see all reports
      const data = await reportService.listAllReports();
      setReports(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load reports');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const isAdmin = user?.role === 'Admin' || user?.role === 'Super Admin';
  const canManageUsers = hasPermission('manage_users');

  // Load full user list only when user can manage users (avoid 403 for Regulators)
  useEffect(() => {
    if (!canManageUsers) return;
    usersApi.getUsers().then((list) => {
      const active = list.filter((u) => u.status === 'active');
      setUsersList(active.map((u) => ({ id: u.id, name: u.name || u.email || 'Unknown' })).sort((a, b) => a.name.localeCompare(b.name)));
    }).catch(() => setUsersList([]));
  }, [canManageUsers]);

  const filteredReports = reports.filter(r => {
    const matchSearch = (r.scriptTitle ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (r.companyNameAr ?? '').includes(search) ||
      (r.companyNameEn ?? '').toLowerCase().includes(search.toLowerCase());
    const matchCompany = companyId === 'all' || r.companyId === companyId;
    const matchDecision = decision === 'all' || r.reviewStatus === decision;
    const matchUser = userFilter === 'all' || r.reportCreatorId === userFilter;
    return matchSearch && matchCompany && matchDecision && matchUser;
  });

  const totalFiltered = filteredReports.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const start = (currentPage - 1) * pageSize;
  const paginatedReports = filteredReports.slice(start, start + pageSize);

  useEffect(() => {
    setPage(1);
  }, [search, companyId, decision, userFilter]);

  const handleOpen = (report: ReportListItem) => {
    const path = `/report/${report.jobId ?? report.id}?by=${report.jobId ? 'job' : 'id'}`;
    const mode = settings?.platform?.reportMode ?? 'both';
    if (mode === 'standalone') {
      window.open(path, '_blank');
    } else {
      navigate(path);
    }
  };

  const handleDownloadPdf = async (e: React.MouseEvent, report: ReportListItem) => {
    e.stopPropagation();
    if (downloadingReportId) return;
    setDownloadingReportId(report.id || null);

    try {
      const fullReport = await reportsApi.getById(report.id!);
      let findings: AnalysisFinding[] = [];
      if (fullReport.jobId) {
        try {
          findings = await findingsApi.getByJob(fullReport.jobId);
        } catch { /* proceed with summary if findings fail */ }
      }

      const isAr = lang === 'ar';
      const hasRealFindings = findings.length > 0;

      await downloadAnalysisPdf({
        scriptTitle: fullReport.scriptTitle || (isAr ? 'تحليل النص' : 'Script Analysis'),
        clientName: fullReport.clientName || (isAr ? 'عميل' : 'Client'),
        createdAt: fullReport.createdAt,
        findings,
        findingsByArticle: fullReport.summaryJson?.findings_by_article,
        canonicalFindings: fullReport.summaryJson?.canonical_findings,
        lang: isAr ? 'ar' : 'en',
        dateFormat: settings?.platform?.dateFormat,
      });

      toast.success(isAr ? 'تم تنزيل PDF' : 'PDF downloaded');
    } catch (err: any) {
      console.error(err);
      toast.error(lang === 'ar' ? 'تعذر تنزيل PDF، سيتم الفتح للطباعة' : 'PDF direct download failed, opening print view');
      handleOpen(report);
    } finally {
      setDownloadingReportId(null);
    }
  };

  const decisionConfig: Record<string, { label: string; color: string }> = {
    approved: { label: t('approved' as any) || 'Approved', color: 'success' },
    rejected: { label: t('rejected' as any) || 'Rejected', color: 'error' },
    under_review: { label: t('reviewRequired' as any) || 'Review', color: 'warning' }
  };

  const handleExportCsv = () => {
    const headers = ['id', 'jobId', 'companyId', 'companyNameEn', 'companyNameAr', 'scriptTitle', 'createdAt', 'reviewStatus', 'findingsCount', 'reportCreatorName'];
    const rows = filteredReports.map(r => [
      r.id ?? '',
      r.jobId ?? '',
      r.companyId ?? '',
      (r.companyNameEn ?? '').replace(/"/g, '""'),
      (r.companyNameAr ?? '').replace(/"/g, '""'),
      (r.scriptTitle ?? '').replace(/"/g, '""'),
      r.createdAt ?? '',
      r.reviewStatus ?? '',
      String(r.findingsCount ?? 0),
      (r.reportCreatorName ?? '').replace(/"/g, '""'),
    ]);
    const csvContent = [headers.join(','), ...rows.map(row => row.map(cell => `"${cell}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reports-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-main">{t('reports')}</h1>
          <p className="text-text-muted mt-1">{t('reportsSubtitle' as any)}</p>
        </div>
        <Button variant="outline" className="flex items-center gap-2" onClick={handleExportCsv}>
          <FileDown className="w-4 h-4" />
          <span className="hidden sm:inline">{t('exportCsv')}</span>
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-text-muted">{t('totalReports' as any)}</span>
              <FileText className="h-4 w-4 text-primary" />
            </div>
            <div className="text-2xl font-bold text-text-main">{reports.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-text-muted">{t('reportsThisMonth' as any)}</span>
              <Calendar className="h-4 w-4 text-info" />
            </div>
            <div className="text-2xl font-bold text-text-main">{reports.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-text-muted">{t('approved' as any)}</span>
              <CheckCircle className="h-4 w-4 text-success" />
            </div>
            <div className="text-2xl font-bold text-success">
              {reports.filter(r => r.reviewStatus === 'approved').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-text-muted">{t('rejected' as any)}</span>
              <XCircle className="h-4 w-4 text-error" />
            </div>
            <div className="text-2xl font-bold text-error">
              {reports.filter(r => r.reviewStatus === 'rejected').length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="w-full lg:w-1/3">
          <Input
            placeholder={t('search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            icon={<Search className="w-4 h-4" />}
          />
        </div>
        <div className="w-full lg:w-2/3 flex flex-col sm:flex-row gap-4">
          <Select
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
            options={[
              { label: lang === 'ar' ? 'جميع الشركات' : 'All Companies', value: 'all' },
              ...companies.map(c => ({ label: lang === 'ar' ? c.nameAr : c.nameEn, value: c.companyId }))
            ]}
          />
          <Select
            value={decision}
            onChange={(e) => setDecision(e.target.value)}
            options={[
              { label: lang === 'ar' ? 'جميع الحالات' : 'All Decisions', value: 'all' },
              { label: t('approved' as any) || 'Approved', value: 'approved' },
              { label: t('rejected' as any) || 'Rejected', value: 'rejected' },
              { label: t('reviewRequired' as any) || 'Under Review', value: 'under_review' }
            ]}
          />
          {/* Admin-only: Filter by user (full user list so all users appear in dropdown) */}
          {isAdmin && (
            <Select
              value={userFilter}
              onChange={(e) => setUserFilter(e.target.value)}
              options={[
                { label: lang === 'ar' ? 'جميع المستخدمين' : 'All Users', value: 'all' },
                ...usersList.map((u) => ({ label: u.name, value: u.id }))
              ]}
            />
          )}
        </div>
      </div>

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex justify-center p-12"><RefreshCw className="w-8 h-8 animate-spin text-primary" /></div>
          ) : error ? (
            <div className="p-12 text-center text-error flex flex-col items-center">
              <AlertTriangle className="w-8 h-8 mb-2" />
              <p>{error}</p>
              <Button onClick={loadReports} className="mt-4" variant="outline">{t('retry')}</Button>
            </div>
          ) : filteredReports.length === 0 ? (
            <div className="text-center p-12 text-text-muted">{t('noReportsFound')}</div>
          ) : (
            <table className="w-full text-sm text-start">
              <thead className="text-xs text-text-muted uppercase bg-background border-b border-border">
                <tr>
                  <th className="px-6 py-4 font-semibold">{t('reportId' as any)}</th>
                  <th className="px-6 py-4 font-semibold">{t('company' as any)}</th>
                  <th className="px-6 py-4 font-semibold">{t('scriptTitle' as any)}</th>
                  <th className="px-6 py-4 font-semibold">{t('reportDate' as any)}</th>
                  <th className="px-6 py-4 font-semibold">{t('reviewer' as any)}</th>
                  <th className="px-6 py-4 font-semibold">{t('decision' as any)}</th>
                  <th className="px-6 py-4 font-semibold">{t('totalFindings' as any)}</th>
                  <th className="px-6 py-4 font-semibold text-end">{lang === 'ar' ? 'الإجراءات' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paginatedReports.map(report => (
                  <tr key={report.id} className="bg-surface hover:bg-background/50 transition-colors cursor-pointer" onClick={() => handleOpen(report)}>
                    <td className="px-6 py-4 font-mono text-xs text-text-muted">{report.id?.substring(0, 8)}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-text-muted" />
                        <span className="font-medium text-text-main">{lang === 'ar' ? report.companyNameAr : report.companyNameEn}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="font-semibold text-text-main">{report.scriptTitle}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-text-muted">{formatDate(new Date(report.createdAt), { lang, format: settings?.platform?.dateFormat })}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-xs">
                        <User className="w-4 h-4 text-text-muted" />
                        {report.reportCreatorName ?? 'N/A'}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant={decisionConfig[report.reviewStatus]?.color as any}>
                        {decisionConfig[report.reviewStatus]?.label || report.reviewStatus}
                      </Badge>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className="font-bold">{report.findingsCount ?? 0}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); handleOpen(report); }} className="h-8">
                          <Eye className="w-3.5 h-3.5 mr-1.5 rtl:ml-1.5 rtl:mr-0" />
                          {t('open' as any)}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={(e) => handleDownloadPdf(e, report)} disabled={downloadingReportId === report.id} className="h-8 hover:bg-primary/10 hover:text-primary transition-colors">
                          {downloadingReportId === report.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {!loading && !error && filteredReports.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-t border-border bg-background">
            <div className="flex items-center gap-3">
              <span className="text-sm text-text-muted">{lang === 'ar' ? 'عرض' : 'Show'}</span>
              <Select
                value={String(pageSize)}
                onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                options={[
                  { label: '10', value: '10' },
                  { label: '30', value: '30' },
                  { label: '50', value: '50' },
                  { label: '100', value: '100' },
                ]}
              />
              <span className="text-sm text-text-muted">{lang === 'ar' ? 'في الصفحة' : 'per page'}</span>
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
      </Card>
    </div>
  );
}

export default Reports;