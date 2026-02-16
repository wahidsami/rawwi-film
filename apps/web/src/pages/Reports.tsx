import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLangStore } from '@/store/langStore';
import { useAuthStore } from '@/store/authStore';
import { reportService } from '@/services/reportService';
import { useDataStore } from '@/store/dataStore';
import { ReportListItem } from '@/api/models';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import {
  FileText, Search, FileDown, Printer, Eye, Calendar, Building2, User, RefreshCw, XCircle, CheckCircle, AlertTriangle
} from 'lucide-react';

function Reports() {
  const { t, lang } = useLangStore();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { companies, fetchInitialData } = useDataStore();

  const [reports, setReports] = useState<ReportListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [companyId, setCompanyId] = useState('all');
  const [decision, setDecision] = useState('all');
  const [userFilter, setUserFilter] = useState('all'); // For admin filtering

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  const loadReports = async () => {
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
  };

  useEffect(() => {
    loadReports();
  }, [user]);

  const isAdmin = user?.role === 'Admin' || user?.role === 'Super Admin';

  // Get unique users for admin filtering
  const uniqueUsers = isAdmin
    ? Array.from(new Set(reports.map(r => r.reportCreatorId).filter(Boolean))).map(id => {
      const report = reports.find(r => r.reportCreatorId === id);
      return { id, name: report?.reportCreatorName ?? 'Unknown' };
    })
    : [];

  const filteredReports = reports.filter(r => {
    const matchSearch = (r.scriptTitle ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (r.companyNameAr ?? '').includes(search) ||
      (r.companyNameEn ?? '').toLowerCase().includes(search.toLowerCase());
    const matchCompany = companyId === 'all' || r.companyId === companyId;
    const matchDecision = decision === 'all' || r.reviewStatus === decision;
    const matchUser = userFilter === 'all' || r.reportCreatorId === userFilter;
    return matchSearch && matchCompany && matchDecision && matchUser;
  });

  const handleOpen = (report: ReportListItem) => navigate(`/report/${(report as any).jobId ?? (report as any).id}?by=${(report as any).jobId ? 'job' : 'id'}`);

  const handlePrint = (e: React.MouseEvent, report: ReportListItem) => {
    e.stopPropagation();
    handleOpen(report);
  };

  const decisionConfig: Record<string, { label: string; color: string }> = {
    PASS: { label: t('approved' as any) || 'Approved', color: 'success' },
    REJECT: { label: t('rejected' as any) || 'Rejected', color: 'error' },
    REVIEW_REQUIRED: { label: t('reviewRequired' as any) || 'Review', color: 'warning' },
    DRAFT: { label: 'Draft', color: 'default' }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-main">{t('reports')}</h1>
          <p className="text-text-muted mt-1">{t('reportsSubtitle' as any)}</p>
        </div>
        <Button variant="outline" className="flex items-center gap-2">
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
              {reports.filter(r => r.decision_status === 'PASS').length}
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
              {reports.filter(r => r.decision_status === 'REJECT').length}
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
              { label: t('approved' as any) || 'Approved', value: 'PASS' },
              { label: t('rejected' as any) || 'Rejected', value: 'REJECT' },
              { label: t('reviewRequired' as any) || 'Review', value: 'REVIEW_REQUIRED' }
            ]}
          />
          {/* Admin-only: Filter by user */}
          {isAdmin && uniqueUsers.length > 0 && (
            <Select
              value={userFilter}
              onChange={(e) => setUserFilter(e.target.value)}
              options={[
                { label: lang === 'ar' ? 'جميع المستخدمين' : 'All Users', value: 'all' },
                ...uniqueUsers.map(u => ({ label: u.name, value: u.id }))
              ]}
            />
          )}
          <Button variant="ghost" onClick={() => { setSearch(''); setCompanyId('all'); setDecision('all'); setUserFilter('all'); }}>
            <RefreshCw className="w-4 h-4 mr-2 rtl:ml-2 rtl:mr-0" />
            {lang === 'ar' ? 'إعادة ضبط' : 'Reset'}
          </Button>
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
              <Button onClick={loadReports} className="mt-4" variant="outline">Retry</Button>
            </div>
          ) : filteredReports.length === 0 ? (
            <div className="text-center p-12 text-text-muted">{lang === 'ar' ? 'لا يوجد تقارير.' : 'No reports found.'}</div>
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
                {filteredReports.map(report => (
                  <tr key={report.report_id} className="bg-surface hover:bg-background/50 transition-colors cursor-pointer" onClick={() => handleOpen(report)}>
                    <td className="px-6 py-4 font-mono text-xs text-text-muted">{report.report_id}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-text-muted" />
                        <span className="font-medium text-text-main">{lang === 'ar' ? report.company_name_ar : report.company_name_en}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="font-semibold text-text-main">{report.script_title}</span>
                        <span className="text-xs text-text-muted">{report.script_type}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-text-muted">{new Date(report.created_at).toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-US')}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-xs">
                        <User className="w-4 h-4 text-text-muted" />
                        {report.reviewer_user.name}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant={decisionConfig[report.decision_status]?.color as any}>
                        {decisionConfig[report.decision_status]?.label || report.decision_status}
                      </Badge>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className="font-bold">{Number.isFinite(Number(report.findings_count_total)) ? report.findings_count_total : 0}</span>
                        <div className="flex gap-1 text-[10px] font-bold">
                          {(Number(report.severity_counts?.critical) || 0) > 0 && <span className="bg-error-100 text-error-700 px-1 rounded">C:{Number.isFinite(Number(report.severity_counts?.critical)) ? report.severity_counts.critical : 0}</span>}
                          {(Number(report.severity_counts?.high) || 0) > 0 && <span className="bg-error-50 text-error px-1 rounded">H:{Number.isFinite(Number(report.severity_counts?.high)) ? report.severity_counts.high : 0}</span>}
                          {(Number(report.severity_counts?.medium) || 0) > 0 && <span className="bg-warning-50 text-warning-700 px-1 rounded">M:{Number.isFinite(Number(report.severity_counts?.medium)) ? report.severity_counts.medium : 0}</span>}
                          {(Number(report.severity_counts?.low) || 0) > 0 && <span className="bg-info-50 text-info-700 px-1 rounded">L:{Number.isFinite(Number(report.severity_counts?.low)) ? report.severity_counts.low : 0}</span>}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); handleOpen(report); }} className="h-8">
                          <Eye className="w-3.5 h-3.5 mr-1.5 rtl:ml-1.5 rtl:mr-0" />
                          {t('open' as any)}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={(e) => handlePrint(e, report)} className="h-8 hover:bg-primary/10 hover:text-primary">
                          <Printer className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </div>
  );
}

export default Reports;