import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Upload, Loader2, FileText, History, PlayCircle } from 'lucide-react';

import { useLangStore } from '@/store/langStore';
import { scriptsApi, reportsApi } from '@/api';
import type { Script } from '@/api/models';
import type { ReportListItem } from '@/api/models';
import { extractDocx, extractTextFromPdf } from '@/utils/documentExtract';
import { formatDate, formatTime } from '@/utils/dateFormat';
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
  const navigate = useNavigate();
  const [history, setHistory] = useState<QuickHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
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
    try {
      const quickScript = await scriptsApi.createQuickScript({
        title: fileTitle(file.name),
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
        source_file_name: file.name,
        source_file_type: sourceFileType,
        source_file_size: file.size,
        source_file_path: storagePath,
        source_file_url: storagePath,
      });

      if (ext === 'txt') {
        const text = await file.text();
        await scriptsApi.extractText(version.id, text, { enqueueAnalysis: false });
      } else if (ext === 'docx') {
        const { plain, html } = await extractDocx(file);
        if (!plain?.trim()) throw new Error(isAr ? 'لم يتم العثور على نص داخل DOCX' : 'No text found in DOCX');
        await scriptsApi.extractText(version.id, plain, { enqueueAnalysis: false, contentHtml: html?.trim() || null });
      } else {
        const text = await extractTextFromPdf(file);
        if (!text?.trim()) throw new Error(isAr ? 'لم يتم العثور على نص داخل PDF' : 'No text found in PDF');
        await scriptsApi.extractText(version.id, text, { enqueueAnalysis: false });
      }

      await scriptsApi.updateScript(quickScript.id, { currentVersionId: version.id });
      await scriptsApi.createTask(version.id, { forceFresh: true });
      toast.success(isAr ? 'تم بدء التحليل السريع بنجاح' : 'Quick analysis started successfully');
      await loadHistory();
      navigate(`/workspace/${quickScript.id}`);
    } catch (err: any) {
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
                  <div className="flex items-center gap-2">
                    <Badge variant={latestReport ? 'warning' : 'outline'} className="text-[10px]">
                      {latestReport
                        ? `${latestReport.findingsCount ?? 0} ${isAr ? 'ملاحظة' : 'findings'}`
                        : (isAr ? 'بدون تقرير' : 'No report')}
                    </Badge>
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={() => navigate(`/workspace/${script.id}`)}>
                      <PlayCircle className="w-3.5 h-3.5" />
                      {isAr ? 'فتح مساحة العمل' : 'Open Workspace'}
                    </Button>
                    {latestReport && (
                      <Button
                        size="sm"
                        className="gap-1.5"
                        onClick={() => navigate(`/report/${latestReport.id}?by=id`)}
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
