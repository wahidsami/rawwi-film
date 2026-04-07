import { CheckCircle2, Loader2, Pause, XCircle } from 'lucide-react';

import type { DuplicateScriptCheckResponse } from '@/api';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import {
  type ImportDocumentCases,
  type ImportStatus,
  formatImportDocumentCaseSummary,
  formatImportDuplicateDate,
  formatImportElapsed,
  formatPageListSummary,
} from '@/utils/documentImport';

type Props = {
  isOpen: boolean;
  lang: 'ar' | 'en';
  status: Exclude<ImportStatus, 'idle'>;
  phaseLabel: string;
  statusMessage: string;
  elapsedMs: number;
  error: string | null;
  duplicateInfo: DuplicateScriptCheckResponse | null;
  documentCases: ImportDocumentCases | null;
  isBusy: boolean;
  onStop: () => void;
  onClose: () => void;
  title?: string;
  statusDescription: string;
  footerHint: string;
};

export function DocumentImportModal({
  isOpen,
  lang,
  status,
  phaseLabel,
  statusMessage,
  elapsedMs,
  error,
  duplicateInfo,
  documentCases,
  isBusy,
  onStop,
  onClose,
  title,
  statusDescription,
  footerHint,
}: Props) {
  const tone = status === 'failed' ? 'error' : status === 'done' ? 'success' : status === 'aborted' ? 'outline' : 'info';
  const badgeLabel =
    status === 'failed'
      ? lang === 'ar'
        ? 'فشل'
        : 'Failed'
      : status === 'aborted'
        ? lang === 'ar'
          ? 'متوقف'
          : 'Stopped'
        : status === 'done'
          ? lang === 'ar'
            ? 'مكتمل'
            : 'Done'
          : status === 'extracting'
            ? lang === 'ar'
              ? 'استخراج'
              : 'Extracting'
            : lang === 'ar'
              ? 'رفع'
              : 'Uploading';
  const operationLabel =
    status === 'extracting'
      ? (lang === 'ar' ? 'استخراج ومعالجة' : 'Extraction')
      : status === 'aborted'
        ? (lang === 'ar' ? 'تم الإيقاف' : 'Stopped')
        : status === 'done'
          ? (lang === 'ar' ? 'اكتمل' : 'Completed')
          : status === 'failed'
            ? (lang === 'ar' ? 'توقف' : 'Stopped')
            : (lang === 'ar' ? 'رفع وتجهيز' : 'Upload');

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title || (lang === 'ar' ? 'استيراد المستند' : 'Document Import')}
      className="max-w-2xl"
    >
      <div className="space-y-5" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        <div className="flex items-start justify-between gap-4 rounded-2xl border border-border bg-background px-4 py-4">
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-semibold text-text-main">{phaseLabel || (lang === 'ar' ? 'جاري الاستيراد' : 'Import in progress')}</p>
            <p className="text-sm text-text-muted leading-6">
              {statusMessage || (lang === 'ar' ? 'يجري تجهيز الملف وعرض حالته هنا.' : 'The file is being processed and its status will appear here.')}
            </p>
          </div>
          <Badge
            variant={tone === 'error' ? 'error' : tone === 'success' ? 'success' : 'outline'}
            className="shrink-0"
          >
            {badgeLabel}
          </Badge>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-border bg-background px-4 py-3">
            <p className="text-xs text-text-muted">{lang === 'ar' ? 'الحالة' : 'Status'}</p>
            <p className="mt-1 text-base font-semibold text-text-main">{phaseLabel || '—'}</p>
          </div>
          <div className="rounded-2xl border border-border bg-background px-4 py-3">
            <p className="text-xs text-text-muted">{lang === 'ar' ? 'المدة' : 'Elapsed'}</p>
            <p className="mt-1 text-base font-semibold text-text-main">{formatImportElapsed(elapsedMs, lang)}</p>
          </div>
          <div className="rounded-2xl border border-border bg-background px-4 py-3">
            <p className="text-xs text-text-muted">{lang === 'ar' ? 'نوع العملية' : 'Operation'}</p>
            <p className="mt-1 text-base font-semibold text-text-main">{operationLabel}</p>
          </div>
        </div>

        <div className="space-y-3 rounded-2xl border border-border bg-surface px-4 py-4">
          <div className="flex items-center gap-3">
            {status === 'failed' ? (
              <XCircle className="h-5 w-5 shrink-0 text-error" />
            ) : status === 'aborted' ? (
              <Pause className="h-5 w-5 shrink-0 text-warning" />
            ) : status === 'done' ? (
              <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
            ) : (
              <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" />
            )}
            <p className="text-sm text-text-main">{statusDescription}</p>
          </div>
          {status === 'extracting' && (
            <div className="h-2 overflow-hidden rounded-full bg-border">
              <div className="h-full w-2/3 animate-pulse rounded-full bg-primary" />
            </div>
          )}
          {error && (
            <div className="rounded-xl border border-error/25 bg-error/5 px-4 py-3">
              <p className="mb-1 text-xs font-semibold text-error">{lang === 'ar' ? 'رسالة الخطأ' : 'Error message'}</p>
              <p className="whitespace-pre-wrap break-words text-sm text-text-main">{error}</p>
            </div>
          )}
          {duplicateInfo?.exactMatch && (
            <div className="space-y-3 rounded-xl border border-warning/25 bg-warning/5 px-4 py-3">
              <div className="space-y-1">
                <p className="text-xs font-semibold text-warning">
                  {lang === 'ar' ? 'تم العثور على نسخة مطابقة بالمحتوى نفسه' : 'Exact content duplicate found'}
                </p>
                <p className="text-sm leading-6 text-text-main">
                  {lang === 'ar'
                    ? 'هذا النص موجود مسبقاً داخل النظام، حتى لو كان اسم الملف مختلفاً. راجع السجلات التالية قبل متابعة العمل عليه كنص جديد.'
                    : 'This exact script content already exists in the system, even if the file name is different. Review these records before treating it as a new script.'}
                </p>
              </div>
              {duplicateInfo.matches.length > 0 ? (
                <>
                  <div className="space-y-2">
                    {duplicateInfo.matches.slice(0, 3).map((match) => (
                      <div key={match.versionId} className="space-y-1.5 rounded-xl border border-border bg-background px-3 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-text-main">{match.scriptTitle}</p>
                          <Badge variant="outline" className="text-[10px]">
                            {match.sameScript
                              ? (lang === 'ar' ? 'داخل نفس النص' : 'Same script')
                              : (lang === 'ar' ? 'نص آخر' : 'Another script')}
                          </Badge>
                          {match.analyzedBefore && (
                            <Badge variant="outline" className="text-[10px]">
                              {lang === 'ar' ? 'محلل سابقاً' : 'Analyzed before'}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-text-muted">
                          {[
                            match.contextType === 'quick_analysis'
                              ? (lang === 'ar' ? 'تحليل سريع' : 'Quick analysis')
                              : match.contextLabel || match.companyName,
                            match.sourceFileName,
                            `${lang === 'ar' ? 'تاريخ الاستيراد' : 'Imported'}: ${formatImportDuplicateDate(match.createdAt, lang)}`,
                          ].filter(Boolean).join(' • ')}
                        </p>
                        {(match.importedByName || match.contextType) && (
                          <p className="text-xs text-text-muted">
                            {[
                              match.importedByName
                                ? (lang === 'ar' ? `بواسطة: ${match.importedByName}` : `Imported by: ${match.importedByName}`)
                                : null,
                              match.contextType === 'quick_analysis'
                                ? (lang === 'ar' ? 'العميل: تحليل سريع' : 'Client: Quick analysis')
                                : match.contextLabel
                                  ? (lang === 'ar' ? `العميل: ${match.contextLabel}` : `Client: ${match.contextLabel}`)
                                  : null,
                            ].filter(Boolean).join(' • ')}
                          </p>
                        )}
                        {match.latestAnalysisAt && (
                          <p className="text-xs text-text-muted">
                            {lang === 'ar'
                              ? `آخر تحليل: ${formatImportDuplicateDate(match.latestAnalysisAt, lang)}${match.latestReviewerName ? ` • ${match.latestReviewerName}` : ''}`
                              : `Latest analysis: ${formatImportDuplicateDate(match.latestAnalysisAt, lang)}${match.latestReviewerName ? ` • ${match.latestReviewerName}` : ''}`}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                  {duplicateInfo.matches.length > 3 && (
                    <p className="text-xs text-text-muted">
                      {lang === 'ar'
                        ? `وهناك أيضاً ${duplicateInfo.matches.length - 3} سجل/سجلات إضافية مطابقة بنفس المحتوى.`
                        : `There are also ${duplicateInfo.matches.length - 3} more matching record(s).`}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-xs text-text-muted">
                  {lang === 'ar'
                    ? 'رُصدت نسخة مطابقة في السجلات، لكن تفاصيلها غير متاحة لهذا المستخدم.'
                    : 'An exact duplicate exists in the records, but its details are not visible to this user.'}
                </p>
              )}
            </div>
          )}
          {documentCases && (
            <div className="space-y-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
              <div className="space-y-1">
                <p className="text-xs font-semibold text-primary">
                  {lang === 'ar' ? 'تنبيهات بنية المستند' : 'Document structure warnings'}
                </p>
                <p className="text-sm leading-6 text-text-main">
                  {formatImportDocumentCaseSummary(documentCases, lang)}
                </p>
              </div>
              {documentCases.probableTablePages.length > 0 && (
                <p className="text-xs text-text-muted">
                  {lang === 'ar'
                    ? `صفحات محتملة الجداول: ${documentCases.probableTablePages.join('، ')}`
                    : `Probable table pages: ${documentCases.probableTablePages.join(', ')}`}
                </p>
              )}
              {documentCases.multiColumnPages.length > 0 && (
                <p className="text-xs text-text-muted">
                  {lang === 'ar'
                    ? `صفحات متعددة الأعمدة: ${documentCases.multiColumnPages.join('، ')}`
                    : `Probable multi-column pages: ${documentCases.multiColumnPages.join(', ')}`}
                </p>
              )}
              {documentCases.formLayoutPages.length > 0 && (
                <p className="text-xs text-text-muted">
                  {lang === 'ar'
                    ? `صفحات بنمط نموذج/حقول: ${documentCases.formLayoutPages.join('، ')}`
                    : `Probable form-like pages: ${documentCases.formLayoutPages.join(', ')}`}
                </p>
              )}
              {documentCases.scanAnnotationPages.length > 0 && (
                <p className="text-xs text-text-muted">
                  {lang === 'ar'
                    ? `صفحات ممسوحة/تعليقات بصرية: ${documentCases.scanAnnotationPages.join('، ')}`
                    : `Probable scan/annotation-heavy pages: ${documentCases.scanAnnotationPages.join(', ')}`}
                </p>
              )}
              {documentCases.repeatedHeaderFooterPages.length > 0 && (
                <p className="text-xs text-text-muted">
                  {formatPageListSummary(documentCases.repeatedHeaderFooterPages, documentCases.totalPages, lang, {
                    almostAllAr: 'تكررت الترويسات/التذييلات في معظم الصفحات',
                    almostAllEn: 'Repeated headers/footers on most pages',
                    pagesAr: 'صفحات تحتوي على ترويسات/تذييلات متكررة',
                    pagesEn: 'Pages with repeated headers/footers',
                  })}
                </p>
              )}
            </div>
          )}
          <div className="space-y-1 rounded-xl border border-info/20 bg-info/5 px-4 py-3">
            <p className="text-xs font-semibold text-info">
              {lang === 'ar' ? 'تنبيه تنسيقي' : 'Compatibility note'}
            </p>
            <p className="text-sm leading-6 text-text-main">
              {lang === 'ar'
                ? 'لأفضل توافقية وجودة تحليل، يُوصى باستخدام ملفات Word بصيغة DOC / DOCX متى ما كانت متاحة، لأنها تعطي نتائج أكثر استقرارًا من بعض ملفات PDF ذات البنية البصرية المعقدة.'
                : 'For best compatibility and analysis quality, Word documents in DOC / DOCX format are recommended when available, because they are often more stable than visually complex PDFs.'}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-text-muted">{footerHint}</p>
          <div className="flex items-center gap-2">
            {isBusy && (
              <Button variant="danger" onClick={onStop}>
                {lang === 'ar' ? 'إيقاف' : 'Stop'}
              </Button>
            )}
            <Button variant="ghost" onClick={onClose}>
              {lang === 'ar' ? 'إغلاق' : 'Close'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
