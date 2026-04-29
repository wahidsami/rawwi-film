import { useState, useEffect, useCallback, Fragment } from 'react';
import toast from 'react-hot-toast';
import { useLangStore } from '@/store/langStore';
import { useAuthStore } from '@/store/authStore';
import { auditService, AuditEventRow, AuditListParams } from '@/services/auditService';
import { usersApi } from '@/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Download, FileText, ChevronDown, ChevronRight, Filter } from 'lucide-react';
import { useSettingsStore } from '@/store/settingsStore';
import { formatDateTime } from '@/utils/dateFormat';
import { downloadAuditPdf } from '@/components/reports/audit/download';

const PAGE_SIZE = 20;
const EVENT_TYPES = [
  'TASK_CREATED', 'TASK_ASSIGNED', 'ANALYSIS_STARTED', 'ANALYSIS_COMPLETED', 'REPORT_GENERATED',
  'FINDING_CREATED', 'FINDING_OVERRIDDEN', 'FINDING_MARKED_SAFE', 'FINDING_DELETED',
  'LEXICON_TERM_ADDED', 'LEXICON_TERM_UPDATED', 'LEXICON_TERM_DELETED',
  'CLIENT_CREATED', 'CLIENT_UPDATED', 'CLIENT_DEACTIVATED',
  'USER_ROLE_CHANGED', 'LOGIN_SUCCESS', 'LOGIN_FAILED',
];
const TARGET_TYPES = ['script', 'task', 'report', 'glossary', 'client'];

export function Audit() {
  const { t, lang } = useLangStore();
  const { settings } = useSettingsStore();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const [data, setData] = useState<AuditEventRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [users, setUsers] = useState<Array<{ id: string; email: string; role: string }>>([]);

  const [filters, setFilters] = useState<AuditListParams>({
    pageSize: PAGE_SIZE,
    dateFrom: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString().slice(0, 19),
    dateTo: '',
    userId: '',
    eventType: '',
    targetType: '',
    resultStatus: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await auditService.list({
        ...filters,
        page,
        pageSize: PAGE_SIZE,
      });
      setData(res.data);
      setTotal(res.total);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load audit log');
    } finally {
      setLoading(false);
    }
  }, [page, filters]);

  useEffect(() => {
    load();
  }, [load]);

  // Fetch users list for filter dropdown only when user can manage users (avoid 403 for Regulators)
  useEffect(() => {
    if (!hasPermission('manage_users')) {
      setUsers([]);
      return;
    }
    let cancelled = false;
    usersApi.getUsers()
      .then((list) => {
        if (cancelled) return;
        const userList = list
          .map(u => ({ id: u.id, email: u.email, role: u.roleKey ?? '—' }))
          .sort((a, b) => a.email.localeCompare(b.email));
        setUsers(userList);
      })
      .catch((err) => {
        if (!cancelled) console.error('Failed to fetch users:', err);
      });
    return () => { cancelled = true; };
  }, [hasPermission]);

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const blob = await auditService.exportCsv({
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo || undefined,
        userId: filters.userId || undefined,
        eventType: filters.eventType || undefined,
        targetType: filters.targetType || undefined,
        resultStatus: filters.resultStatus || undefined,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(lang === 'ar' ? 'تم تنزيل CSV' : 'CSV downloaded');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Export failed');
      toast.error(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const handleExportPdf = async () => {
    setExporting(true);
    try {
      const allDataRes = await auditService.list({
        ...filters,
        page: 1,
        pageSize: 1000,
      });
      await downloadAuditPdf({
        events: allDataRes.data,
        total: allDataRes.total,
        lang: lang === 'ar' ? 'ar' : 'en',
        dateFormat: settings?.platform?.dateFormat,
      });
      toast.success(lang === 'ar' ? 'تم تنزيل التقرير' : 'Report downloaded');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Export failed');
      toast.error(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const formatWhen = (iso: string) => {
    try {
      return formatDateTime(new Date(iso), { lang });
    } catch {
      return iso;
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6 pb-8">
      <div className="dashboard-page-header p-5 md:p-6">
        <h1 className="text-2xl font-bold text-text-main">{t('auditLog')}</h1>
      </div>

      <Card className="dashboard-panel">
        <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-4 w-4" />
            {t('filterByDate')}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCsv}
              disabled={exporting}
            >
              <Download className="h-4 w-4 me-2" />
              {t('exportCsv')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportPdf}
              disabled={exporting}
            >
              <FileText className="h-4 w-4 me-2" />
              {t('exportPdf')}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4">
            <Input
              label={t('filterByDate') + ' (from)'}
              type="datetime-local"
              value={filters.dateFrom?.slice(0, 16) ?? ''}
              onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value ? new Date(e.target.value).toISOString().slice(0, 19) : '' }))}
            />
            <Input
              label={t('filterByDate') + ' (to)'}
              type="datetime-local"
              value={filters.dateTo?.slice(0, 16) ?? ''}
              onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value ? new Date(e.target.value).toISOString().slice(0, 19) : '' }))}
            />
            <div>
              <label className="block text-sm font-medium text-text-main mb-1.5">{t('filterByEventType')}</label>
              <select
                className="flex h-10 w-full rounded-[var(--radius)] border border-border bg-surface px-3 py-2 text-sm text-text-main"
                value={filters.eventType ?? ''}
                onChange={(e) => setFilters((f) => ({ ...f, eventType: e.target.value || '' }))}
              >
                <option value="">—</option>
                {EVENT_TYPES.map((ev) => (
                  <option key={ev} value={ev}>{ev}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-main mb-1.5">{t('filterByTargetType')}</label>
              <select
                className="flex h-10 w-full rounded-[var(--radius)] border border-border bg-surface px-3 py-2 text-sm text-text-main"
                value={filters.targetType ?? ''}
                onChange={(e) => setFilters((f) => ({ ...f, targetType: e.target.value || '' }))}
              >
                <option value="">—</option>
                {TARGET_TYPES.map((tt) => (
                  <option key={tt} value={tt}>{tt}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-main mb-1.5">{t('filterByResult')}</label>
              <select
                className="flex h-10 w-full rounded-[var(--radius)] border border-border bg-surface px-3 py-2 text-sm text-text-main"
                value={filters.resultStatus ?? ''}
                onChange={(e) => setFilters((f) => ({ ...f, resultStatus: e.target.value || '' }))}
              >
                <option value="">—</option>
                <option value="success">success</option>
                <option value="failure">failure</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="dashboard-table-card">
        <CardContent className="p-0">
          {error && (
            <div className="p-4 bg-error/10 text-error rounded-t-lg">{error}</div>
          )}
          {loading ? (
            <div className="p-8 text-center text-text-muted">Loading…</div>
          ) : data.length === 0 ? (
            <div className="p-8 text-center text-text-muted">{t('cleanLog')}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface-hover">
                    <th className="text-start p-3 font-medium text-text-muted">{t('auditWhat')}</th>
                    <th className="text-start p-3 font-medium text-text-muted">{t('auditWho')}</th>
                    <th className="text-start p-3 font-medium text-text-muted">{t('auditWhen')}</th>
                    <th className="text-start p-3 font-medium text-text-muted">{t('auditTarget')}</th>
                    <th className="text-start p-3 font-medium text-text-muted">{t('auditResult')}</th>
                    <th className="text-start p-3 font-medium text-text-muted w-10">{t('auditMetadata')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((row) => (
                    <Fragment key={row.id}>
                      <tr
                        className="border-b border-border bg-transparent transition-colors"
                      >
                        <td className="p-3 text-text-main">{row.eventType}</td>
                        <td className="p-3 text-text-main">
                          {row.actorName ?? row.actorRole ?? '—'}
                          {row.actorRole && row.actorName && ` (${row.actorRole})`}
                        </td>
                        <td className="p-3 text-text-muted whitespace-nowrap">{formatWhen(row.occurredAt)}</td>
                        <td className="p-3 text-text-main">
                          {row.targetType}
                          {row.targetLabel ? `: ${row.targetLabel}` : ''}
                        </td>
                        <td className="p-3">
                          <Badge variant={row.resultStatus === 'failure' ? 'error' : 'success'}>
                            {row.resultStatus}
                          </Badge>
                          {row.resultMessage && (
                            <span className="ms-2 text-text-muted text-xs">{row.resultMessage}</span>
                          )}
                        </td>
                        <td className="p-3">
                          {row.metadata && Object.keys(row.metadata).length > 0 ? (
                            <button
                              type="button"
                              className="text-primary hover:underline"
                              onClick={() => setExpandedId(expandedId === row.id ? null : row.id)}
                            >
                              {expandedId === row.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </button>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                      {expandedId === row.id && row.metadata && (
                        <tr className="border-b border-border bg-surface-hover/30">
                          <td colSpan={6} className="p-3">
                            <pre className="text-xs text-text-muted overflow-auto max-h-48 rounded bg-surface p-3">
                              {JSON.stringify(row.metadata, null, 2)}
                            </pre>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {totalPages > 1 && (
            <div className="flex items-center justify-between p-4 border-t border-border">
              <span className="text-sm text-text-muted">
                {total} {t('auditLog').toLowerCase()}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  {t('previous')}
                </Button>
                <span className="flex items-center px-2 text-sm text-text-muted">
                  {page} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  {t('next')}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
