import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Textarea } from '@/components/ui/Textarea';
import { clientPortalApi, reportsApi, scriptsApi, type AdminClientSubmissionItem } from '@/api';
import type { ReportListItem } from '@/api/models';
import { useLangStore } from '@/store/langStore';

function statusVariant(status: string): 'default' | 'success' | 'warning' | 'error' | 'outline' {
  const key = status.toLowerCase();
  if (key === 'approved') return 'success';
  if (key === 'rejected') return 'error';
  if (key === 'in_review' || key === 'review_required' || key === 'analysis_running') return 'warning';
  return 'outline';
}

function statusLabel(status: string, lang: 'ar' | 'en'): string {
  const key = status.toLowerCase();
  if (key === 'approved') return lang === 'ar' ? 'مقبول' : 'Approved';
  if (key === 'rejected') return lang === 'ar' ? 'مرفوض' : 'Rejected';
  if (key === 'in_review') return lang === 'ar' ? 'قيد المراجعة' : 'In Review';
  if (key === 'review_required') return lang === 'ar' ? 'بحاجة مراجعة' : 'Needs Review';
  if (key === 'analysis_running') return lang === 'ar' ? 'التحليل جارٍ' : 'Analysis Running';
  if (key === 'draft') return lang === 'ar' ? 'مسودة' : 'Draft';
  return status;
}

export function ClientSubmissions() {
  const navigate = useNavigate();
  const { lang } = useLangStore();
  const [rows, setRows] = useState<AdminClientSubmissionItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [decisionScript, setDecisionScript] = useState<AdminClientSubmissionItem | null>(null);
  const [decisionAction, setDecisionAction] = useState<'approve' | 'reject'>('approve');
  const [decisionReason, setDecisionReason] = useState('');
  const [decisionClientComment, setDecisionClientComment] = useState('');
  const [shareReportsToClient, setShareReportsToClient] = useState(true);
  const [availableReports, setAvailableReports] = useState<ReportListItem[]>([]);
  const [selectedSharedReportIds, setSelectedSharedReportIds] = useState<string[]>([]);
  const [isLoadingReports, setIsLoadingReports] = useState(false);
  const [isDeciding, setIsDeciding] = useState(false);

  const load = async () => {
    setIsLoading(true);
    setError('');
    try {
      const data = await clientPortalApi.getAdminSubmissions();
      setRows(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : (lang === 'ar' ? 'فشل تحميل طلبات العملاء' : 'Failed to load client submissions'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      const status = row.status.toLowerCase();
      const pending = status === 'in_review' || status === 'review_required' || status === 'analysis_running' || status === 'draft';
      if (statusFilter === 'pending' && !pending) return false;
      if (statusFilter === 'approved' && status !== 'approved') return false;
      if (statusFilter === 'rejected' && status !== 'rejected') return false;
      if (!q) return true;
      return (
        row.title.toLowerCase().includes(q) ||
        (row.companyNameAr ?? '').includes(search.trim()) ||
        (row.companyNameEn ?? '').toLowerCase().includes(q) ||
        (row.submittedByName ?? '').toLowerCase().includes(q) ||
        (row.submittedByEmail ?? '').toLowerCase().includes(q)
      );
    });
  }, [rows, search, statusFilter]);

  const openDecisionModal = async (row: AdminClientSubmissionItem, action: 'approve' | 'reject') => {
    setDecisionScript(row);
    setDecisionAction(action);
    setDecisionReason('');
    setDecisionClientComment('');
    setShareReportsToClient(action === 'reject');
    setAvailableReports([]);
    setSelectedSharedReportIds([]);

    if (action !== 'reject') return;

    setIsLoadingReports(true);
    try {
      const reports = await reportsApi.listByScript(row.scriptId);
      setAvailableReports(reports);
      const defaultReportId =
        (row.latestReportId && reports.some((r) => r.id === row.latestReportId))
          ? row.latestReportId
          : (reports[0]?.id ?? null);
      setSelectedSharedReportIds(defaultReportId ? [defaultReportId] : []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : (lang === 'ar' ? 'فشل تحميل التقارير المتاحة' : 'Failed to load available reports'));
      setAvailableReports([]);
      setSelectedSharedReportIds([]);
    } finally {
      setIsLoadingReports(false);
    }
  };

  const toggleSharedReport = (reportId: string) => {
    setSelectedSharedReportIds((prev) => prev.includes(reportId)
      ? prev.filter((id) => id !== reportId)
      : [...prev, reportId]);
  };

  const submitDecision = async () => {
    if (!decisionScript) return;
    if (!decisionReason.trim()) {
      toast.error(lang === 'ar' ? 'يرجى كتابة سبب القرار' : 'Please provide a decision reason');
      return;
    }
    setIsDeciding(true);
    try {
      await scriptsApi.makeDecision(
        decisionScript.scriptId,
        decisionAction,
        decisionReason.trim(),
        decisionScript.latestReportId ?? undefined,
        decisionAction === 'reject'
          ? {
              clientComment: decisionClientComment.trim(),
              shareReportsToClient,
              shareReportIds: shareReportsToClient ? selectedSharedReportIds : [],
            }
          : undefined,
      );
      toast.success(
        decisionAction === 'approve'
          ? (lang === 'ar' ? 'تم قبول النص' : 'Script approved')
          : (lang === 'ar' ? 'تم رفض النص' : 'Script rejected'),
      );
      setDecisionScript(null);
      setDecisionReason('');
      setDecisionClientComment('');
      setShareReportsToClient(true);
      setAvailableReports([]);
      setSelectedSharedReportIds([]);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : (lang === 'ar' ? 'فشل تنفيذ القرار' : 'Failed to apply decision'));
    } finally {
      setIsDeciding(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text-main">
            {lang === 'ar' ? 'طلبات نصوص العملاء' : 'Client Script Submissions'}
          </h1>
          <p className="text-sm text-text-muted">
            {lang === 'ar'
              ? 'قائمة طلبات شركات الإنتاج الواردة من بوابة العملاء للمراجعة والتحليل والاعتماد.'
              : 'Incoming submissions from production companies for review, analysis, and decision.'}
          </p>
        </div>
        <Button onClick={load} variant="outline" disabled={isLoading}>
          {lang === 'ar' ? 'تحديث' : 'Refresh'}
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Input
              label={lang === 'ar' ? 'بحث' : 'Search'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={lang === 'ar' ? 'عنوان النص أو الشركة أو المرسل' : 'Title, company, or submitter'}
            />
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-text-main">{lang === 'ar' ? 'الحالة' : 'Status'}</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                className="w-full h-10 rounded-[var(--radius)] border border-border bg-surface px-3 text-sm"
              >
                <option value="pending">{lang === 'ar' ? 'قيد المعالجة' : 'Pending'}</option>
                <option value="approved">{lang === 'ar' ? 'مقبول' : 'Approved'}</option>
                <option value="rejected">{lang === 'ar' ? 'مرفوض' : 'Rejected'}</option>
                <option value="all">{lang === 'ar' ? 'الكل' : 'All'}</option>
              </select>
            </div>
            <div className="flex items-end">
              <p className="text-sm text-text-muted">
                {lang === 'ar' ? 'عدد النتائج:' : 'Results:'} <span className="font-semibold text-text-main">{filteredRows.length}</span>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{lang === 'ar' ? 'قائمة الطلبات' : 'Submission Queue'}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-text-muted">{lang === 'ar' ? 'جاري التحميل...' : 'Loading...'}</p>
          ) : error ? (
            <p className="text-sm text-error">{error}</p>
          ) : filteredRows.length === 0 ? (
            <p className="text-sm text-text-muted">{lang === 'ar' ? 'لا توجد طلبات حالياً.' : 'No submissions found.'}</p>
          ) : (
            <div className="space-y-3">
              {filteredRows.map((row) => {
                const status = row.status.toLowerCase();
                const isFinal = status === 'approved' || status === 'rejected';
                return (
                  <div key={row.scriptId} className="rounded-lg border border-border bg-surface p-4 space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="font-semibold text-text-main">{row.title}</p>
                        <p className="text-sm text-text-muted">
                          {(lang === 'ar' ? row.companyNameAr : row.companyNameEn) || row.companyNameEn || row.companyNameAr || '—'}
                        </p>
                        <p className="text-xs text-text-muted">
                          {lang === 'ar' ? 'مرسل بواسطة:' : 'Submitted by:'} {row.submittedByName || row.submittedByEmail || '—'}
                          {' • '}
                          {new Date(row.submittedAt).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={statusVariant(row.status)}>{statusLabel(row.status, lang)}</Badge>
                        <Badge variant="outline">{lang === 'ar' ? 'الخطة: مجاني' : 'Plan: Free'}</Badge>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Button size="sm" variant="outline" onClick={() => navigate(`/workspace/${row.scriptId}`)}>
                        {lang === 'ar' ? 'فتح مساحة العمل' : 'Open Workspace'}
                      </Button>
                      {row.latestReportId && (
                        <Button size="sm" variant="outline" onClick={() => navigate(`/report/${row.latestReportId}`)}>
                          {lang === 'ar' ? 'فتح التقرير' : 'Open Report'}
                        </Button>
                      )}
                      {!isFinal && (
                        <>
                          <Button size="sm" onClick={() => void openDecisionModal(row, 'approve')}>
                            {lang === 'ar' ? 'قبول' : 'Approve'}
                          </Button>
                          <Button size="sm" variant="danger" onClick={() => void openDecisionModal(row, 'reject')}>
                            {lang === 'ar' ? 'رفض' : 'Reject'}
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Modal
        isOpen={decisionScript != null}
        onClose={() => {
          if (isDeciding) return;
          setDecisionScript(null);
          setDecisionReason('');
          setDecisionClientComment('');
          setShareReportsToClient(true);
          setAvailableReports([]);
          setSelectedSharedReportIds([]);
        }}
        title={decisionAction === 'approve'
          ? (lang === 'ar' ? 'تأكيد قبول النص' : 'Confirm Script Approval')
          : (lang === 'ar' ? 'تأكيد رفض النص' : 'Confirm Script Rejection')}
      >
        <div className="space-y-4">
          <p className="text-sm text-text-muted">
            {decisionScript?.title}
          </p>
          <Textarea
            label={lang === 'ar' ? 'سبب القرار' : 'Decision Reason'}
            rows={4}
            value={decisionReason}
            onChange={(e) => setDecisionReason(e.target.value)}
          />
          {decisionAction === 'reject' && (
            <>
              <Textarea
                label={lang === 'ar' ? 'تعليق يظهر للعميل' : 'Client-facing comment'}
                rows={3}
                value={decisionClientComment}
                onChange={(e) => setDecisionClientComment(e.target.value)}
                placeholder={lang === 'ar' ? 'اكتب ملاحظات واضحة للعميل حول أسباب الرفض…' : 'Write clear feedback to client about the rejection…'}
              />

              <div className="rounded-md border border-border bg-background p-3 space-y-3">
                <label className="inline-flex items-center gap-2 text-sm font-medium text-text-main">
                  <input
                    type="checkbox"
                    checked={shareReportsToClient}
                    onChange={(e) => setShareReportsToClient(e.target.checked)}
                  />
                  <span>{lang === 'ar' ? 'مشاركة تقرير/تقارير التحليل مع العميل' : 'Share analysis report(s) with client'}</span>
                </label>

                {shareReportsToClient && (
                  <div className="space-y-2">
                    {isLoadingReports ? (
                      <p className="text-xs text-text-muted">{lang === 'ar' ? 'جاري تحميل التقارير…' : 'Loading reports…'}</p>
                    ) : availableReports.length === 0 ? (
                      <p className="text-xs text-text-muted">{lang === 'ar' ? 'لا توجد تقارير متاحة لهذا النص حالياً.' : 'No reports available for this script yet.'}</p>
                    ) : (
                      availableReports.map((report) => (
                        <label key={report.id} className="flex items-start gap-2 text-sm text-text-main rounded border border-border bg-surface p-2">
                          <input
                            type="checkbox"
                            checked={selectedSharedReportIds.includes(report.id)}
                            onChange={() => toggleSharedReport(report.id)}
                          />
                          <span>
                            {lang === 'ar' ? 'تقرير' : 'Report'} #{report.id.slice(0, 8)} • {new Date(report.createdAt).toLocaleString()}
                            {' • '}
                            {lang === 'ar' ? 'الحالة:' : 'Status:'} {report.reviewStatus}
                            {' • '}
                            {lang === 'ar' ? 'المخالفات:' : 'Findings:'} {report.findingsCount}
                          </span>
                        </label>
                      ))
                    )}
                  </div>
                )}
              </div>
            </>
          )}
          <div className="flex items-center gap-2">
            <Button isLoading={isDeciding} onClick={submitDecision}>
              {lang === 'ar' ? 'تأكيد' : 'Confirm'}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setDecisionScript(null);
                setDecisionReason('');
                setDecisionClientComment('');
                setShareReportsToClient(true);
                setAvailableReports([]);
                setSelectedSharedReportIds([]);
              }}
              disabled={isDeciding}
            >
              {lang === 'ar' ? 'إلغاء' : 'Cancel'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
