import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowUpRight,
  Award,
  BellRing,
  CreditCard,
  Clock3,
  Eye,
  FileCheck2,
  FolderKanban,
  Pencil,
  Search,
  Settings2,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { FileUpload } from '@/components/ui/FileUpload';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { ClientPortalLayout, type ClientPortalSection } from '@/components/client-portal/ClientPortalLayout';
import { ClientCertificatesSection } from '@/components/client-portal/ClientCertificatesSection';
import { certificatesApi, clientPortalApi, scriptsApi, type ClientCertificatesResponse, type ClientPortalMeResponse, type ClientPortalSubmissionItem, type ClientPortalRejectionDetailsResponse } from '@/api';
import { useAuthStore } from '@/store/authStore';
import { useLangStore } from '@/store/langStore';
import type { Script } from '@/api/models';
import { supabase } from '@/lib/supabaseClient';
import { API_BASE_URL } from '@/lib/env';
import { downloadAnalysisPdf } from '@/components/reports/analysis/download';
import { extractDocxWithPages } from '@/utils/documentExtract';
import { PDF_EXTRACTION_INTERVAL_MS, PDF_EXTRACTION_TIMEOUT_MS, waitForVersionExtraction } from '@/utils/waitForVersionExtraction';
import {
  buildScriptClassificationSelectOptions,
  LEGACY_SCRIPT_CLASSIFICATION_OPTIONS,
  useScriptClassificationOptions,
} from '@/lib/scriptClassificationOptions';

type UploadResult = {
  success: boolean;
  fileUrl: string;
  path: string;
  fileName: string;
  fileSize: number;
  versionId: string | null;
  versionNumber: number | null;
};

function statusLabel(status: string, lang: 'ar' | 'en'): string {
  const key = status.toLowerCase();
  if (key === 'approved') return lang === 'ar' ? 'مقبول' : 'Approved';
  if (key === 'rejected') return lang === 'ar' ? 'مرفوض' : 'Rejected';
  if (key === 'analysis_running') return lang === 'ar' ? 'التحليل جارٍ' : 'Analysis Running';
  if (key === 'review_required') return lang === 'ar' ? 'بحاجة لمراجعة' : 'Needs Review';
  if (key === 'in_review') return lang === 'ar' ? 'قيد المراجعة' : 'In Review';
  if (key === 'draft') return lang === 'ar' ? 'مسودة' : 'Draft';
  return status;
}

function statusVariant(status: string): 'default' | 'success' | 'warning' | 'error' | 'outline' {
  const key = status.toLowerCase();
  if (key === 'approved') return 'success';
  if (key === 'rejected') return 'error';
  if (key === 'analysis_running' || key === 'review_required' || key === 'in_review') return 'warning';
  return 'outline';
}

export function ClientPortal() {
  const navigate = useNavigate();
  const { lang, toggleLang } = useLangStore();
  const { logout, user } = useAuthStore();
  const { options: scriptClassificationOptions } = useScriptClassificationOptions();
  const workClassificationOptions = useMemo(
    () => buildScriptClassificationSelectOptions(lang === 'ar' ? 'ar' : 'en', scriptClassificationOptions),
    [lang, scriptClassificationOptions],
  );

  const [profile, setProfile] = useState<ClientPortalMeResponse | null>(null);
  const [submissions, setSubmissions] = useState<ClientPortalSubmissionItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [uploaderKey, setUploaderKey] = useState(1);
  const [activeSection, setActiveSection] = useState<ClientPortalSection>('overview');
  const [entryMode, setEntryMode] = useState<'upload' | 'paste'>('upload');

  const [form, setForm] = useState<{
    title: string;
    type: 'Film' | 'Series';
    workClassification: string;
    synopsis: string;
    receivedAt: string;
  }>({
    title: '',
    type: 'Film' as 'Film' | 'Series',
    workClassification: LEGACY_SCRIPT_CLASSIFICATION_OPTIONS[0]?.label_ar ?? '',
    synopsis: '',
    receivedAt: new Date().toISOString().slice(0, 10),
  });
  const [file, setFile] = useState<File | null>(null);
  const [manualText, setManualText] = useState('');

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState('');
  const [details, setDetails] = useState<ClientPortalRejectionDetailsResponse | null>(null);
  const [downloadingReportId, setDownloadingReportId] = useState<string | null>(null);
  const [scriptsSearch, setScriptsSearch] = useState('');
  const [scriptsStatusFilter, setScriptsStatusFilter] = useState<'all' | 'draft' | 'submitted' | 'approved' | 'rejected'>('all');
  const [scriptsPage, setScriptsPage] = useState(1);
  const [scriptToDelete, setScriptToDelete] = useState<ClientPortalSubmissionItem | null>(null);
  const [editingDraft, setEditingDraft] = useState<ClientPortalSubmissionItem | null>(null);
  const [paymentScriptId, setPaymentScriptId] = useState<string | null>(null);
  const [paymentData, setPaymentData] = useState<ClientCertificatesResponse | null>(null);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);
  const [paymentSuccessOpen, setPaymentSuccessOpen] = useState(false);
  const [paidScriptIds, setPaidScriptIds] = useState<Set<string>>(new Set());
  const [paymentForm, setPaymentForm] = useState({
    cardHolder: '',
    cardNumber: '',
    expiry: '',
    cvv: '',
  });

  type RejectionReportBlock = {
    report: NonNullable<ClientPortalRejectionDetailsResponse['sharedReports']>[number]['report'];
    findings: NonNullable<ClientPortalRejectionDetailsResponse['sharedReports']>[number]['findings'];
  };

  type ReportSummaryShape = {
    findings_by_article?: Array<{
      article_id: number;
      top_findings?: Array<{
        title_ar?: string;
        severity?: string;
        confidence?: number;
        evidence_snippet?: string;
      }>;
    }>;
    canonical_findings?: Array<{
      canonical_finding_id: string;
      title_ar: string;
      evidence_snippet: string;
      severity: string;
      confidence: number;
      rationale?: string | null;
      pillar_id?: string | null;
      primary_article_id?: number | null;
      related_article_ids?: number[];
      start_line_chunk?: number | null;
      end_line_chunk?: number | null;
      page_number?: number | null;
      primary_policy_atom_id?: string | null;
      source?: string | null;
    }>;
    report_hints?: Array<{
      canonical_finding_id: string;
      title_ar: string;
      evidence_snippet: string;
      severity: string;
      confidence: number;
      rationale?: string | null;
      pillar_id?: string | null;
      primary_article_id?: number | null;
      related_article_ids?: number[];
      start_line_chunk?: number | null;
      end_line_chunk?: number | null;
    }>;
    script_summary?: {
      synopsis_ar: string;
      key_risky_events_ar?: string;
      narrative_stance_ar?: string;
      compliance_posture_ar?: string;
      confidence: number;
    };
  };

  const asReportSummary = (summaryJson?: Record<string, unknown> | null): ReportSummaryShape | null => {
    if (!summaryJson || typeof summaryJson !== 'object') return null;
    return summaryJson as ReportSummaryShape;
  };

  const downloadRejectionReportPdf = async (block: RejectionReportBlock) => {
    if (!details) return;
    setDetailsError('');
    setDownloadingReportId(block.report.id);
    try {
      const summary = asReportSummary(block.report.summaryJson);
      const canonicalFindings =
        summary?.canonical_findings && summary.canonical_findings.length > 0
          ? summary.canonical_findings
          : block.findings.map((finding, index) => ({
              canonical_finding_id: finding.id || `${block.report.id}-${index}`,
              title_ar: finding.titleAr || (lang === 'ar' ? 'مخالفة' : 'Finding'),
              evidence_snippet: finding.evidenceSnippet || '',
              severity: finding.severity || 'info',
              confidence: 1,
              rationale: finding.rationaleAr || finding.descriptionAr || null,
              primary_article_id: Number.isFinite(finding.articleId) ? finding.articleId : null,
              related_article_ids: [],
              page_number: finding.pageNumber ?? null,
              source: finding.source || 'ai',
            }));

      await downloadAnalysisPdf({
        scriptTitle: details.script.title || (lang === 'ar' ? 'تقرير النص' : 'Script Report'),
        clientName: profile?.company
          ? (lang === 'ar' ? profile.company.nameAr : profile.company.nameEn)
          : (lang === 'ar' ? 'شركة الإنتاج' : 'Production Company'),
        createdAt: block.report.createdAt,
        findingsByArticle: summary?.findings_by_article ?? null,
        canonicalFindings,
        reportHints: summary?.report_hints ?? null,
        scriptSummary: summary?.script_summary ?? null,
        lang,
      });
      setNotice(lang === 'ar' ? 'تم تنزيل تقرير PDF.' : 'PDF report downloaded.');
    } catch (err) {
      setDetailsError(err instanceof Error ? err.message : (lang === 'ar' ? 'تعذر تنزيل ملف PDF للتقرير' : 'Unable to download report PDF'));
    } finally {
      setDownloadingReportId(null);
    }
  };

  const loadProfileAndSubmissions = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const [me, list, certDashboard] = await Promise.all([
        clientPortalApi.getMe(),
        clientPortalApi.getSubmissions(),
        certificatesApi.getClientDashboard().catch(() => null),
      ]);
      setProfile(me);
      setSubmissions(list);
      if (certDashboard) {
        const paidIds = new Set(
          (certDashboard.items ?? [])
            .filter((item) => item.certificateStatus === 'issued' || item.latestPayment?.paymentStatus === 'completed')
            .map((item) => item.scriptId),
        );
        setPaidScriptIds(paidIds);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : (lang === 'ar' ? 'فشل تحميل بيانات البوابة' : 'Failed to load portal data'));
    } finally {
      setIsLoading(false);
    }
  }, [lang]);

  const refreshSubmissionsSilently = useCallback(async () => {
    try {
      const list = await clientPortalApi.getSubmissions();
      setSubmissions(list);
    } catch {
      // Keep current list if a background refresh fails.
    }
  }, []);

  useEffect(() => {
    loadProfileAndSubmissions();
  }, [loadProfileAndSubmissions]);

  useEffect(() => {
    const defaultClassification = workClassificationOptions[0]?.value ?? LEGACY_SCRIPT_CLASSIFICATION_OPTIONS[0]?.label_ar ?? '';
    setForm((prev) => {
      if (prev.workClassification && workClassificationOptions.some((option) => option.value === prev.workClassification)) {
        return prev;
      }
      return { ...prev, workClassification: defaultClassification };
    });
  }, [workClassificationOptions]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      refreshSubmissionsSilently();
    }, 15000);

    const handleFocus = () => {
      refreshSubmissionsSilently();
    };

    window.addEventListener('focus', handleFocus);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
    };
  }, [refreshSubmissionsSilently]);

  const uploadScriptDocument = async (scriptId: string, companyId: string, uploadFile: File): Promise<UploadResult> => {
    let { data: { session } } = await supabase.auth.getSession();
    let token = session?.access_token ?? null;
    if (!token) {
      await supabase.auth.refreshSession();
      ({ data: { session } } = await supabase.auth.getSession());
      token = session?.access_token ?? null;
    }
    if (!token) throw new Error('No auth token available');

    const formData = new FormData();
    formData.append('file', uploadFile);
    formData.append('scriptId', scriptId);
    formData.append('companyId', companyId);
    formData.append('createVersion', 'true');

    const response = await fetch(`${API_BASE_URL}/raawi-script-upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: (import.meta as any).env.VITE_SUPABASE_ANON_KEY,
      },
      body: formData,
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({} as Record<string, unknown>));
      const message = typeof body.error === 'string' ? body.error : `${response.status} ${response.statusText}`;
      throw new Error(message);
    }

    return response.json();
  };

  const handleSubmitScript = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice('');
    setError('');

    if (!profile?.company?.companyId) {
      setError(lang === 'ar' ? 'تعذّر تحديد الشركة الحالية' : 'Unable to resolve your company account');
      return;
    }
    if (!form.title.trim()) {
      setError(lang === 'ar' ? 'عنوان النص مطلوب' : 'Script title is required');
      return;
    }
    if (entryMode === 'upload' && !file) {
      setError(lang === 'ar' ? 'يجب إرفاق ملف النص' : 'Please attach a script file');
      return;
    }
    if (entryMode === 'paste' && !manualText.trim()) {
      setError(lang === 'ar' ? 'يجب إدخال نص في المحرر' : 'Please enter script text in the editor');
      return;
    }

    setIsSubmitting(true);
    let createdScriptId: string | null = null;
    try {
      const scriptPayload: Script = {
        id: '',
        companyId: profile.company.companyId,
        title: form.title.trim(),
        type: form.type,
        workClassification: form.workClassification,
        synopsis: form.synopsis.trim(),
        status: 'in_review',
        receivedAt: form.receivedAt || null,
        createdAt: new Date().toISOString(),
      };
      const created = await scriptsApi.addScript(scriptPayload);

      createdScriptId = created.id;
      if (entryMode === 'upload') {
        const upload = await uploadScriptDocument(created.id, profile.company.companyId, file!);
        if (!upload.versionId) {
          throw new Error(lang === 'ar' ? 'تعذّر إنشاء نسخة النص' : 'Failed to create script version');
        }

        const ext = file!.name.toLowerCase().split('.').pop() || '';
        if (ext === 'pdf') {
          await scriptsApi.extractText(upload.versionId, undefined, { enqueueAnalysis: false });
          const extractedVersion = await waitForVersionExtraction(created.id, upload.versionId, {
            timeoutMs: PDF_EXTRACTION_TIMEOUT_MS,
            intervalMs: PDF_EXTRACTION_INTERVAL_MS,
          });
          if (!extractedVersion.extracted_text?.trim()) {
            throw new Error(lang === 'ar' ? 'لم يتم استخراج نص من الملف' : 'No text extracted from file');
          }
        } else if (ext === 'docx') {
          const { pages } = await extractDocxWithPages(file!);
          const res = await scriptsApi.extractText(upload.versionId, undefined, { pages, enqueueAnalysis: false });
          if (!(res as { extracted_text?: string }).extracted_text?.trim()) {
            throw new Error(lang === 'ar' ? 'لم يتم استخراج نص من الملف' : 'No text extracted from file');
          }
        } else if (ext === 'txt') {
          const text = await file!.text();
          if (!text.trim()) throw new Error(lang === 'ar' ? 'الملف النصي فارغ' : 'Text file is empty');
          await scriptsApi.extractText(upload.versionId, text, { enqueueAnalysis: false });
        } else {
          throw new Error(lang === 'ar' ? 'صيغة الملف غير مدعومة' : 'Unsupported file format');
        }
      } else {
        const version = await scriptsApi.createVersion(created.id, {
          source_file_name: 'client-editor-entry.txt',
          source_file_type: 'application/x-raawi-editor',
          source_file_size: manualText.trim().length,
          extraction_status: 'pending',
        });
        await scriptsApi.extractText(version.id, manualText.trim(), { enqueueAnalysis: false });
      }

      setForm({
        title: '',
        type: 'Film',
        workClassification: workClassificationOptions[0]?.value ?? LEGACY_SCRIPT_CLASSIFICATION_OPTIONS[0]?.label_ar ?? '',
        synopsis: '',
        receivedAt: new Date().toISOString().slice(0, 10),
      });
      setFile(null);
      setManualText('');
      setEntryMode('upload');
      setUploaderKey((v) => v + 1);
      setNotice(lang === 'ar'
        ? 'تم إرسال النص بنجاح، وسيتم مراجعته من فريق الإدارة.'
        : 'Script submitted successfully and sent to admin review.');
      setActiveSection('scripts');
      await loadProfileAndSubmissions();
    } catch (err) {
      if (createdScriptId) {
        await scriptsApi.deleteScript(createdScriptId).catch(() => {});
      }
      setError(err instanceof Error ? err.message : (lang === 'ar' ? 'فشل إرسال النص' : 'Failed to submit script'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveDraft = async () => {
    setNotice('');
    setError('');
    if (!profile?.company?.companyId) {
      setError(lang === 'ar' ? 'تعذّر تحديد الشركة الحالية' : 'Unable to resolve your company account');
      return;
    }
    if (!form.title.trim()) {
      setError(lang === 'ar' ? 'عنوان النص مطلوب' : 'Script title is required');
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingDraft) {
        await scriptsApi.updateScript(editingDraft.scriptId, {
          title: form.title.trim(),
          type: form.type,
          workClassification: form.workClassification,
          synopsis: form.synopsis.trim(),
          receivedAt: form.receivedAt || null,
          status: 'draft',
        } as Partial<Script>);
      } else {
        const scriptPayload: Script = {
          id: '',
          companyId: profile.company.companyId,
          title: form.title.trim(),
          type: form.type,
          workClassification: form.workClassification,
          synopsis: form.synopsis.trim(),
          status: 'draft',
          receivedAt: form.receivedAt || null,
          createdAt: new Date().toISOString(),
        };
        await scriptsApi.addScript(scriptPayload);
      }
      setNotice(lang === 'ar' ? 'تم حفظ النص كمسودة.' : 'Script saved as draft.');
      setEditingDraft(null);
      await loadProfileAndSubmissions();
      setActiveSection('scripts');
    } catch (err) {
      setError(err instanceof Error ? err.message : (lang === 'ar' ? 'فشل حفظ المسودة' : 'Failed to save draft'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteScript = async () => {
    if (!scriptToDelete) return;
    setNotice('');
    setError('');
    try {
      await scriptsApi.deleteScript(scriptToDelete.scriptId);
      setNotice(lang === 'ar' ? 'تم إلغاء النص بنجاح.' : 'Script canceled successfully.');
      setScriptToDelete(null);
      await loadProfileAndSubmissions();
    } catch (err) {
      setError(err instanceof Error ? err.message : (lang === 'ar' ? 'تعذر إلغاء النص' : 'Unable to cancel script'));
    }
  };

  const startEditDraft = (item: ClientPortalSubmissionItem) => {
    setEditingDraft(item);
    setForm((prev) => ({
      ...prev,
      title: item.title ?? '',
      type: item.type === 'Series' ? 'Series' : 'Film',
      receivedAt: item.receivedAt ? String(item.receivedAt).slice(0, 10) : new Date().toISOString().slice(0, 10),
      synopsis: prev.synopsis ?? '',
    }));
    setActiveSection('new-script');
  };

  const openPaymentPage = async (scriptId: string) => {
    setNotice('');
    setError('');
    setPaymentScriptId(scriptId);
    setActiveSection('payment');
    setPaymentLoading(true);
    try {
      const response = await certificatesApi.getClientDashboard();
      setPaymentData(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : (lang === 'ar' ? 'تعذر تحميل بيانات الدفع' : 'Unable to load payment data'));
    } finally {
      setPaymentLoading(false);
    }
  };

  const submitPayment = async () => {
    if (!paymentScriptId) return;
    const cardNumber = paymentForm.cardNumber.replace(/\s+/g, '');
    const cvv = paymentForm.cvv.trim();
    if (!paymentForm.cardHolder.trim()) {
      setError(lang === 'ar' ? 'اسم حامل البطاقة مطلوب' : 'Card holder name is required');
      return;
    }
    if (!/^\d{16}$/.test(cardNumber)) {
      setError(lang === 'ar' ? 'رقم البطاقة يجب أن يكون 16 رقمًا' : 'Card number must be 16 digits');
      return;
    }
    if (!/^\d{2}\/\d{2}$/.test(paymentForm.expiry.trim())) {
      setError(lang === 'ar' ? 'تاريخ الانتهاء يجب أن يكون MM/YY' : 'Expiry must be MM/YY');
      return;
    }
    if (!/^\d{3,4}$/.test(cvv)) {
      setError(lang === 'ar' ? 'رمز الأمان غير صالح' : 'Invalid security code');
      return;
    }

    setError('');
    setPaymentSubmitting(true);
    try {
      const res = await certificatesApi.processDemoPayment(paymentScriptId, 'visa_success');
      if (!res.ok && !res.alreadyIssued) {
        setError(res.error || (lang === 'ar' ? 'فشلت عملية الدفع' : 'Payment failed'));
        return;
      }
      setPaymentSuccessOpen(true);
      const refreshed = await certificatesApi.getClientDashboard();
      setPaymentData(refreshed);
      setPaidScriptIds(new Set(
        (refreshed.items ?? [])
          .filter((item) => item.certificateStatus === 'issued' || item.latestPayment?.paymentStatus === 'completed')
          .map((item) => item.scriptId),
      ));
      await loadProfileAndSubmissions();
    } catch (err) {
      setError(err instanceof Error ? err.message : (lang === 'ar' ? 'تعذر إتمام عملية الدفع' : 'Unable to complete payment'));
    } finally {
      setPaymentSubmitting(false);
    }
  };

  const openRejectionDetails = async (scriptId: string) => {
    setDetailsOpen(true);
    setDetailsLoading(true);
    setDetailsError('');
    setDetails(null);
    try {
      const payload = await clientPortalApi.getRejectionDetails(scriptId);
      setDetails(payload);
    } catch (err) {
      setDetailsError(err instanceof Error ? err.message : (lang === 'ar' ? 'تعذر تحميل تفاصيل الرفض' : 'Unable to load rejection details'));
    } finally {
      setDetailsLoading(false);
    }
  };

  const totalRejected = useMemo(() => submissions.filter((s) => s.status.toLowerCase() === 'rejected').length, [submissions]);
  const totalApproved = useMemo(() => submissions.filter((s) => s.status.toLowerCase() === 'approved').length, [submissions]);
  const totalPending = useMemo(
    () => submissions.filter((s) => ['analysis_running', 'review_required', 'in_review'].includes(s.status.toLowerCase())).length,
    [submissions],
  );
  const recentSubmissions = useMemo(() => submissions.slice(0, 5), [submissions]);
  const visibleSubmissions = useMemo(
    () => submissions.filter((s) => !['canceled', 'cancelled'].includes(s.status.toLowerCase())),
    [submissions],
  );
  const filteredSubmissions = useMemo(() => {
    const q = scriptsSearch.trim().toLowerCase();
    return visibleSubmissions.filter((item) => {
      const status = item.status.toLowerCase();
      const isDraft = status === 'draft';
      const isSubmitted = ['in_review', 'analysis_running', 'review_required'].includes(status);
      const passStatus =
        scriptsStatusFilter === 'all' ||
        (scriptsStatusFilter === 'draft' && isDraft) ||
        (scriptsStatusFilter === 'submitted' && isSubmitted) ||
        (scriptsStatusFilter === 'approved' && status === 'approved') ||
        (scriptsStatusFilter === 'rejected' && status === 'rejected');
      if (!passStatus) return false;
      if (!q) return true;
      return item.title.toLowerCase().includes(q) || item.type.toLowerCase().includes(q);
    });
  }, [visibleSubmissions, scriptsSearch, scriptsStatusFilter]);
  const scriptsPageSize = 10;
  const scriptsPageCount = Math.max(1, Math.ceil(filteredSubmissions.length / scriptsPageSize));
  const pagedSubmissions = filteredSubmissions.slice((scriptsPage - 1) * scriptsPageSize, scriptsPage * scriptsPageSize);

  useEffect(() => {
    setScriptsPage(1);
  }, [scriptsSearch, scriptsStatusFilter]);

  const handleLogout = () => {
    logout();
    navigate('/portal', { replace: true });
  };

  const renderSubmissionList = () => (
    <Card className="client-portal-panel overflow-hidden border-border/80 shadow-[0_18px_50px_rgba(31,23,36,0.06)]">
      <CardHeader>
        <CardTitle>{lang === 'ar' ? 'حالة النصوص المرسلة' : 'Submitted Scripts Status'}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex flex-col gap-3 md:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <Input
              value={scriptsSearch}
              onChange={(e) => setScriptsSearch(e.target.value)}
              placeholder={lang === 'ar' ? 'بحث باسم النص...' : 'Search by script title...'}
              className="pl-10"
            />
          </div>
          <select
            value={scriptsStatusFilter}
            onChange={(e) => setScriptsStatusFilter(e.target.value as typeof scriptsStatusFilter)}
            className="h-10 rounded-[var(--radius)] border border-border bg-surface px-3 text-sm"
          >
            <option value="all">{lang === 'ar' ? 'الكل' : 'All'}</option>
            <option value="draft">{lang === 'ar' ? 'مسودة' : 'Draft'}</option>
            <option value="submitted">{lang === 'ar' ? 'مُرسل' : 'Submitted'}</option>
            <option value="approved">{lang === 'ar' ? 'مقبول' : 'Approved'}</option>
            <option value="rejected">{lang === 'ar' ? 'مرفوض' : 'Rejected'}</option>
          </select>
        </div>
        {isLoading ? (
          <p className="text-sm text-text-muted">{lang === 'ar' ? 'جاري التحميل...' : 'Loading...'}</p>
        ) : filteredSubmissions.length === 0 ? (
          <p className="text-sm text-text-muted">{lang === 'ar' ? 'لا توجد نصوص مرسلة بعد.' : 'No submitted scripts yet.'}</p>
        ) : (
          <div className="overflow-x-auto rounded-[calc(var(--radius)+0.35rem)] border border-border bg-surface">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-xs uppercase text-text-muted">
                <tr>
                  <th className="px-4 py-3 text-start">#</th>
                  <th className="px-4 py-3 text-start">{lang === 'ar' ? 'اسم النص' : 'Script Name'}</th>
                  <th className="px-4 py-3 text-start">{lang === 'ar' ? 'وقت الإرسال' : 'Submission Time'}</th>
                  <th className="px-4 py-3 text-start">{lang === 'ar' ? 'الحالة' : 'Status'}</th>
                  <th className="px-4 py-3 text-start">{lang === 'ar' ? 'الإجراءات' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody>
                {pagedSubmissions.map((item, index) => {
                  const status = item.status.toLowerCase();
                  const isDraft = status === 'draft';
                  const isSubmitted = ['in_review', 'analysis_running', 'review_required'].includes(status);
                  const canPay = status === 'approved' && !paidScriptIds.has(item.scriptId);
                  return (
                    <tr key={item.scriptId} className="border-b border-border/70 last:border-b-0">
                      <td className="px-4 py-3 text-text-muted">{(scriptsPage - 1) * scriptsPageSize + index + 1}</td>
                      <td className="px-4 py-3 font-medium text-text-main">{item.title}</td>
                      <td className="px-4 py-3 text-text-muted">{new Date(item.createdAt).toLocaleString()}</td>
                      <td className="px-4 py-3"><Badge variant={statusVariant(item.status)}>{statusLabel(item.status, lang)}</Badge></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <Button size="sm" variant="ghost" onClick={() => navigate(`/workspace/${item.scriptId}`)} aria-label="view"><Eye className="h-4 w-4" /></Button>
                          {isDraft ? (
                            <Button size="sm" variant="ghost" onClick={() => startEditDraft(item)} aria-label="edit"><Pencil className="h-4 w-4" /></Button>
                          ) : null}
                          <Button size="sm" variant="ghost" onClick={() => setScriptToDelete(item)} aria-label="delete"><Trash2 className="h-4 w-4 text-error" /></Button>
                          {!isDraft && !isSubmitted && canPay ? (
                            <Button size="sm" variant="ghost" onClick={() => void openPaymentPage(item.scriptId)} aria-label="payment"><CreditCard className="h-4 w-4 text-primary" /></Button>
                          ) : null}
                          {status === 'rejected' ? (
                            <Button size="sm" variant="outline" onClick={() => openRejectionDetails(item.scriptId)}>
                              {lang === 'ar' ? 'تقرير الرفض' : 'Rejection'}
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="flex items-center justify-between border-t border-border px-4 py-3">
              <span className="text-xs text-text-muted">{filteredSubmissions.length} {lang === 'ar' ? 'نتيجة' : 'results'}</span>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" disabled={scriptsPage <= 1} onClick={() => setScriptsPage((v) => v - 1)}>{lang === 'ar' ? 'السابق' : 'Previous'}</Button>
                <span className="text-xs text-text-muted">{scriptsPage} / {scriptsPageCount}</span>
                <Button size="sm" variant="outline" disabled={scriptsPage >= scriptsPageCount} onClick={() => setScriptsPage((v) => v + 1)}>{lang === 'ar' ? 'التالي' : 'Next'}</Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );

  const renderNewScriptForm = () => (
    <Card className="client-portal-panel overflow-hidden border-border/80 shadow-[0_18px_50px_rgba(31,23,36,0.06)]">
      <CardHeader>
        <CardTitle>{lang === 'ar' ? 'إضافة نص جديد' : 'Add New Script'}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmitScript} className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="md:col-span-2 space-y-2">
            <label className="block text-sm font-medium text-text-main">
              {lang === 'ar' ? 'طريقة إدخال النص' : 'Script Entry Method'}
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setEntryMode('upload')}
                className={`rounded-[var(--radius)] border px-4 py-2 text-sm transition ${entryMode === 'upload' ? 'border-primary bg-primary text-white' : 'border-border bg-background text-text-main hover:bg-surface'}`}
              >
                {lang === 'ar' ? 'استيراد ملف' : 'Import file'}
              </button>
              <button
                type="button"
                onClick={() => setEntryMode('paste')}
                className={`rounded-[var(--radius)] border px-4 py-2 text-sm transition ${entryMode === 'paste' ? 'border-primary bg-primary text-white' : 'border-border bg-background text-text-main hover:bg-surface'}`}
              >
                {lang === 'ar' ? 'لصق النص في المحرر' : 'Paste into editor'}
              </button>
            </div>
            <p className="text-xs text-text-muted">
              {lang === 'ar'
                ? 'سنُبقي مسار الاستيراد الحالي كما هو، ونضيف مسار التحرير النصي بشكل آمن دون كسر الربط مع مساحة عمل الإدارة.'
                : 'The current import flow stays intact, while a safe text-entry path is added without breaking admin workspace wiring.'}
            </p>
          </div>
          <Input
            label={lang === 'ar' ? 'عنوان النص' : 'Script Title'}
            value={form.title}
            onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
            required
          />
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-text-main">{lang === 'ar' ? 'نوع الإنتاج' : 'Production Type'}</label>
            <select
              value={form.type}
              onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value as 'Film' | 'Series' }))}
              className="h-10 w-full rounded-[var(--radius)] border border-border bg-surface px-3 text-sm"
            >
              <option value="Film">{lang === 'ar' ? 'فيلم' : 'Film'}</option>
              <option value="Series">{lang === 'ar' ? 'مسلسل' : 'Series'}</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-text-main">{lang === 'ar' ? 'تصنيف العمل' : 'Work Classification'}</label>
            <select
              value={form.workClassification}
              onChange={(e) => setForm((prev) => ({ ...prev, workClassification: e.target.value }))}
              className="h-10 w-full rounded-[var(--radius)] border border-border bg-surface px-3 text-sm"
            >
              {workClassificationOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <Input
            label={lang === 'ar' ? 'تاريخ الاستلام' : 'Received Date'}
            type="date"
            value={form.receivedAt}
            onChange={(e) => setForm((prev) => ({ ...prev, receivedAt: e.target.value }))}
          />
          <div className="md:col-span-2">
            <Textarea
              label={lang === 'ar' ? 'ملخص النص' : 'Synopsis'}
              rows={4}
              value={form.synopsis}
              onChange={(e) => setForm((prev) => ({ ...prev, synopsis: e.target.value }))}
            />
          </div>
          {entryMode === 'upload' ? (
            <div className="md:col-span-2">
              <div key={uploaderKey}>
                <FileUpload
                  label={lang === 'ar' ? 'ملف النص' : 'Script File'}
                  accept=".pdf,.docx,.txt"
                  helperText={lang === 'ar' ? 'يدعم PDF وDOCX وTXT حتى 50MB. هذا هو المسار الحالي المرتبط بمساحة عمل الإدارة.' : 'Supports PDF, DOCX, and TXT up to 50MB. This is the current flow already wired to the admin workspace.'}
                  onChange={setFile}
                />
              </div>
            </div>
          ) : (
            <div className="md:col-span-2">
              <Textarea
                label={lang === 'ar' ? 'محرر النص' : 'Script Editor'}
                rows={14}
                value={manualText}
                onChange={(e) => setManualText(e.target.value)}
                placeholder={
                  lang === 'ar'
                    ? 'الصق النص هنا. سننشئ له نسخة نظامية ونمرره لنفس مسار المعالجة المستخدم في النظام الحالي.'
                    : 'Paste the script text here. We will create a proper version and send it through the same processing path used by the current system.'
                }
              />
            </div>
          )}
          <div className="md:col-span-2 flex flex-wrap items-center gap-3">
            <Button type="submit" isLoading={isSubmitting}>
              {lang === 'ar' ? 'إرسال للنظام' : 'Submit to Dashboard'}
            </Button>
            <Button type="button" variant="outline" isLoading={isSubmitting} onClick={handleSaveDraft}>
              {lang === 'ar' ? 'حفظ كمسودة' : 'Save Draft'}
            </Button>
            <Button type="button" variant="outline" onClick={loadProfileAndSubmissions} disabled={isLoading || isSubmitting}>
              {lang === 'ar' ? 'تحديث' : 'Refresh'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );

  const renderOverview = () => (
    <div className="space-y-4">
      <section className="client-portal-hero rounded-[calc(var(--radius)+0.85rem)] px-6 py-6 text-white shadow-[0_24px_60px_rgba(103,42,85,0.18)] md:px-8 md:py-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-medium uppercase tracking-[0.24em] text-white/70">
              {lang === 'ar' ? 'مرحلة التأسيس' : 'Foundation Phase'}
            </p>
            <h2 className="mt-3 text-2xl font-bold md:text-3xl">
              {lang === 'ar' ? 'لوحة عميل جديدة على نفس العمود الفقري للنظام' : 'A new client dashboard on the same system backbone'}
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-white/80 md:text-base">
              {lang === 'ar'
                ? 'هذا الإصدار يضع الغلاف الجديد والأقسام الأساسية دون كسر الربط الحالي مع الإدارة والتقارير. سنضيف المحرر والتقسيم الذكي للمشاهد على مراحل آمنة.'
                : 'This phase introduces the new shell and core sections without breaking the current admin/report wiring. Editor and smart scene splitting will follow in safe phases.'}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 md:min-w-[300px]">
            <button
              type="button"
              onClick={() => setActiveSection('new-script')}
              className="rounded-2xl border border-white/20 bg-white/12 px-4 py-4 text-start transition hover:bg-white/18"
            >
              <p className="text-sm font-semibold">{lang === 'ar' ? 'إضافة نص' : 'Add Script'}</p>
              <p className="mt-1 text-xs text-white/70">{lang === 'ar' ? 'رفع ملف جديد للشركة' : 'Submit a new company script'}</p>
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('scripts')}
              className="rounded-2xl border border-white/20 bg-white/12 px-4 py-4 text-start transition hover:bg-white/18"
            >
              <p className="text-sm font-semibold">{lang === 'ar' ? 'متابعة النصوص' : 'Track Scripts'}</p>
              <p className="mt-1 text-xs text-white/70">{lang === 'ar' ? 'عرض الحالات والقرارات' : 'View statuses and decisions'}</p>
            </button>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-4 md:grid-cols-2">
        <Card className="client-portal-stat-card border-border/80 shadow-[0_18px_50px_rgba(31,23,36,0.06)]">
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-sm text-text-muted">{lang === 'ar' ? 'إجمالي النصوص' : 'Total Scripts'}</p>
              <p className="mt-2 text-3xl font-bold">{submissions.length}</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <FolderKanban className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>
        <Card className="client-portal-stat-card border-border/80 shadow-[0_18px_50px_rgba(31,23,36,0.06)]">
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-sm text-text-muted">{lang === 'ar' ? 'المعتمد' : 'Approved'}</p>
              <p className="mt-2 text-3xl font-bold text-success">{totalApproved}</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-success/10 text-success">
              <FileCheck2 className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>
        <Card className="client-portal-stat-card border-border/80 shadow-[0_18px_50px_rgba(31,23,36,0.06)]">
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-sm text-text-muted">{lang === 'ar' ? 'قيد المتابعة' : 'In Progress'}</p>
              <p className="mt-2 text-3xl font-bold text-warning">{totalPending}</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-warning/10 text-warning">
              <Clock3 className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>
        <Card className="client-portal-stat-card border-border/80 shadow-[0_18px_50px_rgba(31,23,36,0.06)]">
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-sm text-text-muted">{lang === 'ar' ? 'المرفوض' : 'Rejected'}</p>
              <p className="mt-2 text-3xl font-bold text-error">{totalRejected}</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-error/10 text-error">
              <ShieldAlert className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="client-portal-panel overflow-hidden border-border/80 shadow-[0_18px_50px_rgba(31,23,36,0.06)]">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>{lang === 'ar' ? 'أحدث النصوص' : 'Recent Scripts'}</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setActiveSection('scripts')}>
                {lang === 'ar' ? 'عرض الكل' : 'View all'}
                <ArrowUpRight className="ms-2 h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentSubmissions.length === 0 ? (
              <p className="text-sm text-text-muted">{lang === 'ar' ? 'لا توجد نصوص بعد. ابدأ بإضافة النص الأول.' : 'No scripts yet. Start by adding your first script.'}</p>
            ) : (
              recentSubmissions.map((item) => (
                <div key={item.scriptId} className="rounded-[calc(var(--radius)+0.3rem)] border border-border bg-background/80 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold">{item.title}</p>
                      <p className="mt-1 text-sm text-text-muted">{item.type} • {new Date(item.createdAt).toLocaleDateString()}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={statusVariant(item.status)}>{statusLabel(item.status, lang)}</Badge>
                      {item.status.toLowerCase() === 'rejected' ? (
                        <Button size="sm" variant="outline" onClick={() => openRejectionDetails(item.scriptId)}>
                          {lang === 'ar' ? 'تقرير الرفض' : 'Rejection report'}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="client-portal-panel overflow-hidden border-border/80 shadow-[0_18px_50px_rgba(31,23,36,0.06)]">
          <CardHeader>
            <CardTitle>{lang === 'ar' ? 'الأقسام التالية في الطريق' : 'Next sections in progress'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-[calc(var(--radius)+0.3rem)] border border-border bg-background/80 p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-secondary/15 text-secondary">
                  <Award className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold">{lang === 'ar' ? 'الشهادات' : 'Certificates'}</p>
                  <p className="mt-1 text-sm leading-6 text-text-muted">
                    {lang === 'ar' ? 'ربط أقوى مع الوثائق والشهادات المعتمدة سيصل في مرحلة منفصلة.' : 'A stronger issued-documents and certificates section will arrive in a dedicated phase.'}
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-[calc(var(--radius)+0.3rem)] border border-border bg-background/80 p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <BellRing className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold">{lang === 'ar' ? 'الإشعارات' : 'Notifications'}</p>
                  <p className="mt-1 text-sm leading-6 text-text-muted">
                    {lang === 'ar' ? 'سنفصل تنبيهات العميل لاحقًا بدل الاعتماد على متابعة الحالة يدويًا.' : 'Client notifications will be separated into their own stream in a later phase.'}
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-[calc(var(--radius)+0.3rem)] border border-border bg-background/80 p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-success/10 text-success">
                  <Settings2 className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold">{lang === 'ar' ? 'الإعدادات' : 'Settings'}</p>
                  <p className="mt-1 text-sm leading-6 text-text-muted">
                    {lang === 'ar' ? 'إعدادات الحساب والشركة ستنتقل لاحقًا إلى صفحة مستقلة شبيهة بالنظام القديم.' : 'Account and company settings will move later into a dedicated page closer to the old dashboard.'}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );

  const renderPlaceholderSection = (titleAr: string, titleEn: string, bodyAr: string, bodyEn: string) => (
    <Card className="client-portal-panel overflow-hidden border-border/80 shadow-[0_18px_50px_rgba(31,23,36,0.06)]">
      <CardHeader>
        <CardTitle>{lang === 'ar' ? titleAr : titleEn}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="max-w-3xl text-sm leading-7 text-text-muted">{lang === 'ar' ? bodyAr : bodyEn}</p>
      </CardContent>
    </Card>
  );

  const renderPaymentPage = () => {
    const paymentItem = paymentData?.items?.find((item) => item.scriptId === paymentScriptId) ?? null;
    return (
      <Card className="client-portal-panel overflow-hidden border-border/80 shadow-[0_18px_50px_rgba(31,23,36,0.06)]">
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>{lang === 'ar' ? 'صفحة دفع رسوم الشهادة' : 'Certificate Fee Payment'}</CardTitle>
            <Button variant="outline" size="sm" onClick={() => setActiveSection('scripts')}>
              {lang === 'ar' ? 'العودة إلى نصوصي' : 'Back to My Scripts'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {paymentLoading ? (
            <p className="text-sm text-text-muted">{lang === 'ar' ? 'جاري تحميل بيانات الدفع...' : 'Loading payment details...'}</p>
          ) : !paymentItem ? (
            <p className="text-sm text-text-muted">{lang === 'ar' ? 'هذا النص غير متاح للدفع الآن.' : 'This script is not ready for payment right now.'}</p>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <div className="rounded-[calc(var(--radius)+0.35rem)] border border-border bg-surface p-4">
                  <p className="mb-3 text-sm font-semibold text-text-main">{lang === 'ar' ? 'بيانات الدفع' : 'Payment Details'}</p>
                  <div className="grid grid-cols-1 gap-3">
                    <Input
                      label={lang === 'ar' ? 'اسم حامل البطاقة' : 'Card Holder Name'}
                      value={paymentForm.cardHolder}
                      onChange={(e) => setPaymentForm((prev) => ({ ...prev, cardHolder: e.target.value }))}
                    />
                    <Input
                      label={lang === 'ar' ? 'رقم البطاقة' : 'Card Number'}
                      value={paymentForm.cardNumber}
                      onChange={(e) => setPaymentForm((prev) => ({ ...prev, cardNumber: e.target.value }))}
                      placeholder="4111111111111111"
                      maxLength={19}
                    />
                    <div className="grid grid-cols-2 gap-3">
                      <Input
                        label={lang === 'ar' ? 'تاريخ الانتهاء' : 'Expiry Date'}
                        value={paymentForm.expiry}
                        onChange={(e) => setPaymentForm((prev) => ({ ...prev, expiry: e.target.value }))}
                        placeholder="MM/YY"
                        maxLength={5}
                      />
                      <Input
                        label={lang === 'ar' ? 'رمز الأمان' : 'CVV'}
                        value={paymentForm.cvv}
                        onChange={(e) => setPaymentForm((prev) => ({ ...prev, cvv: e.target.value }))}
                        placeholder="123"
                        maxLength={4}
                      />
                    </div>
                  </div>
                  <div className="mt-4">
                    <Button className="w-full" onClick={() => void submitPayment()} isLoading={paymentSubmitting}>
                      {lang === 'ar' ? 'ادفع الآن' : 'Pay Now'}
                    </Button>
                  </div>
                </div>

                <div className="rounded-[calc(var(--radius)+0.35rem)] border border-border bg-background/70 p-4">
                  <p className="font-semibold text-text-main">{paymentItem.scriptTitle}</p>
                  <p className="mt-1 text-sm text-text-muted">{paymentItem.scriptType}</p>
                  <div className="mt-4 space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-text-muted">{lang === 'ar' ? 'الرسوم الأساسية' : 'Base Fee'}</span>
                      <span>{new Intl.NumberFormat(lang === 'ar' ? 'ar-SA' : 'en-US', { style: 'currency', currency: paymentItem.certificateFee.currency, maximumFractionDigits: 2 }).format(paymentItem.certificateFee.baseAmount)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-text-muted">{lang === 'ar' ? 'الضريبة' : 'Tax'}</span>
                      <span>{new Intl.NumberFormat(lang === 'ar' ? 'ar-SA' : 'en-US', { style: 'currency', currency: paymentItem.certificateFee.currency, maximumFractionDigits: 2 }).format(paymentItem.certificateFee.taxAmount)}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between rounded-md bg-primary/10 px-3 py-2 text-base font-semibold text-primary">
                      <span>{lang === 'ar' ? 'الإجمالي' : 'Total'}</span>
                      <span>{new Intl.NumberFormat(lang === 'ar' ? 'ar-SA' : 'en-US', { style: 'currency', currency: paymentItem.certificateFee.currency, maximumFractionDigits: 2 }).format(paymentItem.certificateFee.totalAmount)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    );
  };

  const renderActiveSection = () => {
    if (activeSection === 'overview') return renderOverview();
    if (activeSection === 'scripts') return renderSubmissionList();
    if (activeSection === 'new-script') return renderNewScriptForm();
    if (activeSection === 'payment') return renderPaymentPage();
    if (activeSection === 'certificates') {
      return <ClientCertificatesSection lang={lang} />;
    }
    if (activeSection === 'notifications') {
      return renderPlaceholderSection(
        'قسم الإشعارات',
        'Notifications Section',
        'سنفصل الإشعارات هنا في مرحلة لاحقة. حاليًا يمكنك متابعة آخر الحالات مباشرة من قسم النصوص.',
        'Notifications will be separated here in a later phase. For now, you can track the latest statuses from the scripts section.',
      );
    }
    return renderPlaceholderSection(
      'قسم الإعدادات',
      'Settings Section',
      'الإعدادات ستأتي لاحقًا بصياغة أقرب للنظام القديم، مع الحفاظ على الربط الحالي مع بيانات الحساب والشركة.',
      'Settings will come later in a structure closer to the old dashboard, while preserving the current account and company wiring.',
    );
  };

  return (
    <ClientPortalLayout
      lang={lang}
      companyName={
        profile?.company
          ? (lang === 'ar' ? profile.company.nameAr : profile.company.nameEn)
          : (lang === 'ar' ? 'جاري تحميل معلومات الشركة...' : 'Loading company profile...')
      }
      userName={user?.name}
      activeSection={activeSection}
      onSectionChange={setActiveSection}
      onToggleLanguage={toggleLang}
      onLogout={handleLogout}
      subscriptionLabel={lang === 'ar' ? 'الاشتراك: مجاني' : 'Subscription: Free'}
      summary={{
        totalScripts: submissions.length,
        rejectedScripts: totalRejected,
      }}
    >
      <div className="space-y-4">
        {error && (
          <div className="rounded-[calc(var(--radius)+0.3rem)] border border-error/20 bg-error/10 p-3 text-sm text-error">{error}</div>
        )}
        {notice && (
          <div className="rounded-[calc(var(--radius)+0.3rem)] border border-success/20 bg-success/10 p-3 text-sm text-success">{notice}</div>
        )}
        {renderActiveSection()}
      </div>

      <Modal
        isOpen={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        title={lang === 'ar' ? 'تفاصيل الرفض والمخالفات' : 'Rejection Report & Findings'}
        className="max-w-4xl"
      >
        {detailsLoading ? (
          <p className="text-sm text-text-muted">{lang === 'ar' ? 'جاري التحميل...' : 'Loading...'}</p>
        ) : detailsError ? (
          <p className="text-sm text-error">{detailsError}</p>
        ) : !details ? (
          <p className="text-sm text-text-muted">{lang === 'ar' ? 'لا توجد بيانات متاحة' : 'No details available'}</p>
        ) : (
          (() => {
            const reportBlocks =
              details.sharedReports && details.sharedReports.length > 0
                ? details.sharedReports
                : (details.report ? [{ report: details.report, findings: details.findings ?? [] }] : []);

            return (
              <div className="space-y-4">
                <div className="rounded-md border border-border bg-background p-3 space-y-2">
                  <p className="font-semibold">{details.script.title}</p>
                  {details.decision?.decidedAt && (
                    <p className="text-sm text-text-muted">
                      {lang === 'ar' ? 'تاريخ قرار الرفض:' : 'Rejection decision date:'} {new Date(details.decision.decidedAt).toLocaleString()}
                    </p>
                  )}
                  {details.decision?.adminComment && (
                    <p className="text-sm">
                      <span className="font-medium">{lang === 'ar' ? 'تعليق الإدارة:' : 'Admin comment:'}</span> {details.decision.adminComment}
                    </p>
                  )}
                  {!details.decision?.adminComment && details.report?.reviewNotes && (
                    <p className="text-sm">
                      <span className="font-medium">{lang === 'ar' ? 'ملاحظة المراجع:' : 'Reviewer note:'}</span> {details.report.reviewNotes}
                    </p>
                  )}
                </div>

                {reportBlocks.length === 0 ? (
                  <p className="text-sm text-text-muted">
                    {lang === 'ar'
                      ? 'لم يتم إرفاق تقارير مع قرار الرفض من الإدارة.'
                      : 'No analysis reports were attached to this rejection decision.'}
                  </p>
                ) : (
                  <div className="space-y-4 max-h-[55vh] overflow-auto pe-1">
                    {reportBlocks.map((block) => (
                      <div key={block.report.id} className="space-y-3 rounded-lg border border-border bg-background p-3">
                        <div className="space-y-2">
                          <p className="text-sm font-semibold">
                            {lang === 'ar' ? 'التقرير' : 'Report'} #{block.report.id.slice(0, 8)}
                          </p>
                          <p className="text-xs text-text-muted">
                            {lang === 'ar' ? 'تاريخ التقرير:' : 'Report date:'} {new Date(block.report.createdAt).toLocaleString()}
                          </p>
                          {block.report.reviewNotes && (
                            <p className="text-xs text-text-muted">
                              {lang === 'ar' ? 'ملاحظة المراجع:' : 'Reviewer note:'} {block.report.reviewNotes}
                            </p>
                          )}
                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void downloadRejectionReportPdf(block)}
                              isLoading={downloadingReportId === block.report.id}
                            >
                              {lang === 'ar' ? 'تنزيل PDF' : 'Download PDF'}
                            </Button>
                          </div>
                        </div>

                        <div className="space-y-3">
                          {block.findings.length === 0 ? (
                            <p className="text-sm text-text-muted">{lang === 'ar' ? 'لا توجد مخالفات متاحة في هذا التقرير' : 'No findings available in this report'}</p>
                          ) : (
                            block.findings.map((finding) => (
                              <div key={finding.id} className="rounded-md border border-border bg-surface p-3 space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="font-semibold">{finding.titleAr}</p>
                                  <Badge variant={finding.severity === 'high' || finding.severity === 'critical' ? 'error' : 'warning'}>
                                    {finding.severity}
                                  </Badge>
                                </div>
                                {finding.descriptionAr && (
                                  <p className="text-sm text-text-muted">{finding.descriptionAr}</p>
                                )}
                                <p className="text-sm leading-relaxed bg-background rounded p-2 border border-border">
                                  {finding.evidenceSnippet}
                                </p>
                                <p className="text-xs text-text-muted">
                                  {lang === 'ar' ? 'المادة' : 'Article'} #{finding.articleId}
                                  {finding.pageNumber ? ` • ${lang === 'ar' ? 'صفحة' : 'Page'} ${finding.pageNumber}` : ''}
                                </p>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()
        )}
      </Modal>
      <Modal
        isOpen={scriptToDelete != null}
        onClose={() => setScriptToDelete(null)}
        title={lang === 'ar' ? 'إلغاء النص' : 'Cancel Script'}
      >
        <div className="space-y-4">
          <p className="text-sm text-text-muted">
            {lang === 'ar'
              ? 'سيتم إلغاء هذا النص وإشعار الإدارة بذلك. هل تريد المتابعة؟'
              : 'This script will be canceled and admin will be notified. Continue?'}
          </p>
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" onClick={() => setScriptToDelete(null)}>
              {lang === 'ar' ? 'رجوع' : 'Back'}
            </Button>
            <Button variant="danger" onClick={handleDeleteScript}>
              {lang === 'ar' ? 'تأكيد الإلغاء' : 'Confirm Cancel'}
            </Button>
          </div>
        </div>
      </Modal>
      <Modal
        isOpen={paymentSuccessOpen}
        onClose={() => {
          setPaymentSuccessOpen(false);
          setActiveSection('scripts');
        }}
        title={lang === 'ar' ? 'تم الدفع بنجاح' : 'Payment Successful'}
      >
        <div className="space-y-4">
          <p className="text-sm text-text-muted">
            {lang === 'ar'
              ? 'مبروك! تم استلام دفعتك بنجاح. يمكنك زيارة قسم الشهادات خلال 5 دقائق وستجد شهادتك هناك.'
              : 'Congratulations! Your payment was completed successfully. Visit the Certificates section within 5 minutes to find your certificate.'}
          </p>
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setPaymentSuccessOpen(false);
                setActiveSection('scripts');
              }}
            >
              {lang === 'ar' ? 'إغلاق' : 'Close'}
            </Button>
            <Button onClick={() => { setPaymentSuccessOpen(false); setActiveSection('certificates'); }}>
              {lang === 'ar' ? 'الذهاب إلى الشهادات' : 'Go to Certificates'}
            </Button>
          </div>
        </div>
      </Modal>
    </ClientPortalLayout>
  );
}
