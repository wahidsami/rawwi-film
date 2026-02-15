import { useEffect, useState } from 'react';
import { useLangStore } from '../store/langStore';
import { dashboardService, DashboardStats } from '../services/dashboardService';
import { activityService, Activity } from '../services/activityService';
import { useAuthStore } from '../store/authStore';
import { useDataStore } from '../store/dataStore';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { RecentDecisionsWidget } from '../components/RecentDecisionsWidget';
import { useNavigate } from 'react-router-dom';
import {
  ClipboardList,
  FileText,
  BarChart2,
  AlertTriangle,
  Plus,
  UploadCloud,
  UserPlus,
  PlayCircle,
  FileBarChart,
  BookOpen,
  ArrowLeft,
  ArrowRight,
  Clock,
  CheckCircle,
  XCircle,
  TrendingUp
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import toast from 'react-hot-toast';

export function Overview() {
  const { t, lang } = useLangStore();
  const { user, hasPermission } = useAuthStore();
  const { tasks, fetchInitialData } = useDataStore();
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
  }, [fetchInitialData]);

  const handleExportReport = async () => {
    if (!stats) return;
    setExportingReport(true);
    try {
      // 1. Fetch Template
      const response = await fetch('/templates/dashboard-report-template.html');
      const template = await response.text();

      const isAr = lang === 'ar';
      const baseUrl = window.location.origin;

      // Images
      const loginLogo = `${baseUrl}/loginlogo.png`;
      const footerImg = `${baseUrl}/footer.png`;
      const dashLogo = `${baseUrl}/loginlogo.png`;

      // 2. Prepare Data
      const totalScripts = Object.values(stats.scriptsByStatus).reduce((a, b) => a + b, 0) || 1;
      const totalFindings = Object.values(stats.findingsBySeverity).reduce((a, b) => a + b, 0) || 1;

      const pDraft = Math.round((stats.scriptsByStatus.draft / totalScripts) * 100);
      const pAssigned = Math.round((stats.scriptsByStatus.assigned / totalScripts) * 100);
      const pReview = Math.round((stats.scriptsByStatus.review_required / totalScripts) * 100);
      const pCompleted = Math.round((stats.scriptsByStatus.completed / totalScripts) * 100);

      const pCritical = Math.round((stats.findingsBySeverity.critical / totalFindings) * 100);
      const pHigh = Math.round((stats.findingsBySeverity.high / totalFindings) * 100);
      const pMedium = Math.round((stats.findingsBySeverity.medium / totalFindings) * 100);
      const pLow = Math.round((stats.findingsBySeverity.low / totalFindings) * 100);

      // 3. Replacements
      let html = template;
      const replacements: Record<string, string> = {
        '{{lang}}': isAr ? 'ar' : 'en',
        '{{dir}}': isAr ? 'rtl' : 'ltr',
        '{{formattedDate}}': new Date().toLocaleDateString(isAr ? 'ar-SA' : 'en-GB'),
        '{{generationTimestamp}}': new Date().toLocaleString(),
        '{{loginLogoBase64}}': loginLogo,
        '{{footerImageBase64}}': footerImg,
        '{{dashboardLogoBase64}}': dashLogo,

        // Stats Values
        '{{stats.pendingTasks}}': String(stats.pendingTasks),
        '{{stats.scriptsInReview}}': String(stats.scriptsInReview),
        '{{stats.reportsThisMonth}}': String(stats.reportsThisMonth),
        '{{stats.criticalFindings}}': String(stats.highCriticalFindings),

        // Script Status
        '{{stats.draft}}': String(stats.scriptsByStatus.draft),
        '{{stats.assigned}}': String(stats.scriptsByStatus.assigned),
        '{{stats.review}}': String(stats.scriptsByStatus.review_required),
        '{{stats.completed}}': String(stats.scriptsByStatus.completed),
        '{{stats.percentDraft}}': String(pDraft),
        '{{stats.percentAssigned}}': String(pAssigned),
        '{{stats.percentReview}}': String(pReview),
        '{{stats.percentCompleted}}': String(pCompleted),

        // Findings Severity
        '{{stats.critical}}': String(stats.findingsBySeverity.critical),
        '{{stats.high}}': String(stats.findingsBySeverity.high),
        '{{stats.medium}}': String(stats.findingsBySeverity.medium),
        '{{stats.low}}': String(stats.findingsBySeverity.low),
        '{{stats.percentCritical}}': String(pCritical),
        '{{stats.percentHigh}}': String(pHigh),
        '{{stats.percentMedium}}': String(pMedium),
        '{{stats.percentLow}}': String(pLow),

        // Labels
        '{{labels.reportTitle}}': isAr ? 'تقرير حالة النظام' : 'System Status Report',
        '{{labels.subtitle}}': isAr ? 'لوحة القيادة التنفيذية' : 'Executive Dashboard',
        '{{labels.generatedOn}}': isAr ? 'تاريخ التقرير' : 'Generated On',
        '{{labels.systemOverview}}': isAr ? 'نظرة عامة على أداء النظام والأنشطة الأخيرة' : 'System performance overview and recent activities',
        '{{labels.executiveSummary}}': isAr ? 'الملخص التنفيذي' : 'Executive Summary',
        '{{labels.pendingTasks}}': isAr ? 'مهام معلقة' : 'Pending Tasks',
        '{{labels.inReview}}': isAr ? 'نصوص قيد المراجعة' : 'Scripts in Review',
        '{{labels.reportsMonth}}': isAr ? 'تقارير هذا الشهر' : 'Reports This Month',
        '{{labels.criticalFindings}}': isAr ? 'ملاحظات حرجة' : 'Critical/High Findings',

        '{{labels.scriptStatus}}': isAr ? 'توزيع حالات النصوص' : 'Script Status Distribution',
        '{{labels.findingsSeverity}}': isAr ? 'تحليل المخاطر (الملاحظات)' : 'Risk Analysis (Findings)',
        '{{labels.recentActivity}}': isAr ? 'الأنشطة الأخيرة' : 'Recent Activity',

        '{{labels.statusDraft}}': isAr ? 'مسودة' : 'Draft',
        '{{labels.statusAssigned}}': isAr ? 'معين' : 'Assigned',
        '{{labels.statusReview}}': isAr ? 'مراجعة' : 'Review',
        '{{labels.statusCompleted}}': isAr ? 'مكتمل' : 'Completed',

        '{{labels.severityCritical}}': isAr ? 'حرج' : 'Critical',
        '{{labels.severityHigh}}': isAr ? 'عالي' : 'High',
        '{{labels.severityMedium}}': isAr ? 'متوسط' : 'Medium',
        '{{labels.severityLow}}': isAr ? 'منخفض' : 'Low',
      };

      Object.entries(replacements).forEach(([key, val]) => {
        html = html.split(key).join(val);
      });

      // 4. Activity Rows
      const rowsHtml = activities.slice(0, 15).map(act => `
        <div class="activity-item">
            <div class="activity-icon"></div>
            <div class="activity-content">
                <div class="activity-action">${act.action}</div>
                <div class="activity-meta">
                    <span style="font-weight: 600;">${act.actor}</span> • ${act.time}
                </div>
            </div>
        </div>
      `).join('');

      const loopRegex = /{{#each activities}}([\s\S]*?){{\/each}}/m;
      html = html.replace(loopRegex, rowsHtml);

      // 5. Open Window
      const win = window.open('', '_blank');
      if (!win) {
        toast.error(isAr ? 'تم حظر النافذة المنبثقة' : 'Popup blocked');
        return;
      }

      setTimeout(() => {
        win.document.write(html);
        win.document.close();
        setTimeout(() => win.print(), 500);
      }, 100);

    } catch (err: unknown) {
      console.error(err);
      toast.error('Export failed');
    } finally {
      setExportingReport(false);
    }
  };

  const canManage = user?.role === 'Super Admin' || user?.role === 'Admin' || user?.role === 'Regulator';
  const canViewAudit = hasPermission('view_audit');

  const myTasks = tasks.filter(t => t.status !== 'completed' && t.status !== 'completed_with_errors');

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
      { name: t('draft'), value: stats.scriptsByStatus.draft, fill: 'var(--color-primary)' },
      { name: t('assigned'), value: stats.scriptsByStatus.assigned, fill: 'var(--color-info)' },
      { name: t('analysis_running'), value: stats.scriptsByStatus.analysis_running, fill: 'var(--color-warning)' },
      { name: t('review_required'), value: stats.scriptsByStatus.review_required, fill: 'var(--color-secondary)' },
      { name: t('completed'), value: stats.scriptsByStatus.completed, fill: 'var(--color-success)' }
    ];
  };

  const getSeverityChartData = () => {
    if (!stats) return [];
    return [
      { name: t('critical'), value: stats.findingsBySeverity.critical, fill: 'var(--color-error)' },
      { name: t('high'), value: stats.findingsBySeverity.high, fill: 'var(--color-error-hover)' },
      { name: t('medium'), value: stats.findingsBySeverity.medium, fill: 'var(--color-warning)' },
      { name: t('low'), value: stats.findingsBySeverity.low, fill: 'var(--color-info)' }
    ];
  };

  return (
    <div className="space-y-8 pb-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-main">{t('overview')}</h1>
        <Button
          variant="outline"
          onClick={handleExportReport}
          disabled={exportingReport}
          className="gap-2"
        >
          <FileBarChart className="w-4 h-4" />
          {lang === 'ar' ? 'تقرير الحالة' : 'Status Report'}
        </Button>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-text-muted">{t('pendingTasks')}</CardTitle>
            <ClipboardList className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-text-main">{stats?.pendingTasks || 0}</div>
            <button onClick={() => navigate('/tasks')} className="mt-4 text-xs text-primary hover:underline flex items-center gap-1">
              {t('viewTasks')} <ArrowIcon className="h-3 w-3" />
            </button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-text-muted">{t('scriptsInReview')}</CardTitle>
            <FileText className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-text-main">{stats?.scriptsInReview || 0}</div>
            <button onClick={() => navigate('/clients')} className="mt-4 text-xs text-primary hover:underline flex items-center gap-1">
              {lang === 'ar' ? 'فتح النصوص' : 'Open Scripts'} <ArrowIcon className="h-3 w-3" />
            </button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-text-muted">{t('reportsThisMonth')}</CardTitle>
            <BarChart2 className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-text-main">{stats?.reportsThisMonth || 0}</div>
            <button onClick={() => navigate('/reports')} className="mt-4 text-xs text-primary hover:underline flex items-center gap-1">
              {t('goToReports')} <ArrowIcon className="h-3 w-3" />
            </button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-text-muted">{t('highCriticalFindings')}</CardTitle>
            <AlertTriangle className="h-4 w-4 text-error" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-text-main">{stats?.highCriticalFindings || 0}</div>
            <button onClick={() => navigate('/reports')} className="mt-4 text-xs text-primary hover:underline flex items-center gap-1">
              {t('viewResults')} <ArrowIcon className="h-3 w-3" />
            </button>
          </CardContent>
        </Card>
      </div>

      {/* Approval Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
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
            <button
              onClick={() => navigate('/scripts?status=approved')}
              className="mt-4 text-xs text-success hover:underline flex items-center gap-1"
            >
              {lang === 'ar' ? 'عرض النصوص المقبولة' : 'View Approved'} <ArrowIcon className="h-3 w-3" />
            </button>
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
            <button
              onClick={() => navigate('/scripts?status=rejected')}
              className="mt-4 text-xs text-error hover:underline flex items-center gap-1"
            >
              {lang === 'ar' ? 'عرض النصوص المرفوضة' : 'View Rejected'} <ArrowIcon className="h-3 w-3" />
            </button>
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
            <button
              onClick={() => navigate('/scripts?status=pending')}
              className="mt-4 text-xs text-warning hover:underline flex items-center gap-1"
            >
              {lang === 'ar' ? 'مراجعة الآن' : 'Review Now'} <ArrowIcon className="h-3 w-3" />
            </button>
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

            <Card>
              <CardHeader>
                <CardTitle>{t('findingsBySeverity')}</CardTitle>
              </CardHeader>
              <CardContent className="h-64 min-h-[200px]">
                {stats && Object.values(stats.findingsBySeverity).some(v => v > 0) ? (
                  <div className="w-full h-full min-h-[200px]" style={{ minHeight: 200 }}>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={getSeverityChartData()} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'var(--color-text-muted)' }} />
                        <YAxis tick={{ fontSize: 12, fill: 'var(--color-text-muted)' }} />
                        <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid var(--color-border-main)' }} />
                        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                          {getSeverityChartData().map((entry, index) => (
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
          </div>

          {/* My Queue */}
          <Card>
            <CardHeader>
              <CardTitle>{t('myQueue')}</CardTitle>
            </CardHeader>
            <CardContent>
              {myTasks.length === 0 ? (
                <div className="text-center py-8 text-text-muted bg-surface-hover rounded-lg border border-dashed border-border-main">
                  {t('cleanLog')}
                </div>
              ) : (
                <div className="space-y-4">
                  {myTasks.map(task => (
                    <div key={task.id} className="flex items-center justify-between p-4 bg-surface-hover rounded-lg border border-border-main">
                      <div>
                        <h4 className="font-semibold text-text-main">{task.scriptTitle || task.scriptId}</h4>
                        <div className="text-xs text-text-muted mt-1 flex items-center gap-2">
                          {'progressDone' in task ? (
                            <>
                              <span>{task.progressDone}/{task.progressTotal}</span>
                              <span>•</span>
                              <span>{task.progressPercent}%</span>
                            </>
                          ) : (
                            <span className="italic">{lang === 'ar' ? 'بانتظار التحليل' : 'Pending Analysis'}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <Badge variant={
                          task.status === 'Ready' ? 'success' :
                            task.status === 'failed' ? 'error' :
                              task.status === 'completed' ? 'default' :
                                'warning'
                        }>
                          {t(task.status as any) || task.status}
                        </Badge>
                        <Button size="sm" onClick={() => navigate(`/workspace/${task.scriptId}`)}>{t('openScript')}</Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column (Actions & Activity) */}
        <div className="space-y-8">
          {/* Quick Actions */}
          <Card className="bg-primary/5 border-primary/20">
            <CardHeader>
              <CardTitle className="text-primary-dark">{t('quickActions')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {canManage && (
                <>
                  <Button variant="outline" className="w-full justify-start gap-3 bg-surface-main" onClick={() => navigate('/clients')}>
                    <Plus className="h-4 w-4" /> {t('addClientAction')}
                  </Button>
                  <Button variant="outline" className="w-full justify-start gap-3 bg-surface-main" onClick={() => navigate('/clients')}>
                    <UploadCloud className="h-4 w-4" /> {t('uploadScriptAction')}
                  </Button>
                  <Button variant="outline" className="w-full justify-start gap-3 bg-surface-main" onClick={() => navigate('/tasks')}>
                    <UserPlus className="h-4 w-4" /> {t('assignTaskAction')}
                  </Button>
                </>
              )}
              <Button variant="outline" className="w-full justify-start gap-3 bg-surface-main" onClick={() => navigate('/tasks')}>
                <PlayCircle className="h-4 w-4" /> {t('startAnalysisAction')}
              </Button>
              <Button variant="outline" className="w-full justify-start gap-3 bg-surface-main" onClick={() => navigate('/reports')}>
                <FileBarChart className="h-4 w-4" /> {t('generateReportAction')}
              </Button>
              {canManage && (
                <Button variant="outline" className="w-full justify-start gap-3 bg-surface-main" onClick={() => navigate('/glossary')}>
                  <BookOpen className="h-4 w-4" /> {t('addTermAction')}
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Recent Decisions */}
          <RecentDecisionsWidget />

          {/* Recent Activity */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{t('recentActivity')}</CardTitle>
              {canViewAudit && (
                <Button variant="ghost" size="sm" onClick={() => navigate('/audit')}>
                  {t('showAll')}
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {activities.length === 0 ? (
                <div className="text-center py-6 text-text-muted">{t('cleanLog')}</div>
              ) : (
                <div className="space-y-6 relative before:absolute before:inset-0 before:ml-2 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-border-main before:to-transparent">
                  {activities.map((act) => (
                    <div key={act.id} className="relative flex items-center justify-between group">
                      <div className="flex items-start gap-4 w-full">
                        <div className="relative z-10 w-4 h-4 mt-1 rounded-full bg-surface-main border-2 border-primary flex-shrink-0" />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-text-main leading-tight">{act.action}</p>
                          <div className="flex items-center gap-2 mt-1.5 text-xs text-text-muted">
                            <span className="font-semibold">{act.actor}</span>
                            <span>•</span>
                            <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {act.time}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
