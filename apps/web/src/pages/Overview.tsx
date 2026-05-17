import { useEffect, useState } from 'react';
import { useLangStore } from '../store/langStore';
import { dashboardService, DashboardStats } from '../services/dashboardService';
import { activityService, Activity } from '../services/activityService';
import { useAuthStore } from '../store/authStore';
import { useDataStore } from '../store/dataStore';
import { useSettingsStore } from '@/store/settingsStore';
import { formatDate, formatDateTimeValue } from '@/utils/dateFormat';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { RecentDecisionsWidget } from '../components/RecentDecisionsWidget';
import { useNavigate } from 'react-router-dom';
import {
  FileText,
  BarChart2,
  FileBarChart,
  ArrowLeft,
  ArrowRight,
  Clock,
  CheckCircle,
  XCircle,
  TrendingUp,
  Loader2,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import toast from 'react-hot-toast';
import { downloadStatusPdf } from '@/components/reports/status/download';
import { httpClient } from '@/api/httpClient';

export function Overview() {
  const { t, lang } = useLangStore();
  const { user, hasSection } = useAuthStore();
  const { fetchInitialData, scripts, companies } = useDataStore();
  const { settings } = useSettingsStore();
  const navigate = useNavigate();

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [exportingReport, setExportingReport] = useState(false);
  const [decisionDatesByScript, setDecisionDatesByScript] = useState<Record<string, string>>({});
  const [scriptsPage, setScriptsPage] = useState(1);
  const scriptsPageSize = 10;

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        setLoading(true);
        const [statsData, actData] = await Promise.all([
          dashboardService.getOverviewStats(),
          activityService.listRecent(),
          fetchInitialData()
        ]);
        setStats(statsData);
        setActivities(actData);
        try {
          const decisionRows = await httpClient.get('/dashboard/decision-dates') as Array<{ scriptId: string; status: string; changedAt: string }>;
          const map: Record<string, string> = {};
          for (const row of decisionRows ?? []) {
            if (row?.scriptId && row?.changedAt) map[row.scriptId] = row.changedAt;
          }
          setDecisionDatesByScript(map);
        } catch {
          setDecisionDatesByScript({});
        }
      } catch (error) {
        console.error('Failed to load dashboard:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchDashboard();
    const onInvalidate = () => fetchDashboard();
    window.addEventListener('dashboard-invalidate', onInvalidate);
    return () => window.removeEventListener('dashboard-invalidate', onInvalidate);
  }, [fetchInitialData]);

  const handleExportReport = async () => {
    if (!stats) return;
    setExportingReport(true);
    try {
      await downloadStatusPdf({
        stats,
        activities,
        scripts,
        companies,
        lang: lang === 'ar' ? 'ar' : 'en',
        dateFormat: settings?.platform?.dateFormat,
      });
      toast.success(lang === 'ar' ? 'تم تنزيل التقرير' : 'Report downloaded');
    } catch (err: unknown) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExportingReport(false);
    }
  };

  const isRegulator = user?.role === 'Regulator';
  const now = new Date();
  const beneficiariesJoinedThisMonth = companies.filter((company) => {
    const dt = company.createdAt ? new Date(company.createdAt) : null;
    return dt && !Number.isNaN(dt.getTime()) && dt.getMonth() === now.getMonth() && dt.getFullYear() === now.getFullYear();
  }).length;
  const totalBeneficiaries = companies.length;
  const companyCount = companies.filter((company) => (company.beneficiaryType ?? 'company') === 'company').length;
  const individualCount = companies.filter((company) => (company.beneficiaryType ?? 'company') === 'individual').length;
  const companyNameById = new Map<string, string>(
    companies.map((company) => [
      company.companyId,
      (company.beneficiaryType ?? 'company') === 'individual'
        ? (company.individualProfile?.fullName || company.representativeName || company.nameAr || company.nameEn || '—')
        : (company.nameAr || company.nameEn || '—'),
    ]),
  );
  const scriptsOverviewRows = scripts
    .slice()
    .sort((a, b) => {
      const da = new Date(a.receivedAt || a.createdAt || 0).getTime();
      const db = new Date(b.receivedAt || b.createdAt || 0).getTime();
      return db - da;
    });
  const scriptsPageCount = Math.max(1, Math.ceil(scriptsOverviewRows.length / scriptsPageSize));
  const currentScriptsPage = Math.min(scriptsPage, scriptsPageCount);
  const paginatedScriptsRows = scriptsOverviewRows.slice(
    (currentScriptsPage - 1) * scriptsPageSize,
    currentScriptsPage * scriptsPageSize,
  );

  useEffect(() => {
    setScriptsPage(1);
  }, [scriptsOverviewRows.length]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-surface-hover rounded animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-32 bg-surface-main rounded-lg animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="col-span-2 space-y-6">
            <div className="h-64 bg-surface-main rounded-lg animate-pulse" />
            <div className="h-64 bg-surface-main rounded-lg animate-pulse" />
          </div>
          <div className="space-y-6">
            <div className="h-48 bg-surface-main rounded-lg animate-pulse" />
            <div className="h-64 bg-surface-main rounded-lg animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  const ArrowIcon = lang === 'ar' ? ArrowLeft : ArrowRight;

  const getStatusChartData = () => {
    if (!stats) return [];
    return [
      { name: t('draft'), value: stats.scriptsByStatus.draft ?? 0, fill: 'var(--color-primary)' },
      { name: t('assigned'), value: stats.scriptsByStatus.assigned ?? 0, fill: 'var(--color-info)' },
      { name: t('analysis_running'), value: stats.scriptsByStatus.analysis_running ?? 0, fill: 'var(--color-warning)' },
      { name: t('review_required'), value: stats.scriptsByStatus.review_required ?? 0, fill: 'var(--color-secondary)' },
      { name: t('completed'), value: stats.scriptsByStatus.completed ?? 0, fill: 'var(--color-success)' }
    ];
  };

  const getFindingTypeChartData = () => {
    if (!stats) return [];
    return [
      { name: lang === 'ar' ? 'آلية' : 'AI', value: stats.findingsByType?.ai ?? 0, fill: 'var(--color-primary)' },
      { name: lang === 'ar' ? 'القاموس' : 'Glossary', value: stats.findingsByType?.glossary ?? 0, fill: 'var(--color-warning)' },
      { name: lang === 'ar' ? 'يدوية' : 'Manual', value: stats.findingsByType?.manual ?? 0, fill: 'var(--color-success)' },
      { name: lang === 'ar' ? 'خاصة' : 'Special', value: stats.findingsByType?.special ?? 0, fill: 'var(--color-info)' }
    ];
  };

  return (
    <div className="space-y-8 pb-8">
      <div className="dashboard-page-header flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between md:p-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.24em] text-text-muted">
            {lang === 'ar' ? 'لوحة الإدارة' : 'Admin Dashboard'}
          </p>
          <h1 className="mt-2 text-2xl font-bold text-text-main">{t('overview')}</h1>
        </div>
        <Button
          variant="outline"
          onClick={handleExportReport}
          disabled={exportingReport}
          className="gap-2"
        >
          {exportingReport ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileBarChart className="w-4 h-4" />}
          {exportingReport
            ? (lang === 'ar' ? 'جاري تجهيز PDF...' : 'Preparing PDF...')
            : (lang === 'ar' ? 'تقرير الحالة' : 'Status Report')}
        </Button>
      </div>

      {/* Stats cards: single grid — 1 row for regulator (5 cards), 2 rows for admin (8 cards) */}
      <div
        className={`grid gap-4 sm:gap-5 ${isRegulator ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4'}`}
      >
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-text-muted">{t('scriptsInReview')}</CardTitle>
            <FileText className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-text-main">{stats?.scriptsInReview || 0}</div>
            {hasSection('clients') && (
              <button onClick={() => navigate('/scripts')} className="mt-4 text-xs text-primary hover:underline flex items-center gap-1">
                {lang === 'ar' ? 'فتح النصوص' : 'Open Scripts'} <ArrowIcon className="h-3 w-3" />
              </button>
            )}
          </CardContent>
        </Card>

        {!isRegulator && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-text-muted">{t('reportsThisMonth')}</CardTitle>
              <BarChart2 className="h-4 w-4 text-success" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-text-main">{stats?.reportsThisMonth || 0}</div>
              {hasSection('reports') && (
                <button onClick={() => navigate('/reports')} className="mt-4 text-xs text-primary hover:underline flex items-center gap-1">
                  {t('goToReports')} <ArrowIcon className="h-3 w-3" />
                </button>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-text-muted">
              {lang === 'ar' ? 'نصوص مفسوحة' : 'Approved Scripts'}
            </CardTitle>
            <CheckCircle className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-text-main">
              {stats?.scriptsByStatus?.approved || 0}
            </div>
            {hasSection('clients') && (
              <button
                onClick={() => navigate('/scripts?status=approved')}
                className="mt-4 text-xs text-success hover:underline flex items-center gap-1"
              >
                {lang === 'ar' ? 'عرض النصوص المفسوحة' : 'View Approved'} <ArrowIcon className="h-3 w-3" />
              </button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-text-muted">
              {lang === 'ar' ? 'نصوص مرفوضة' : 'Rejected Scripts'}
            </CardTitle>
            <XCircle className="h-4 w-4 text-error" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-text-main">
              {stats?.scriptsByStatus?.rejected || 0}
            </div>
            {hasSection('clients') && (
              <button
                onClick={() => navigate('/scripts?status=rejected')}
                className="mt-4 text-xs text-error hover:underline flex items-center gap-1"
              >
                {lang === 'ar' ? 'عرض النصوص المرفوضة' : 'View Rejected'} <ArrowIcon className="h-3 w-3" />
              </button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-text-muted">
              {lang === 'ar' ? 'قيد الانتظار' : 'Pending Review'}
            </CardTitle>
            <Clock className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-text-main">
              {(stats?.scriptsByStatus?.review_required || 0) + (stats?.scriptsByStatus?.in_review || 0)}
            </div>
            {hasSection('clients') && (
              <button
                onClick={() => navigate('/scripts?status=pending')}
                className="mt-4 text-xs text-warning hover:underline flex items-center gap-1"
              >
                {lang === 'ar' ? 'مراجعة الآن' : 'Review Now'} <ArrowIcon className="h-3 w-3" />
              </button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-text-muted">
              {lang === 'ar' ? 'معدل القبول' : 'Approval Rate'}
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-text-main">
              {(() => {
                const approved = stats?.scriptsByStatus?.approved || 0;
                const rejected = stats?.scriptsByStatus?.rejected || 0;
                const total = approved + rejected;
                return total > 0 ? Math.round((approved / total) * 100) : 0;
              })()}%
            </div>
            <p className="mt-4 text-xs text-text-muted">
              {lang === 'ar' ? 'من النصوص المراجعة' : 'of reviewed scripts'}
            </p>
          </CardContent>
        </Card>
        {!isRegulator && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-text-muted">{lang === 'ar' ? 'إجمالي المستفيدين' : 'Total Beneficiaries'}</CardTitle>
              <FileText className="h-4 w-4 text-info" />
            </CardHeader>
            <CardContent><div className="text-3xl font-bold text-text-main">{totalBeneficiaries}</div></CardContent>
          </Card>
        )}
        {!isRegulator && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-text-muted">{lang === 'ar' ? 'انضموا هذا الشهر' : 'Joined This Month'}</CardTitle>
              <TrendingUp className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent><div className="text-3xl font-bold text-text-main">{beneficiariesJoinedThisMonth}</div></CardContent>
            <p className="px-6 pb-4 text-xs text-text-muted">
              {lang === 'ar' ? `شركات: ${companyCount} • أفراد: ${individualCount}` : `Companies: ${companyCount} • Individuals: ${individualCount}`}
            </p>
          </Card>
        )}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column (Charts & Queue) */}
        <div className="lg:col-span-2 space-y-8">
          {/* Charts Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>{t('scriptsByStatus')}</CardTitle>
              </CardHeader>
              <CardContent className="h-64 min-h-[200px]">
                {stats && Object.values(stats.scriptsByStatus).some(v => v > 0) ? (
                  <div className="w-full h-full min-h-[200px]" style={{ minHeight: 200 }}>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={getStatusChartData()} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'var(--color-text-muted)' }} />
                        <YAxis tick={{ fontSize: 12, fill: 'var(--color-text-muted)' }} />
                        <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid var(--color-border-main)' }} />
                        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                          {getStatusChartData().map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.fill} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center text-text-muted">{t('cleanLog')}</div>
                )}
              </CardContent>
            </Card>

            {!isRegulator && (
              <Card>
                <CardHeader>
                  <CardTitle>{t('findingsByType')}</CardTitle>
                </CardHeader>
                <CardContent className="h-64 min-h-[200px]">
                  {stats && Object.values(stats.findingsByType ?? {}).some(v => v > 0) ? (
                    <div className="w-full h-full min-h-[200px]" style={{ minHeight: 200 }}>
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={getFindingTypeChartData()} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'var(--color-text-muted)' }} />
                          <YAxis tick={{ fontSize: 12, fill: 'var(--color-text-muted)' }} />
                          <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid var(--color-border-main)' }} />
                          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                            {getFindingTypeChartData().map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.fill} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="h-full flex items-center justify-center text-text-muted">{t('cleanLog')}</div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Recent Activity intentionally hidden */}
        </div>

        {/* Right Column (Actions & Activity) */}
        <div className="space-y-8">
          {/* Recent Decisions */}
          <RecentDecisionsWidget />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{lang === 'ar' ? 'النصوص وحالتها' : 'Scripts and Status'}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-surface-hover">
                <tr>
                  <th className="px-4 py-2 text-start">{lang === 'ar' ? 'اسم النص' : 'Script Name'}</th>
                  <th className="px-4 py-2 text-start">{lang === 'ar' ? 'المستفيد' : 'Beneficiary'}</th>
                  <th className="px-4 py-2 text-start">{lang === 'ar' ? 'تاريخ الاستلام' : 'Date Received'}</th>
                  <th className="px-4 py-2 text-start">{lang === 'ar' ? 'الحالة' : 'Status'}</th>
                  <th className="px-4 py-2 text-start">{lang === 'ar' ? 'تاريخ الرفض/الموافقة' : 'Rejected/Approved Date'}</th>
                </tr>
              </thead>
              <tbody>
                {paginatedScriptsRows.map((script) => {
                  const status = String(script.status ?? '—');
                  const statusKey = status.toLowerCase();
                  const decisionDate = statusKey === 'approved'
                    ? ((script as any).approvedAt ?? decisionDatesByScript[script.id] ?? '—')
                    : statusKey === 'rejected'
                      ? ((script as any).rejectedAt ?? decisionDatesByScript[script.id] ?? '—')
                      : '—';
                  return (
                    <tr key={script.id} className="border-b border-border/60">
                      <td className="px-4 py-2">{script.title}</td>
                      <td className="px-4 py-2">{companyNameById.get(script.companyId) ?? '—'}</td>
                      <td className="px-4 py-2">
                        {formatDateTimeValue(script.receivedAt || script.createdAt, { lang, format: settings?.platform?.dateFormat })}
                      </td>
                      <td className="px-4 py-2">{status}</td>
                      <td className="px-4 py-2">
                        {formatDateTimeValue(decisionDate, { lang, format: settings?.platform?.dateFormat })}
                      </td>
                    </tr>
                  );
                })}
                {paginatedScriptsRows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-4 text-center text-text-muted">
                      {lang === 'ar' ? 'لا توجد نصوص حالياً' : 'No scripts yet'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {scriptsOverviewRows.length > scriptsPageSize && (
            <div className="mt-4 flex items-center justify-between text-xs text-text-muted">
              <span>
                {lang === 'ar'
                  ? `صفحة ${currentScriptsPage} من ${scriptsPageCount}`
                  : `Page ${currentScriptsPage} of ${scriptsPageCount}`}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={currentScriptsPage <= 1}
                  onClick={() => setScriptsPage((prev) => Math.max(1, prev - 1))}
                >
                  {lang === 'ar' ? 'السابق' : 'Previous'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={currentScriptsPage >= scriptsPageCount}
                  onClick={() => setScriptsPage((prev) => Math.min(scriptsPageCount, prev + 1))}
                >
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
