import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Upload, Loader2, FileText, History, PlayCircle, Trash2 } from 'lucide-react';

import { useLangStore } from '@/store/langStore';
import { useDataStore } from '@/store/dataStore';
import { scriptsApi, reportsApi } from '@/api';
import type { Script } from '@/api/models';
import type { ReportListItem } from '@/api/models';
import { formatDate, formatTime } from '@/utils/dateFormat';
import { extractDocx, extractTextFromPdfPerPage } from '@/utils/documentExtract';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

type QuickHistoryItem = {
  script: Script;
  latestReport: ReportListItem | null;
};

function fileTitle(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, '').trim();
  return base || 'Quick Analysis';
}

function safeUploadFileName(fileName: string): string {
  const trimmed = fileName.trim();
  const dotIdx = trimmed.lastIndexOf('.');
  const ext = dotIdx > 0 ? trimmed.slice(dotIdx).toLowerCase() : '';
  const base = (dotIdx > 0 ? trimmed.slice(0, dotIdx) : trimmed)
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 64);
  const safeBase = base || 'quick_analysis';
  return `${safeBase}_${Date.now()}${ext}`;
}

export function QuickAnalysis() {
  const { lang } = useLangStore();
  const pushScript = useDataStore((s) => s.pushScript);
  const navigate = useNavigate();
  const [history, setHistory] = useState<QuickHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deletingScriptId, setDeletingScriptId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const isAr = lang === 'ar';

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

    setUploading(true);
    let quickScript: { id: string; title: string; type: string; status: string } | null = null;
    try {
      const normalizedName = file.name.normalize('NFC');
      quickScript = await scriptsApi.createQuickScript({
        title: fileTitle(normalizedName),
        type: 'Film',
        status: 'draft',
      });

      const uploadName = safeUploadFileName(file.name);
      const { url, path } = await scriptsApi.getUploadUrl(uploadName);
      await scriptsApi.uploadToSignedUrl(file, url);
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
      });

      if (ext === 'txt') {
        const text = await file.text();
        await scriptsApi.extractText(version.id, text, { enqueueAnalysis: false });
      } else if (ext === 'pdf') {
        const pdfPages = await extractTextFromPdfPerPage(file);
        const res = await scriptsApi.extractText(version.id, undefined, {
          pages: pdfPages.map((p) => ({
            pageNumber: p.pageNumber,
            text: p.text,
            html: p.html || undefined,
          })),
          enqueueAnalysis: false,
        });
        if ((res as { error?: string })?.error) {
          throw new Error((res as { error: string }).error);
        }
        if (!(res as { extracted_text?: string })?.extracted_text?.trim()) {
          throw new Error(isAr ? 'لم يتم العثور على نص في الملف' : 'No text found in document');
        }
      } else if (ext === 'docx') {
        const { plain, html } = await extractDocx(file);
        const res = await scriptsApi.extractText(version.id, plain, {
          contentHtml: html,
          enqueueAnalysis: false,
        });
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
      const scriptForStore: Script = { ...quickScript, currentVersionId: version.id };
      pushScript(scriptForStore);
      toast.success(isAr ? 'تم تجهيز النص. ابدأ التحليل من مساحة العمل.' : 'Script prepared. Start analysis from workspace.');
      await loadHistory();
      navigate(`/workspace/${quickScript.id}?quick=1`);
    } catch (err: any) {
      if (quickScript?.id) {
        try {
          await scriptsApi.deleteScript(quickScript.id);
        } catch (_) {}
        await loadHistory();
      }
      toast.error(err?.message ?? (isAr ? 'فشل التحليل السريع' : 'Quick analysis failed'));
    } finally {
      setUploading(false);
      if (e.target) e.target.value = '';
    }
  };

  const emptyText = useMemo(
    () => (isAr ? 'لا يوجد سجل تحليل سريع بعد.' : 'No quick analysis history yet.'),
    [isAr],
  );

  return (
    <div className="space-y-6 pb-8">
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
            disabled={uploading}
          />
          <Button
            className="gap-2"
            disabled={uploading}
            type="button"
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploading ? (isAr ? 'جاري الرفع...' : 'Uploading...') : (isAr ? 'رفع ملف للتحليل السريع' : 'Upload Script File')}
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
