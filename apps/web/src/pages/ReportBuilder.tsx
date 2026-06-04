import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Bookmark,
  Download,
  FileDown,
  Loader2,
  RefreshCw,
  Search,
  Save,
  SlidersHorizontal,
  Trash2,
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
import { supabase } from '@/lib/supabaseClient';
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
  scripts: ['title', 'company', 'status', 'assignee', 'createdAt'],
  reports: ['scriptTitle', 'company', 'status', 'findingsCount', 'createdAt'],
  users: ['name', 'email', 'role', 'status', 'permissionsCount'],
  performance: ['name', 'role', 'assignedScripts', 'recommendations', 'agreementRate'],
  audit: ['eventType', 'actor', 'targetType', 'resultStatus', 'occurredAt'],
};

type ReportBuilderTemplate = {
  id: string;
  name: string;
  source: BuilderSource;
  isPreset?: boolean;
  search: string;
  statusFilter: string;
  roleFilter: string;
  eventTypeFilter: string;
  targetTypeFilter: string;
  from: string;
  to: string;
  pageSize: number;
  selectedColumns: string[];
  createdAt: string;
  updatedAt: string;
};

type ReportBuilderTemplateRow = {
  id: string;
  name: string;
  source: BuilderSource;
  template_data: {
    search?: string;
    statusFilter?: string;
    roleFilter?: string;
    eventTypeFilter?: string;
    targetTypeFilter?: string;
    from?: string;
    to?: string;
    pageSize?: number;
    selectedColumns?: string[];
  } | null;
  created_at: string;
  updated_at: string;
};

const REPORT_BUILDER_TEMPLATE_KEY = 'raawi-report-builder-templates-v1';

const BUILT_IN_TEMPLATES: ReportBuilderTemplate[] = [
  {
    id: 'preset-scripts-monthly',
    name: 'Monthly scripts overview',
    source: 'scripts',
    isPreset: true,
    search: '',
    statusFilter: 'all',
    roleFilter: 'all',
    eventTypeFilter: 'all',
    targetTypeFilter: 'all',
    from: '',
    to: '',
    pageSize: 10,
    selectedColumns: SOURCE_DEFAULT_COLUMNS.scripts,
    createdAt: '2026-06-02T00:00:00.000Z',
    updatedAt: '2026-06-02T00:00:00.000Z',
  },
  {
    id: 'preset-reports-review',
    name: 'Reports review export',
    source: 'reports',
    isPreset: true,
    search: '',
    statusFilter: 'all',
    roleFilter: 'all',
    eventTypeFilter: 'all',
    targetTypeFilter: 'all',
    from: '',
    to: '',
    pageSize: 10,
    selectedColumns: SOURCE_DEFAULT_COLUMNS.reports,
    createdAt: '2026-06-02T00:00:00.000Z',
    updatedAt: '2026-06-02T00:00:00.000Z',
  },
  {
    id: 'preset-team-performance',
    name: 'Team performance snapshot',
    source: 'performance',
    isPreset: true,
    search: '',
    statusFilter: 'all',
    roleFilter: 'all',
    eventTypeFilter: 'all',
    targetTypeFilter: 'all',
    from: '',
    to: '',
    pageSize: 10,
    selectedColumns: SOURCE_DEFAULT_COLUMNS.performance,
    createdAt: '2026-06-02T00:00:00.000Z',
    updatedAt: '2026-06-02T00:00:00.000Z',
  },
  {
    id: 'preset-regulator-performance',
    name: 'Regulator performance',
    source: 'performance',
    isPreset: true,
    search: '',
    statusFilter: 'all',
    roleFilter: 'Regulator',
    eventTypeFilter: 'all',
    targetTypeFilter: 'all',
    from: '',
    to: '',
    pageSize: 10,
    selectedColumns: SOURCE_DEFAULT_COLUMNS.performance,
    createdAt: '2026-06-02T00:00:00.000Z',
    updatedAt: '2026-06-02T00:00:00.000Z',
  },
  {
    id: 'preset-audit-log',
    name: 'Audit log export',
    source: 'audit',
    isPreset: true,
    search: '',
    statusFilter: 'all',
    roleFilter: 'all',
    eventTypeFilter: 'all',
    targetTypeFilter: 'all',
    from: '',
    to: '',
    pageSize: 10,
    selectedColumns: SOURCE_DEFAULT_COLUMNS.audit,
    createdAt: '2026-06-02T00:00:00.000Z',
    updatedAt: '2026-06-02T00:00:00.000Z',
  },
];

function loadTemplatesFromStorage(): ReportBuilderTemplate[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(REPORT_BUILDER_TEMPLATE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ReportBuilderTemplate[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => typeof item?.id === 'string' && typeof item?.name === 'string');
  } catch {
    return [];
  }
}

function persistTemplatesToStorage(templates: ReportBuilderTemplate[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(REPORT_BUILDER_TEMPLATE_KEY, JSON.stringify(templates));
}

function toTemplatePayload(template: ReportBuilderTemplate) {
  return {
    search: template.search,
    statusFilter: template.statusFilter,
    roleFilter: template.roleFilter,
    eventTypeFilter: template.eventTypeFilter,
    targetTypeFilter: template.targetTypeFilter,
    from: template.from,
    to: template.to,
    pageSize: template.pageSize,
    selectedColumns: template.selectedColumns,
  };
}

function fromTemplateRow(row: ReportBuilderTemplateRow): ReportBuilderTemplate {
  const data = row.template_data ?? {};
  return {
    id: row.id,
    name: row.name,
    source: row.source,
    isPreset: false,
    search: data.search ?? '',
    statusFilter: data.statusFilter ?? 'all',
    roleFilter: data.roleFilter ?? 'all',
    eventTypeFilter: data.eventTypeFilter ?? 'all',
    targetTypeFilter: data.targetTypeFilter ?? 'all',
    from: data.from ?? '',
    to: data.to ?? '',
    pageSize: data.pageSize ?? 10,
    selectedColumns: Array.isArray(data.selectedColumns) ? data.selectedColumns : SOURCE_DEFAULT_COLUMNS[row.source],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mergeUniqueTemplates(items: ReportBuilderTemplate[]): ReportBuilderTemplate[] {
  const byId = new Map<string, ReportBuilderTemplate>();
  items.forEach((template) => {
    const existing = byId.get(template.id);
    if (!existing || existing.updatedAt.localeCompare(template.updatedAt) < 0) {
      byId.set(template.id, template);
    }
  });
  return Array.from(byId.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function createTemplateId(name: string): string {
  return `${Date.now()}-${name.toLowerCase().replace(/\s+/g, '-').slice(0, 24)}`;
}

async function loadTemplatesFromServer(userId: string): Promise<ReportBuilderTemplate[]> {
  const { data, error } = await supabase
    .from('report_builder_templates')
    .select('id, name, source, template_data, created_at, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => fromTemplateRow(row as ReportBuilderTemplateRow));
}

async function upsertTemplateToServer(userId: string, template: ReportBuilderTemplate): Promise<void> {
  const { error } = await supabase.from('report_builder_templates').upsert({
    id: template.id,
    user_id: userId,
    name: template.name,
    source: template.source,
    template_data: toTemplatePayload(template),
  }, { onConflict: 'id' });
  if (error) throw error;
}

async function deleteTemplateFromServer(userId: string, templateId: string): Promise<void> {
  const { error } = await supabase
    .from('report_builder_templates')
    .delete()
    .eq('id', templateId)
    .eq('user_id', userId);
  if (error) throw error;
}

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
      const values = {
        title: script.title || '—',
        company: beneficiary,
        type: script.type || '—',
        classification: script.workClassification || '—',
        status,
        assignee: script.assigneeName || script.assigneeId || '—',
        recommendation: script.recommendationStatus || '—',
        receivedAt: formatDateTimeValue(script.receivedAt || null, { lang }),
        createdAt: formatDateTimeValue(script.createdAt, { lang }),
      };
      const searchText = [
        script.title,
        beneficiary,
        script.type,
        script.workClassification,
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
        dateRaw: script.receivedAt || script.createdAt || null,
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
        status,
        findingsCount: report.findingsCount,
        approvedCount: report.approvedCount,
        rejectedCount: report.rejectedCount ?? 0,
        reviewedBy: report.reportCreatorName || report.reviewedBy || '—',
        reviewedAt: formatDateTimeValue(report.reviewedAt || report.lastReviewedAt || report.createdAt, { lang }),
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
        eventType: event.eventType,
        actor,
        targetType: event.targetType,
        resultStatus: event.resultStatus,
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
          role,
          status: user.status,
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
        role,
        status: user.status,
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
  const [search, setSearch] = useState('');
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
  const [templateName, setTemplateName] = useState('');
  const [templates, setTemplates] = useState<ReportBuilderTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');

  const canAccessBuilder = user?.role === 'Admin' || user?.role === 'Super Admin' || hasPermission('manage_users');
  const sourceOption = SOURCE_OPTIONS.find((opt) => opt.value === source) ?? SOURCE_OPTIONS[0];
  const selectedColumnsMeta = useMemo(() => SOURCE_COLUMNS[source].filter((col) => selectedColumns.includes(col.key)), [source, selectedColumns]);
  const templateCatalog = useMemo(() => {
    const custom = templates.filter((item) => !item.isPreset);
    const byId = new Map<string, ReportBuilderTemplate>();
    [...BUILT_IN_TEMPLATES, ...custom].forEach((template) => {
      if (!byId.has(template.id)) {
        byId.set(template.id, template);
      }
    });
    return Array.from(byId.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [templates]);
  const selectedTemplate = useMemo(
    () => templateCatalog.find((item) => item.id === selectedTemplateId) ?? null,
    [selectedTemplateId, templateCatalog],
  );
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

  useEffect(() => {
    setTemplates(loadTemplatesFromStorage());
  }, []);

  const syncSavedTemplates = useCallback(async () => {
    const localTemplates = mergeUniqueTemplates(loadTemplatesFromStorage());
    setTemplates(localTemplates);

    if (!user?.id) return;

    try {
      const remoteTemplates = await loadTemplatesFromServer(user.id);
      const merged = mergeUniqueTemplates([...remoteTemplates, ...localTemplates]);
      setTemplates(merged);
      persistTemplatesToStorage(merged);

      const remoteById = new Map(remoteTemplates.map((template) => [template.id, template]));
      const templatesToBackfill = localTemplates.filter((template) => {
        const remote = remoteById.get(template.id);
        if (!remote) return true;
        return remote.updatedAt.localeCompare(template.updatedAt) < 0;
      });
      if (templatesToBackfill.length > 0) {
        await Promise.all(templatesToBackfill.map((template) => upsertTemplateToServer(user.id, template)));
      }
    } catch {
      // Keep the local cache available if the server read fails; exports still work from the browser state.
      setTemplates(localTemplates);
    }
  }, [user?.id]);

  useEffect(() => {
    void syncSavedTemplates();
  }, [syncSavedTemplates]);

  const loadSourceData = useCallback(async (nextSource: BuilderSource, range?: { from?: string; to?: string }) => {
    if (!canAccessBuilder) return;
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
      setPage(1);
    } catch (err: any) {
      setError(err?.message ?? (lang === 'ar' ? 'تعذر تحميل البيانات' : 'Failed to load data'));
      setRows([]);
    } finally {
      setLoading(false);
      setLoadingMessage('');
    }
  }, [canAccessBuilder, companies, from, lang, to]);

  useEffect(() => {
    void loadSourceData(source);
    // Only run initial fetch on mount; source changes use the handler below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyTemplate = useCallback(async (template: ReportBuilderTemplate) => {
    setSelectedTemplateId(template.id);
    setSource(template.source);
    setSelectedColumns(template.selectedColumns.length > 0 ? template.selectedColumns : SOURCE_DEFAULT_COLUMNS[template.source]);
    setSearch(template.search);
    setStatusFilter(template.statusFilter);
    setRoleFilter(template.roleFilter);
    setEventTypeFilter(template.eventTypeFilter || 'all');
    setTargetTypeFilter(template.targetTypeFilter || 'all');
    setFrom(template.from);
    setTo(template.to);
    setPageSize(template.pageSize || 10);
    setPage(1);
    if (template.source !== 'performance') {
      await loadSourceData(template.source, { from: template.from, to: template.to });
    }
  }, [loadSourceData]);

  const handleSourceChange = useCallback(async (nextSource: BuilderSource) => {
    setSelectedTemplateId('');
    setTemplateName('');
    setSource(nextSource);
    setSelectedColumns(SOURCE_DEFAULT_COLUMNS[nextSource]);
    setSearch('');
    setStatusFilter('all');
    setRoleFilter('all');
    setEventTypeFilter('all');
    setTargetTypeFilter('all');
    setFrom('');
    setTo('');
    setPageSize(10);
    setPage(1);
    if (nextSource !== 'performance') {
      await loadSourceData(nextSource, { from: '', to: '' });
    }
  }, [loadSourceData]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesSearch = !q || row.searchText.includes(q);
      const matchesStatus = statusFilter === 'all' || row.status === statusFilter;
      const matchesRole = (source !== 'users' && source !== 'performance') || roleFilter === 'all' || row.roleKey === roleFilter;
      const matchesEventType = source !== 'audit' || eventTypeFilter === 'all' || row.values['eventType'] === eventTypeFilter;
      const matchesTargetType = source !== 'audit' || targetTypeFilter === 'all' || row.values['targetType'] === targetTypeFilter;
      const rowDate = dateKey(row.dateRaw);
      const matchesFrom = source === 'performance' ? true : (!from || !rowDate || rowDate >= from);
      const matchesTo = source === 'performance' ? true : (!to || !rowDate || rowDate <= to);
      return matchesSearch && matchesStatus && matchesRole && matchesEventType && matchesTargetType && matchesFrom && matchesTo;
    });
  }, [rows, search, statusFilter, roleFilter, source, eventTypeFilter, targetTypeFilter, from, to]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const pageRows = filteredRows.slice((currentPage - 1) * pageSize, (currentPage - 1) * pageSize + pageSize);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, roleFilter, eventTypeFilter, targetTypeFilter, from, to, pageSize, source]);

  useEffect(() => {
    if (source !== 'performance') return;
    void loadSourceData('performance', { from, to });
    // Reload performance rows whenever the reporting window changes.
  }, [from, loadSourceData, source, to]);

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
            { label: lang === 'ar' ? 'بحث' : 'Search', value: search || '—' },
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

  const handleSaveTemplate = async () => {
    const name = templateName.trim();
    if (!name) {
      toast.error(lang === 'ar' ? 'اكتب اسمًا للقالب أولًا' : 'Enter a template name first');
      return;
    }
    if (!user?.id) {
      toast.error(lang === 'ar' ? 'تعذّر تحديد المستخدم الحالي' : 'Unable to identify the current user');
      return;
    }
    const now = new Date().toISOString();
    const nextId = selectedTemplate?.isPreset ? createTemplateId(name) : (selectedTemplateId || createTemplateId(name));
    const nextTemplate: ReportBuilderTemplate = {
      id: nextId,
      name,
      source,
      search,
      statusFilter,
      roleFilter,
      eventTypeFilter,
      targetTypeFilter,
      from,
      to,
      pageSize,
      selectedColumns,
      createdAt: selectedTemplate?.createdAt ?? now,
      updatedAt: now,
    };
    const nextTemplates = mergeUniqueTemplates([
      nextTemplate,
      ...templates.filter((item) => item.id !== nextTemplate.id && !item.isPreset),
    ]);
    try {
      await upsertTemplateToServer(user.id, nextTemplate);
    } catch (err: any) {
      toast.error(err?.message ?? (lang === 'ar' ? 'تعذّر حفظ القالب على الخادم' : 'Failed to save template on the server'));
      return;
    }
    setTemplates(nextTemplates);
    persistTemplatesToStorage(nextTemplates);
    setSelectedTemplateId(nextTemplate.id);
    toast.success(lang === 'ar' ? 'تم حفظ القالب' : 'Template saved');
  };

  const handleDeleteTemplate = async (templateId: string) => {
    const template = templateCatalog.find((item) => item.id === templateId);
    if (template?.isPreset) {
      toast.error(lang === 'ar' ? 'القالب المبدئي لا يمكن حذفه' : 'Starter templates cannot be deleted');
      return;
    }
    if (!user?.id) {
      toast.error(lang === 'ar' ? 'تعذّر تحديد المستخدم الحالي' : 'Unable to identify the current user');
      return;
    }
    try {
      await deleteTemplateFromServer(user.id, templateId);
    } catch (err: any) {
      toast.error(err?.message ?? (lang === 'ar' ? 'تعذّر حذف القالب من الخادم' : 'Failed to delete template from server'));
      return;
    }
    const nextTemplates = templates.filter((item) => item.id !== templateId);
    setTemplates(nextTemplates);
    persistTemplatesToStorage(nextTemplates);
    if (selectedTemplateId === templateId) {
      setSelectedTemplateId('');
      setTemplateName('');
    }
  };

  const handleReset = () => {
    setSearch('');
    setStatusFilter('all');
    setRoleFilter('all');
    setEventTypeFilter('all');
    setTargetTypeFilter('all');
    setFrom('');
    setTo('');
    setPage(1);
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
                {lang === 'ar' ? 'إنشاء تقارير مخصصة من بيانات النظام' : 'Build custom reports from system data'}
              </h1>
              <p className="max-w-3xl text-sm text-text-muted">
                {lang === 'ar'
                  ? 'اختر مصدر البيانات، صفّها، ثم صدّرها كملف CSV أو Excel. هذا القسم مصمم للتقارير السريعة والمرنة دون لمس بنية البيانات الأساسية.'
                  : 'Choose a data source, filter it, and export the result as CSV or Excel. This section is designed for flexible admin reporting without changing the underlying data model.'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="outline" onClick={handleReset}>
                <RefreshCw className="me-2 h-4 w-4" />
                {lang === 'ar' ? 'إعادة الضبط' : 'Reset filters'}
              </Button>
              <Button variant="outline" onClick={handleExportCsv} isLoading={downloading === 'csv'}>
                <Download className="me-2 h-4 w-4" />
                CSV
              </Button>
              <Button onClick={handleExportXlsx} isLoading={downloading === 'xlsx'}>
                <FileDown className="me-2 h-4 w-4" />
                Excel
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardContent className="space-y-5 p-6">
          <div className="grid gap-4 lg:grid-cols-3">
            <Select
              label={lang === 'ar' ? 'مصدر البيانات' : 'Data source'}
              value={source}
              onChange={(e) => void handleSourceChange(e.target.value as BuilderSource)}
              options={SOURCE_OPTIONS.map((opt) => ({
                value: opt.value,
                label: lang === 'ar' ? opt.labelAr : opt.labelEn,
              }))}
            />
            <Input
              label={lang === 'ar' ? 'بحث' : 'Search'}
              icon={<Search className="h-4 w-4" />}
              placeholder={lang === 'ar' ? 'ابحث في السجلات أو الأسماء...' : 'Search rows, names, titles...'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Select
              label={lang === 'ar' ? 'الحالة' : 'Status'}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              options={[
                { value: 'all', label: lang === 'ar' ? 'كل الحالات' : 'All statuses' },
                ...availableStatuses.map((status) => ({ value: status, label: status })),
              ]}
            />
          </div>

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
              <div className="lg:col-span-2 rounded-[var(--radius)] border border-dashed border-border bg-background/40 p-4 text-sm text-text-muted">
                {lang === 'ar'
                  ? 'هذا المصدر لا يعتمد حاليًا على فلترة زمنية.'
                  : 'This source does not currently support date-range filtering.'}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">
              {lang === 'ar' ? 'المصدر الحالي' : 'Current source'}: {lang === 'ar' ? sourceOption.labelAr : sourceOption.labelEn}
            </Badge>
            <Badge variant="secondary">
              {lang === 'ar' ? 'الصفحة' : 'Page'}: {currentPage}/{totalPages}
            </Badge>
            <Badge variant="secondary">
              {lang === 'ar' ? 'أعمدة قابلة للتصدير' : 'Exportable columns'}: {selectedColumnsMeta.length}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardContent className="space-y-5 p-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-text-main">
                {lang === 'ar' ? 'القوالب المحفوظة' : 'Saved templates'}
              </h2>
              <p className="text-sm text-text-muted">
                {lang === 'ar'
                  ? 'احفظ إعداداتك الحالية لتعيد استخدامها بسرعة لاحقًا.'
                  : 'Save the current configuration so you can reuse it later with one click.'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={() => void loadSourceData(source)}>
                <RefreshCw className="me-2 h-4 w-4" />
                {lang === 'ar' ? 'إعادة تحميل' : 'Reload'}
              </Button>
              <Button variant="outline" onClick={handleExportPdf} isLoading={downloadingPdf}>
                <FileDown className="me-2 h-4 w-4" />
                PDF
              </Button>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
            <Input
              label={lang === 'ar' ? 'اسم القالب' : 'Template name'}
              placeholder={lang === 'ar' ? 'مثال: تقرير النصوص الشهري' : 'e.g. Monthly scripts report'}
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
            />
            <div className="flex items-end gap-2">
              <Button onClick={handleSaveTemplate}>
                <Save className="me-2 h-4 w-4" />
                {lang === 'ar' ? 'حفظ القالب' : 'Save template'}
              </Button>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <Select
              label={lang === 'ar' ? 'اختيار قالب محفوظ' : 'Choose a saved template'}
              value={selectedTemplateId}
              onChange={(e) => {
                const found = templateCatalog.find((item) => item.id === e.target.value);
                if (!found) return;
                setTemplateName(found.name);
                void applyTemplate(found);
              }}
              options={[
                { value: '', label: lang === 'ar' ? 'اختر قالبًا...' : 'Choose a template...' },
                ...templateCatalog.map((template) => ({
                  value: template.id,
                  label: `${template.name} · ${lang === 'ar' ? SOURCE_OPTIONS.find((opt) => opt.value === template.source)?.labelAr ?? template.source : SOURCE_OPTIONS.find((opt) => opt.value === template.source)?.labelEn ?? template.source}`,
                })),
              ]}
            />
            <div className="flex flex-wrap items-end gap-2">
              {selectedTemplateId ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    const found = templateCatalog.find((item) => item.id === selectedTemplateId);
                    if (found) {
                      setTemplateName(found.name);
                    }
                  }}
                >
                  <Bookmark className="me-2 h-4 w-4" />
                  {lang === 'ar' ? 'إعادة تعبئة القالب' : 'Refill template'}
                </Button>
              ) : null}
              {selectedTemplateId && !selectedTemplate?.isPreset ? (
                <Button
                  variant="danger"
                  onClick={() => handleDeleteTemplate(selectedTemplateId)}
                >
                  <Trash2 className="me-2 h-4 w-4" />
                  {lang === 'ar' ? 'حذف القالب' : 'Delete template'}
                </Button>
              ) : null}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">
                {lang === 'ar' ? 'القوالب المبدئية' : 'Starter templates'}
              </Badge>
              {BUILT_IN_TEMPLATES.map((template) => (
                <Badge key={template.id} variant={template.id === selectedTemplateId ? 'primary' : 'secondary'}>
                  {template.name}
                </Badge>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">
                {lang === 'ar' ? 'القوالب المحفوظة' : 'Saved templates'}
              </Badge>
              {templates.length === 0 ? (
                <span className="text-sm text-text-muted">
                  {lang === 'ar' ? 'لا توجد قوالب محفوظة بعد' : 'No saved templates yet'}
                </span>
              ) : (
                templates.slice(0, 4).map((template) => (
                  <Badge key={template.id} variant={template.id === selectedTemplateId ? 'primary' : 'secondary'}>
                    {template.name}
                  </Badge>
                ))
              )}
            </div>
          </div>
        </CardContent>
      </Card>

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
                    ? 'اختر الحقول التي تريد تضمينها في التصدير والجدول.'
                    : 'Choose the fields you want to include in the preview and exports.'}
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
            {chartData.length > 0 ? (
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
                  ? 'هذه المعاينة تعتمد على التصفية الحالية وستستخدم نفسها في CSV وExcel.'
                  : 'This preview follows the current filters and powers both CSV and Excel exports.'}
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
            </div>
          </div>

          {loading ? (
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
