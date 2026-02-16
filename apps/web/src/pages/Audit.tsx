import { useState, useEffect, useCallback, Fragment } from 'react';
import toast from 'react-hot-toast';
import { useLangStore } from '@/store/langStore';
import { auditService, AuditEventRow, AuditListParams } from '@/services/auditService';
import { supabase } from '@/lib/supabaseClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Download, FileText, ChevronDown, ChevronRight, Filter } from 'lucide-react';

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
    q: '',
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

  // Fetch users list for filter dropdown
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        // Fetch all users from user_roles with their roles
        const { data: userRolesData } = await supabase
          .from('user_roles')
          .select('user_id, role:roles(name)');

        if (!userRolesData) return;

        // Get unique user IDs
        const userIds = [...new Set(userRolesData.map((ur: any) => ur.user_id))];

        // Fetch user emails from auth
        const userList: Array<{ id: string; email: string; role: string }> = [];
        for (const userId of userIds) {
          const { data: { user } } = await supabase.auth.admin.getUserById(userId);
          if (user?.email) {
            const userRole = userRolesData.find((ur: any) => ur.user_id === userId);
            userList.push({
              id: userId,
              email: user.email,
              role: (userRole as any)?.role?.name ?? 'No Role'
            });
          }
        }

        setUsers(userList.sort((a, b) => a.email.localeCompare(b.email)));
      } catch (err) {
        console.error('Failed to fetch users:', err);
      }
    };

    fetchUsers();
  }, []);

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
        q: filters.q || undefined,
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
      // 1. Fetch Template
      const response = await fetch('/templates/audit-report-template.html');
      const template = await response.text();

      const isAr = lang === 'ar';
      const baseUrl = window.location.origin;

      // Images
      const loginLogo = `${baseUrl}/loginlogo.png`;
      const footerImg = `${baseUrl}/footer.png`;
      const dashLogo = `${baseUrl}/loginlogo.png`;

      // 2. Fetch ALL Data (not just current page)
      const allDataRes = await auditService.list({
        ...filters,
        page: 1,
        pageSize: 1000, // Reasonable limit for browser print
      });
      const allEvents = allDataRes.data;

      // 3. Prepare Data
      const eventsData = allEvents.map(row => ({
        eventType: row.eventType,
        actorName: row.actorName || '—',
        actorRole: row.actorRole || '',
        occurredAt: formatWhen(row.occurredAt),
        targetType: row.targetType,
        targetLabel: row.targetLabel || '',
        resultStatus: row.resultStatus,
        statusClass: row.resultStatus === 'failure' ? 'badge-error' : 'badge-success',
        metadata: row.metadata ? JSON.stringify(row.metadata).slice(0, 100) + (JSON.stringify(row.metadata).length > 100 ? '...' : '') : '',
        align: isAr ? 'right' : 'left'
      }));

      // 4. Replacements
      let html = template;
      const replacements: Record<string, string> = {
        '{{lang}}': isAr ? 'ar' : 'en',
        '{{dir}}': isAr ? 'rtl' : 'ltr',
        '{{formattedDate}}': new Date().toLocaleDateString(isAr ? 'ar-SA' : 'en-GB'),
        '{{generationTimestamp}}': new Date().toLocaleString(),
        '{{loginLogoBase64}}': loginLogo,
        '{{footerImageBase64}}': footerImg,
        '{{dashboardLogoBase64}}': dashLogo,
        '{{totalEvents}}': String(allDataRes.total),

        // Labels
        '{{labels.reportTitle}}': isAr ? 'سجل التدقيق' : 'Audit Log Report',
        '{{labels.subtitle}}': isAr ? 'نظام راوي' : 'Raawi System',
        '{{labels.totalEvents}}': isAr ? 'إجمالي السجلات' : 'Total Events',
        '{{labels.generatedOn}}': isAr ? 'تم الإنشاء في' : 'Generated On',
        '{{labels.dateRange}}': isAr ? 'النطاق الزمني' : 'Date Range',
        '{{labels.eventType}}': isAr ? 'نوع الحدث' : 'Event Type',
        '{{labels.targetType}}': isAr ? 'نوع الهدف' : 'Target Type',
        '{{labels.resultStatus}}': isAr ? 'الحالة' : 'Result Status',
        '{{labels.search}}': isAr ? 'بحث' : 'Search',

        // Table Headers
        '{{labels.event}}': isAr ? 'الحدث' : 'Event',
        '{{labels.who}}': isAr ? 'المستخدم' : 'Who',
        '{{labels.when}}': isAr ? 'التوقيت' : 'When',
        '{{labels.target}}': isAr ? 'الهدف' : 'Target',
        '{{labels.result}}': isAr ? 'النتيجة' : 'Result',
        '{{labels.details}}': isAr ? 'التفاصيل' : 'Details',

        // Filters Values
        '{{filters.dateRange}}': `${filters.dateFrom || 'Start'} — ${filters.dateTo || 'Now'}`,
        '{{filters.eventType}}': filters.eventType || '',
        '{{filters.targetType}}': filters.targetType || '',
        '{{filters.resultStatus}}': filters.resultStatus || '',
        '{{filters.search}}': filters.q || '',
      };

      Object.entries(replacements).forEach(([key, val]) => {
        html = html.split(key).join(val);
      });

      // Conditional Filters Blocks
      ['eventType', 'targetType', 'resultStatus', 'search'].forEach(key => {
        // Simple hack: if value is empty in replacements, we rely on handlebars-like regex to remove block?
        // Actually, my regex below handles "if filter.key". 
        // But I need to ensure the block key matches.
        // Let's do a simple replace for blocks if the value was empty string.
        const val = (filters as any)[key];
        if (!val) {
          const regex = new RegExp(`{{#if filters.${key}}}[\\s\\S]*?{{/if}}`, 'g');
          html = html.replace(regex, '');
        } else {
          html = html.replace(`{{#if filters.${key}}}`, '').replace('{{/if}}', '');
        }
      });


      // 5. Generate Rows
      const rowsHtml = eventsData.map(item => `
        <tr>
            <td><div class="font-bold">${item.eventType}</div></td>
            <td>
                <div>${item.actorName}</div>
                <div style="color: #6B7280; font-size: 8px;">${item.actorRole}</div>
            </td>
            <td dir="ltr" style="text-align: ${item.align};">${item.occurredAt}</td>
            <td>
                <span style="font-weight: 600;">${item.targetType}</span>
                ${item.targetLabel ? `<span style="color: #6B7280;">: ${item.targetLabel}</span>` : ''}
            </td>
            <td>
                <span class="badge ${item.statusClass}">${item.resultStatus}</span>
            </td>
            <td>
                <div style="font-family: monospace; white-space: pre-wrap; font-size: 8px; color: #4B5563;">${item.metadata}</div>
            </td>
        </tr>
      `).join('');

      const loopRegex = /{{#each events}}([\s\S]*?){{\/each}}/m;
      html = html.replace(loopRegex, rowsHtml);

      // 6. Open Window
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
      toast.error(err instanceof Error ? err.message : 'PDF export failed');
    } finally {
      setExporting(false);
    }
  };

  const formatWhen = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleString(lang === 'ar' ? 'ar-SA' : 'en-GB', {
        dateStyle: 'short',
        timeStyle: 'medium',
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
    } catch {
      return iso;
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6 pb-8">
      <div>
        <h1 className="text-2xl font-bold text-text-main">{t('auditLog')}</h1>
      </div>

      <Card>
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
            <Input
              label={t('searchKeyword')}
              placeholder={t('searchKeyword')}
              value={filters.q ?? ''}
              onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
            />
          </div>
          <div className="flex justify-end">
            <Button onClick={() => setPage(1)}>Apply</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
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
                        className="border-b border-border hover:bg-surface-hover/50"
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
                  Previous
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
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
