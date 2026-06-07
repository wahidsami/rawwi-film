import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Download,
  FileDown,
  Loader2,
  RefreshCw,
  SlidersHorizontal,
  Table2,
} from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import toast from 'react-hot-toast';

import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { useAuthStore } from '@/store/authStore';
import { useDataStore } from '@/store/dataStore';
import { useLangStore } from '@/store/langStore';
import { useSettingsStore } from '@/store/settingsStore';
import { formatDateTimeValue, APP_TIME_ZONE } from '@/utils/dateFormat';
import {
  reportsApi,
  scriptsApi,
  usersApi,
  type ReportListItem,
  type RegulatorPerformancePayload,
  type Script,
  type UserListItem,
} from '@/api';
import { auditService, type AuditEventRow } from '@/services/auditService';
import { downloadCsvFile, downloadXlsxFile } from '@/utils/spreadsheetExport';
import { downloadReportBuilderPdf } from '@/components/reports/report-builder/download';
import { cn } from '@/utils/cn';

type BuilderSource = 'scripts' | 'reports' | 'users' | 'audit' | 'performance';

type BuilderRow = {
  id: string;
  values: Record<string, string | number | null>;
  searchText: string;
  status: string;
  roleKey: string | null;
  dateRaw: string | null;
  actionHref: string | null;
  actionLabelAr: string;
  actionLabelEn: string;
};

type ColumnDef = {
  key: string;
  labelAr: string;
  labelEn: string;
};

const SOURCE_OPTIONS: Array<{ value: BuilderSource; labelAr: string; labelEn: string; descriptionAr: string; descriptionEn: string; supportsDateRange: boolean }> = [
  {
    value: 'scripts',
    labelAr: 'النصوص',
    labelEn: 'Scripts',
    descriptionAr: 'تصدير قائمة النصوص، حالاتها، ومعلومات الإسناد.',
    descriptionEn: 'Export script inventory, status, and assignment data.',
    supportsDateRange: true,
  },
  {
    value: 'reports',
    labelAr: 'التقارير',
    labelEn: 'Reports',
    descriptionAr: 'تصدير تقارير التحليل مع المراجع والنتيجة.',
    descriptionEn: 'Export analysis reports with decisions and review metadata.',
    supportsDateRange: true,
  },
  {
    value: 'users',
    labelAr: 'المستخدمون الداخليّون',
    labelEn: 'Internal Users',
    descriptionAr: 'تصدير مستخدمي الإدارة والمراجعين مع الصلاحيات والدور.',
    descriptionEn: 'Export internal users, roles, permissions, and section access.',
    supportsDateRange: false,
  },
  {
    value: 'audit',
    labelAr: 'سجل التدقيق',
    labelEn: 'Audit Log',
    descriptionAr: 'تصدير سجل العمليات والأحداث التشغيلية مع النتائج.',
    descriptionEn: 'Export operational events and audit actions with outcomes.',
    supportsDateRange: true,
  },
  {
    value: 'performance',
    labelAr: 'الأداء',
    labelEn: 'Performance',
    descriptionAr: 'تصدير أداء الإداريين والمراجعين مع مؤشرات الإنجاز والسرعة.',
    descriptionEn: 'Export admins and regulators performance with workload and turnaround metrics.',
    supportsDateRange: true,
  },
];

const SOURCE_COLUMNS: Record<BuilderSource, ColumnDef[]> = {
  scripts: [
    { key: 'title', labelAr: 'اسم النص', labelEn: 'Title' },
    { key: 'company', labelAr: 'المستفيد', labelEn: 'Beneficiary' },
    { key: 'type', labelAr: 'النوع', labelEn: 'Type' },
    { key: 'classification', labelAr: 'التصنيف', labelEn: 'Classification' },
    { key: 'episodeCount', labelAr: 'عدد الحلقات', labelEn: 'Episode Count' },
    { key: 'expectedRank', labelAr: 'الرتبة المتوقعة', labelEn: 'Expected Rank' },
    { key: 'hasSecurityScenes', labelAr: 'مشاهد أمنية', labelEn: 'Security Scenes' },
    { key: 'status', labelAr: 'الحالة', labelEn: 'Status' },
    { key: 'assignee', labelAr: 'المسند إليه', labelEn: 'Assignee' },
    { key: 'recommendation', labelAr: 'التوصية', labelEn: 'Recommendation' },
    { key: 'receivedAt', labelAr: 'تاريخ الاستلام', labelEn: 'Received At' },
    { key: 'createdAt', labelAr: 'تاريخ الإنشاء', labelEn: 'Created At' },
  ],
  reports: [
    { key: 'scriptTitle', labelAr: 'اسم النص', labelEn: 'Script Title' },
    { key: 'company', labelAr: 'المستفيد', labelEn: 'Beneficiary' },
    { key: 'status', labelAr: 'حالة المراجعة', labelEn: 'Review Status' },
    { key: 'findingsCount', labelAr: 'عدد الملاحظات', labelEn: 'Findings Count' },
    { key: 'approvedCount', labelAr: 'الملاحظات المقبولة', labelEn: 'Approved Findings' },
    { key: 'rejectedCount', labelAr: 'الملاحظات المرفوضة', labelEn: 'Rejected Findings' },
    { key: 'reviewedBy', labelAr: 'المراجع', labelEn: 'Reviewed By' },
    { key: 'reviewedAt', labelAr: 'تاريخ المراجعة', labelEn: 'Reviewed At' },
    { key: 'createdAt', labelAr: 'تاريخ الإنشاء', labelEn: 'Created At' },
    { key: 'creator', labelAr: 'منشئ التقرير', labelEn: 'Created By' },
  ],
  users: [
    { key: 'name', labelAr: 'الاسم', labelEn: 'Name' },
    { key: 'email', labelAr: 'البريد الإلكتروني', labelEn: 'Email' },
    { key: 'role', labelAr: 'الدور', labelEn: 'Role' },
    { key: 'status', labelAr: 'الحالة', labelEn: 'Status' },
    { key: 'permissionsCount', labelAr: 'عدد الصلاحيات', labelEn: 'Permissions Count' },
    { key: 'sectionsCount', labelAr: 'عدد الأقسام', labelEn: 'Sections Count' },
  ],
  performance: [
    { key: 'name', labelAr: 'الاسم', labelEn: 'Name' },
    { key: 'email', labelAr: 'البريد الإلكتروني', labelEn: 'Email' },
    { key: 'role', labelAr: 'الدور', labelEn: 'Role' },
    { key: 'assignedScripts', labelAr: 'النصوص المسندة', labelEn: 'Assigned Scripts' },
    { key: 'recommendations', labelAr: 'التوصيات', labelEn: 'Recommendations' },
    { key: 'sendBacks', labelAr: 'الإرجاعات', labelEn: 'Send-backs' },
    { key: 'agreementRate', labelAr: 'معدل التوافق', labelEn: 'Agreement Rate' },
    { key: 'avgFirstAction', labelAr: 'متوسط أول إجراء', labelEn: 'Avg. First Action' },
    { key: 'avgTurnaround', labelAr: 'متوسط زمن المعالجة', labelEn: 'Avg. Turnaround' },
  ],
  audit: [
    { key: 'eventType', labelAr: 'نوع الحدث', labelEn: 'Event Type' },
    { key: 'actor', labelAr: 'المستخدم', labelEn: 'Actor' },
    { key: 'targetType', labelAr: 'الوجهة', labelEn: 'Target Type' },
    { key: 'resultStatus', labelAr: 'النتيجة', labelEn: 'Result' },
    { key: 'occurredAt', labelAr: 'الوقت', labelEn: 'Occurred At' },
    { key: 'targetLabel', labelAr: 'الهدف', labelEn: 'Target' },
  ],
};

const SOURCE_DEFAULT_COLUMNS: Record<BuilderSource, string[]> = {
  scripts: ['title', 'company', 'status', 'assignee', 'receivedAt', 'createdAt'],
  reports: ['scriptTitle', 'company', 'status', 'findingsCount', 'reviewedAt', 'createdAt'],
  users: ['name', 'email', 'role', 'status', 'permissionsCount'],
  performance: ['name', 'role', 'assignedScripts', 'recommendations', 'agreementRate'],
  audit: ['eventType', 'actor', 'targetType', 'resultStatus', 'occurredAt'],
};

const AUDIT_EVENT_TYPES = [
  'TASK_CREATED', 'TASK_ASSIGNED', 'ANALYSIS_STARTED', 'ANALYSIS_COMPLETED', 'REPORT_GENERATED',
  'FINDING_CREATED', 'FINDING_OVERRIDDEN', 'FINDING_MARKED_SAFE', 'FINDING_DELETED',
  'LEXICON_TERM_ADDED', 'LEXICON_TERM_UPDATED', 'LEXICON_TERM_DELETED',
  'CLIENT_CREATED', 'CLIENT_UPDATED', 'CLIENT_DEACTIVATED',
  'USER_ROLE_CHANGED', 'LOGIN_SUCCESS', 'LOGIN_FAILED',
];

const AUDIT_TARGET_TYPES = ['script', 'task', 'report', 'glossary', 'client'];

function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '0';
  return new Intl.NumberFormat().format(value);
}

function dateKey(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function normalizeText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).toLowerCase();
}

function hasRenderableValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'boolean') return true;
  const text = String(value).trim();
  return text !== '' && text !== '—' && text !== 'null' && text !== 'undefined';
}

function formatStatusLabel(value: string | null | undefined, lang: 'ar' | 'en'): string {
  const status = String(value ?? '').trim().toLowerCase();
  if (!status) return '—';

  const labels: Record<string, { ar: string; en: string }> = {
    active: { ar: 'نشط', en: 'Active' },
    invited: { ar: 'مدعو', en: 'Invited' },
    draft: { ar: 'مسودة', en: 'Draft' },
    pending: { ar: 'قيد الانتظار', en: 'Pending' },
    assigned: { ar: 'مُسند', en: 'Assigned' },
    in_review: { ar: 'قيد المراجعة', en: 'In Review' },
    analysis_running: { ar: 'التحليل جارٍ', en: 'Analysis Running' },
    resubmitted: { ar: 'مُعاد الإرسال', en: 'Resubmitted' },
    reviewed: { ar: 'تمت المراجعة', en: 'Reviewed' },
    approved: { ar: 'معتمد', en: 'Approved' },
    rejected: { ar: 'مرفوض', en: 'Rejected' },
    completed: { ar: 'مكتمل', en: 'Completed' },
    success: { ar: 'ناجح', en: 'Success' },
    failed: { ar: 'فشل', en: 'Failed' },
    warning: { ar: 'تحذير', en: 'Warning' },
    info: { ar: 'معلومة', en: 'Info' },
    error: { ar: 'خطأ', en: 'Error' },
  };

  const label = labels[status];
  if (label) return lang === 'ar' ? label.ar : label.en;

  const humanized = status
    .split(/[_\s-]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
  return humanized || '—';
}

function autoSelectColumnsForRows(source: BuilderSource, rows: BuilderRow[]): string[] {
  const allColumns = SOURCE_COLUMNS[source].map((column) => column.key);
  const populatedColumns = allColumns.filter((key) => rows.some((row) => hasRenderableValue(row.values[key])));
  return populatedColumns.length > 0 ? populatedColumns : SOURCE_DEFAULT_COLUMNS[source];
}

function createBuilderRows(
  source: BuilderSource,
  payload: {
    scripts: Script[];
    reports: ReportListItem[];
    users: UserListItem[];
    performance: Array<{ user: UserListItem; payload: RegulatorPerformancePayload | null }>;
    audit: AuditEventRow[];
    companies: Array<{ companyId: string; nameAr?: string; nameEn?: string }>;
  },
  lang: 'ar' | 'en',
): BuilderRow[] {
  const companyName = (companyId?: string | null) => {
    if (!companyId) return '—';
    const company = payload.companies.find((item) => item.companyId === companyId);
    if (!company) return companyId;
    return lang === 'ar'
      ? company.nameAr || company.nameEn || company.companyId
      : company.nameEn || company.nameAr || company.companyId;
  };

  if (source === 'scripts') {
    return payload.scripts.map((script) => {
      const beneficiary = companyName(script.companyId);
      const status = String(script.status ?? '—');
      const receivedAtValue = script.receivedAt || script.createdAt || null;
      const values = {
        title: script.title || '—',
        company: beneficiary,
        type: script.type || '—',
        classification: script.workClassification || '—',
        episodeCount: script.episodeCount ?? '—',
        expectedRank: script.expectedRank || '—',
        hasSecurityScenes: script.hasSecurityScenes === null || script.hasSecurityScenes === undefined
          ? '—'
          : (script.hasSecurityScenes ? (lang === 'ar' ? 'نعم' : 'Yes') : (lang === 'ar' ? 'لا' : 'No')),
        status: formatStatusLabel(status, lang),
        assignee: script.assigneeName || script.assigneeId || '—',
        recommendation: script.recommendationStatus || '—',
        receivedAt: formatDateTimeValue(receivedAtValue, { lang }),
        createdAt: formatDateTimeValue(script.createdAt, { lang }),
      };
      const searchText = [
        script.title,
        beneficiary,
        script.type,
        script.workClassification,
        script.episodeCount,
        script.expectedRank,
        script.hasSecurityScenes,
        status,
        script.assigneeName,
        script.assigneeId,
        script.recommendationStatus,
      ]
        .map(normalizeText)
        .join(' ');

      return {
        id: script.id,
        values,
        searchText,
        status,
        roleKey: null,
        dateRaw: receivedAtValue,
        actionHref: `/app/workspace/${script.id}`,
        actionLabelAr: 'فتح النص',
        actionLabelEn: 'Open script',
      };
    });
  }

  if (source === 'reports') {
    return payload.reports.map((report) => {
      const beneficiary = report.companyNameAr || report.companyNameEn || report.clientName || '—';
      const status = String(report.reviewStatus ?? '—');
      const values = {
        scriptTitle: report.scriptTitle || '—',
        company: beneficiary,
        status: formatStatusLabel(status, lang),
        findingsCount: report.findingsCount,
        approvedCount: report.approvedCount,
        rejectedCount: report.rejectedCount ?? 0,
        reviewedBy: report.reportCreatorName || report.reviewedBy || '—',
        reviewedAt: formatDateTimeValue(report.reviewedAt || report.lastReviewedAt || report.createdAt, { lang }),
        createdAt: formatDateTimeValue(report.createdAt, { lang }),
        creator: report.reportCreatorName || '—',
      };
      const searchText = [
        report.scriptTitle,
        beneficiary,
        status,
        report.reviewNotes,
        report.reportCreatorName,
        report.reviewedBy,
        report.lastReviewedBy,
        report.createdBy,
        report.createdAt,
      ]
        .map(normalizeText)
        .join(' ');

      return {
        id: report.id,
        values,
        searchText,
        status,
        roleKey: null,
        dateRaw: report.reviewedAt || report.createdAt || null,
        actionHref: `/report/${report.jobId || report.id}?by=${report.jobId ? 'job' : 'id'}`,
        actionLabelAr: 'فتح التقرير',
        actionLabelEn: 'Open report',
      };
    });
  }

  if (source === 'audit') {
    return payload.audit.map((event) => {
      const actor = event.actorName || event.actorUserId || '—';
      const target = event.targetLabel || event.targetId || '—';
      const values = {
        eventType: formatStatusLabel(event.eventType, lang),
        actor,
        targetType: formatStatusLabel(event.targetType, lang),
        resultStatus: formatStatusLabel(event.resultStatus, lang),
        occurredAt: formatDateTimeValue(event.occurredAt, { lang }),
        targetLabel: target,
      };
      const searchText = [
        event.eventType,
        event.actorName,
        event.actorUserId,
        event.actorRole,
        event.targetType,
        event.targetLabel,
        event.targetId,
        event.resultStatus,
        event.resultMessage,
      ]
        .map(normalizeText)
        .join(' ');

      return {
        id: event.id,
        values,
        searchText,
        status: event.resultStatus,
        roleKey: event.actorRole,
        dateRaw: event.occurredAt || event.createdAt || null,
        actionHref: '/app/audit',
        actionLabelAr: 'فتح التدقيق',
        actionLabelEn: 'Open audit',
      };
    });
  }

  if (source === 'performance') {
    return payload.performance
      .filter(({ user }) => user.status === 'active')
      .filter(({ user }) => String(user.roleKey ?? '').toLowerCase() !== 'beneficiary')
      .map(({ user, payload: perf }) => {
        const role = user.roleKey || '—';
        const summary = perf?.summary ?? null;
      const values = {
        name: user.name || '—',
        email: user.email || '—',
        role: formatStatusLabel(role, lang),
        status: formatStatusLabel(user.status, lang),
        assignedScripts: summary?.totalAssignedScripts ?? 0,
        recommendations: summary?.totalRecommendations ?? 0,
        sendBacks: summary?.totalSendBacks ?? 0,
          agreementRate: summary?.recommendationAgreementRate == null ? '—' : `${Math.round(summary.recommendationAgreementRate * 100)}%`,
          agreementRateValue: summary?.recommendationAgreementRate ?? null,
          avgFirstAction: summary?.averageFirstActionMinutes == null ? '—' : `${Math.round(summary.averageFirstActionMinutes)} min`,
          avgTurnaround: summary?.averageTurnaroundDays == null ? '—' : `${summary.averageTurnaroundDays.toFixed(1)} d`,
        };
        const searchText = [
          user.name,
          user.email,
          user.roleKey,
          user.status,
          summary?.totalAssignedScripts,
          summary?.totalRecommendations,
          summary?.totalSendBacks,
          summary?.averageFirstActionMinutes,
          summary?.averageTurnaroundDays,
        ]
          .map(normalizeText)
          .join(' ');

        return {
          id: user.id,
          values,
          searchText,
          status: user.status,
          roleKey: user.roleKey || null,
          dateRaw: null,
          actionHref: `/app/performance/${user.id}`,
          actionLabelAr: 'عرض الأداء',
          actionLabelEn: 'Open performance',
        };
      });
  }

  return payload.users
    .filter((user) => user.status === 'active')
    .filter((user) => String(user.roleKey ?? '').toLowerCase() !== 'beneficiary')
    .map((user) => {
      const role = user.roleKey || '—';
      const values = {
        name: user.name || '—',
        email: user.email || '—',
        role: formatStatusLabel(role, lang),
        status: formatStatusLabel(user.status, lang),
        permissionsCount: user.permissions?.length ?? 0,
        sectionsCount: user.allowedSections?.length ?? 0,
      };
      const searchText = [
        user.name,
        user.email,
        user.roleKey,
        user.status,
        ...(user.permissions ?? []),
        ...(user.allowedSections ?? []),
      ]
        .map(normalizeText)
        .join(' ');

      return {
        id: user.id,
        values,
        searchText,
        status: user.status,
        roleKey: user.roleKey || null,
        dateRaw: null,
        actionHref: `/app/performance/${user.id}`,
        actionLabelAr: 'عرض الأداء',
        actionLabelEn: 'Open performance',
      };
    });
}

function buildSummaryCards(
  source: BuilderSource,
  rows: BuilderRow[],
  filteredRows: BuilderRow[],
  selectedColumns: string[],
  lang: 'ar' | 'en',
) {
  const statuses = new Set(filteredRows.map((row) => row.status).filter(Boolean));
  const roles = new Set(filteredRows.map((row) => row.roleKey).filter(Boolean) as string[]);
  const isPerformance = source === 'performance';
  const avgAgreement = isPerformance
    ? filteredRows.reduce((sum, row) => sum + Number(row.values['agreementRateValue'] ?? 0), 0)
    : 0;
  return [
    {
      label: lang === 'ar' ? 'إجمالي السجلات' : 'Total rows',
      value: formatCount(rows.length),
      hint: lang === 'ar' ? 'قبل التصفية' : 'Before filters',
    },
    {
      label: lang === 'ar' ? 'السجلات الظاهرة' : 'Visible rows',
      value: formatCount(filteredRows.length),
      hint: lang === 'ar' ? 'بعد التصفية' : 'After filters',
    },
    {
      label: lang === 'ar' ? 'الحالات المختلفة' : 'Distinct statuses',
      value: formatCount(statuses.size),
      hint: lang === 'ar' ? 'منظور الحالة' : 'Status distribution',
    },
    {
      label: lang === 'ar' ? 'الأعمدة المختارة' : 'Selected columns',
      value: formatCount(selectedColumns.length),
      hint: source === 'users' || source === 'performance'
        ? (lang === 'ar' ? 'بيانات المستخدمين الداخليين' : 'Internal user columns')
        : (lang === 'ar' ? 'حقول التصدير' : 'Export fields'),
    },
    ...(isPerformance
      ? [
          {
            label: lang === 'ar' ? 'إجمالي النصوص المسندة' : 'Assigned scripts',
            value: formatCount(filteredRows.reduce((sum, row) => sum + Number(row.values['assignedScripts'] ?? 0), 0)),
            hint: lang === 'ar' ? 'داخل فترة التقرير' : 'Within the reporting window',
          },
          {
            label: lang === 'ar' ? 'متوسط التوافق' : 'Avg. agreement',
            value: filteredRows.length ? `${Math.round((avgAgreement / filteredRows.length) * 100)}%` : '0%',
            hint: lang === 'ar' ? 'مع القرار النهائي' : 'Against the final decision',
          },
        ]
      : []),
    ...(source === 'users' || source === 'performance'
      ? [{
          label: lang === 'ar' ? 'الأدوار الظاهرة' : 'Visible roles',
          value: formatCount(roles.size),
          hint: lang === 'ar' ? 'مراجعون وإداريون' : 'Admins and regulators',
        }]
      : []),
  ];
}

export function ReportBuilder() {
  const { lang } = useLangStore();
  const navigate = useNavigate();
  const { user, hasPermission } = useAuthStore();
  const { fetchInitialData, companies } = useDataStore();
  const { settings } = useSettingsStore();

  const [source, setSource] = useState<BuilderSource>('scripts');
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<BuilderRow[]>([]);
  const [selectedColumns, setSelectedColumns] = useState<string[]>(SOURCE_DEFAULT_COLUMNS.scripts);
  const [statusFilter, setStatusFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [eventTypeFilter, setEventTypeFilter] = useState('all');
  const [targetTypeFilter, setTargetTypeFilter] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [downloading, setDownloading] = useState<'csv' | 'xlsx' | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [reportCreated, setReportCreated] = useState(false);

  const canAccessBuilder = user?.role === 'Admin' || user?.role === 'Super Admin' || hasPermission('manage_users');
  const sourceOption = SOURCE_OPTIONS.find((opt) => opt.value === source) ?? SOURCE_OPTIONS[0];
  const selectedColumnsMeta = useMemo(() => SOURCE_COLUMNS[source].filter((col) => selectedColumns.includes(col.key)), [source, selectedColumns]);
  const coverageMatrix = useMemo(() => {
    const allColumns = SOURCE_COLUMNS[source];
    const populated = allColumns.filter((column) => rows.some((row) => hasRenderableValue(row.values[column.key])));
    const visibleKeys = new Set(selectedColumnsMeta.map((column) => column.key));
    const hidden = allColumns.filter((column) => !visibleKeys.has(column.key));
    return {
      total: allColumns.length,
      populated,
      hidden,
      visibleCount: selectedColumnsMeta.length,
    };
  }, [rows, selectedColumnsMeta, source]);
  const availableStatuses = useMemo(() => {
    const values = Array.from(new Set(rows.map((row) => row.status).filter(Boolean))).sort((a, b) => a.localeCompare(b));
    return values;
  }, [rows]);
  const availableRoles = useMemo(() => {
    if (source !== 'users' && source !== 'performance') return [];
    return Array.from(new Set(rows.map((row) => row.roleKey).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b));
  }, [rows, source]);
  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  const loadSourceData = useCallback(async (nextSource: BuilderSource, range?: { from?: string; to?: string }): Promise<boolean> => {
    if (!canAccessBuilder) return false;
    setLoading(true);
    setError(null);
    setLoadingMessage(lang === 'ar' ? 'جاري تحميل بيانات المصدر...' : 'Loading source data...');
    try {
      const rangeFrom = range?.from ?? from;
      const rangeTo = range?.to ?? to;
      const usersPromise = nextSource === 'users' || nextSource === 'performance'
        ? usersApi.getUsers()
        : Promise.resolve<UserListItem[]>([]);
      const [scriptRows, reportRows, userRows, auditRows, performanceRows] = await Promise.all([
        nextSource === 'scripts' ? scriptsApi.getScripts() : Promise.resolve<Script[]>([]),
        nextSource === 'reports' ? reportsApi.listAll() : Promise.resolve<ReportListItem[]>([]),
        usersPromise,
        nextSource === 'audit'
          ? auditService.list({ page: 1, pageSize: 1000 }).then((res) => res.data)
          : Promise.resolve<AuditEventRow[]>([]),
        nextSource === 'performance'
          ? usersPromise.then(async (users) => {
              const internalUsers = users
                .filter((u) => u.status === 'active')
                .filter((u) => String(u.roleKey ?? '').toLowerCase() !== 'beneficiary');
              const entries = await Promise.all(
                internalUsers.map(async (u) => {
                  try {
                    const payload = await reportsApi.getRegulatorPerformance(u.id, { from: rangeFrom || undefined, to: rangeTo || undefined });
                    return { user: u, payload };
                  } catch {
                    return { user: u, payload: null };
                  }
                }),
              );
              return entries;
            })
          : Promise.resolve<Array<{ user: UserListItem; payload: RegulatorPerformancePayload | null }>>([]),
      ]);

      const nextRows = createBuilderRows(
        nextSource,
        {
          scripts: scriptRows,
          reports: reportRows,
          users: userRows,
          performance: performanceRows,
          audit: auditRows,
          companies,
        },
        lang,
      );

      setRows(nextRows);
      setSelectedColumns(autoSelectColumnsForRows(nextSource, nextRows));
      setPage(1);
      return true;
    } catch (err: any) {
      setError(err?.message ?? (lang === 'ar' ? 'تعذر تحميل البيانات' : 'Failed to load data'));
      setRows([]);
      return false;
    } finally {
      setLoading(false);
      setLoadingMessage('');
    }
  }, [canAccessBuilder, companies, from, lang, to]);

  const handleSourceChange = useCallback((nextSource: BuilderSource) => {
    setSource(nextSource);
    setSelectedColumns(SOURCE_DEFAULT_COLUMNS[nextSource]);
    setStatusFilter('all');
    setRoleFilter('all');
    setEventTypeFilter('all');
    setTargetTypeFilter('all');
    setFrom('');
    setTo('');
    setPageSize(10);
    setPage(1);
    setRows([]);
    setReportCreated(false);
  }, []);

  const handleCreateReport = useCallback(async () => {
    const success = await loadSourceData(source, { from, to });
    setReportCreated(success);
  }, [from, loadSourceData, source, to]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const matchesStatus = statusFilter === 'all' || row.status === statusFilter;
      const matchesRole = (source !== 'users' && source !== 'performance') || roleFilter === 'all' || row.roleKey === roleFilter;
      const matchesEventType = source !== 'audit' || eventTypeFilter === 'all' || row.values['eventType'] === eventTypeFilter;
      const matchesTargetType = source !== 'audit' || targetTypeFilter === 'all' || row.values['targetType'] === targetTypeFilter;
      const rowDate = dateKey(row.dateRaw);
      const matchesFrom = source === 'performance' ? true : (!from || !rowDate || rowDate >= from);
      const matchesTo = source === 'performance' ? true : (!to || !rowDate || rowDate <= to);
      return matchesStatus && matchesRole && matchesEventType && matchesTargetType && matchesFrom && matchesTo;
    });
  }, [rows, statusFilter, roleFilter, source, eventTypeFilter, targetTypeFilter, from, to]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const pageRows = filteredRows.slice((currentPage - 1) * pageSize, (currentPage - 1) * pageSize + pageSize);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, roleFilter, eventTypeFilter, targetTypeFilter, from, to, pageSize, source]);

  useEffect(() => {
    const valid = new Set(SOURCE_COLUMNS[source].map((col) => col.key));
    setSelectedColumns((current) => {
      const next = current.filter((key) => valid.has(key));
      return next.length > 0 ? next : SOURCE_DEFAULT_COLUMNS[source];
    });
  }, [source]);

  const chartData = useMemo(() => {
    if (source === 'performance') {
      return filteredRows
        .map((row) => ({
          name: String(row.values['name'] ?? '—'),
          value: Number(row.values['assignedScripts'] ?? 0),
        }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 8);
    }
    const counts = new Map<string, number>();
    filteredRows.forEach((row) => {
      const key = row.status || '—';
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [filteredRows, source]);

  const summaryCards = useMemo(
    () => buildSummaryCards(source, rows, filteredRows, selectedColumns, lang),
    [filteredRows, lang, rows, selectedColumns, source],
  );

  const exportBaseName = useMemo(() => {
    const stamp = new Date().toISOString().slice(0, 10);
    return `report-builder-${source}-${stamp}`;
  }, [source]);

  const handleExportCsv = async () => {
    if (downloading) return;
    if (!reportCreated) {
      toast.error(lang === 'ar' ? 'أنشئ التقرير أولًا' : 'Create the report first');
      return;
    }
    setDownloading('csv');
    try {
      const headers = selectedColumnsMeta.map((col) => (lang === 'ar' ? col.labelAr : col.labelEn));
      const rowsForExport = filteredRows.map((row) => selectedColumnsMeta.map((col) => row.values[col.key] ?? ''));
      downloadCsvFile({
        fileName: `${exportBaseName}.csv`,
        headers,
        rows: rowsForExport,
      });
      toast.success(lang === 'ar' ? 'تم تنزيل CSV' : 'CSV downloaded');
    } catch (err: any) {
      toast.error(err?.message ?? (lang === 'ar' ? 'تعذر تنزيل CSV' : 'Failed to download CSV'));
    } finally {
      setDownloading(null);
    }
  };

  const handleExportXlsx = async () => {
    if (downloading) return;
    if (!reportCreated) {
      toast.error(lang === 'ar' ? 'أنشئ التقرير أولًا' : 'Create the report first');
      return;
    }
    setDownloading('xlsx');
    try {
      const headers = selectedColumnsMeta.map((col) => (lang === 'ar' ? col.labelAr : col.labelEn));
      const dataRows = filteredRows.map((row) => selectedColumnsMeta.map((col) => row.values[col.key] ?? ''));
      const summaryRows = [
        ['Generated At', new Intl.DateTimeFormat('en-GB', {
          timeZone: APP_TIME_ZONE,
          dateStyle: 'medium',
          timeStyle: 'medium',
        }).format(new Date())],
        ['Total Rows', rows.length],
        ['Filtered Rows', filteredRows.length],
        ['Selected Columns', selectedColumnsMeta.length],
      ];
      await downloadXlsxFile({
        fileName: `${exportBaseName}.xlsx`,
        sheets: [
          {
            name: 'Summary',
            rows: [
              ['Report Builder', sourceOption.labelEn],
              ...summaryRows,
            ],
          },
          {
            name: 'Data',
            rows: [
              headers,
              ...dataRows,
            ],
          },
        ],
      });
      toast.success(lang === 'ar' ? 'تم تنزيل Excel' : 'Excel downloaded');
    } catch (err: any) {
      toast.error(err?.message ?? (lang === 'ar' ? 'تعذر تنزيل Excel' : 'Failed to download Excel'));
    } finally {
      setDownloading(null);
    }
  };

  const handleExportPdf = async () => {
    if (downloadingPdf) return;
    if (!reportCreated) {
      toast.error(lang === 'ar' ? 'أنشئ التقرير أولًا' : 'Create the report first');
      return;
    }
    setDownloadingPdf(true);
    try {
      const pdfRows = filteredRows.slice(0, 30).map((row) => ({
        values: selectedColumnsMeta.map((col) => String(row.values[col.key] ?? '—')),
      }));
      await downloadReportBuilderPdf({
        lang,
        dateFormat: settings?.platform?.dateFormat,
        data: {
          sourceLabel: sourceOption.labelEn,
          generatedAt: new Date().toISOString(),
          totalRows: rows.length,
          filteredRows: filteredRows.length,
          selectedColumns: selectedColumnsMeta.length,
          summaryCards: summaryCards.map((card) => ({
            label: card.label,
            value: card.value,
            hint: card.hint,
          })),
          filters: [
            { label: lang === 'ar' ? 'مصدر البيانات' : 'Data source', value: sourceOption.labelEn },
            { label: lang === 'ar' ? 'الحالة' : 'Status', value: statusFilter },
            { label: lang === 'ar' ? 'الدور' : 'Role', value: source === 'users' || source === 'performance' ? roleFilter : '—' },
            { label: lang === 'ar' ? 'من تاريخ' : 'From date', value: from || '—' },
            { label: lang === 'ar' ? 'إلى تاريخ' : 'To date', value: to || '—' },
          ],
          columns: selectedColumnsMeta.map((col) => ({ label: lang === 'ar' ? col.labelAr : col.labelEn })),
          rows: pdfRows,
        },
      });
      toast.success(lang === 'ar' ? 'تم تنزيل PDF' : 'PDF downloaded');
    } catch (err: any) {
      toast.error(err?.message ?? (lang === 'ar' ? 'تعذر تنزيل PDF' : 'Failed to download PDF'));
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handleReset = () => {
    setStatusFilter('all');
    setRoleFilter('all');
    setEventTypeFilter('all');
    setTargetTypeFilter('all');
    setFrom('');
    setTo('');
    setPage(1);
    setRows([]);
    setReportCreated(false);
  };

  if (!canAccessBuilder) {
    return (
      <div className="space-y-6">
        <Card className="border-border/60">
          <CardContent className="p-8 text-center">
            <p className="text-text-muted">
              {lang === 'ar' ? 'هذه الصفحة مخصصة للمسؤولين فقط.' : 'This page is available to admins only.'}
            </p>
          </CardContent>
      </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="border-border/60 shadow-sm">
        <CardContent className="p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.28em] text-text-muted">
                <SlidersHorizontal className="h-4 w-4 text-primary" />
                {lang === 'ar' ? 'منشئ التقارير' : 'Report Builder'}
              </div>
              <h1 className="text-2xl font-bold text-text-main">
                {lang === 'ar' ? 'أنشئ تقريرًا مخصصًا من بيانات النظام' : 'Build a custom report from system data'}
              </h1>
              <p className="max-w-3xl text-sm text-text-muted">
                {lang === 'ar'
                  ? 'اختر نوع التقرير، حدّد الحقول المطلوبة، ثم أنشئ التقرير وصدّره كملف PDF أو Excel.'
                  : 'Choose the report type, pick the fields you need, then create the report and export it as PDF or Excel.'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="outline" onClick={handleReset}>
                <RefreshCw className="me-2 h-4 w-4" />
                {lang === 'ar' ? 'إعادة الضبط' : 'Reset filters'}
              </Button>
            </div>
          </div>
          </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardContent className="space-y-5 p-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-text-main">
                  {lang === 'ar' ? '1. اختر التقرير والحقول' : '1. Choose report and fields'}
                </h2>
                <Badge variant="secondary">
                  {lang === 'ar' ? 'الخطوة 1' : 'Step 1'}
                </Badge>
              </div>
              <p className="text-sm text-text-muted">
                {lang === 'ar'
                  ? 'أبقينا الخطوة الأساسية واضحة، وأخفينا ما هو اختياري حتى تحتاجه.'
                  : 'We keep the main step clear and tuck optional controls away until you need them.'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">
                {lang === 'ar' ? 'المصدر' : 'Source'}: {lang === 'ar' ? sourceOption.labelAr : sourceOption.labelEn}
              </Badge>
              <Badge variant="secondary">
                {lang === 'ar' ? 'أعمدة التصدير' : 'Export columns'}: {selectedColumnsMeta.length}
              </Badge>
              <Badge variant="secondary">
                {lang === 'ar' ? 'حالة التقرير' : 'Report state'}: {reportCreated ? (lang === 'ar' ? 'جاهز' : 'Ready') : (lang === 'ar' ? 'غير منشأ' : 'Not created')}
              </Badge>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Select
              label={lang === 'ar' ? 'مصدر البيانات' : 'Data source'}
              value={source}
              onChange={(e) => void handleSourceChange(e.target.value as BuilderSource)}
              options={SOURCE_OPTIONS.map((opt) => ({
                value: opt.value,
                label: lang === 'ar' ? opt.labelAr : opt.labelEn,
              }))}
            />
          </div>

          <div className="rounded-[var(--radius)] border border-border bg-background/50 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-text-main">
                  {lang === 'ar' ? 'مصفوفة تغطية البيانات' : 'Data coverage matrix'}
                </p>
                <p className="text-xs text-text-muted">
                  {lang === 'ar'
                    ? 'نعرض فقط الحقول التي تحتوي على بيانات فعلية أو تضيف قيمة واضحة للتقرير.'
                    : 'We only surface fields that have real data or add clear value to the report.'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
                <Badge variant="secondary">{lang === 'ar' ? 'إجمالي الحقول' : 'Total fields'}: {coverageMatrix.total}</Badge>
                <Badge variant="secondary">{lang === 'ar' ? 'المعبّأ' : 'Populated'}: {coverageMatrix.populated.length}</Badge>
                <Badge variant="secondary">{lang === 'ar' ? 'الظاهرة' : 'Visible'}: {coverageMatrix.visibleCount}</Badge>
              </div>
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-2">
              <div className="rounded-[var(--radius)] border border-border/70 bg-surface/40 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
                  {lang === 'ar' ? 'متوفر ببيانات فعلية' : 'Populated with real data'}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {coverageMatrix.populated.length > 0 ? coverageMatrix.populated.map((column) => (
                    <Badge key={column.key} variant="secondary">
                      {lang === 'ar' ? column.labelAr : column.labelEn}
                    </Badge>
                  )) : (
                    <span className="text-sm text-text-muted">
                      {lang === 'ar' ? 'لا توجد حقول ممتلئة بعد.' : 'No populated fields yet.'}
                    </span>
                  )}
                </div>
              </div>

              <div className="rounded-[var(--radius)] border border-border/70 bg-surface/40 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
                  {lang === 'ar' ? 'مخفية افتراضيًا' : 'Hidden by default'}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {coverageMatrix.hidden.length > 0 ? coverageMatrix.hidden.map((column) => (
                    <Badge key={column.key} variant="outline">
                      {lang === 'ar' ? column.labelAr : column.labelEn}
                    </Badge>
                  )) : (
                    <span className="text-sm text-text-muted">
                      {lang === 'ar' ? 'كل الحقول ظاهرة.' : 'All fields are visible.'}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

            <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
              <Card className="border-border/60">
                <CardContent className="p-6">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold text-text-main">
                        {lang === 'ar' ? 'الأعمدة المختارة' : 'Selected columns'}
                      </h2>
                      <p className="text-sm text-text-muted">
                        {lang === 'ar'
                          ? 'اختر الحقول التي تريد تضمينها في التقرير.'
                          : 'Choose the fields you want to include in the report.'}
                      </p>
                    </div>
                    <Button variant="outline" onClick={() => setSelectedColumns(SOURCE_DEFAULT_COLUMNS[source])}>
                      {lang === 'ar' ? 'الافتراضي' : 'Default'}
                    </Button>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {SOURCE_COLUMNS[source].map((column) => {
                      const checked = selectedColumns.includes(column.key);
                      return (
                        <label
                          key={column.key}
                          className={cn(
                            'flex cursor-pointer items-center justify-between gap-3 rounded-[var(--radius)] border p-3 text-sm transition-colors',
                            checked ? 'border-primary/40 bg-primary/5' : 'border-border bg-background/40',
                          )}
                        >
                          <div className="space-y-0.5">
                            <div className="font-medium text-text-main">
                              {lang === 'ar' ? column.labelAr : column.labelEn}
                            </div>
                            <div className="text-xs text-text-muted">{column.key}</div>
                          </div>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              const next = e.target.checked
                                ? Array.from(new Set([...selectedColumns, column.key]))
                                : selectedColumns.filter((key) => key !== column.key);
                              setSelectedColumns(next.length > 0 ? next : [SOURCE_DEFAULT_COLUMNS[source][0]]);
                            }}
                            className="h-4 w-4 rounded border-border text-primary focus:ring-primary/20"
                          />
                        </label>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              <div className="flex flex-col gap-3 rounded-[var(--radius)] border border-primary/15 bg-primary/5 p-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-text-main">
                    {lang === 'ar' ? '3. إنشاء التقرير' : '3. Create report'}
                  </p>
                  <p className="text-xs text-text-muted">
                    {lang === 'ar'
                      ? 'اضغط لإنشاء التقرير بحسب المصدر والحقول والفلاتر المختارة.'
                      : 'Generate the report using the chosen source, fields, and filters.'}
                  </p>
                </div>
                <div className="mt-auto flex flex-wrap items-center gap-2">
                  <Button variant="outline" onClick={handleReset}>
                    {lang === 'ar' ? 'إعادة ضبط التقرير' : 'Reset report'}
                  </Button>
                  <Button onClick={() => void handleCreateReport()} isLoading={loading}>
                    <Table2 className="me-2 h-4 w-4" />
                    {lang === 'ar' ? 'إنشاء التقرير' : 'Create Report'}
                  </Button>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 rounded-[var(--radius)] border border-border bg-background/40 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-text-main">
                    {lang === 'ar' ? 'الفلاتر المتقدمة' : 'Advanced filters'}
                  </p>
                  <p className="text-xs text-text-muted">
                    {lang === 'ar'
                      ? 'الدور، نوع الحدث، الوجهة، والفترة الزمنية.'
                      : 'Role, event type, target type, and date range.'}
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setShowAdvancedFilters((open) => !open)}>
                  {showAdvancedFilters
                    ? (lang === 'ar' ? 'إخفاء' : 'Hide')
                    : (lang === 'ar' ? 'إظهار' : 'Show')}
                </Button>
              </div>

              {showAdvancedFilters ? (
                <div
                  className={cn(
                    'grid gap-4',
                    source === 'audit'
                      ? 'lg:grid-cols-5'
                      : source === 'users' || source === 'performance'
                        ? 'lg:grid-cols-4'
                        : 'lg:grid-cols-3',
                  )}
                >
                  <Select
                    label={lang === 'ar' ? 'الحالة' : 'Status'}
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    options={[
                      { value: 'all', label: lang === 'ar' ? 'كل الحالات' : 'All statuses' },
                      ...availableStatuses.map((status) => ({ value: status, label: status })),
                    ]}
                  />
                  {(source === 'users' || source === 'performance') && (
                    <Select
                      label={lang === 'ar' ? 'الدور' : 'Role'}
                      value={roleFilter}
                      onChange={(e) => setRoleFilter(e.target.value)}
                      options={[
                        { value: 'all', label: lang === 'ar' ? 'كل الأدوار' : 'All roles' },
                        ...availableRoles.map((role) => ({ value: role, label: role })),
                      ]}
                    />
                  )}
                  {source === 'audit' && (
                    <Select
                      label={lang === 'ar' ? 'نوع الحدث' : 'Event type'}
                      value={eventTypeFilter}
                      onChange={(e) => setEventTypeFilter(e.target.value)}
                      options={[
                        { value: 'all', label: lang === 'ar' ? 'كل الأنواع' : 'All event types' },
                        ...AUDIT_EVENT_TYPES.map((type) => ({ value: type, label: type })),
                      ]}
                    />
                  )}
                  {source === 'audit' && (
                    <Select
                      label={lang === 'ar' ? 'الوجهة' : 'Target type'}
                      value={targetTypeFilter}
                      onChange={(e) => setTargetTypeFilter(e.target.value)}
                      options={[
                        { value: 'all', label: lang === 'ar' ? 'كل الوجهات' : 'All targets' },
                        ...AUDIT_TARGET_TYPES.map((type) => ({ value: type, label: type })),
                      ]}
                    />
                  )}
                  {sourceOption.supportsDateRange ? (
                    <>
                      <Input
                        label={lang === 'ar' ? 'من تاريخ' : 'From date'}
                        type="date"
                        value={from}
                        onChange={(e) => setFrom(e.target.value)}
                      />
                      <Input
                        label={lang === 'ar' ? 'إلى تاريخ' : 'To date'}
                        type="date"
                        value={to}
                        onChange={(e) => setTo(e.target.value)}
                      />
                    </>
                  ) : (
                    <div className="lg:col-span-2 rounded-[var(--radius)] border border-dashed border-border bg-background/50 p-4 text-sm text-text-muted">
                      {lang === 'ar'
                        ? 'هذا المصدر لا يعتمد حاليًا على فلترة زمنية.'
                        : 'This source does not currently support date-range filtering.'}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-text-muted">
                  {lang === 'ar'
                    ? 'الفلاتر المتقدمة مخفية الآن للحفاظ على بساطة الواجهة.'
                    : 'Advanced filters are hidden to keep the page uncluttered.'}
                </p>
              )}
            </div>
          </CardContent>
      </Card>

      {reportCreated ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {summaryCards.map((card) => (
            <Card key={card.label} className="border-border/60">
              <CardContent className="p-5">
                <div className="text-xs uppercase tracking-wide text-text-muted">{card.label}</div>
                <div className="mt-3 text-3xl font-semibold text-text-main">{card.value}</div>
                <div className="mt-2 text-xs text-text-muted">{card.hint}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="border-border/60">
          <CardContent className="p-8 text-center">
            <p className="text-sm text-text-muted">
              {lang === 'ar'
                ? 'اختر المصدر والحقول ثم اضغط إنشاء التقرير لعرض الملخص والمخطط والجدول.'
                : 'Choose the source and fields, then click Create Report to show the summary, chart, and table.'}
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4">
        <Card className="border-border/60">
          <CardContent className="p-6">
            <div className="mb-4 flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              <h2 className="text-lg font-semibold text-text-main">
                {source === 'performance'
                  ? (lang === 'ar' ? 'أعلى النصوص المسندة' : 'Top assigned scripts')
                  : (lang === 'ar' ? 'توزيع الحالات' : 'Status distribution')}
              </h2>
            </div>
            {!reportCreated ? (
              <div className="flex h-64 items-center justify-center rounded-[var(--radius)] border border-dashed border-border bg-background/30 text-sm text-text-muted">
                {lang === 'ar'
                  ? 'أنشئ التقرير أولًا لعرض المخطط.'
                  : 'Create the report first to display the chart.'}
              </div>
            ) : chartData.length > 0 ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="value" fill="#7A2F63" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex h-64 items-center justify-center rounded-[var(--radius)] border border-dashed border-border bg-background/30 text-sm text-text-muted">
                {loading ? (lang === 'ar' ? 'جاري التحميل...' : 'Loading...') : (lang === 'ar' ? 'لا توجد بيانات للرسم البياني' : 'No data available for chart')}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/60">
        <CardContent className="p-0">
          <div className="flex items-center justify-between gap-3 border-b border-border px-6 py-5">
            <div>
              <h2 className="text-lg font-semibold text-text-main">
                {lang === 'ar' ? 'معاينة الجدول' : 'Table preview'}
              </h2>
              <p className="text-sm text-text-muted">
                {lang === 'ar'
                  ? 'المعاينة التالية هي ما سيصدر في PDF وCSV وExcel.'
                  : 'This preview is what will be exported as PDF, CSV, and Excel.'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Select
                value={String(pageSize)}
                onChange={(e) => setPageSize(Number(e.target.value))}
                options={[
                  { value: '10', label: '10' },
                  { value: '25', label: '25' },
                  { value: '50', label: '50' },
                ]}
                className="w-24"
              />
              <Button variant="outline" onClick={handleReset}>
                {lang === 'ar' ? 'تصفير' : 'Clear'}
              </Button>
              <Button variant="outline" onClick={handleExportPdf} isLoading={downloadingPdf} disabled={!reportCreated || pageRows.length === 0}>
                <FileDown className="me-2 h-4 w-4" />
                PDF
              </Button>
              <Button variant="outline" onClick={handleExportCsv} isLoading={downloading === 'csv'} disabled={!reportCreated || pageRows.length === 0}>
                <Download className="me-2 h-4 w-4" />
                CSV
              </Button>
              <Button onClick={handleExportXlsx} isLoading={downloading === 'xlsx'} disabled={!reportCreated || pageRows.length === 0}>
                <FileDown className="me-2 h-4 w-4" />
                Excel
              </Button>
            </div>
          </div>

          {!reportCreated ? (
            <div className="flex min-h-[18rem] items-center justify-center">
              <div className="max-w-lg rounded-[var(--radius)] border border-dashed border-border bg-background/30 p-8 text-center text-sm text-text-muted">
                {lang === 'ar'
                  ? 'هذا القسم سيظهر بعد إنشاء التقرير. اختر المصدر والحقول ثم اضغط إنشاء التقرير.'
                  : 'This section appears after you create the report. Choose the source and fields, then click Create Report.'}
              </div>
            </div>
          ) : loading ? (
            <div className="flex min-h-[18rem] items-center justify-center">
              <div className="flex items-center gap-3 text-text-muted">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>{loadingMessage || (lang === 'ar' ? 'جاري التحميل...' : 'Loading...')}</span>
              </div>
            </div>
          ) : error ? (
            <div className="p-8 text-center text-error">{error}</div>
          ) : pageRows.length === 0 ? (
            <div className="p-10 text-center text-text-muted">
              {lang === 'ar' ? 'لا توجد نتائج مطابقة.' : 'No matching results.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-border text-sm">
                <thead className="bg-background/70">
                  <tr>
                    {selectedColumnsMeta.map((column) => (
                      <th key={column.key} className="px-4 py-3 text-start font-medium text-text-main">
                        {lang === 'ar' ? column.labelAr : column.labelEn}
                      </th>
                    ))}
                    <th className="px-4 py-3 text-start font-medium text-text-main">
                      {lang === 'ar' ? 'الإجراء' : 'Action'}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-surface/60">
                  {pageRows.map((row) => (
                    <tr key={row.id} className="hover:bg-background/60">
                      {selectedColumnsMeta.map((column) => (
                        <td key={column.key} className="px-4 py-3 text-text-main">
                          {String(row.values[column.key] ?? '—')}
                        </td>
                      ))}
                      <td className="px-4 py-3">
                        {row.actionHref ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => navigate(row.actionHref!)}
                          >
                            {lang === 'ar' ? row.actionLabelAr : row.actionLabelEn}
                          </Button>
                        ) : (
                          <span className="text-text-muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-col gap-3 border-t border-border px-6 py-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2 text-sm text-text-muted">
              <Table2 className="h-4 w-4" />
              <span>
                {lang === 'ar'
                  ? `عرض ${pageRows.length} من ${filteredRows.length} سجل`
                  : `Showing ${pageRows.length} of ${filteredRows.length} rows`}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-text-muted">
                {lang === 'ar' ? 'الصفحة' : 'Page'} {currentPage} / {totalPages}
              </span>
              <Button variant="outline" size="sm" disabled={currentPage >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default ReportBuilder;
