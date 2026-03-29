import { formatDate, formatTime } from '@/utils/dateFormat';

export type ImportStatus = 'idle' | 'uploading' | 'extracting' | 'done' | 'failed' | 'aborted';

export function formatImportElapsed(ms: number, lang: 'ar' | 'en'): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts: string[] = [];
  if (hours > 0) parts.push(lang === 'ar' ? `${hours} س` : `${hours}h`);
  if (minutes > 0 || hours > 0) parts.push(lang === 'ar' ? `${minutes} د` : `${minutes}m`);
  parts.push(lang === 'ar' ? `${seconds} ث` : `${seconds}s`);
  return parts.join(' ');
}

function safeImportDuplicateDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatImportDuplicateDate(value: string | null | undefined, lang: 'ar' | 'en'): string {
  const parsed = safeImportDuplicateDate(value);
  if (!parsed) return '—';
  return `${formatDate(parsed, { lang })} • ${formatTime(parsed, { lang })}`;
}

export function formatExtractionProgressMessage(
  progress: Record<string, unknown> | undefined,
  lang: 'ar' | 'en',
): string | null {
  if (!progress) return null;
  const phase = typeof progress.phase === 'string' ? progress.phase : '';
  const currentPage = typeof progress.currentPage === 'number' ? progress.currentPage : null;
  const totalPages = typeof progress.totalPages === 'number' ? progress.totalPages : null;
  const ocrPagesUsed = typeof progress.ocrPagesUsed === 'number' ? progress.ocrPagesUsed : null;
  const ocrBudget = typeof progress.ocrBudget === 'number' ? progress.ocrBudget : null;

  if (phase === 'queued_for_backend_pdf') {
    return lang === 'ar'
      ? 'تمت جدولة استخراج PDF في الخلفية. ننتظر بدء معالجة الصفحات.'
      : 'PDF extraction was queued in the backend. Waiting for page processing to start.';
  }

  if (phase === 'preparing_pdf') {
    return lang === 'ar'
      ? 'يجري تجهيز ملف PDF واختيار أفضل طبقة نص قبل بدء معالجة الصفحات.'
      : 'Preparing the PDF and choosing the best text layer before page processing starts.';
  }

  if ((phase === 'processing_page' || phase === 'ocr_page') && currentPage != null) {
    const pagePart =
      totalPages != null
        ? (lang === 'ar' ? `الصفحة ${currentPage} من ${totalPages}` : `Page ${currentPage} of ${totalPages}`)
        : (lang === 'ar' ? `الصفحة ${currentPage}` : `Page ${currentPage}`);
    const ocrPart =
      ocrPagesUsed != null && ocrBudget != null
        ? ` • OCR ${ocrPagesUsed}/${ocrBudget}`
        : '';
    return phase === 'ocr_page'
      ? lang === 'ar'
        ? `يجري الآن تشغيل OCR على ${pagePart}${ocrPart}.`
        : `Running OCR on ${pagePart}${ocrPart}.`
      : lang === 'ar'
        ? `يجري الآن استخراج ومعالجة ${pagePart}${ocrPart}.`
        : `Extracting and processing ${pagePart}${ocrPart}.`;
  }

  if (phase === 'saving_pages') {
    return lang === 'ar'
      ? 'اكتمل استخراج الصفحات ويجري الآن حفظ النص النهائي في مساحة العمل.'
      : 'Page extraction completed and the final text is now being saved to the workspace.';
  }

  if (phase === 'cancelled') {
    return lang === 'ar'
      ? 'تم إيقاف استخراج المستند من الخادم.'
      : 'Document extraction was cancelled on the server.';
  }

  if (phase === 'failed') {
    return lang === 'ar'
      ? 'فشلت عملية استخراج المستند في الخلفية.'
      : 'Document extraction failed in the backend.';
  }

  return null;
}

export type ImportDocumentCases = {
  flags: string[];
  totalPages: number;
  probableTablePages: number[];
  probableTableCount: number;
  multiColumnPages: number[];
  multiColumnCount: number;
  formLayoutPages: number[];
  formLayoutCount: number;
  scanAnnotationPages: number[];
  scanAnnotationCount: number;
  repeatedHeaderFooterPages: number[];
  repeatedHeaderFooterCount: number;
  htmlTableDetected: boolean;
};

export function parseImportDocumentCases(progress: Record<string, unknown> | undefined): ImportDocumentCases | null {
  const raw = progress?.documentCases;
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  const flags = Array.isArray(value.flags) ? value.flags.filter((flag): flag is string => typeof flag === 'string') : [];
  const probableTablePages = Array.isArray(value.probableTablePages)
    ? value.probableTablePages.filter((page): page is number => typeof page === 'number')
    : [];
  const multiColumnPages = Array.isArray(value.multiColumnPages)
    ? value.multiColumnPages.filter((page): page is number => typeof page === 'number')
    : [];
  const formLayoutPages = Array.isArray(value.formLayoutPages)
    ? value.formLayoutPages.filter((page): page is number => typeof page === 'number')
    : [];
  const scanAnnotationPages = Array.isArray(value.scanAnnotationPages)
    ? value.scanAnnotationPages.filter((page): page is number => typeof page === 'number')
    : [];
  const repeatedHeaderFooterPages = Array.isArray(value.repeatedHeaderFooterPages)
    ? value.repeatedHeaderFooterPages.filter((page): page is number => typeof page === 'number')
    : [];
  const totalPages = typeof value.totalPages === 'number' ? value.totalPages : Math.max(
    probableTablePages.length,
    multiColumnPages.length,
    formLayoutPages.length,
    scanAnnotationPages.length,
    repeatedHeaderFooterPages.length,
  );
  const probableTableCount =
    typeof value.probableTableCount === 'number' ? value.probableTableCount : probableTablePages.length;
  const multiColumnCount =
    typeof value.multiColumnCount === 'number' ? value.multiColumnCount : multiColumnPages.length;
  const formLayoutCount =
    typeof value.formLayoutCount === 'number' ? value.formLayoutCount : formLayoutPages.length;
  const scanAnnotationCount =
    typeof value.scanAnnotationCount === 'number' ? value.scanAnnotationCount : scanAnnotationPages.length;
  const repeatedHeaderFooterCount =
    typeof value.repeatedHeaderFooterCount === 'number' ? value.repeatedHeaderFooterCount : repeatedHeaderFooterPages.length;
  const htmlTableDetected = value.htmlTableDetected === true;
  if (!flags.length && probableTablePages.length === 0 && multiColumnPages.length === 0 && formLayoutPages.length === 0 && scanAnnotationPages.length === 0 && repeatedHeaderFooterPages.length === 0 && !htmlTableDetected) return null;
  return {
    flags,
    totalPages,
    probableTablePages,
    probableTableCount,
    multiColumnPages,
    multiColumnCount,
    formLayoutPages,
    formLayoutCount,
    scanAnnotationPages,
    scanAnnotationCount,
    repeatedHeaderFooterPages,
    repeatedHeaderFooterCount,
    htmlTableDetected,
  };
}

function shouldCompactPageList(pageCount: number, totalPages: number): boolean {
  if (pageCount === 0) return false;
  if (pageCount >= 20) return true;
  if (totalPages > 0 && pageCount / totalPages >= 0.7) return true;
  return false;
}

export function formatPageListSummary(
  pages: number[],
  totalPages: number,
  lang: 'ar' | 'en',
  labels: { almostAllAr: string; almostAllEn: string; pagesAr: string; pagesEn: string },
): string {
  if (pages.length === 0) return '';
  if (totalPages > 0 && pages.length === totalPages) {
    return lang === 'ar' ? 'جميع الصفحات تقريباً' : 'Nearly all pages';
  }
  if (shouldCompactPageList(pages.length, totalPages)) {
    return lang === 'ar'
      ? `${labels.almostAllAr} (${pages.length} صفحة)`
      : `${labels.almostAllEn} (${pages.length} pages)`;
  }
  return lang === 'ar'
    ? `${labels.pagesAr}: ${pages.join('، ')}`
    : `${labels.pagesEn}: ${pages.join(', ')}`;
}

export function formatImportDocumentCaseSummary(cases: ImportDocumentCases, lang: 'ar' | 'en'): string {
  if (cases.probableTableCount > 0 || cases.multiColumnCount > 0 || cases.formLayoutCount > 0 || cases.scanAnnotationCount > 0) {
    const parts: string[] = [];
    if (cases.probableTableCount > 0) {
      parts.push(lang === 'ar' ? `${cases.probableTableCount} صفحة جدول/أعمدة` : `${cases.probableTableCount} table-layout page(s)`);
    }
    if (cases.multiColumnCount > 0) {
      parts.push(lang === 'ar' ? `${cases.multiColumnCount} صفحة متعددة الأعمدة` : `${cases.multiColumnCount} multi-column page(s)`);
    }
    if (cases.formLayoutCount > 0) {
      parts.push(lang === 'ar' ? `${cases.formLayoutCount} صفحة بنمط نموذج` : `${cases.formLayoutCount} form-like page(s)`);
    }
    if (cases.scanAnnotationCount > 0) {
      parts.push(lang === 'ar' ? `${cases.scanAnnotationCount} صفحة ممسوحة/تعليقات بصرية` : `${cases.scanAnnotationCount} scan/annotation-heavy page(s)`);
    }
    return lang === 'ar'
      ? `رصد النظام ${parts.join('، ')}. قد تحتاج هذه الصفحات إلى مراجعة يدوية لأن الاستيراد يحافظ على النص أكثر من البنية الأصلية.`
      : `The importer detected ${parts.join(', ')}. Review these pages manually because extraction preserves text better than full original structure.`;
  }
  if (cases.repeatedHeaderFooterCount > 0) {
    const touchesMostPages =
      cases.totalPages > 0 && cases.repeatedHeaderFooterCount / cases.totalPages >= 0.7;
    return lang === 'ar'
      ? touchesMostPages
        ? `رصد النظام ترويسات أو تذييلات متكررة في معظم صفحات المستند (${cases.repeatedHeaderFooterCount} من ${cases.totalPages}). سيتم التعامل معها بحذر لأنها قد تختلط مع متن الصفحة إن لم تُستبعد.`
        : `رصد النظام ترويسات أو تذييلات متكررة في ${cases.repeatedHeaderFooterCount} صفحة، وقد تظهر داخل النص المستخرج وتحتاج إلى تجاهل أو مراجعة.`
      : touchesMostPages
        ? `The importer detected repeated headers or footers across most of the document (${cases.repeatedHeaderFooterCount} of ${cases.totalPages} pages). They need careful handling so they do not pollute extracted body text.`
        : `The importer detected repeated headers or footers on ${cases.repeatedHeaderFooterCount} page(s). They may appear in extracted text and need review.`;
  }
  if (cases.htmlTableDetected) {
    return lang === 'ar'
      ? 'رصد النظام جداول داخل ملف Word. قد لا تبقى كل الخلايا بنفس البنية الأصلية بعد التحويل إلى النص التحليلي.'
      : 'The importer detected tables in the Word document. Not every cell will keep its original structure after conversion to analysis text.';
  }
  return lang === 'ar'
    ? 'رصد النظام بنية مستندية تحتاج إلى مراجعة يدوية.'
    : 'The importer detected document structure that may need manual review.';
}

export function createImportAbortError(): Error {
  const error = new Error('Import aborted');
  error.name = 'AbortError';
  return error;
}

export function isImportAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.message === 'Import aborted');
}

export function safeUploadFileName(fileName: string): string {
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
