import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Upload, Loader2, FileText, History, PlayCircle, Trash2 } from 'lucide-react';

import { useLangStore } from '@/store/langStore';
import { useDataStore } from '@/store/dataStore';
import { scriptsApi, reportsApi, type DuplicateScriptCheckResponse } from '@/api';
import type { Script } from '@/api/models';
import type { ReportListItem } from '@/api/models';
import { formatDate, formatTime } from '@/utils/dateFormat';
import { extractDocx } from '@/utils/documentExtract';
import { PDF_EXTRACTION_INTERVAL_MS, PDF_EXTRACTION_TIMEOUT_MS, waitForVersionExtraction } from '@/utils/waitForVersionExtraction';
import { DocumentImportModal } from '@/components/import/DocumentImportModal';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import {
  createImportAbortError,
  formatExtractionProgressMessage,
  isImportAbortError,
  parseImportDocumentCases,
  safeUploadFileName,
  type ImportDocumentCases,
  type ImportStatus,
} from '@/utils/documentImport';

type QuickHistoryItem = {
  script: Script;
  latestReport: ReportListItem | null;
};

function fileTitle(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, '').trim();
  return base || 'Quick Analysis';
}

export function QuickAnalysis() {
  const { lang } = useLangStore();
  const pushScript = useDataStore((s) => s.pushScript);
  const navigate = useNavigate();
  const [history, setHistory] = useState<QuickHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<ImportStatus>('idle');
  const [uploadPhaseLabel, setUploadPhaseLabel] = useState('');
  const [uploadStatusMessage, setUploadStatusMessage] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadStartedAt, setUploadStartedAt] = useState<number | null>(null);
  const [uploadElapsedMs, setUploadElapsedMs] = useState(0);
  const [uploadVersionId, setUploadVersionId] = useState<string | null>(null);
  const [uploadDuplicateInfo, setUploadDuplicateInfo] = useState<DuplicateScriptCheckResponse | null>(null);
  const [uploadDocumentCases, setUploadDocumentCases] = useState<ImportDocumentCases | null>(null);
  const [deletingScriptId, setDeletingScriptId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const uploadAbortControllerRef = useRef<AbortController | null>(null);
  const uploadSessionIdRef = useRef(0);
  const uploadAutoCloseTimeoutRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);

  const isAr = lang === 'ar';
  const isImportModalOpen = uploadStatus !== 'idle';

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const scripts = await scriptsApi.getQuickScripts();
      const rows = await Promise.all(
        scripts.map(async (script) => {
          try {
            const reports = await reportsApi.listByScript(script.id);
            return { script, latestReport: reports[0] ?? null };
          } catch {
            return { script, latestReport: null };
          }
        }),
      );
      setHistory(rows);
    } catch (err: any) {
      toast.error(err?.message ?? (isAr ? 'فشل تحميل سجل التحليل السريع' : 'Failed to load quick analysis history'));
      setHistory([]);
    } finally {
      setLoading(false);
    }
  }, [isAr]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    if (!isImportModalOpen || uploadStartedAt == null) return;
    const tick = () => setUploadElapsedMs(Date.now() - uploadStartedAt);
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [isImportModalOpen, uploadStartedAt]);

  const clearImportAutoClose = useCallback(() => {
    if (uploadAutoCloseTimeoutRef.current != null) {
      window.clearTimeout(uploadAutoCloseTimeoutRef.current);
      uploadAutoCloseTimeoutRef.current = null;
    }
  }, []);

  const resetImportState = useCallback(() => {
    clearImportAutoClose();
    const controller = uploadAbortControllerRef.current;
    if (controller && !controller.signal.aborted) controller.abort();
    uploadAbortControllerRef.current = null;
    uploadSessionIdRef.current += 1;
    setIsUploading(false);
    setUploadStatus('idle');
    setUploadError(null);
    setUploadStartedAt(null);
    setUploadElapsedMs(0);
    setUploadVersionId(null);
    setUploadDuplicateInfo(null);
    setUploadDocumentCases(null);
    setUploadPhaseLabel('');
    setUploadStatusMessage('');
  }, [clearImportAutoClose]);

  const stopImportProcess = useCallback((closeModal = false) => {
    clearImportAutoClose();
    const controller = uploadAbortControllerRef.current;
    if (controller && !controller.signal.aborted) controller.abort();
    uploadAbortControllerRef.current = null;
    uploadSessionIdRef.current += 1;
    const versionIdToCancel = uploadVersionId;
    const shouldCancelBackend = uploadStatus === 'extracting' && !!versionIdToCancel;
    setIsUploading(false);
    setUploadVersionId(null);
    setUploadDuplicateInfo(null);
    setUploadDocumentCases(null);
    if (shouldCancelBackend && versionIdToCancel) {
      void scriptsApi.cancelVersionExtraction(versionIdToCancel).catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        console.warn('[QuickAnalysis] Failed to cancel backend extraction', { versionId: versionIdToCancel, error: message });
      });
    }
    if (closeModal) {
      setUploadStatus('idle');
      setUploadError(null);
      setUploadStartedAt(null);
      setUploadElapsedMs(0);
      setUploadPhaseLabel('');
      setUploadStatusMessage('');
      return;
    }
    setUploadStatus('aborted');
    setUploadError(null);
    setUploadPhaseLabel(isAr ? 'تم إيقاف الاستيراد' : 'Import stopped');
    setUploadStatusMessage(
      isAr
        ? 'تم إيقاف عملية الاستيراد الحالية. يمكنك إغلاق النافذة أو إعادة المحاولة لاحقاً.'
        : 'The current import was stopped. You can close this window or try again later.',
    );
  }, [clearImportAutoClose, isAr, uploadStatus, uploadVersionId]);

  useEffect(() => () => {
    clearImportAutoClose();
    const controller = uploadAbortControllerRef.current;
    if (controller && !controller.signal.aborted) controller.abort();
  }, [clearImportAutoClose]);

  const handleDeleteQuickAnalysis = useCallback(async (script: Script) => {
    const confirmed = window.confirm(
      isAr
        ? `سيتم حذف التحليل السريع "${script.title}" مع كل التقارير والنتائج المرتبطة به. هل تريد المتابعة؟`
        : `Delete quick analysis "${script.title}" and all related reports/findings?`,
    );
    if (!confirmed) return;

    setDeletingScriptId(script.id);
    try {
      await scriptsApi.deleteScript(script.id);
      toast.success(isAr ? 'تم حذف التحليل السريع' : 'Quick analysis deleted');
      await loadHistory();
    } catch (err: any) {
      toast.error(err?.message ?? (isAr ? 'فشل حذف التحليل السريع' : 'Failed to delete quick analysis'));
    } finally {
      setDeletingScriptId(null);
    }
  }, [isAr, loadHistory]);

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.toLowerCase().split('.').pop() || '';
    if (!['txt', 'docx', 'pdf'].includes(ext)) {
      toast.error(isAr ? 'الملف يجب أن يكون TXT أو DOCX أو PDF' : 'File must be TXT, DOCX, or PDF');
      if (e.target) e.target.value = '';
      return;
    }

    clearImportAutoClose();
    const controller = new AbortController();
    uploadAbortControllerRef.current = controller;
    const importSessionId = uploadSessionIdRef.current + 1;
    uploadSessionIdRef.current = importSessionId;
    const ensureImportActive = () => {
      if (controller.signal.aborted || uploadSessionIdRef.current !== importSessionId) {
        throw createImportAbortError();
      }
    };

    setIsUploading(true);
    setUploadStatus('uploading');
    setUploadPhaseLabel(isAr ? 'رفع الملف' : 'Uploading file');
    setUploadStatusMessage(
      isAr
        ? 'يجري إنشاء مساحة تحليل سريع جديدة ثم رفع الملف وتهيئته للاستخراج.'
        : 'Creating a new quick analysis item, then uploading the document for extraction.',
    );
    setUploadError(null);
    setUploadDuplicateInfo(null);
    setUploadDocumentCases(null);
    setUploadStartedAt(Date.now());
    setUploadElapsedMs(0);

    let quickScript: { id: string; title: string; type: string; status: string } | null = null;
    try {
      const normalizedName = file.name.normalize('NFC');
      ensureImportActive();
      quickScript = await scriptsApi.createQuickScript({
        title: fileTitle(normalizedName),
        type: 'Film',
        status: 'draft',
      });
      ensureImportActive();
      setUploadStatusMessage(
        isAr
          ? 'تم إنشاء مساحة التحليل السريع. يجري الآن رفع الملف وربطه بالنسخة الأولى.'
          : 'Quick analysis shell created. Uploading the document and creating its first version now.',
      );

      const uploadName = safeUploadFileName(file.name);
      const { url, path } = await scriptsApi.getUploadUrl(uploadName, { signal: controller.signal });
      ensureImportActive();
      await scriptsApi.uploadToSignedUrl(file, url, { signal: controller.signal });
      ensureImportActive();
      const storagePath = path ?? url;
      const sourceFileType =
        file.type ||
        (ext === 'txt'
          ? 'text/plain'
          : ext === 'pdf'
            ? 'application/pdf'
            : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');

      const version = await scriptsApi.createVersion(quickScript.id, {
        source_file_name: normalizedName,
        source_file_type: sourceFileType,
        source_file_size: file.size,
        source_file_path: storagePath,
        source_file_url: storagePath,
      }, { signal: controller.signal });
      ensureImportActive();
      setUploadVersionId(version.id);
      setUploadStatus('extracting');
      setUploadPhaseLabel(isAr ? 'استخراج النص' : 'Extracting text');
      setUploadStatusMessage(
        isAr
          ? ext === 'pdf'
            ? 'ملفات PDF قد تستغرق وقتاً أطول لأن النظام يحلل الصفحات ويعيد بناء النص خطوة بخطوة.'
            : 'يجري الآن استخراج النص وتجهيزه قبل فتح مساحة العمل.'
          : ext === 'pdf'
            ? 'PDF imports can take longer while the worker reconstructs page text.'
            : 'Extracting and preparing the text before opening the workspace.',
      );
      let detectedDocumentCases: ImportDocumentCases | null = null;

      if (ext === 'txt') {
        const text = await file.text();
        ensureImportActive();
        const res = await scriptsApi.extractText(version.id, text, {
          enqueueAnalysis: false,
          signal: controller.signal,
        });
        ensureImportActive();
        detectedDocumentCases = parseImportDocumentCases((res as { extraction_progress?: Record<string, unknown> }).extraction_progress);
        setUploadDocumentCases(detectedDocumentCases);
        if (!((res as { extracted_text?: string })?.extracted_text ?? text).trim()) {
          throw new Error(isAr ? 'لم يتم العثور على نص في الملف' : 'No text found in document');
        }
      } else if (ext === 'pdf') {
        await scriptsApi.extractText(version.id, undefined, {
          enqueueAnalysis: false,
          signal: controller.signal,
        });
        ensureImportActive();
        const extractedVersion = await waitForVersionExtraction(quickScript.id, version.id, {
          timeoutMs: PDF_EXTRACTION_TIMEOUT_MS,
          intervalMs: PDF_EXTRACTION_INTERVAL_MS,
          signal: controller.signal,
          onUpdate: (currentVersion) => {
            const progressMessage = formatExtractionProgressMessage(currentVersion.extraction_progress, lang);
            if (progressMessage) setUploadStatusMessage(progressMessage);
            detectedDocumentCases = parseImportDocumentCases(currentVersion.extraction_progress);
            setUploadDocumentCases(detectedDocumentCases);
            if (currentVersion.extraction_status === 'failed' && currentVersion.extraction_error) {
              setUploadError(currentVersion.extraction_error);
            }
          },
        });
        ensureImportActive();
        detectedDocumentCases = parseImportDocumentCases(extractedVersion.extraction_progress);
        setUploadDocumentCases(detectedDocumentCases);
        if (!extractedVersion.extracted_text?.trim()) {
          throw new Error(isAr ? 'لم يتم العثور على نص في الملف' : 'No text found in document');
        }
      } else if (ext === 'docx') {
        const { plain, html } = await extractDocx(file);
        ensureImportActive();
        const res = await scriptsApi.extractText(version.id, plain, {
          contentHtml: html,
          enqueueAnalysis: false,
          signal: controller.signal,
        });
        ensureImportActive();
        detectedDocumentCases = parseImportDocumentCases((res as { extraction_progress?: Record<string, unknown> }).extraction_progress);
        setUploadDocumentCases(detectedDocumentCases);
        if ((res as { error?: string })?.error) {
          throw new Error((res as { error: string }).error);
        }
        if (!(res as { extracted_text?: string })?.extracted_text?.trim()) {
          throw new Error(isAr ? 'لم يتم العثور على نص في الملف' : 'No text found in document');
        }
      } else {
        throw new Error(isAr ? 'نوع الملف غير مدعوم' : 'Unsupported file type');
      }

      await scriptsApi.updateScript(quickScript.id, { currentVersionId: version.id });
      ensureImportActive();
      const scriptForStore: Script = { ...quickScript, currentVersionId: version.id };
      pushScript(scriptForStore);
      let duplicateInfo: DuplicateScriptCheckResponse | null = null;
      try {
        duplicateInfo = await scriptsApi.getDuplicateScripts(version.id);
        ensureImportActive();
      } catch (duplicateErr) {
        const message = duplicateErr instanceof Error ? duplicateErr.message : String(duplicateErr);
        console.warn('[QuickAnalysis] duplicate script check failed', { versionId: version.id, error: message });
      }
      setUploadDuplicateInfo(duplicateInfo?.exactMatch ? duplicateInfo : null);
      setUploadStatus('done');
      setUploadVersionId(null);
      setUploadPhaseLabel(isAr ? 'اكتمل الاستيراد' : 'Import complete');
      setUploadStatusMessage(
        duplicateInfo?.exactMatch
          ? isAr
            ? `اكتمل الاستيراد، لكن النظام وجد ${duplicateInfo.duplicateCount} ${duplicateInfo.duplicateCount === 1 ? 'نسخة مطابقة' : 'نسخ مطابقة'} بالمحتوى نفسه في السجلات الحالية.`
            : `Import completed, but the system found ${duplicateInfo.duplicateCount} exact content duplicate${duplicateInfo.duplicateCount === 1 ? '' : 's'} in existing records.`
          : detectedDocumentCases
            ? (isAr ? 'اكتمل الاستيراد مع تنبيهات بنية مستند ستظهر أدناه قبل فتح مساحة العمل.' : 'Import completed with document structure warnings shown below before opening the workspace.')
            : isAr
              ? 'تم تجهيز النص بنجاح. سيتم فتح مساحة العمل الآن لبدء التحليل.'
              : 'The script is ready. Opening the workspace now to start analysis.',
      );
      toast.success(isAr ? 'تم تجهيز النص. ابدأ التحليل من مساحة العمل.' : 'Script prepared. Start analysis from workspace.');
      await loadHistory();
      const nextUrl = `/workspace/${quickScript.id}?quick=1`;
      uploadAutoCloseTimeoutRef.current = window.setTimeout(() => {
        navigate(nextUrl);
      }, duplicateInfo?.exactMatch || detectedDocumentCases ? 2400 : 1200);
    } catch (err: any) {
      if (quickScript?.id) {
        try {
          await scriptsApi.deleteScript(quickScript.id);
        } catch (_) {}
        await loadHistory();
      }
      if (isImportAbortError(err)) {
        return;
      }
      const message = err?.message ?? (isAr ? 'فشل التحليل السريع' : 'Quick analysis failed');
      setUploadStatus('failed');
      setUploadPhaseLabel(isAr ? 'فشل الاستيراد' : 'Import failed');
      setUploadStatusMessage(
        isAr
          ? 'تعذر تجهيز الملف للتحليل السريع. راجع الرسالة أدناه ثم أعد المحاولة.'
          : 'The document could not be prepared for quick analysis. Review the message below and try again.',
      );
      setUploadError(message);
      toast.error(message);
    } finally {
      setIsUploading(false);
      if (e.target) e.target.value = '';
    }
  };

  const emptyText = useMemo(
    () => (isAr ? 'لا يوجد سجل تحليل سريع بعد.' : 'No quick analysis history yet.'),
    [isAr],
  );
  const importStatusDescription =
    uploadStatus === 'uploading'
      ? (isAr ? 'يتم رفع الملف إلى التخزين وربطه بتحليل سريع جديد.' : 'Uploading the document and linking it to a new quick analysis item.')
      : uploadStatus === 'extracting'
        ? (isAr ? 'يتم الآن استخراج النص في الخلفية قبل فتح مساحة العمل. قد تستغرق ملفات PDF الكبيرة وقتاً أطول.' : 'The text is being extracted in the background before opening the workspace. Large PDFs can take longer.')
        : uploadStatus === 'aborted'
          ? (isAr ? 'تم إيقاف عملية التحليل السريع قبل اكتمالها.' : 'This quick analysis import was stopped before completion.')
          : uploadStatus === 'done'
            ? (isAr ? 'اكتمل الاستيراد بنجاح، وسيتم فتح مساحة العمل لبدء التحليل.' : 'Import completed successfully, and the workspace will open next.')
            : (isAr ? 'توقف الاستيراد قبل اكتماله.' : 'The import stopped before completion.');
  const importFooterHint =
    uploadStatus === 'failed'
      ? (isAr ? 'يمكنك إغلاق هذه النافذة ثم إعادة محاولة التحليل السريع.' : 'You can close this window and try quick analysis again.')
      : uploadStatus === 'aborted'
        ? (isAr ? 'تم إيقاف الاستيراد يدوياً. يمكنك إغلاق النافذة أو بدء تحليل سريع جديد.' : 'The import was stopped manually. You can close this window or start a new quick analysis.')
        : uploadStatus === 'done'
          ? (isAr ? 'سيتم فتح مساحة العمل تلقائياً بعد لحظة قصيرة.' : 'The workspace will open automatically shortly.')
          : (isAr ? 'سيبقى هذا المؤشر مفتوحاً حتى نعرف أين وصلت عملية الاستيراد.' : 'This panel stays open so you can see where the import currently stands.');

  return (
    <div className="space-y-6 pb-8">
      {isImportModalOpen && (
        <DocumentImportModal
          isOpen={isImportModalOpen}
          lang={lang}
          status={uploadStatus === 'idle' ? 'uploading' : uploadStatus}
          phaseLabel={uploadPhaseLabel}
          statusMessage={uploadStatusMessage}
          elapsedMs={uploadElapsedMs}
          error={uploadError}
          duplicateInfo={uploadDuplicateInfo}
          documentCases={uploadDocumentCases}
          isBusy={isUploading}
          onStop={() => stopImportProcess(false)}
          onClose={() => {
            if (isUploading) {
              stopImportProcess(true);
              return;
            }
            resetImportState();
          }}
          statusDescription={importStatusDescription}
          footerHint={importFooterHint}
        />
      )}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text-main">{isAr ? 'التحليل السريع' : 'Quick Analysis'}</h1>
          <p className="text-sm text-text-muted mt-1">
            {isAr
              ? 'ارفع ملف نص بدون ربطه بشركة، وسيتم تحليله بنفس محرك التحليل الذكي.'
              : 'Upload a script without linking to a company and run the same smart analysis pipeline.'}
          </p>
        </div>
        <div className="inline-flex">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept=".pdf,.docx,.txt"
            onChange={onPickFile}
            disabled={isUploading}
          />
          <Button
            className="gap-2"
            disabled={isUploading}
            type="button"
            onClick={() => fileInputRef.current?.click()}
          >
            {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {isUploading ? (isAr ? 'جاري الرفع...' : 'Uploading...') : (isAr ? 'رفع ملف للتحليل السريع' : 'Upload Script File')}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <History className="w-4 h-4" />
            {isAr ? 'سجل التحليل السريع' : 'Quick Analysis History'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="py-8 flex items-center justify-center text-text-muted">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : history.length === 0 ? (
            <p className="text-sm text-text-muted py-2">{emptyText}</p>
          ) : (
            history.map(({ script, latestReport }) => (
              <div key={script.id} className="rounded-lg border border-border p-3 bg-surface">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="font-semibold text-text-main truncate">{script.title}</p>
                    <p className="text-xs text-text-muted mt-0.5">
                      {formatDate(new Date(script.createdAt), { lang })} {formatTime(new Date(script.createdAt), { lang })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    <Badge variant={latestReport ? 'warning' : 'outline'} className="text-[10px]">
                      {latestReport
                        ? `${latestReport.findingsCount ?? 0} ${isAr ? 'ملاحظة' : 'findings'}`
                        : (isAr ? 'بدون تقرير' : 'No report')}
                    </Badge>
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={() => navigate(`/workspace/${script.id}?quick=1`)}>
                      <PlayCircle className="w-3.5 h-3.5" />
                      {isAr ? 'فتح مساحة العمل' : 'Open Workspace'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 border-error/30 text-error hover:bg-error/10"
                      onClick={() => handleDeleteQuickAnalysis(script)}
                      disabled={deletingScriptId === script.id}
                    >
                      {deletingScriptId === script.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      {isAr ? 'حذف' : 'Delete'}
                    </Button>
                    {latestReport && (
                      <Button
                        size="sm"
                        className="gap-1.5"
                        onClick={() => navigate(`/report/${latestReport.id}?by=id&quick=1`)}
                      >
                        <FileText className="w-3.5 h-3.5" />
                        {isAr ? 'التقرير' : 'Report'}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
