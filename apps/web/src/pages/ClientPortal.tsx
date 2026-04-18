import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { FileUpload } from '@/components/ui/FileUpload';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { clientPortalApi, scriptsApi, type ClientPortalMeResponse, type ClientPortalSubmissionItem, type ClientPortalRejectionDetailsResponse } from '@/api';
import { useAuthStore } from '@/store/authStore';
import { useLangStore } from '@/store/langStore';
import type { Script } from '@/api/models';
import { supabase } from '@/lib/supabaseClient';
import { API_BASE_URL } from '@/lib/env';
import { extractDocxWithPages } from '@/utils/documentExtract';
import { PDF_EXTRACTION_INTERVAL_MS, PDF_EXTRACTION_TIMEOUT_MS, waitForVersionExtraction } from '@/utils/waitForVersionExtraction';

type UploadResult = {
  success: boolean;
  fileUrl: string;
  path: string;
  fileName: string;
  fileSize: number;
  versionId: string | null;
  versionNumber: number | null;
};

const WORK_CLASSIFICATION_OPTIONS = [
  { value: 'أمني', labelAr: 'أمني', labelEn: 'Security' },
  { value: 'وثائقي', labelAr: 'وثائقي', labelEn: 'Documentary' },
  { value: 'درامي', labelAr: 'درامي', labelEn: 'Drama' },
  { value: 'كوميدي', labelAr: 'كوميدي', labelEn: 'Comedy' },
  { value: 'تاريخي', labelAr: 'تاريخي', labelEn: 'Historical' },
  { value: 'اجتماعي', labelAr: 'اجتماعي', labelEn: 'Social' },
  { value: 'أطفال', labelAr: 'أطفال', labelEn: 'Children' },
  { value: 'إعلامي', labelAr: 'إعلامي', labelEn: 'Media' },
  { value: 'آخر', labelAr: 'آخر', labelEn: 'Other' },
] as const;

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
  const { lang } = useLangStore();
  const { logout, user } = useAuthStore();

  const [profile, setProfile] = useState<ClientPortalMeResponse | null>(null);
  const [submissions, setSubmissions] = useState<ClientPortalSubmissionItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [uploaderKey, setUploaderKey] = useState(1);

  const [form, setForm] = useState<{
    title: string;
    type: 'Film' | 'Series';
    workClassification: string;
    synopsis: string;
    receivedAt: string;
  }>({
    title: '',
    type: 'Film' as 'Film' | 'Series',
    workClassification: WORK_CLASSIFICATION_OPTIONS[0].value,
    synopsis: '',
    receivedAt: new Date().toISOString().slice(0, 10),
  });
  const [file, setFile] = useState<File | null>(null);

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState('');
  const [details, setDetails] = useState<ClientPortalRejectionDetailsResponse | null>(null);

  const loadProfileAndSubmissions = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const [me, list] = await Promise.all([
        clientPortalApi.getMe(),
        clientPortalApi.getSubmissions(),
      ]);
      setProfile(me);
      setSubmissions(list);
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
    if (!file) {
      setError(lang === 'ar' ? 'يجب إرفاق ملف النص' : 'Please attach a script file');
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
      const upload = await uploadScriptDocument(created.id, profile.company.companyId, file);
      if (!upload.versionId) {
        throw new Error(lang === 'ar' ? 'تعذّر إنشاء نسخة النص' : 'Failed to create script version');
      }

      const ext = file.name.toLowerCase().split('.').pop() || '';
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
        const { pages } = await extractDocxWithPages(file);
        const res = await scriptsApi.extractText(upload.versionId, undefined, { pages, enqueueAnalysis: false });
        if (!(res as { extracted_text?: string }).extracted_text?.trim()) {
          throw new Error(lang === 'ar' ? 'لم يتم استخراج نص من الملف' : 'No text extracted from file');
        }
      } else if (ext === 'txt') {
        const text = await file.text();
        if (!text.trim()) throw new Error(lang === 'ar' ? 'الملف النصي فارغ' : 'Text file is empty');
        await scriptsApi.extractText(upload.versionId, text, { enqueueAnalysis: false });
      } else {
        throw new Error(lang === 'ar' ? 'صيغة الملف غير مدعومة' : 'Unsupported file format');
      }

      setForm({
        title: '',
        type: 'Film',
        workClassification: WORK_CLASSIFICATION_OPTIONS[0].value,
        synopsis: '',
        receivedAt: new Date().toISOString().slice(0, 10),
      });
      setFile(null);
      setUploaderKey((v) => v + 1);
      setNotice(lang === 'ar'
        ? 'تم إرسال النص بنجاح، وسيتم مراجعته من فريق الإدارة.'
        : 'Script submitted successfully and sent to admin review.');
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

  const handleLogout = () => {
    logout();
    navigate('/portal', { replace: true });
  };

  return (
    <div className="min-h-screen bg-background text-text-main">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto max-w-7xl px-4 py-4 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold">{lang === 'ar' ? 'بوابة شركات الإنتاج' : 'Production Client Portal'}</h1>
            <p className="text-sm text-text-muted">
              {profile?.company
                ? (lang === 'ar' ? profile.company.nameAr : profile.company.nameEn)
                : (lang === 'ar' ? 'جاري تحميل معلومات الشركة...' : 'Loading company profile...')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="success">
              {lang === 'ar' ? 'الاشتراك: مجاني' : 'Subscription: Free'}
            </Badge>
            <span className="text-sm text-text-muted hidden md:inline">{user?.name}</span>
            <Button variant="outline" onClick={handleLogout}>
              {lang === 'ar' ? 'تسجيل الخروج' : 'Logout'}
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 space-y-6">
        {error && (
          <div className="rounded-md border border-error/20 bg-error/10 p-3 text-sm text-error">{error}</div>
        )}
        {notice && (
          <div className="rounded-md border border-success/20 bg-success/10 p-3 text-sm text-success">{notice}</div>
        )}

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>{lang === 'ar' ? 'إجمالي النصوص' : 'Total Submissions'}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{submissions.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{lang === 'ar' ? 'المرفوض' : 'Rejected'}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-error">{totalRejected}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{lang === 'ar' ? 'حالة الاشتراك' : 'Subscription'}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-lg font-semibold">{lang === 'ar' ? 'مفعل - مجاني' : 'Active - Free'}</p>
            </CardContent>
          </Card>
        </section>

        <Card>
          <CardHeader>
            <CardTitle>{lang === 'ar' ? 'رفع نص جديد' : 'Submit New Script'}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmitScript} className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  className="w-full h-10 rounded-[var(--radius)] border border-border bg-surface px-3 text-sm"
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
                  className="w-full h-10 rounded-[var(--radius)] border border-border bg-surface px-3 text-sm"
                >
                  {WORK_CLASSIFICATION_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {lang === 'ar' ? option.labelAr : option.labelEn}
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
              <div className="md:col-span-2">
                <div key={uploaderKey}>
                  <FileUpload
                    label={lang === 'ar' ? 'ملف النص' : 'Script File'}
                    accept=".pdf,.docx,.txt"
                    helperText={lang === 'ar' ? 'يدعم PDF وDOCX وTXT حتى 50MB' : 'Supports PDF, DOCX, and TXT up to 50MB'}
                    onChange={setFile}
                  />
                </div>
              </div>
              <div className="md:col-span-2 flex items-center gap-3">
                <Button type="submit" isLoading={isSubmitting}>
                  {lang === 'ar' ? 'إرسال للنظام' : 'Submit to Dashboard'}
                </Button>
                <Button type="button" variant="outline" onClick={loadProfileAndSubmissions} disabled={isLoading || isSubmitting}>
                  {lang === 'ar' ? 'تحديث' : 'Refresh'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{lang === 'ar' ? 'حالة النصوص المرسلة' : 'Submitted Scripts Status'}</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-text-muted">{lang === 'ar' ? 'جاري التحميل...' : 'Loading...'}</p>
            ) : submissions.length === 0 ? (
              <p className="text-sm text-text-muted">{lang === 'ar' ? 'لا توجد نصوص مرسلة بعد.' : 'No submitted scripts yet.'}</p>
            ) : (
              <div className="space-y-3">
                {submissions.map((item) => (
                  <div key={item.scriptId} className="border border-border rounded-lg p-4 bg-surface">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{item.title}</p>
                        <p className="text-sm text-text-muted">
                          {item.type} • {new Date(item.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={statusVariant(item.status)}>{statusLabel(item.status, lang)}</Badge>
                        {item.status.toLowerCase() === 'rejected' && (
                          <Button size="sm" variant="outline" onClick={() => openRejectionDetails(item.scriptId)}>
                            {lang === 'ar' ? 'عرض تقرير الرفض' : 'View Rejection Report'}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>

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
          <div className="space-y-4">
            <div className="rounded-md border border-border bg-background p-3 space-y-1">
              <p className="font-semibold">{details.script.title}</p>
              <p className="text-sm text-text-muted">
                {lang === 'ar' ? 'تاريخ التقرير:' : 'Report date:'} {new Date(details.report.createdAt).toLocaleString()}
              </p>
              {details.report.reviewNotes && (
                <p className="text-sm">
                  <span className="font-medium">{lang === 'ar' ? 'ملاحظة المراجع:' : 'Reviewer note:'}</span> {details.report.reviewNotes}
                </p>
              )}
            </div>

            <div className="space-y-3 max-h-[50vh] overflow-auto pe-1">
              {details.findings.length === 0 ? (
                <p className="text-sm text-text-muted">{lang === 'ar' ? 'لا توجد مخالفات متاحة في هذا التقرير' : 'No findings available in this report'}</p>
              ) : (
                details.findings.map((finding) => (
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
        )}
      </Modal>
    </div>
  );
}
