import { useEffect, useState } from 'react';
import { useLangStore } from '../store/langStore';
import { dashboardService, DashboardStats } from '../services/dashboardService';
import { activityService, Activity } from '../services/activityService';
import { useAuthStore } from '../store/authStore';
import { useDataStore } from '../store/dataStore';
import { useSettingsStore } from '@/store/settingsStore';
import { formatDate } from '@/utils/dateFormat';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { RecentDecisionsWidget } from '../components/RecentDecisionsWidget';
import { useNavigate } from 'react-router-dom';
import {
  ClipboardList,
  FileText,
  BarChart2,
  AlertTriangle,
  Plus,
  UploadCloud,
  PlayCircle,
  FileBarChart,
  BookOpen,
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

export function Overview() {
  const { t, lang } = useLangStore();
  const { user, hasPermission, hasSection } = useAuthStore();
  const { fetchInitialData } = useDataStore();
  const { settings } = useSettingsStore();
  const navigate = useNavigate();

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [exportingReport, setExportingReport] = useState(false);

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

  const canManage = user?.role === 'Super Admin' || user?.role === 'Admin' || user?.role === 'Regulator';
  const canViewAudit = hasSection('audit');
  const isRegulator = user?.role === 'Regulator';

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
        {!isRegulator && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-text-muted">{t('pendingTasks')}</CardTitle>
              <ClipboardList className="h-4 w-4 text-warning" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-text-main">{stats?.pendingTasks || 0}</div>
              {hasSection('tasks') && (
                <button onClick={() => navigate('/tasks')} className="mt-4 text-xs text-primary hover:underline flex items-center gap-1">
                  {t('viewTasks')} <ArrowIcon className="h-3 w-3" />
                </button>
              )}
            </CardContent>
          </Card>
        )}

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

        {!isRegulator && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-text-muted">{t('totalFindings')}</CardTitle>
              <AlertTriangle className="h-4 w-4 text-error" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-text-main">{stats?.totalFindings || 0}</div>
              {hasSection('reports') && (
                <button onClick={() => navigate('/reports')} className="mt-4 text-xs text-primary hover:underline flex items-center gap-1">
                  {t('viewResults')} <ArrowIcon className="h-3 w-3" />
                </button>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-text-muted">
              {lang === 'ar' ? 'نصوص مقبولة' : 'Approved Scripts'}
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
                {lang === 'ar' ? 'عرض النصوص المقبولة' : 'View Approved'} <ArrowIcon className="h-3 w-3" />
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
          {/* Quick Actions */}
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader>
              <CardTitle className="text-primary-dark">{t('quickActions')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {!isRegulator && hasSection('clients') && (
                <>
                  <Button variant="outline" className="w-full justify-start gap-3 bg-surface-main" onClick={() => navigate('/clients')}>
                    <Plus className="h-4 w-4" /> {t('addClientAction')}
                  </Button>
                  <Button variant="outline" className="w-full justify-start gap-3 bg-surface-main" onClick={() => navigate('/clients')}>
                    <UploadCloud className="h-4 w-4" /> {t('uploadScriptAction')}
                  </Button>
                </>
              )}
              {hasSection('clients') && (
                <Button variant="outline" className="w-full justify-start gap-3 bg-surface-main" onClick={() => navigate('/scripts')}>
                  <FileText className="h-4 w-4" /> {lang === 'ar' ? 'فتح النصوص' : 'Open Scripts'}
                </Button>
              )}
              {!isRegulator && hasSection('tasks') && (
                <Button variant="outline" className="w-full justify-start gap-3 bg-surface-main" onClick={() => navigate('/tasks')}>
                  <PlayCircle className="h-4 w-4" /> {t('startAnalysisAction')}
                </Button>
              )}
              {!isRegulator && hasSection('reports') && (
                <Button variant="outline" className="w-full justify-start gap-3 bg-surface-main" onClick={() => navigate('/reports')}>
                  <FileBarChart className="h-4 w-4" /> {t('generateReportAction')}
                </Button>
              )}
              {hasSection('glossary') && (
                <Button variant="outline" className="w-full justify-start gap-3 bg-surface-main" onClick={() => navigate('/glossary')}>
                  <BookOpen className="h-4 w-4" /> {t('addTermAction')}
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Recent Decisions */}
          <RecentDecisionsWidget />
        </div>
      </div>
    </div>
  );
}
