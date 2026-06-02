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
import { formatDateTimeValue } from '@/utils/dateFormat';
import { ArrowLeft, BarChart3, Eye, FileDown, Loader2, RefreshCw, Search, TrendingUp, Users } from 'lucide-react';
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

function safe(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  return String(v);
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
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);

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
    try {
      const payload = await reportsApi.getRegulatorPerformance(userId, dateRange);
      setRows([{ user: { id: payload.regulator.id, name: payload.regulator.name, email: payload.regulator.email ?? '', roleKey: payload.regulator.roleKey }, payload, loading: false, error: null }]);
    } catch (err) {
      console.error(err);
      setRows([]);
    } finally {
      setLoadingDetail(false);
    }
  }, [dateRange, userId]);

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
  const avgAgreementRate = filteredRows.length
    ? filteredRows.reduce((sum, row) => sum + (row.payload?.summary.recommendationAgreementRate ?? 0), 0) / filteredRows.length
    : null;

  const topUsers = filteredRows
    .map((row) => ({
      label: row.user.name,
      value: row.payload?.summary.totalAssignedScripts ?? 0,
      color: '#6d2f5f',
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

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

          <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
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
          {loadingDetail || !currentDetail ? (
            <Card><CardContent className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></CardContent></Card>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Card><CardContent className="p-5"><p className="text-sm text-text-muted">{lang === 'ar' ? 'النصوص المسندة' : 'Assigned scripts'}</p><p className="mt-2 text-3xl font-bold text-text-main">{currentDetail.summary.totalAssignedScripts}</p></CardContent></Card>
                <Card><CardContent className="p-5"><p className="text-sm text-text-muted">{lang === 'ar' ? 'إجمالي التوصيات' : 'Total recommendations'}</p><p className="mt-2 text-3xl font-bold text-text-main">{currentDetail.summary.totalRecommendations}</p></CardContent></Card>
                <Card><CardContent className="p-5"><p className="text-sm text-text-muted">{lang === 'ar' ? 'إرجاعات' : 'Send-backs'}</p><p className="mt-2 text-3xl font-bold text-text-main">{currentDetail.summary.totalSendBacks}</p></CardContent></Card>
                <Card><CardContent className="p-5"><p className="text-sm text-text-muted">{lang === 'ar' ? 'التوافق' : 'Agreement'}</p><p className="mt-2 text-3xl font-bold text-text-main">{pct(currentDetail.summary.recommendationAgreementRate)}</p></CardContent></Card>
              </div>

              <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
                <Card>
                  <CardContent className="p-6">
                    <h2 className="text-lg font-semibold text-text-main">{lang === 'ar' ? 'مؤشرات الأداء' : 'Performance indicators'}</h2>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                        <p className="text-xs text-text-muted">{lang === 'ar' ? 'أول إجراء بالدقائق' : 'First action (min)'}</p>
                        <p className="mt-2 text-2xl font-bold text-text-main">{currentDetail.summary.averageFirstActionMinutes == null ? '—' : Math.round(currentDetail.summary.averageFirstActionMinutes)}</p>
                      </div>
                      <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                        <p className="text-xs text-text-muted">{lang === 'ar' ? 'متوسط أيام الإنجاز' : 'Avg turnaround days'}</p>
                        <p className="mt-2 text-2xl font-bold text-text-main">{currentDetail.summary.averageTurnaroundDays == null ? '—' : currentDetail.summary.averageTurnaroundDays.toFixed(1)}</p>
                      </div>
                    </div>
                    <div className="mt-6">
                      <SimpleBars
                        lang={lang === 'ar' ? 'ar' : 'en'}
                        items={[
                          { label: lang === 'ar' ? 'توصيات' : 'Recommendations', value: currentDetail.summary.totalRecommendations, color: '#6d2f5f' },
                          { label: lang === 'ar' ? 'موافقات' : 'Approvals', value: currentDetail.summary.totalApprovalRecommendations, color: '#0f9d58' },
                          { label: lang === 'ar' ? 'رفض' : 'Rejections', value: currentDetail.summary.totalRejectionRecommendations, color: '#c53b3b' },
                          { label: lang === 'ar' ? 'إرجاعات' : 'Send-backs', value: currentDetail.summary.totalSendBacks, color: '#d97706' },
                          { label: lang === 'ar' ? 'دورات' : 'Cycles', value: currentDetail.summary.totalCyclesHandled, color: '#2563eb' },
                        ]}
                      />
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
                  <h2 className="text-lg font-semibold text-text-main">{lang === 'ar' ? 'الخط الزمني' : 'Timeline'}</h2>
                  <div className="mt-4 space-y-3">
                    {currentDetail.timeline.slice(0, 20).map((event, idx) => (
                      <div key={idx} className="rounded-2xl border border-border/70 bg-background/70 p-4">
                        <p className="text-xs text-text-muted">{formatDateTimeValue((event as any).at, { lang: lang === 'ar' ? 'ar' : 'en', format: settings?.platform?.dateFormat })}</p>
                        <p className="mt-1 text-sm font-medium text-text-main">{safe((event as any).type)}</p>
                        <p className="mt-1 text-sm text-text-muted">{safe((event as any).actorName ?? (event as any).actor)}</p>
                        {(event as any).note ? <p className="mt-1 text-sm text-text-main">{safe((event as any).note)}</p> : null}
                      </div>
                    ))}
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
