import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useLangStore } from '@/store/langStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { reportsApi, usersApi, type RegulatorPerformancePayload } from '@/api';
import { downloadRegulatorPerformancePdf } from '@/components/reports/regulator-performance/download';
import { APP_TIME_ZONE, formatDateTimeValue } from '@/utils/dateFormat';
import { ArrowDown, ArrowLeft, ArrowUp, BarChart3, ClipboardCheck, Eye, FileDown, FileText, Filter, Loader2, RefreshCw, Search, TrendingUp, Users } from 'lucide-react';
import toast from 'react-hot-toast';

type InternalUser = {
  id: string;
  name: string;
  email: string;
  roleKey: string | null;
};

type UserPerfRow = {
  user: InternalUser;
  payload: RegulatorPerformancePayload | null;
  loading: boolean;
  error: string | null;
};

type TimelineEntry = NonNullable<RegulatorPerformancePayload['timeline']>[number];
type TimelineFilterKey = 'all' | 'assignments' | 'analysis' | 'recommendations' | 'send_backs' | 'decisions' | 'reports';

function safe(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  return String(v);
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'U';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

function pct(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return `${Math.round(v * 100)}%`;
}

function SimpleBars({ items, lang }: { items: Array<{ label: string; value: number; color: string }>; lang: 'ar' | 'en' }) {
  const max = Math.max(1, ...items.map((item) => item.value));
  return (
    <div className="space-y-4">
      {items.map((item) => (
        <div key={item.label} className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-text-muted">
            <span>{item.label}</span>
            <span>{item.value}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-background/80">
            <div
              className="h-full rounded-full"
              style={{
                width: `${(item.value / max) * 100}%`,
                backgroundColor: item.color,
                marginInlineStart: lang === 'ar' ? 'auto' : undefined,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function timelineDateKey(value: string): string | null {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function timelineDayLabel(value: string, lang: 'ar' | 'en', dateFormat?: string): string {
  return formatDateTimeValue(value, {
    lang,
    format: dateFormat,
  });
}

function timelineActionLabel(type: string | null | undefined, lang: 'ar' | 'en'): string {
  const key = String(type ?? '').trim().toLowerCase();
  if (!key) return lang === 'ar' ? 'حدث' : 'Event';
  const mapAr: Record<string, string> = {
    recommendation_approved: 'توصية بالموافقة',
    recommendation_rejected: 'توصية بالرفض',
    send_for_review: 'إرجاع للمراجعة',
    final_approved: 'اعتماد نهائي',
    final_rejected: 'رفض نهائي',
    analysis_started: 'بدء التحليل',
    analysis_completed: 'اكتمال التحليل',
    script_assigned: 'إسناد نص',
    report_generated: 'توليد تقرير',
    review_requested: 'طلب مراجعة',
  };
  const mapEn: Record<string, string> = {
    recommendation_approved: 'Recommend approval',
    recommendation_rejected: 'Recommend rejection',
    send_for_review: 'Sent back for review',
    final_approved: 'Final approval',
    final_rejected: 'Final rejection',
    analysis_started: 'Analysis started',
    analysis_completed: 'Analysis completed',
    script_assigned: 'Script assigned',
    report_generated: 'Report generated',
    review_requested: 'Review requested',
  };
  return lang === 'ar'
    ? (mapAr[key] ?? key.replaceAll('_', ' '))
    : (mapEn[key] ?? key.replaceAll('_', ' '));
}

function timelineAccent(type: string | null | undefined): { ring: string; badge: string } {
  const key = String(type ?? '').trim().toLowerCase();
  if (key.includes('reject')) return { ring: 'ring-red-200 bg-red-500', badge: 'bg-red-50 text-red-700 border-red-200' };
  if (key.includes('send') || key.includes('review')) return { ring: 'ring-amber-200 bg-amber-500', badge: 'bg-amber-50 text-amber-700 border-amber-200' };
  if (key.includes('approve') || key.includes('completed')) return { ring: 'ring-emerald-200 bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  if (key.includes('assign') || key.includes('analysis')) return { ring: 'ring-primary/20 bg-primary', badge: 'bg-primary/5 text-primary border-primary/15' };
  return { ring: 'ring-border/70 bg-text-muted', badge: 'bg-background text-text-muted border-border' };
}

function timelineIcon(type: string | null | undefined) {
  const key = String(type ?? '').trim().toLowerCase();
  if (key.includes('assign')) return FileText;
  if (key.includes('analysis')) return BarChart3;
  if (key.includes('recommend')) return TrendingUp;
  if (key.includes('send') || key.includes('review')) return RefreshCw;
  if (key.includes('final') || key.includes('approve') || key.includes('reject')) return ClipboardCheck;
  if (key.includes('report')) return FileDown;
  return FileText;
}

function timelineFilterKey(type: string | null | undefined): TimelineFilterKey {
  const key = String(type ?? '').trim().toLowerCase();
  if (!key) return 'all';
  if (key.includes('assign')) return 'assignments';
  if (key.includes('analysis')) return 'analysis';
  if (key.includes('recommend')) return 'recommendations';
  if (key.includes('send') || key.includes('review')) return 'send_backs';
  if (key.includes('final') || key.includes('approve') || key.includes('reject')) return 'decisions';
  if (key.includes('report')) return 'reports';
  return 'all';
}

function timelineFilterLabel(key: TimelineFilterKey, lang: 'ar' | 'en'): string {
  const ar: Record<TimelineFilterKey, string> = {
    all: 'كل الأحداث',
    assignments: 'الإسنادات',
    analysis: 'التحليل',
    recommendations: 'التوصيات',
    send_backs: 'الإرجاعات',
    decisions: 'القرارات النهائية',
    reports: 'التقارير',
  };
  const en: Record<TimelineFilterKey, string> = {
    all: 'All events',
    assignments: 'Assignments',
    analysis: 'Analysis',
    recommendations: 'Recommendations',
    send_backs: 'Send-backs',
    decisions: 'Final decisions',
    reports: 'Reports',
  };
  return lang === 'ar' ? ar[key] : en[key];
}

export function Performance() {
  const { lang } = useLangStore();
  const { settings } = useSettingsStore();
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const { userId } = useParams<{ userId?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

  const [internalUsers, setInternalUsers] = useState<InternalUser[]>([]);
  const [rows, setRows] = useState<UserPerfRow[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [expandedDays, setExpandedDays] = useState<Record<string, boolean>>({});
  const [timelineFilter, setTimelineFilter] = useState<TimelineFilterKey>('all');
  const [showTimelineFilters, setShowTimelineFilters] = useState(false);
  const [visibleTimelineDays, setVisibleTimelineDays] = useState(3);

  const from = searchParams.get('from') ?? '';
  const to = searchParams.get('to') ?? '';
  const dateRange = useMemo(() => ({
    from: from || undefined,
    to: to || undefined,
  }), [from, to]);

  const isDetail = !!userId;
  const isAdmin = user?.role === 'Admin' || user?.role === 'Super Admin';

  const loadUsers = useCallback(async () => {
    if (!isAdmin) return;
    setLoadingList(true);
    try {
      const list = await usersApi.getUsers();
      const activeInternal = list
        .filter((u) => u.status === 'active')
        .filter((u) => String(u.roleKey ?? '').toLowerCase() !== 'beneficiary')
        .map((u) => ({
          id: u.id,
          name: u.name || u.email || 'Unknown',
          email: u.email,
          roleKey: u.roleKey,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
      setInternalUsers(activeInternal);
    } catch (err) {
      console.error(err);
      setInternalUsers([]);
    } finally {
      setLoadingList(false);
    }
  }, [isAdmin]);

  const loadListPerformance = useCallback(async () => {
    if (!isAdmin) return;
    const users = internalUsers;
    if (users.length === 0) {
      setRows([]);
      return;
    }
    setLoadingList(true);
    const nextRows = await Promise.all(users.map(async (u) => {
      try {
        const payload = await reportsApi.getRegulatorPerformance(u.id, dateRange);
        return { user: u, payload, loading: false, error: null };
      } catch (err: any) {
        return { user: u, payload: null, loading: false, error: err?.message ?? 'Failed' };
      }
    }));
    setRows(nextRows);
    setLoadingList(false);
  }, [dateRange, internalUsers, isAdmin]);

  const loadDetail = useCallback(async () => {
    if (!userId) return;
    setLoadingDetail(true);
    setDetailError(null);
    try {
      const payload = await reportsApi.getRegulatorPerformance(userId, dateRange);
      setRows([{ user: { id: payload.regulator.id, name: payload.regulator.name, email: payload.regulator.email ?? '', roleKey: payload.regulator.roleKey }, payload, loading: false, error: null }]);
    } catch (err) {
      console.error(err);
      setDetailError(err instanceof Error ? err.message : (lang === 'ar' ? 'تعذر تحميل التقرير' : 'Failed to load report'));
      setRows([]);
    } finally {
      setLoadingDetail(false);
    }
  }, [dateRange, lang, userId]);

  useEffect(() => {
    if (!isAdmin) return;
    loadUsers();
  }, [isAdmin, loadUsers]);

  useEffect(() => {
    if (!isAdmin) return;
    if (isDetail) {
      loadDetail();
      return;
    }
    if (internalUsers.length > 0) {
      loadListPerformance();
    }
  }, [isAdmin, isDetail, internalUsers.length, loadDetail, loadListPerformance]);

  useEffect(() => {
    setPage(1);
  }, [search, roleFilter, from, to]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      const role = String(row.user.roleKey ?? '').toLowerCase();
      const matchesSearch = !q || [row.user.name, row.user.email, row.user.id, role].join(' ').toLowerCase().includes(q);
      const matchesRole = roleFilter === 'all' || role === roleFilter;
      return matchesSearch && matchesRole;
    });
  }, [rows, roleFilter, search]);

  const totalAssigned = filteredRows.reduce((sum, row) => sum + (row.payload?.summary.totalAssignedScripts ?? 0), 0);
  const totalRecommendations = filteredRows.reduce((sum, row) => sum + (row.payload?.summary.totalRecommendations ?? 0), 0);
  const totalSendBacks = filteredRows.reduce((sum, row) => sum + (row.payload?.summary.totalSendBacks ?? 0), 0);
  const totalCycles = filteredRows.reduce((sum, row) => sum + (row.payload?.summary.totalCyclesHandled ?? 0), 0);
  const avgAgreementRate = filteredRows.length
    ? filteredRows.reduce((sum, row) => sum + (row.payload?.summary.recommendationAgreementRate ?? 0), 0) / filteredRows.length
    : null;
  const totalApprovals = filteredRows.reduce((sum, row) => sum + (row.payload?.summary.totalApprovalRecommendations ?? 0), 0);
  const totalRejections = filteredRows.reduce((sum, row) => sum + (row.payload?.summary.totalRejectionRecommendations ?? 0), 0);
  const decisionVolume = totalApprovals + totalRejections + totalSendBacks;

  const topUsers = filteredRows
    .map((row) => ({
      label: row.user.name,
      value: row.payload?.summary.totalAssignedScripts ?? 0,
      color: '#6d2f5f',
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);
  const topPerformer = topUsers[0] ?? null;
  const topPerformerShare = filteredRows.length
    ? Math.round((topPerformer?.value ?? 0) / Math.max(1, totalAssigned) * 100)
    : 0;

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedRows = filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleRangeChange = (key: 'from' | 'to', value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next, { replace: true });
  };

  const handleDownload = async (payload: RegulatorPerformancePayload) => {
    try {
      await downloadRegulatorPerformancePdf({
        data: payload,
        lang: lang === 'ar' ? 'ar' : 'en',
        dateFormat: settings?.platform?.dateFormat,
      });
      toast.success(lang === 'ar' ? 'تم تنزيل PDF' : 'PDF downloaded');
    } catch (err: any) {
      toast.error(err?.message ?? (lang === 'ar' ? 'تعذر تنزيل PDF' : 'Failed to download PDF'));
    }
  };

  const currentDetail = isDetail ? rows[0]?.payload ?? null : null;
  const currentDetailUser = isDetail ? rows[0]?.user ?? null : null;
  const timelineGroups = useMemo(() => {
    if (!currentDetail) return [];
    const entries = (currentDetail.timeline ?? []) as TimelineEntry[];
    const ordered = [...entries].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    const groups = new Map<string, { dayLabel: string; events: TimelineEntry[] }>();
    ordered.forEach((event) => {
      const key = timelineDateKey(event.at) ?? 'unknown';
      if (!groups.has(key)) {
        groups.set(key, { dayLabel: event.at, events: [] });
      }
      groups.get(key)!.events.push(event);
    });
    return Array.from(groups.entries()).map(([dayKey, group]) => ({
      dayKey,
      dayLabel: group.dayLabel,
      events: group.events,
    }));
  }, [currentDetail]);

  const filteredTimelineGroups = useMemo(() => {
    if (timelineFilter === 'all') return timelineGroups;
    return timelineGroups
      .map((group) => {
        const events = group.events.filter((event) => timelineFilterKey((event as any).type) === timelineFilter);
        return { ...group, events };
      })
      .filter((group) => group.events.length > 0);
  }, [timelineFilter, timelineGroups]);

  const pagedTimelineGroups = useMemo(() => filteredTimelineGroups.slice(0, visibleTimelineDays), [filteredTimelineGroups, visibleTimelineDays]);

  useEffect(() => {
    setExpandedDays({});
  }, [userId]);

  useEffect(() => {
    setTimelineFilter('all');
    setShowTimelineFilters(false);
    setVisibleTimelineDays(3);
  }, [userId]);

  useEffect(() => {
    setVisibleTimelineDays(3);
  }, [timelineFilter, userId]);

  if (!isAdmin) {
    return (
      <Card>
        <CardContent className="p-10 text-center text-text-muted">
          {lang === 'ar' ? 'هذا القسم مخصص للإدارة فقط.' : 'This section is for admins only.'}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="dashboard-page-header flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between md:p-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.24em] text-text-muted">
            {lang === 'ar' ? 'لوحة الإدارة' : 'Admin Dashboard'}
          </p>
          <h1 className="mt-2 text-2xl font-bold text-text-main">
            {isDetail
              ? (lang === 'ar' ? 'تفاصيل أداء العضو' : 'Member Performance Details')
              : (lang === 'ar' ? 'الأداء' : 'Performance')}
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            {isDetail
              ? (lang === 'ar' ? 'راجع أداء المستخدم ثم أنشئ تقرير PDF أو عد إلى القائمة.' : 'Review the user performance, generate a PDF, or go back to the list.')
              : (lang === 'ar' ? 'قائمة المستخدمين الداخليين مع مؤشرات الأداء والفلاتر.' : 'Internal users list with performance indicators and filters.')}
          </p>
        </div>
        {isDetail && currentDetail && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => navigate(`/app/performance?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)}>
              <ArrowLeft className="w-4 h-4 mr-2 rtl:ml-2 rtl:mr-0" />
              {lang === 'ar' ? 'رجوع' : 'Back'}
            </Button>
            <Button variant="outline" onClick={() => handleDownload(currentDetail)}>
              <FileDown className="w-4 h-4 mr-2 rtl:ml-2 rtl:mr-0" />
              {lang === 'ar' ? 'تقرير PDF' : 'PDF Report'}
            </Button>
          </div>
        )}
      </div>

      {!isDetail && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card><CardContent className="p-5"><div className="flex items-center justify-between"><div><p className="text-sm text-text-muted">{lang === 'ar' ? 'المستخدمون الداخليون' : 'Internal users'}</p><p className="mt-2 text-3xl font-bold text-text-main">{filteredRows.length}</p></div><Users className="h-5 w-5 text-primary" /></div></CardContent></Card>
            <Card><CardContent className="p-5"><div className="flex items-center justify-between"><div><p className="text-sm text-text-muted">{lang === 'ar' ? 'النصوص المسندة' : 'Assigned scripts'}</p><p className="mt-2 text-3xl font-bold text-text-main">{totalAssigned}</p></div><BarChart3 className="h-5 w-5 text-info" /></div></CardContent></Card>
            <Card><CardContent className="p-5"><div className="flex items-center justify-between"><div><p className="text-sm text-text-muted">{lang === 'ar' ? 'التوصيات' : 'Recommendations'}</p><p className="mt-2 text-3xl font-bold text-text-main">{totalRecommendations}</p></div><TrendingUp className="h-5 w-5 text-success" /></div></CardContent></Card>
            <Card><CardContent className="p-5"><div className="flex items-center justify-between"><div><p className="text-sm text-text-muted">{lang === 'ar' ? 'إرجاعات للمستفيد' : 'Send-backs'}</p><p className="mt-2 text-3xl font-bold text-text-main">{totalSendBacks}</p></div><RefreshCw className="h-5 w-5 text-warning" /></div></CardContent></Card>
          </div>

          <Card className="border-primary/10 bg-gradient-to-br from-primary/8 via-background to-background">
            <CardContent className="p-6">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                <div className="max-w-2xl">
                  <p className="text-xs font-medium uppercase tracking-[0.24em] text-text-muted">{lang === 'ar' ? 'لقطة تنفيذية' : 'Executive snapshot'}</p>
                  <h2 className="mt-2 text-2xl font-bold text-text-main">
                    {topPerformer
                      ? (lang === 'ar'
                        ? `أكثر عضو نشاطًا: ${topPerformer.label}`
                        : `Most active member: ${topPerformer.label}`)
                      : (lang === 'ar' ? 'لا توجد بيانات كافية بعد' : 'No performance data yet')}
                  </h2>
                  <p className="mt-2 text-sm text-text-muted">
                    {topPerformer
                      ? (lang === 'ar'
                        ? `يمثل هذا العضو ${topPerformerShare}% تقريبًا من إجمالي النصوص المسندة ضمن الفلتر الحالي.`
                        : `This member represents about ${topPerformerShare}% of all assigned scripts in the current filter window.`)
                      : (lang === 'ar' ? 'استخدم الفلاتر لعرض الأداء ضمن فترة زمنية محددة.' : 'Use the filters to focus the report on a specific time window.')}
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 lg:min-w-[680px]">
                  <div className="rounded-2xl border border-border/70 bg-white/80 p-4 shadow-sm">
                    <p className="text-xs text-text-muted">{lang === 'ar' ? 'أعلى حمولة' : 'Top workload'}</p>
                    <p className="mt-2 text-xl font-bold text-text-main">{topPerformer?.label ?? '—'}</p>
                    <p className="mt-1 text-xs text-text-muted">{topPerformer ? `${topPerformer.value} ${lang === 'ar' ? 'نص' : 'scripts'}` : '—'}</p>
                  </div>
                  <div className="rounded-2xl border border-border/70 bg-white/80 p-4 shadow-sm">
                    <p className="text-xs text-text-muted">{lang === 'ar' ? 'متوسط التوافق' : 'Avg. agreement'}</p>
                    <p className="mt-2 text-xl font-bold text-text-main">{pct(avgAgreementRate)}</p>
                    <p className="mt-1 text-xs text-text-muted">{lang === 'ar' ? 'مع القرار النهائي' : 'with final decisions'}</p>
                  </div>
                  <div className="rounded-2xl border border-border/70 bg-white/80 p-4 shadow-sm">
                    <p className="text-xs text-text-muted">{lang === 'ar' ? 'إجمالي الدورات' : 'Total cycles'}</p>
                    <p className="mt-2 text-xl font-bold text-text-main">{totalCycles}</p>
                    <p className="mt-1 text-xs text-text-muted">{lang === 'ar' ? 'خلال الفلتر الحالي' : 'within the current filter'}</p>
                  </div>
                  <div className="rounded-2xl border border-border/70 bg-white/80 p-4 shadow-sm">
                    <p className="text-xs text-text-muted">{lang === 'ar' ? 'حجم القرارات' : 'Decision volume'}</p>
                    <p className="mt-2 text-xl font-bold text-text-main">{decisionVolume}</p>
                    <p className="mt-1 text-xs text-text-muted">{lang === 'ar' ? 'موافقات / رفض / إرجاع' : 'approval / rejection / send-back'}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <div className="flex flex-col gap-4 lg:flex-row">
                <div className="w-full lg:w-2/5">
                  <Input
                    placeholder={lang === 'ar' ? 'ابحث بالاسم أو البريد أو الدور' : 'Search by name, email or role'}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    icon={<Search className="w-4 h-4" />}
                  />
                </div>
                <div className="grid w-full gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Select
                    value={roleFilter}
                    onChange={(e) => setRoleFilter(e.target.value)}
                    options={[
                      { label: lang === 'ar' ? 'كل الأدوار' : 'All roles', value: 'all' },
                      { label: lang === 'ar' ? 'مدير' : 'Admin', value: 'admin' },
                      { label: lang === 'ar' ? 'مراجع' : 'Regulator', value: 'regulator' },
                      { label: lang === 'ar' ? 'مشرف أعلى' : 'Super Admin', value: 'super_admin' },
                    ]}
                  />
                  <Input
                    type="date"
                    value={from}
                    onChange={(e) => handleRangeChange('from', e.target.value)}
                    placeholder={lang === 'ar' ? 'من تاريخ' : 'From date'}
                  />
                  <Input
                    type="date"
                    value={to}
                    onChange={(e) => handleRangeChange('to', e.target.value)}
                    placeholder={lang === 'ar' ? 'إلى تاريخ' : 'To date'}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 xl:grid-cols-[1.2fr_0.9fr_0.9fr]">
            <Card>
              <CardContent className="p-6">
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-text-main">{lang === 'ar' ? 'أعلى المستخدمين حسب النصوص المسندة' : 'Top users by assigned scripts'}</h2>
                    <p className="text-sm text-text-muted">{lang === 'ar' ? 'من الأعلى إلى الأدنى وفق الفلتر الزمني الحالي' : 'Sorted by the active date range'}</p>
                  </div>
                </div>
                <SimpleBars items={topUsers} lang={lang === 'ar' ? 'ar' : 'en'} />
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="mb-4">
                  <h2 className="text-lg font-semibold text-text-main">{lang === 'ar' ? 'مؤشرات سريعة' : 'Quick indicators'}</h2>
                  <p className="text-sm text-text-muted">{lang === 'ar' ? 'متوسط التوافق مع القرار النهائي' : 'Average agreement with final decisions'}</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                    <p className="text-xs text-text-muted">{lang === 'ar' ? 'متوسط التوافق' : 'Average agreement'}</p>
                    <p className="mt-2 text-2xl font-bold text-text-main">{pct(avgAgreementRate)}</p>
                  </div>
                  <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                    <p className="text-xs text-text-muted">{lang === 'ar' ? 'حالة التقرير' : 'Report state'}</p>
                    <p className="mt-2 text-2xl font-bold text-text-main">{loadingList ? (lang === 'ar' ? 'جاري التحميل…' : 'Loading…') : (lang === 'ar' ? 'جاهز' : 'Ready')}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="mb-4">
                  <h2 className="text-lg font-semibold text-text-main">{lang === 'ar' ? 'مزيج القرارات' : 'Decision mix'}</h2>
                  <p className="text-sm text-text-muted">{lang === 'ar' ? 'كيف توزعت التوصيات والإرجاعات' : 'How recommendations and send-backs are distributed'}</p>
                </div>
                <SimpleBars
                  lang={lang === 'ar' ? 'ar' : 'en'}
                  items={[
                    { label: lang === 'ar' ? 'موافقات' : 'Approvals', value: totalApprovals, color: '#0f9d58' },
                    { label: lang === 'ar' ? 'رفض' : 'Rejections', value: totalRejections, color: '#c53b3b' },
                    { label: lang === 'ar' ? 'إرجاعات' : 'Send-backs', value: totalSendBacks, color: '#d97706' },
                    { label: lang === 'ar' ? 'توافق' : 'Agreement', value: Math.round((avgAgreementRate ?? 0) * 100), color: '#2563eb' },
                  ]}
                />
              </CardContent>
            </Card>
          </div>

          <Card className="dashboard-table-card">
            <div className="overflow-x-auto">
              {loadingList ? (
                <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
              ) : filteredRows.length === 0 ? (
                <div className="p-12 text-center text-text-muted">{lang === 'ar' ? 'لا توجد نتائج' : 'No results found'}</div>
              ) : (
                <table className="w-full text-sm text-start">
                  <thead className="border-b border-border text-xs uppercase text-text-muted">
                    <tr>
                      <th className="px-6 py-4 font-semibold">{lang === 'ar' ? 'الاسم' : 'Name'}</th>
                      <th className="px-6 py-4 font-semibold">{lang === 'ar' ? 'الدور' : 'Role'}</th>
                      <th className="px-6 py-4 font-semibold">{lang === 'ar' ? 'النصوص المسندة' : 'Assigned'}</th>
                      <th className="px-6 py-4 font-semibold">{lang === 'ar' ? 'التوصيات' : 'Recommendations'}</th>
                      <th className="px-6 py-4 font-semibold">{lang === 'ar' ? 'إرجاع' : 'Send-backs'}</th>
                      <th className="px-6 py-4 font-semibold">{lang === 'ar' ? 'التوافق' : 'Agreement'}</th>
                      <th className="px-6 py-4 font-semibold text-end">{lang === 'ar' ? 'الإجراءات' : 'Actions'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {pagedRows.map((row) => {
                      const payload = row.payload;
                      return (
                        <tr key={row.user.id} className="bg-transparent transition-colors hover:bg-background/40">
                          <td className="px-6 py-4">
                            <div className="flex flex-col">
                              <span className="font-semibold text-text-main">{row.user.name}</span>
                              <span className="text-xs text-text-muted">{row.user.email}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <Badge variant="default" className="whitespace-nowrap">
                              {safe(row.user.roleKey)}
                            </Badge>
                          </td>
                          <td className="px-6 py-4 font-semibold text-text-main">{payload?.summary.totalAssignedScripts ?? '—'}</td>
                          <td className="px-6 py-4 text-text-main">{payload?.summary.totalRecommendations ?? '—'}</td>
                          <td className="px-6 py-4 text-text-main">{payload?.summary.totalSendBacks ?? '—'}</td>
                          <td className="px-6 py-4 text-text-main">{pct(payload?.summary.recommendationAgreementRate ?? null)}</td>
                          <td className="px-6 py-4">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => navigate(`/app/performance/${row.user.id}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)}
                                className="h-8"
                              >
                                <Eye className="w-3.5 h-3.5 mr-1.5 rtl:ml-1.5 rtl:mr-0" />
                                {lang === 'ar' ? 'عرض' : 'View'}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
            {!loadingList && filteredRows.length > pageSize && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-background/70 px-6 py-4">
                <div className="text-sm text-text-muted">
                  {lang === 'ar'
                    ? `${(currentPage - 1) * pageSize + 1}–${Math.min(currentPage * pageSize, filteredRows.length)} من ${filteredRows.length}`
                    : `${(currentPage - 1) * pageSize + 1}–${Math.min(currentPage * pageSize, filteredRows.length)} of ${filteredRows.length}`}
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" disabled={currentPage <= 1} onClick={() => setPage((v) => Math.max(1, v - 1))}>
                    {lang === 'ar' ? 'السابق' : 'Previous'}
                  </Button>
                  <span className="text-sm text-text-muted">{currentPage} / {totalPages}</span>
                  <Button size="sm" variant="outline" disabled={currentPage >= totalPages} onClick={() => setPage((v) => Math.min(totalPages, v + 1))}>
                    {lang === 'ar' ? 'التالي' : 'Next'}
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </>
      )}

      {isDetail && (
        <div className="space-y-6">
          {loadingDetail ? (
            <Card><CardContent className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></CardContent></Card>
          ) : detailError ? (
            <Card>
              <CardContent className="space-y-3 p-12 text-center">
                <p className="text-lg font-semibold text-text-main">{lang === 'ar' ? 'تعذر تحميل تقرير الأداء' : 'Unable to load performance report'}</p>
                <p className="text-sm text-text-muted">{detailError}</p>
                <div className="flex justify-center gap-2 pt-2">
                  <Button variant="outline" onClick={() => void loadDetail()}>
                    <RefreshCw className="w-4 h-4 mr-2 rtl:ml-2 rtl:mr-0" />
                    {lang === 'ar' ? 'إعادة المحاولة' : 'Retry'}
                  </Button>
                  <Button variant="outline" onClick={() => navigate('/app/performance')}>
                    <ArrowLeft className="w-4 h-4 mr-2 rtl:ml-2 rtl:mr-0" />
                    {lang === 'ar' ? 'رجوع' : 'Back'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : !currentDetail || !currentDetailUser ? (
            <Card>
              <CardContent className="p-12 text-center text-text-muted">
                {lang === 'ar' ? 'لا توجد بيانات تفصيلية بعد.' : 'No detailed data yet.'}
              </CardContent>
            </Card>
          ) : (
            <>
              <Card className="overflow-hidden border-primary/15 bg-gradient-to-br from-primary/12 via-background to-background shadow-[0_22px_50px_rgba(109,47,95,0.08)]">
                <CardContent className="p-6">
                  <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
                    <div className="flex items-start gap-4">
                      <div className="flex h-[72px] w-[72px] min-h-[72px] min-w-[72px] items-center justify-center rounded-[1.15rem] bg-gradient-to-br from-primary to-secondary text-2xl font-bold text-white shadow-[0_18px_34px_rgba(109,47,95,0.28)]">
                        {initials(currentDetail.regulator.name)}
                      </div>
                      <div className="space-y-3">
                        <div>
                          <p className="text-xs font-medium uppercase tracking-[0.24em] text-text-muted">
                            {lang === 'ar' ? 'ملف النشاط المسجل' : 'Recorded activity file'}
                          </p>
                          <h2 className="mt-2 text-3xl font-bold text-text-main">{currentDetail.regulator.name}</h2>
                          <p className="mt-1 text-sm text-text-muted" dir="ltr">
                            {safe(currentDetail.regulator.email)} • {safe(currentDetail.regulator.roleKey)}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="default" className="whitespace-nowrap">
                            {lang === 'ar' ? 'تقرير نشاط فردي' : 'Individual activity report'}
                          </Badge>
                          <Badge variant="outline" className="whitespace-nowrap">
                            {lang === 'ar' ? 'الفترة المحددة' : 'Selected range'}
                          </Badge>
                          <Badge variant="outline" className="whitespace-nowrap">
                            {lang === 'ar' ? `تفاعل مع ${currentDetail.summary.totalAssignedScripts} نص` : `Handled ${currentDetail.summary.totalAssignedScripts} scripts`}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 xl:min-w-[760px]">
                      <div className="rounded-2xl border border-border/70 bg-white/80 p-4">
                        <p className="text-xs text-text-muted">{lang === 'ar' ? 'النصوص المسندة' : 'Assigned scripts'}</p>
                        <p className="mt-2 text-2xl font-bold text-text-main">{currentDetail.summary.totalAssignedScripts}</p>
                      </div>
                      <div className="rounded-2xl border border-border/70 bg-white/80 p-4">
                        <p className="text-xs text-text-muted">{lang === 'ar' ? 'الإرجاعات' : 'Send-backs'}</p>
                        <p className="mt-2 text-2xl font-bold text-text-main">{currentDetail.summary.totalSendBacks}</p>
                      </div>
                      <div className="rounded-2xl border border-border/70 bg-white/80 p-4">
                        <p className="text-xs text-text-muted">{lang === 'ar' ? 'التوافق' : 'Agreement'}</p>
                        <p className="mt-2 text-2xl font-bold text-text-main">{pct(currentDetail.summary.recommendationAgreementRate)}</p>
                      </div>
                      <div className="rounded-2xl border border-border/70 bg-white/80 p-4">
                        <p className="text-xs text-text-muted">{lang === 'ar' ? 'سرعة أول إجراء' : 'First action speed'}</p>
                        <p className="mt-2 text-2xl font-bold text-text-main">
                          {currentDetail.summary.averageFirstActionMinutes == null ? '—' : `${Math.round(currentDetail.summary.averageFirstActionMinutes)}m`}
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Card><CardContent className="p-5"><p className="text-sm text-text-muted">{lang === 'ar' ? 'النصوص المسندة' : 'Assigned scripts'}</p><p className="mt-2 text-3xl font-bold text-text-main">{currentDetail.summary.totalAssignedScripts}</p></CardContent></Card>
                <Card><CardContent className="p-5"><p className="text-sm text-text-muted">{lang === 'ar' ? 'إجمالي التوصيات' : 'Total recommendations'}</p><p className="mt-2 text-3xl font-bold text-text-main">{currentDetail.summary.totalRecommendations}</p></CardContent></Card>
                <Card><CardContent className="p-5"><p className="text-sm text-text-muted">{lang === 'ar' ? 'إرجاعات' : 'Send-backs'}</p><p className="mt-2 text-3xl font-bold text-text-main">{currentDetail.summary.totalSendBacks}</p></CardContent></Card>
                <Card><CardContent className="p-5"><p className="text-sm text-text-muted">{lang === 'ar' ? 'التوافق' : 'Agreement'}</p><p className="mt-2 text-3xl font-bold text-text-main">{pct(currentDetail.summary.recommendationAgreementRate)}</p></CardContent></Card>
              </div>

              <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
                <Card>
                  <CardContent className="p-6">
                    <h2 className="text-lg font-semibold text-text-main">{lang === 'ar' ? 'مؤشرات النشاط المسجل' : 'Recorded activity indicators'}</h2>
                    <p className="mt-1 text-sm text-text-muted">
                      {lang === 'ar'
                        ? 'هذه المؤشرات مبنية فقط على الأحداث المسجلة في النظام خلال الفترة المحددة. الرمز — يعني أنه لا توجد قيمة مسجلة لهذا المؤشر.'
                        : 'These indicators are based only on recorded system events within the selected period. A dash (—) means no value was recorded for that metric.'}
                    </p>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                        <p className="text-xs text-text-muted">{lang === 'ar' ? 'أول إجراء مسجل بالدقائق' : 'First recorded action (min)'}</p>
                        <p className="mt-2 text-2xl font-bold text-text-main">{currentDetail.summary.averageFirstActionMinutes == null ? '—' : Math.round(currentDetail.summary.averageFirstActionMinutes)}</p>
                      </div>
                      <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                        <p className="text-xs text-text-muted">{lang === 'ar' ? 'متوسط أيام الإنجاز المسجلة' : 'Recorded turnaround days avg.'}</p>
                        <p className="mt-2 text-2xl font-bold text-text-main">{currentDetail.summary.averageTurnaroundDays == null ? '—' : currentDetail.summary.averageTurnaroundDays.toFixed(1)}</p>
                      </div>
                    </div>
                    <div className="mt-6">
                      <SimpleBars
                        lang={lang === 'ar' ? 'ar' : 'en'}
                        items={[
                          { label: lang === 'ar' ? 'توصيات مسجلة' : 'Recorded recommendations', value: currentDetail.summary.totalRecommendations, color: '#6d2f5f' },
                          { label: lang === 'ar' ? 'موافقات مسجلة' : 'Recorded approvals', value: currentDetail.summary.totalApprovalRecommendations, color: '#0f9d58' },
                          { label: lang === 'ar' ? 'رفض مسجل' : 'Recorded rejections', value: currentDetail.summary.totalRejectionRecommendations, color: '#c53b3b' },
                          { label: lang === 'ar' ? 'إرجاعات مسجلة' : 'Recorded send-backs', value: currentDetail.summary.totalSendBacks, color: '#d97706' },
                          { label: lang === 'ar' ? 'دورات مسجلة' : 'Recorded cycles', value: currentDetail.summary.totalCyclesHandled, color: '#2563eb' },
                        ]}
                      />
                    </div>
                    <div className="mt-6 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                        <p className="text-xs text-text-muted">{lang === 'ar' ? 'مؤشر التوصيات المسجلة' : 'Recorded recommendation signal'}</p>
                        <p className="mt-2 text-xl font-bold text-text-main">{pct(currentDetail.summary.totalRecommendations ? currentDetail.summary.totalApprovalRecommendations / Math.max(1, currentDetail.summary.totalRecommendations) : null)}</p>
                        <p className="mt-1 text-xs text-text-muted">{lang === 'ar' ? 'نسبة التوصيات الإيجابية المسجلة' : 'Positive recorded recommendation share'}</p>
                      </div>
                      <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                        <p className="text-xs text-text-muted">{lang === 'ar' ? 'إيقاع العمل المسجل' : 'Recorded work rhythm'}</p>
                        <p className="mt-2 text-xl font-bold text-text-main">{currentDetail.summary.averageTurnaroundDays == null ? '—' : `${currentDetail.summary.averageTurnaroundDays.toFixed(1)}d`}</p>
                        <p className="mt-1 text-xs text-text-muted">{lang === 'ar' ? 'متوسط زمن الدورة المسجلة' : 'Average recorded cycle turnaround'}</p>
                      </div>
                      <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                        <p className="text-xs text-text-muted">{lang === 'ar' ? 'عمق الحمل المسجل' : 'Recorded workload depth'}</p>
                        <p className="mt-2 text-xl font-bold text-text-main">{currentDetail.summary.totalCyclesHandled}</p>
                        <p className="mt-1 text-xs text-text-muted">{lang === 'ar' ? 'إجمالي الدورات المسجلة' : 'Total recorded cycles'}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <h2 className="text-lg font-semibold text-text-main">{lang === 'ar' ? 'تفاصيل العضو' : 'Member details'}</h2>
                    <div className="mt-4 space-y-4 text-sm">
                      <div><p className="text-text-muted">{lang === 'ar' ? 'الاسم' : 'Name'}</p><p className="font-medium text-text-main">{currentDetail.regulator.name}</p></div>
                      <div><p className="text-text-muted">{lang === 'ar' ? 'البريد' : 'Email'}</p><p className="font-medium text-text-main" dir="ltr">{safe(currentDetail.regulator.email)}</p></div>
                      <div><p className="text-text-muted">{lang === 'ar' ? 'الدور' : 'Role'}</p><p className="font-medium text-text-main">{safe(currentDetail.regulator.roleKey)}</p></div>
                      <div><p className="text-text-muted">{lang === 'ar' ? 'الفترة' : 'Period'}</p><p className="font-medium text-text-main">{formatDateTimeValue(from || null, { lang: lang === 'ar' ? 'ar' : 'en', format: settings?.platform?.dateFormat })} - {formatDateTimeValue(to || null, { lang: lang === 'ar' ? 'ar' : 'en', format: settings?.platform?.dateFormat })}</p></div>
                    </div>
                    <div className="mt-5 rounded-2xl border border-dashed border-border bg-background/60 p-4 text-sm text-text-muted">
                      {lang === 'ar'
                        ? 'هذه الأرقام تمثل ما تم تسجيله فعليًا في النظام خلال الفترة المحددة فقط. إذا كان العضو مسؤولًا إداريًا أو لم يسجل توصيات/إرجاعات، فستظهر القيم صفر أو — حسب توفر الحدث.'
                        : 'These numbers represent only what was actually recorded in the system during the selected period. If the member handled administration only or did not record recommendations/send-backs, values will appear as zero or — depending on whether the metric exists.'}
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardContent className="p-6">
                  <h2 className="text-lg font-semibold text-text-main">{lang === 'ar' ? 'النصوص المسندة' : 'Assigned scripts'}</h2>
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-sm text-start">
                      <thead className="border-b border-border text-xs uppercase text-text-muted">
                        <tr>
                          <th className="px-4 py-3 font-semibold">{lang === 'ar' ? 'النص' : 'Script'}</th>
                          <th className="px-4 py-3 font-semibold">{lang === 'ar' ? 'المستفيد' : 'Beneficiary'}</th>
                          <th className="px-4 py-3 font-semibold">{lang === 'ar' ? 'الحالة' : 'Status'}</th>
                          <th className="px-4 py-3 font-semibold">{lang === 'ar' ? 'أول إجراء' : 'First action'}</th>
                          <th className="px-4 py-3 font-semibold">{lang === 'ar' ? 'التحول' : 'Turnaround'}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {currentDetail.scripts.map((script) => (
                          <tr key={script.id}>
                            <td className="px-4 py-3 font-medium text-text-main">{script.title || '—'}</td>
                            <td className="px-4 py-3 text-text-main">{script.beneficiaryName || '—'}</td>
                            <td className="px-4 py-3">
                              <Badge variant="default" className="whitespace-nowrap">
                                {safe(script.status)}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-text-main">{formatDateTimeValue(script.firstActionAt || script.assignedAt || script.receivedAt, { lang: lang === 'ar' ? 'ar' : 'en', format: settings?.platform?.dateFormat })}</td>
                            <td className="px-4 py-3 text-text-main">{script.turnaroundDays == null ? '—' : script.turnaroundDays.toFixed(1)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div id="performance-timeline-top" />
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <h2 className="text-lg font-semibold text-text-main">{lang === 'ar' ? 'الخط الزمني' : 'Timeline'}</h2>
                      <p className="text-sm text-text-muted">
                        {lang === 'ar'
                          ? 'عرض مجمّع حسب اليوم مع كل حدث داخل بطاقة مستقلة.'
                          : 'Grouped by day with each event shown as a separate activity card.'}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary" className="w-fit">
                        {lang === 'ar' ? `${filteredTimelineGroups.length} يوم` : `${filteredTimelineGroups.length} days`}
                      </Badge>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => document.getElementById('performance-timeline-bottom')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                      >
                        <ArrowDown className="mr-2 h-4 w-4 rtl:ml-2 rtl:mr-0" />
                        {lang === 'ar' ? 'إلى الأسفل' : 'Bottom'}
                      </Button>
                      <Button
                        variant={showTimelineFilters ? 'primary' : 'outline'}
                        size="sm"
                        onClick={() => setShowTimelineFilters((current) => !current)}
                      >
                        <Filter className="mr-2 h-4 w-4 rtl:ml-2 rtl:mr-0" />
                        {lang === 'ar' ? 'فلتر' : 'Filter'}
                      </Button>
                    </div>
                  </div>
                  {showTimelineFilters ? (
                    <div className="mt-4 rounded-2xl border border-border/70 bg-background/60 p-4">
                      <div className="flex flex-wrap gap-2">
                        {( ['all', 'assignments', 'analysis', 'recommendations', 'send_backs', 'decisions', 'reports'] as TimelineFilterKey[]).map((key) => (
                          <Button
                            key={key}
                            size="sm"
                            variant={timelineFilter === key ? 'primary' : 'outline'}
                            onClick={() => setTimelineFilter(key)}
                            className="rounded-full"
                          >
                            {timelineFilterLabel(key, lang === 'ar' ? 'ar' : 'en')}
                          </Button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <div className="mt-6 space-y-8">
                    {pagedTimelineGroups.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-border bg-background/60 p-10 text-center text-text-muted">
                        {lang === 'ar'
                          ? 'لا توجد أحداث مطابقة لهذا الفلتر.'
                          : 'No events match this filter.'}
                      </div>
                    ) : (
                      pagedTimelineGroups.map((group) => {
                        const expanded = !!expandedDays[group.dayKey];
                        const visibleEvents = expanded ? group.events : group.events.slice(0, 4);
                        return (
                          <div key={group.dayKey} className="grid gap-4 xl:grid-cols-[180px_1fr]">
                            <div className="space-y-2 xl:pt-2">
                              <p className="text-lg font-semibold text-text-main">
                                {timelineDayLabel(group.dayLabel, lang === 'ar' ? 'ar' : 'en', settings?.platform?.dateFormat)}
                              </p>
                              <Badge variant="secondary" className="w-fit">
                                {lang === 'ar' ? `${group.events.length} حدث` : `${group.events.length} events`}
                              </Badge>
                            </div>
                            <div className="relative space-y-4 rounded-[1.5rem] border border-border/70 bg-background/50 p-4 sm:p-5">
                              <div className="absolute inset-y-4 left-5 w-px bg-gradient-to-b from-primary/35 via-border to-transparent rtl:left-auto rtl:right-5" />
                              {visibleEvents.map((event, idx) => {
                                const accent = timelineAccent((event as any).type);
                                const title = timelineActionLabel((event as any).type, lang === 'ar' ? 'ar' : 'en');
                                const actor = safe((event as any).actorName ?? (event as any).actorId ?? (event as any).actor);
                                return (
                                  <div key={`${group.dayKey}-${idx}`} className="relative pl-12 rtl:pl-0 rtl:pr-12">
                                    <span className={`absolute left-[14px] top-5 h-3.5 w-3.5 rounded-full ring-4 ${accent.ring} rtl:left-auto rtl:right-[14px]`} />
                                    <div className="rounded-2xl border border-border/70 bg-white/85 p-4 shadow-sm transition-shadow hover:shadow-md">
                                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                        <div className="space-y-2">
                                          <div className="flex flex-wrap items-center gap-2">
                                            <span className={`inline-flex h-9 w-9 items-center justify-center rounded-full border ${accent.badge}`}>
                                              {(() => {
                                                const Icon = timelineIcon((event as any).type);
                                                return <Icon className="h-4 w-4" />;
                                              })()}
                                            </span>
                                            <Badge variant="secondary" className={accent.badge}>
                                              {title}
                                            </Badge>
                                            {(event as any).toStatus ? (
                                              <Badge variant="outline">
                                                {safe((event as any).toStatus)}
                                              </Badge>
                                            ) : null}
                                          </div>
                                          <p className="text-sm text-text-muted">
                                            <span className="font-medium text-text-main">{lang === 'ar' ? 'بواسطة' : 'By'}</span>{' '}
                                            {actor}
                                          </p>
                                          {(event as any).reason ? (
                                            <p className="text-sm text-text-main">
                                              <span className="font-medium">{lang === 'ar' ? 'السبب:' : 'Reason:'}</span>{' '}
                                              {safe((event as any).reason)}
                                            </p>
                                          ) : null}
                                          {(event as any).note ? (
                                            <p className="text-sm text-text-main">
                                              <span className="font-medium">{lang === 'ar' ? 'ملاحظة:' : 'Note:'}</span>{' '}
                                              {safe((event as any).note)}
                                            </p>
                                          ) : null}
                                        </div>
                                        <div className="shrink-0 rounded-2xl border border-border/70 bg-background/70 px-3 py-2 text-left rtl:text-right">
                                          <p className="text-sm font-semibold text-text-main">
                                            {formatDateTimeValue((event as any).at, { lang: lang === 'ar' ? 'ar' : 'en', format: settings?.platform?.dateFormat })}
                                          </p>
                                          <p className="mt-1 text-xs text-text-muted">
                                            {lang === 'ar'
                                              ? 'إجراء موثق ضمن خط الأداء'
                                              : 'Logged in the performance timeline'}
                                          </p>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                              {group.events.length > 4 ? (
                                <div className="pl-12 rtl:pl-0 rtl:pr-12">
                                  <Button
                                    variant="outline"
                                    className="w-full"
                                    onClick={() => setExpandedDays((current) => ({ ...current, [group.dayKey]: !current[group.dayKey] }))}
                                  >
                                    {expanded
                                      ? (lang === 'ar' ? 'إخفاء بعض الأحداث' : 'Show fewer events')
                                      : (lang === 'ar' ? `+ ${group.events.length - 4} أحداث أخرى` : `+ ${group.events.length - 4} more events`)}
                                  </Button>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        );
                      })
                    )}
                    {filteredTimelineGroups.length > visibleTimelineDays ? (
                      <div className="flex justify-center pt-2">
                        <Button
                          variant="outline"
                          onClick={() => setVisibleTimelineDays((current) => current + 3)}
                        >
                          <RefreshCw className="mr-2 h-4 w-4 rtl:ml-2 rtl:mr-0" />
                          {lang === 'ar'
                            ? 'تحميل المزيد'
                            : 'Load more'}
                        </Button>
                      </div>
                    ) : null}
                    <div id="performance-timeline-bottom" className="flex justify-center pt-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => document.getElementById('performance-timeline-top')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                      >
                        <ArrowUp className="mr-2 h-4 w-4 rtl:ml-2 rtl:mr-0" />
                        {lang === 'ar' ? 'إلى الأعلى' : 'Top'}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default Performance;
