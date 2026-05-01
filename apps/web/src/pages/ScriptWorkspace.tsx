import { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useLangStore } from '@/store/langStore';
import { useDataStore, Finding, type Script } from '@/store/dataStore';
import { useAuthStore } from '@/store/authStore';
import { useSettingsStore } from '@/store/settingsStore';
import { formatDate, formatTime } from '@/utils/dateFormat';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { Badge } from '@/components/ui/Badge';
import { DocumentImportModal } from '@/components/import/DocumentImportModal';
import { ArrowLeft, Bot, ShieldAlert, Check, FileText, Upload, Loader2, CheckCircle2, XCircle, ChevronDown, ChevronUp, Trash2, Download, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Pause, Play, Square, Search } from 'lucide-react';
import { cn } from '@/utils/cn';
import { getActionablePolicyArticles } from '@/data/policyMap';
import {
  getLegacyPolicyArticleIdForViolationTypeId,
  getViolationTypeIdFromLegacyPolicyArticle,
  resolveViolationTypeId,
  violationTypeLabel,
  violationTypesForChecklist,
  type ViolationTypeId,
} from '@/data/violationTypes';
import { getScriptDecisionCapabilities } from '@/utils/scriptDecisionCapabilities';
import { extractDocxWithPages } from '@/utils/documentExtract';
import { PDF_EXTRACTION_INTERVAL_MS, PDF_EXTRACTION_TIMEOUT_MS, waitForVersionExtraction } from '@/utils/waitForVersionExtraction';
import {
  DEFAULT_SCRIPT_EDITOR_FONT_STACK,
  sanitizeFontStackForCss,
} from '@/utils/pdfDisplayFont';
import { getPublicAnalysisErrorMessage } from '@/utils/raawiAiError';



const policyArticlesForForm = getActionablePolicyArticles();
const DEFAULT_ACTIONABLE_ARTICLE_ID = policyArticlesForForm[0]?.articleId ?? 4;
const VIOLATION_TYPES_OPTIONS = violationTypesForChecklist();
const DEFAULT_VIOLATION_TYPE_ID = VIOLATION_TYPES_OPTIONS[0]?.id ?? 'other';

/**
 * Display atom code for UI: PolicyMap style "X-Y" or legacy "X.Y".
 */
function formatAtomDisplay(articleId: number, atomId: string | null): string {
  if (!atomId || !atomId.trim()) return String(articleId);
  const a = atomId.trim();
  if (/^\d+-\d+$/.test(a)) return a;
  return a.includes('.') ? a : `${articleId}.${a}`;
}

function getFindingDisplayTitle(finding: {
  titleAr?: string | null;
  descriptionAr?: string | null;
  excerpt?: string | null;
  evidenceSnippet?: string | null;
  articleId?: number | null;
  atomId?: string | null;
  primaryPolicyAtomId?: string | null;
  source?: string | null;
}, lang: 'ar' | 'en' = 'ar'): string {
  const title = (finding.titleAr ?? "").trim();
  const description = (finding.descriptionAr ?? "").trim();
  const excerpt = (finding.excerpt ?? "").trim();
  const evidence = (finding.evidenceSnippet ?? "").trim();
  const legacyType =
    getViolationTypeIdFromLegacyPolicyArticle(
      finding.articleId ?? null,
      finding.atomId ?? finding.primaryPolicyAtomId ?? null
  );
  if (legacyType) {
    return violationTypeLabel(legacyType, lang);
  }

  const resolvedType = resolveViolationTypeId(title) ?? resolveViolationTypeId(description) ?? resolveViolationTypeId(excerpt) ?? resolveViolationTypeId(evidence);
  if (resolvedType) {
    return violationTypeLabel(resolvedType, lang);
  }

  if (title) return title;
  if (description) return description;
  if (excerpt) return excerpt;
  if (evidence) return evidence;
  return "مخالفة محتوى";
}

function formatAnalysisElapsed(ms: number, lang: 'ar' | 'en'): string {
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

function formatImportElapsed(ms: number, lang: 'ar' | 'en'): string {
  return formatAnalysisElapsed(ms, lang);
}

function formatRelativeDuration(ms: number, lang: 'ar' | 'en'): string {
  return formatAnalysisElapsed(ms, lang);
}

function formatImportDuplicateDate(value: string | null | undefined, lang: 'ar' | 'en'): string {
  if (!value || !value.trim()) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return `${formatDate(parsed, { lang })} • ${formatTime(parsed, { lang })}`;
}

function formatExtractionProgressMessage(
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
        ? lang === 'ar'
          ? ` • OCR ${ocrPagesUsed}/${ocrBudget}`
          : ` • OCR ${ocrPagesUsed}/${ocrBudget}`
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

type ImportDocumentCases = {
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

function parseImportDocumentCases(progress: Record<string, unknown> | undefined): ImportDocumentCases | null {
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

function formatPageListSummary(
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

function formatImportDocumentCaseSummary(cases: ImportDocumentCases, lang: 'ar' | 'en'): string {
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

type WorkspaceDocumentFlagInfo = {
  flag: string;
  labelAr: string;
  labelEn: string;
  descriptionAr: string;
  descriptionEn: string;
};

const WORKSPACE_DOCUMENT_FLAG_MAP: Record<string, WorkspaceDocumentFlagInfo> = {
  probable_table_detected: {
    flag: 'probable_table_detected',
    labelAr: 'جدول محتمل',
    labelEn: 'Probable table',
    descriptionAr: 'هذه الصفحة تبدو كجدول أو أعمدة منظمة. قد يبقى النص صحيحاً بينما تضيع بنية الصفوف والخلايا.',
    descriptionEn: 'This page looks like a table or structured columns. The text may survive while row/cell structure is lost.',
  },
  probable_multi_column_layout: {
    flag: 'probable_multi_column_layout',
    labelAr: 'أعمدة متعددة',
    labelEn: 'Multi-column',
    descriptionAr: 'هذه الصفحة تبدو متعددة الأعمدة، وقد يتأثر ترتيب القراءة في النص المستخرج.',
    descriptionEn: 'This page appears multi-column, so reading order may drift in extracted text.',
  },
  probable_form_layout: {
    flag: 'probable_form_layout',
    labelAr: 'نموذج أو حقول',
    labelEn: 'Form-like layout',
    descriptionAr: 'هذه الصفحة تشبه النماذج أو الحقول، وقد لا تبقى العلاقة بين العنوان والقيمة كما في الأصل.',
    descriptionEn: 'This page looks form-like, so label/value relationships may not survive exactly.',
  },
  probable_scan_annotation_page: {
    flag: 'probable_scan_annotation_page',
    labelAr: 'مسح/تعليق بصري',
    labelEn: 'Scan/annotation heavy',
    descriptionAr: 'هذه الصفحة تبدو ممسوحة ضوئياً أو مليئة بعناصر بصرية مثل الأختام أو الكتابات الجانبية، وقد تكون قراءتها الآلية أقل ثباتاً.',
    descriptionEn: 'This page appears scan-heavy or visually annotated, so OCR and extracted text may be less stable.',
  },
  probable_repeated_header_footer: {
    flag: 'probable_repeated_header_footer',
    labelAr: 'ترويسة/تذييل متكرر',
    labelEn: 'Repeated header/footer',
    descriptionAr: 'رصد النظام ترويسة أو تذييلاً متكرراً ليس من المتن الأصلي. قد يظهر داخل النص المستخرج أو يتم تجاهله تلقائياً بحسب إعدادات الاستيراد.',
    descriptionEn: 'The importer detected repeated header/footer text that is not part of the body. It may appear in extracted content or be suppressed automatically depending on import settings.',
  },
  crossed_out_text_detected: {
    flag: 'crossed_out_text_detected',
    labelAr: 'نص مشطوب',
    labelEn: 'Crossed-out text',
    descriptionAr: 'رصد النظام نصاً مشطوباً في الأصل. قد يكون المقصود حذفه أو تعديله ويحتاج إلى قرار بشري.',
    descriptionEn: 'The importer detected crossed-out text in the source. It may be intended for deletion or revision and needs human review.',
  },
};

function getWorkspaceDocumentFlags(meta: Record<string, unknown> | undefined): WorkspaceDocumentFlagInfo[] {
  if (!meta) return [];
  const documentFlags = Array.isArray(meta.documentFlags) ? meta.documentFlags.filter((flag): flag is string => typeof flag === 'string') : [];
  const editorialFlags = Array.isArray(meta.editorialFlags) ? meta.editorialFlags.filter((flag): flag is string => typeof flag === 'string') : [];
  return [...new Set([...documentFlags, ...editorialFlags])]
    .map((flag) => WORKSPACE_DOCUMENT_FLAG_MAP[flag])
    .filter(Boolean);
}

function createImportAbortError(): Error {
  const error = new Error('Import aborted by user');
  error.name = 'AbortError';
  return error;
}

function isImportAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

const SEVERITY_ORDER: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

import { scriptsApi, tasksApi, reportsApi, findingsApi } from '@/api';
import type { AnalysisFinding, AnalysisReviewFinding, DuplicateScriptCheckResponse, Report as AnalysisReport } from '@/api';
import { findTextOccurrences, findBestMatch, normalizeText } from '@/utils/textMatching';
import { normalizeText as canonicalNormalize } from '@/utils/canonicalText';
import type { EditorContentResponse, EditorSectionResponse } from '@/api';
import type { AnalysisJob, AnalysisModeProfile, ChunkStatus, ReportListItem, ReviewStatus } from '@/api/models';
import { sanitizeFormattedHtml } from '@/utils/sanitizeHtml';
import { PdfOriginalViewer } from '@/components/script/PdfOriginalViewer';
import {
  buildDomTextIndex,
  rangeFromNormalizedOffsets,
  selectionToNormalizedOffsets,
  unwrapFindingMarks,
  type DomTextIndex,
} from '@/utils/domTextIndex';
import {
  VIEWER_PAGE_SEP_LEN,
  viewerPageNumberFromStartOffset,
  globalStartOfViewerPage,
  displayPageForFinding,
} from '@/utils/viewerPageFromOffset';

import toast from 'react-hot-toast';

/// <reference types="vite/client" />
const IS_DEV = (import.meta as any).env?.DEV ?? false;

/** Worker `processing_phase` → modal label */
const PROCESSING_PHASE_LABELS: Record<string, { ar: string; en: string }> = {
  router: { ar: 'اختيار المواد المرشحة', en: 'Routing (candidate articles)' },
  multipass: { ar: 'كشف متعدد بالتوازي', en: 'Parallel multi-pass detection' },
  hybrid: { ar: 'مراجعة سياقية', en: 'Hybrid context pass' },
  aggregating: { ar: 'تجميع النتائج', en: 'Writing findings' },
  cached: { ar: 'نتائج مخزنة', en: 'Cached AI results' },
};

const ANALYSIS_MODE_OPTIONS: Array<{
  value: AnalysisModeProfile;
  labelAr: string;
  labelEn: string;
  hintAr: string;
  hintEn: string;
}> = [
  {
    value: 'quality',
    labelAr: 'جودة',
    labelEn: 'Quality',
    hintAr: 'تغطية أوسع وتجميع أكثر تفصيلاً.',
    hintEn: 'Broader coverage with more detailed grouping.',
  },
  {
    value: 'balanced',
    labelAr: 'متوازن',
    labelEn: 'Balanced',
    hintAr: 'أفضل توازن بين الدقة والسرعة.',
    hintEn: 'Best balance between quality and speed.',
  },
  {
    value: 'turbo',
    labelAr: 'توربو',
    labelEn: 'Turbo',
    hintAr: 'أسرع، مع تقليل بعض العمق لخفض الزمن.',
    hintEn: 'Fastest mode, with some depth reduced to save time.',
  },
];

const ANALYSIS_PIPELINE_OPTIONS: Array<{
  value: 'v2';
  labelAr: string;
  labelEn: string;
  hintAr: string;
  hintEn: string;
}> = [
  {
    value: 'v2',
    labelAr: 'V2',
    labelEn: 'V2',
    hintAr: 'ذاكرة سياقية أفضل وتضييق أدق للدليل.',
    hintEn: 'Improved context memory and tighter evidence pinning.',
  },
];

/**
 * Stored offsets often span a whole dialogue block (character line + sentence).
 * Shrink to the evidence snippet when it appears inside that span so highlights
 * match the finding card text.
 */
function tightenHighlightRangeToEvidence(
  plain: string,
  start: number,
  end: number,
  evidence: string
): { start: number; end: number } {
  const ev = evidence.trim();
  if (ev.length < 4 || !plain || end <= start || start >= plain.length) {
    return { start, end };
  }
  const lo = Math.max(0, start);
  const hi = Math.min(plain.length, end);
  const inner = plain.slice(lo, hi);

  const pickIn = (slice: string, base: number, hintMid: number) => {
    for (const conf of [1.0, 0.88] as const) {
      const matches = findTextOccurrences(slice, ev, { minConfidence: conf });
      if (matches.length === 0) continue;
      const hint = hintMid - base;
      const best =
        matches.length === 1 ? matches[0] : findBestMatch(matches, Math.max(0, Math.min(hint, slice.length))) ?? matches[0];
      return { start: base + best.start, end: base + best.end };
    }
    return null;
  };

  const mid = (lo + hi) / 2;
  const innerHit = pickIn(inner, lo, mid);
  if (innerHit) return innerHit;

  const pad = Math.min(220, Math.max(ev.length + 40, 80));
  const lo2 = Math.max(0, lo - pad);
  const hi2 = Math.min(plain.length, hi + pad);
  const outerHit = pickIn(plain.slice(lo2, hi2), lo2, mid);
  if (outerHit && outerHit.end - outerHit.start < hi - lo - 6) return outerHit;

  return { start: lo, end: hi };
}

/** Finding-card text → search in plain (like Ctrl+F); highlight only that span. */
function normalizeEvidenceForSearch(raw: string): string {
  let s = (raw ?? '').trim();
  s = s.replace(/^[\s"'""«»„]+|[\s"'""«»„]+$/gu, '').trim();
  return s;
}

const RATIONALE_SAYS_NOT_VIOLATION = [
  "لا يعد مخالفة",
  "لا توجد مخالفة",
  "لا يعتبر مخالفة",
  "لا تُعد مخالفة",
  "لا تعتبر مخالفة",
  "ليس مخالفة",
  "لا يشكل مخالفة",
  "لا يصل إلى حد المخالفة",
  "لا يرقى إلى مخالفة",
  "لا يشكل انتهاكاً",
  "لا يشكل تجاوزاً",
  "السياق مقبول",
  "سياق مقبول",
  "ضمن الضوابط",
  "لا خرق للضوابط",
  "لا يتجاوز الضوابط",
  "معالجة إيجابية",
  "لا يتضمن أي إيحاء",
  "سياق درامي فقط",
  "جزء من السياق الدرامي",
  "في إطار درامي",
  "ليس تحريضاً",
  "لا يروج للعنف",
  "لا يروّج للعنف",
  "يخدم السياق الدرامي",
  "يخدم السرد",
];

function isWeakRationaleText(value: string | null | undefined): boolean {
  const text = (value ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return true;
  if (text.length < 24) return true;
  if (
    text === 'السياق يعرض الفعل أو اللفظ مباشرة داخل المشهد ويحتاج وزناً سياساتياً كاملاً.' ||
    text === 'يعرض الفعل أو اللفظ مباشرة داخل المشهد ويحتاج وزناً سياساتياً كاملاً.' ||
    text === 'يحتاج وزناً سياساتياً كاملاً.'
  ) return true;
  return [
    /^وجود /,
    /^مطابقة /,
    /^مخالفة /,
    /^إشارة /,
    /^يحتوي النص/,
    /^يحتوي المقتطف/,
    /^يتطلب تقييم/,
    /^يحتاج مراجعة/,
  ].some((pattern) => pattern.test(text));
}

function pickFindingRationale(f: AnalysisFinding): string | null {
  const v3 = ((f.location as Record<string, unknown> | undefined)?.v3 as Record<string, unknown> | undefined) ?? {};
  const candidates = [
    v3.rationale_ar as string | undefined,
    v3.rationale as string | undefined,
    f.rationaleAr ?? undefined,
    f.descriptionAr ?? undefined,
  ];
  for (const candidate of candidates) {
    if (!isWeakRationaleText(candidate)) return candidate!.trim();
  }
  for (const candidate of candidates) {
    const text = candidate?.trim();
    if (text) return text;
  }
  return null;
}

function findingCanonicalId(f: AnalysisFinding): string | null {
  const v3 = ((f.location as Record<string, unknown> | undefined)?.v3 as Record<string, unknown> | undefined) ?? {};
  const raw = v3.canonical_finding_id;
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
}

function rationaleSaysNotViolationText(value: string | null | undefined): boolean {
  const text = (value ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return false;
  return RATIONALE_SAYS_NOT_VIOLATION.some((phrase) => text.includes(phrase));
}

function shouldTreatFindingAsSpecialNote(
  f: AnalysisFinding,
  canonicalHintIds: Set<string>
): boolean {
  const canonicalId = findingCanonicalId(f);
  if (canonicalId && canonicalHintIds.has(canonicalId)) return true;
  const v3 = ((f.location as Record<string, unknown> | undefined)?.v3 as Record<string, unknown> | undefined) ?? {};
  const finalRuling = typeof v3.final_ruling === 'string' ? v3.final_ruling.toLowerCase() : '';
  if (finalRuling === 'context_ok') return true;
  return rationaleSaysNotViolationText(pickFindingRationale(f));
}

function dedupeAnalysisFindings(list: AnalysisFinding[]): AnalysisFinding[] {
  const byCanonical = new Map<string, AnalysisFinding>();
  for (const f of list) {
    const v3 = ((f.location as Record<string, unknown> | undefined)?.v3 as Record<string, unknown> | undefined) ?? {};
    const canonicalId =
      (v3.canonical_finding_id as string | undefined) ?? f.id ?? `${f.articleId}-${f.evidenceSnippet?.slice(0, 80) ?? ''}`;
    const existing = byCanonical.get(canonicalId);
    if (!existing) {
      byCanonical.set(canonicalId, f);
      continue;
    }
    const currentRank = SEVERITY_ORDER[existing.severity?.toLowerCase() ?? ''] ?? 0;
    const nextRank = SEVERITY_ORDER[f.severity?.toLowerCase() ?? ''] ?? 0;
    if (nextRank > currentRank || (nextRank === currentRank && (f.confidence ?? 0) > (existing.confidence ?? 0))) {
      byCanonical.set(canonicalId, f);
    }
  }
  return [...byCanonical.values()];
}

type WorkspaceCanonicalSummaryFinding = {
  canonical_finding_id: string;
  title_ar?: string | null;
  evidence_snippet?: string | null;
  severity?: string | null;
  confidence?: number | null;
  rationale?: string | null;
  source?: string | null;
  primary_article_id?: number | null;
  primary_policy_atom_id?: string | null;
};

function isSyntheticWorkspaceFinding(f: AnalysisFinding): boolean {
  return f.source === 'canonical_summary';
}

function isReviewLayerOnlyWorkspaceFinding(f: AnalysisFinding): boolean {
  return f.source === 'review_layer';
}

function isWorkspaceActionDisabledFinding(f: AnalysisFinding): boolean {
  return isSyntheticWorkspaceFinding(f) || isReviewLayerOnlyWorkspaceFinding(f);
}

function synthesizeWorkspaceFindingFromCanonical(
  finding: WorkspaceCanonicalSummaryFinding,
  scriptId: string | undefined,
  versionId: string | undefined,
  jobId: string | undefined
): AnalysisFinding {
  const articleId = Number.isFinite(finding.primary_article_id) ? Number(finding.primary_article_id) : DEFAULT_ACTIONABLE_ARTICLE_ID;
  const canonicalId = (finding.canonical_finding_id || '').trim() || `canonical-${articleId}-${(finding.evidence_snippet ?? '').slice(0, 24)}`;
  return {
    id: `canonical:${canonicalId}`,
    jobId: jobId ?? '',
    scriptId: scriptId ?? '',
    versionId: versionId ?? '',
    source: 'canonical_summary',
    articleId,
    atomId: null,
    severity: (finding.severity ?? 'medium') || 'medium',
    confidence: typeof finding.confidence === 'number' ? finding.confidence : 0,
    titleAr: (finding.title_ar ?? '').trim(),
    descriptionAr: (finding.rationale ?? finding.title_ar ?? finding.evidence_snippet ?? '').trim() || '—',
    rationaleAr: (finding.rationale ?? null) as string | null,
    evidenceSnippet: (finding.evidence_snippet ?? '').trim(),
    startOffsetGlobal: null,
    endOffsetGlobal: null,
    startLineChunk: null,
    endLineChunk: null,
    pageNumber: null,
    startOffsetPage: null,
    endOffsetPage: null,
    anchorStatus: 'unresolved',
    anchorMethod: 'canonical_summary',
    anchorPageNumber: null,
    anchorStartOffsetPage: null,
    anchorEndOffsetPage: null,
    anchorStartOffsetGlobal: null,
    anchorEndOffsetGlobal: null,
    anchorText: (finding.evidence_snippet ?? '').trim(),
    anchorConfidence: null,
    anchorUpdatedAt: null,
    location: {
      v3: {
        canonical_finding_id: canonicalId,
        primary_article_id: articleId,
        primary_policy_atom_id: finding.primary_policy_atom_id ?? null,
      },
    },
    createdAt: new Date(0).toISOString(),
    reviewStatus: 'violation',
    reviewReason: null,
    reviewedBy: null,
    reviewedAt: null,
    reviewedRole: null,
    createdBy: null,
    manualComment: null,
  };
}

function matchWorkspaceFindingForCanonical(
  canonicalFinding: WorkspaceCanonicalSummaryFinding,
  findings: AnalysisFinding[]
): AnalysisFinding | undefined {
  const canonicalId = (canonicalFinding.canonical_finding_id ?? '').trim();
  if (canonicalId) {
    const direct = findings.find((finding) => findingCanonicalId(finding) === canonicalId);
    if (direct) return direct;
  }
  const articleId = Number.isFinite(canonicalFinding.primary_article_id) ? Number(canonicalFinding.primary_article_id) : null;
  const snippet = (canonicalFinding.evidence_snippet ?? '').replace(/\s+/g, ' ').trim();
  if (!snippet || snippet.length < 6) return undefined;
  const prefix = snippet.slice(0, Math.min(80, snippet.length));
  return findings.find((finding) => {
    if (articleId != null && finding.articleId !== articleId) return false;
    const evidence = (finding.evidenceSnippet ?? '').replace(/\s+/g, ' ').trim();
    return evidence.includes(prefix) || prefix.includes(evidence.slice(0, Math.min(80, evidence.length)));
  });
}

function matchWorkspaceRawFindingForReview(
  reviewFinding: AnalysisReviewFinding,
  findings: AnalysisFinding[]
): AnalysisFinding | undefined {
  const canonicalId = (reviewFinding.canonicalFindingId ?? '').trim();
  if (canonicalId) {
    const direct = findings.find((finding) => findingCanonicalId(finding) === canonicalId);
    if (direct) return direct;
  }
  const articleId = Number.isFinite(reviewFinding.primaryArticleId) ? Number(reviewFinding.primaryArticleId) : null;
  const snippet = (reviewFinding.evidenceSnippet ?? '').replace(/\s+/g, ' ').trim();
  if (!snippet || snippet.length < 4) return undefined;
  return findings.find((finding) => {
    if (articleId != null && finding.articleId !== articleId) return false;
    const evidence = (finding.evidenceSnippet ?? '').replace(/\s+/g, ' ').trim();
    return evidence.includes(snippet) || snippet.includes(evidence);
  });
}

function synthesizeWorkspaceFindingFromReview(
  reviewFinding: AnalysisReviewFinding,
  rawFinding: AnalysisFinding | undefined
): AnalysisFinding {
  const source =
    reviewFinding.sourceKind === 'glossary'
      ? 'lexicon_mandatory'
      : reviewFinding.sourceKind === 'manual'
        ? 'manual'
        : rawFinding?.source ?? 'ai';
  const baseId = rawFinding?.id ?? `review:${reviewFinding.id}`;
  const articleId = Number.isFinite(reviewFinding.primaryArticleId)
    ? Number(reviewFinding.primaryArticleId)
    : (rawFinding?.articleId ?? DEFAULT_ACTIONABLE_ARTICLE_ID);
  const atomId = reviewFinding.primaryAtomId ?? rawFinding?.atomId ?? null;

  return {
    ...(rawFinding ?? {}),
    id: baseId,
    jobId: reviewFinding.jobId,
    scriptId: reviewFinding.scriptId,
    versionId: reviewFinding.versionId,
    source: rawFinding ? source : 'review_layer',
    articleId,
    atomId,
    severity: reviewFinding.severity || rawFinding?.severity || 'medium',
    confidence: rawFinding?.confidence ?? 0,
    titleAr: (reviewFinding.titleAr ?? rawFinding?.titleAr ?? '').trim(),
    descriptionAr: (reviewFinding.descriptionAr ?? rawFinding?.descriptionAr ?? reviewFinding.evidenceSnippet ?? '').trim(),
    rationaleAr: reviewFinding.rationaleAr ?? rawFinding?.rationaleAr ?? null,
    evidenceSnippet: (reviewFinding.evidenceSnippet ?? rawFinding?.evidenceSnippet ?? '').trim(),
    startOffsetGlobal: reviewFinding.startOffsetGlobal ?? rawFinding?.startOffsetGlobal ?? null,
    endOffsetGlobal: reviewFinding.endOffsetGlobal ?? rawFinding?.endOffsetGlobal ?? null,
    startLineChunk: rawFinding?.startLineChunk ?? null,
    endLineChunk: rawFinding?.endLineChunk ?? null,
    pageNumber: reviewFinding.pageNumber ?? rawFinding?.pageNumber ?? null,
    startOffsetPage: reviewFinding.startOffsetPage ?? rawFinding?.startOffsetPage ?? null,
    endOffsetPage: reviewFinding.endOffsetPage ?? rawFinding?.endOffsetPage ?? null,
    anchorStatus: (reviewFinding.anchorStatus ?? rawFinding?.anchorStatus ?? 'unresolved') as AnalysisFinding['anchorStatus'],
    anchorMethod: reviewFinding.anchorMethod ?? rawFinding?.anchorMethod ?? null,
    anchorPageNumber: reviewFinding.pageNumber ?? rawFinding?.anchorPageNumber ?? null,
    anchorStartOffsetPage: reviewFinding.startOffsetPage ?? rawFinding?.anchorStartOffsetPage ?? null,
    anchorEndOffsetPage: reviewFinding.endOffsetPage ?? rawFinding?.anchorEndOffsetPage ?? null,
    anchorStartOffsetGlobal: reviewFinding.startOffsetGlobal ?? rawFinding?.anchorStartOffsetGlobal ?? null,
    anchorEndOffsetGlobal: reviewFinding.endOffsetGlobal ?? rawFinding?.anchorEndOffsetGlobal ?? null,
    anchorText: reviewFinding.anchorText ?? rawFinding?.anchorText ?? reviewFinding.evidenceSnippet ?? null,
    anchorConfidence: reviewFinding.anchorConfidence ?? rawFinding?.anchorConfidence ?? null,
    anchorUpdatedAt: rawFinding?.anchorUpdatedAt ?? reviewFinding.updatedAt ?? null,
    location: {
      ...(rawFinding?.location ?? {}),
      v3: {
        ...(((rawFinding?.location as Record<string, unknown> | undefined)?.v3 as Record<string, unknown> | undefined) ?? {}),
        canonical_finding_id: reviewFinding.canonicalFindingId ?? null,
        primary_article_id: articleId,
        primary_policy_atom_id: atomId,
      },
    },
    createdAt: rawFinding?.createdAt ?? reviewFinding.createdAt,
    reviewStatus: reviewFinding.reviewStatus === 'approved' ? 'approved' : 'violation',
    reviewReason: reviewFinding.approvedReason ?? rawFinding?.reviewReason ?? null,
    reviewedBy: reviewFinding.reviewedBy ?? rawFinding?.reviewedBy ?? null,
    reviewedAt: reviewFinding.reviewedAt ?? rawFinding?.reviewedAt ?? null,
    reviewedRole: rawFinding?.reviewedRole ?? null,
    createdBy: rawFinding?.createdBy ?? null,
    manualComment: reviewFinding.manualComment ?? rawFinding?.manualComment ?? null,
    editedBy: reviewFinding.editedBy ?? rawFinding?.editedBy ?? null,
    editedAt: reviewFinding.editedAt ?? rawFinding?.editedAt ?? null,
  };
}

function expandHighlightRangeToSentence(
  plain: string,
  start: number,
  end: number
): { start: number; end: number } {
  if (!plain || end <= start) return { start, end };
  const separators = /[\n\r.!?؟…]/;
  let lo = Math.max(0, start);
  let hi = Math.min(plain.length, end);

  while (lo > 0 && !separators.test(plain[lo - 1])) lo--;
  while (hi < plain.length && !separators.test(plain[hi])) hi++;
  while (lo < hi && /\s/.test(plain[lo])) lo++;
  while (hi > lo && /\s/.test(plain[hi - 1])) hi--;

  const maxLen = 260;
  if (hi - lo > maxLen) {
    return { start, end };
  }
  return hi > lo ? { start: lo, end: hi } : { start, end };
}

/** Dialogue after colon / last line first — avoids highlighting the speaker line with the line below. */
function orderedEvidenceNeedles(raw: string): string[] {
  const ev = normalizeEvidenceForSearch(raw);
  const needles: string[] = [];
  const seen = new Set<string>();
  const add = (s: string) => {
    const t = normalizeEvidenceForSearch(s);
    if (t.length >= 3 && !seen.has(t)) {
      seen.add(t);
      needles.push(t);
    }
  };

  const tailAfterColon = (s: string) => {
    const idx = Math.max(s.lastIndexOf(':'), s.lastIndexOf('：'));
    if (idx < 0 || idx >= s.length - 2) return '';
    return normalizeEvidenceForSearch(s.slice(idx + 1));
  };

  const lines = (raw ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length > 1) {
    for (let i = lines.length - 1; i >= 0; i--) add(lines[i]);
  }

  const tail = tailAfterColon(raw ?? '');
  if (tail.length >= 10) {
    const frags = tail
      .split(/[.!?؟。\n]+/)
      .map((p) => normalizeEvidenceForSearch(p))
      .filter((p) => p.length >= 10);
    frags.sort((a, b) => a.length - b.length);
    for (const frag of frags) add(frag);
  }
  if (tail.length >= 4) add(tail);
  if (lines.length === 1) {
    const t1 = tailAfterColon(lines[0]);
    if (t1.length >= 4) add(t1);
  }

  add(ev);

  return needles;
}

function gatherExactOccurrences(plain: string, needle: string): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  if (!needle || !plain) return out;
  let pos = 0;
  while (pos <= plain.length) {
    const i = plain.indexOf(needle, pos);
    if (i < 0) break;
    out.push({ start: i, end: i + needle.length });
    pos = i + 1;
  }
  return out;
}

function findingPreferredPageNumber(f: AnalysisFinding): number | null {
  return f.anchorPageNumber ?? f.pageNumber ?? null;
}

function findingPreferredStartOffsetPage(f: AnalysisFinding): number | null {
  return f.anchorStartOffsetPage ?? f.startOffsetPage ?? null;
}

function findingPreferredEndOffsetPage(f: AnalysisFinding): number | null {
  return f.anchorEndOffsetPage ?? f.endOffsetPage ?? null;
}

function findingPreferredStartOffsetGlobal(f: AnalysisFinding): number | null {
  return f.anchorStartOffsetGlobal ?? f.startOffsetGlobal ?? null;
}

function findingPreferredEndOffsetGlobal(f: AnalysisFinding): number | null {
  return f.anchorEndOffsetGlobal ?? f.endOffsetGlobal ?? null;
}

function findingPreferredAnchorText(f: AnalysisFinding): string {
  return normalizeEvidenceForSearch(f.anchorText ?? f.evidenceSnippet ?? '');
}

type AnchorTokenSpan = { norm: string; start: number; end: number };

const ANCHOR_TOKEN_REGEX = /[\p{L}\p{N}\p{M}]+/gu;

function tokenizeAnchorText(text: string): AnchorTokenSpan[] {
  const out: AnchorTokenSpan[] = [];
  if (!text) return out;
  for (const match of text.matchAll(ANCHOR_TOKEN_REGEX)) {
    const raw = match[0] ?? '';
    const start = match.index ?? -1;
    if (!raw || start < 0) continue;
    const norm = canonicalNormalize(raw);
    if (!norm) continue;
    out.push({ norm, start, end: start + raw.length });
  }
  return out;
}

function buildTokenNeedleVariants(texts: Array<string | null | undefined>): string[][] {
  const variants: string[][] = [];
  const seen = new Set<string>();
  const pushVariant = (tokens: string[]) => {
    if (tokens.length === 0) return;
    if (tokens.length === 1 && tokens[0].length < 4) return;
    const key = tokens.join('\u0001');
    if (seen.has(key)) return;
    seen.add(key);
    variants.push(tokens);
  };

  for (const raw of texts) {
    const trimmed = normalizeEvidenceForSearch(raw ?? '');
    if (!trimmed) continue;
    const tokens = tokenizeAnchorText(trimmed).map((token) => token.norm);
    if (!tokens.length) continue;
    pushVariant(tokens);
    if (tokens.length >= 4) {
      pushVariant(tokens.slice(0, Math.min(tokens.length, 6)));
      pushVariant(tokens.slice(-Math.min(tokens.length, 6)));
    }
    if (tokens.length >= 7) {
      const middleSize = Math.min(tokens.length, 5);
      const start = Math.max(0, Math.floor((tokens.length - middleSize) / 2));
      pushVariant(tokens.slice(start, start + middleSize));
    }
  }

  return variants.sort((a, b) => {
    if (b.length !== a.length) return b.length - a.length;
    return b.join('').length - a.join('').length;
  });
}

function locateSpanByTokenAnchoring(
  plain: string,
  needleTexts: Array<string | null | undefined>,
  opts?: { hintStart?: number | null }
): { start: number; end: number } | null {
  if (!plain) return null;
  const haystackTokens = tokenizeAnchorText(plain);
  if (!haystackTokens.length) return null;
  const needleVariants = buildTokenNeedleVariants(needleTexts);
  if (!needleVariants.length) return null;

  const hintStart = typeof opts?.hintStart === 'number' && Number.isFinite(opts.hintStart)
    ? opts.hintStart
    : null;

  let best: { start: number; end: number; tokenCount: number; charLen: number; distance: number } | null = null;

  for (const needle of needleVariants) {
    const needleLen = needle.length;
    if (needleLen <= 0 || needleLen > haystackTokens.length) continue;
    for (let i = 0; i <= haystackTokens.length - needleLen; i++) {
      let matched = true;
      for (let j = 0; j < needleLen; j++) {
        if (haystackTokens[i + j]?.norm !== needle[j]) {
          matched = false;
          break;
        }
      }
      if (!matched) continue;
      const start = haystackTokens[i]!.start;
      const end = haystackTokens[i + needleLen - 1]!.end;
      const charLen = end - start;
      const distance = hintStart == null ? 0 : Math.abs(start - hintStart);
      if (
        !best ||
        needleLen > best.tokenCount ||
        (needleLen === best.tokenCount && charLen > best.charLen) ||
        (needleLen === best.tokenCount && charLen === best.charLen && distance < best.distance) ||
        (needleLen === best.tokenCount && charLen === best.charLen && distance === best.distance && start < best.start)
      ) {
        best = { start, end, tokenCount: needleLen, charLen, distance };
      }
    }
    if (best && best.tokenCount >= needleLen && needleLen >= 3) {
      // Prefer the longest confident token match early to keep resolution deterministic.
      break;
    }
  }

  return best ? { start: best.start, end: best.end } : null;
}

function pickClosestSpan(
  matches: { start: number; end: number }[],
  hintStart?: number | null
): { start: number; end: number } | null {
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];
  if (typeof hintStart === 'number' && Number.isFinite(hintStart)) {
    return (
      [...matches].sort((a, b) => {
        const da = Math.abs(a.start - hintStart);
        const db = Math.abs(b.start - hintStart);
        if (da !== db) return da - db;
        return a.start - b.start;
      })[0] ?? null
    );
  }
  return [...matches].sort((a, b) => a.start - b.start)[0] ?? null;
}

function locateSpanByStrictExactSearch(
  plain: string,
  f: AnalysisFinding,
  opts?: { hintStart?: number | null }
): { start: number; end: number } | null {
  if (!plain) return null;
  const needles = Array.from(
    new Set(
      [findingPreferredAnchorText(f), ...orderedEvidenceNeedles(f.evidenceSnippet ?? '')]
        .map((value) => normalizeEvidenceForSearch(value))
        .filter((value) => value.length >= 2),
    ),
  );
  for (const needle of needles) {
    const direct = pickClosestSpan(gatherExactOccurrences(plain, needle), opts?.hintStart);
    if (direct) return direct;

    const canonicalNeedle = canonicalNormalize(needle);
    if (canonicalNeedle && canonicalNeedle !== needle) {
      const canonicalExact = findTextOccurrences(plain, needle, { minConfidence: 1.0 }).filter(
        (match) => canonicalNormalize(plain.slice(match.start, match.end)) === canonicalNeedle,
      );
      const canonicalHit = pickClosestSpan(canonicalExact, opts?.hintStart);
      if (canonicalHit) return canonicalHit;
    }

    const collapsed = needle.replace(/\s+/g, ' ').trim();
    if (collapsed && collapsed !== needle) {
      const collapsedHit = pickClosestSpan(gatherExactOccurrences(plain, collapsed), opts?.hintStart);
      if (collapsedHit) return collapsedHit;
    }
  }
  const tokenAnchored = locateSpanByTokenAnchoring(
    plain,
    [findingPreferredAnchorText(f), ...orderedEvidenceNeedles(f.evidenceSnippet ?? '')],
    { hintStart: opts?.hintStart },
  );
  if (tokenAnchored) return tokenAnchored;
  return null;
}

function locateSpanByEvidenceSearch(
  plain: string,
  f: Pick<AnalysisFinding, 'evidenceSnippet' | 'startOffsetGlobal' | 'endOffsetGlobal'>,
  opts?: { sliceGlobalStart?: number; pageSlice?: boolean }
): { start: number; end: number } | null {
  if (!plain) return null;
  const needles = orderedEvidenceNeedles(f.evidenceSnippet ?? '');
  if (needles.length === 0) return null;

  const sliceStart = opts?.sliceGlobalStart ?? 0;
  const pageSlice = opts?.pageSlice === true;
  const hintG = f.startOffsetGlobal ?? -1;
  const hintL = hintG >= 0 ? hintG - sliceStart : Number.NaN;
  const L = plain.length;

  const pick = (matches: { start: number; end: number }[]) => {
    if (matches.length === 0) return null;
    if (matches.length === 1) return { start: matches[0].start, end: matches[0].end };
    const hintOk = hintG > 0 && (!pageSlice || (hintL >= -120 && hintL <= L + 120));
    if (hintOk) {
      const h = pageSlice ? Math.max(0, Math.min(hintL, L)) : Math.min(hintG, L);
      const best = findBestMatch(matches as Parameters<typeof findBestMatch>[0], h);
      return best ? { start: best.start, end: best.end } : null;
    }
    const best = findBestMatch(matches as Parameters<typeof findBestMatch>[0], L * 0.42);
    return best ? { start: best.start, end: best.end } : { start: matches[0].start, end: matches[0].end };
  };

  const tokenAnchored = locateSpanByTokenAnchoring(plain, needles, {
    hintStart: hintG > 0 ? (pageSlice ? hintL : hintG) : null,
  });
  if (tokenAnchored) return tokenAnchored;

  for (const needle of needles) {
    let matches = gatherExactOccurrences(plain, needle);
    if (matches.length === 0) {
      matches = findTextOccurrences(plain, needle, { minConfidence: 1.0 });
    }
    if (matches.length === 0) {
      matches = findTextOccurrences(plain, needle, { minConfidence: 0.85 });
    }
    const hit = pick(matches);
    if (!hit) continue;
    const spanLen = hit.end - hit.start;
    if (spanLen <= needle.length + 10) return hit;
  }

  const ev = needles[needles.length - 1] ?? '';
  if (ev.length > 12) {
    for (let n = Math.min(ev.length, 72); n >= 10; n--) {
      const sub = ev.slice(-n);
      let m = gatherExactOccurrences(plain, sub);
      if (m.length === 0) m = findTextOccurrences(plain, sub, { minConfidence: 0.85 });
      if (m.length === 1) return { start: m[0].start, end: m[0].end };
      const p = pick(m);
      if (p) return p;
    }
  }

  const collapsed = ev.replace(/\s+/g, ' ');
  if (collapsed !== ev) {
    let m = gatherExactOccurrences(plain, collapsed);
    if (m.length === 0) m = findTextOccurrences(plain, collapsed, { minConfidence: 0.85 });
    const hit = pick(m);
    if (hit) return hit;
  }

  for (const needle of needles) {
    const m = findTextOccurrences(plain, needle, { minConfidence: 0.85 });
    const hit = pick(m);
    if (hit) return hit;
  }

  return null;
}

/**
 * 1) Exact evidence inside [start_offset,end_offset] in canonical (prefer last hit in window).
 * 2) Map to local coords on current page if window overlap lies on this page.
 * 3) Else existing page-level search.
 */
function locateHighlightOnCurrentPage(
  canonical: string,
  pagePlain: string,
  pagesSorted: Array<{ pageNumber: number; content: string }>,
  viewerPageNumber: number,
  f: AnalysisFinding,
  pageSliceOpts: { pageSlice: true; sliceGlobalStart: number }
): { start: number; end: number } | null {
  const idx = pagesSorted.findIndex((p) => p.pageNumber === viewerPageNumber);
  if (idx < 0) return locateSpanByEvidenceSearch(pagePlain, f, pageSliceOpts);
  const g0 = globalStartOfViewerPage(pagesSorted, idx);
  const g1 = g0 + pagePlain.length;

  const s = f.startOffsetGlobal ?? -1;
  const e = f.endOffsetGlobal ?? -1;
  if (s >= 0 && e > s && canonical.length > 0) {
    const lo = Math.max(0, s);
    const hi = Math.min(canonical.length, e);
    const win = canonical.slice(lo, hi);
    const needles = orderedEvidenceNeedles(f.evidenceSnippet ?? '');
    for (const needle of needles) {
      if (needle.length < 4) continue;
      let last = -1;
      for (let i = win.length - needle.length; i >= 0; i--) {
        if (win.slice(i, i + needle.length) === needle) {
          last = i;
          break;
        }
      }
      if (last >= 0) {
        const gAbs = lo + last;
        const gAbsEnd = gAbs + needle.length;
        if (gAbs >= g0 && gAbsEnd <= g1) {
          return { start: gAbs - g0, end: gAbsEnd - g0 };
        }
      }
    }
  }

  return locateSpanByEvidenceSearch(pagePlain, f, pageSliceOpts);
}

/**
 * Map a global [start,end) span in workspacePlain (pages joined with \\n\\n) to viewer page + local offsets.
 */
function workspaceGlobalSpanToPageLocal(
  globalStart: number,
  globalEnd: number,
  pages: Array<{ pageNumber: number; content: string }>
): { pageNumber: number; localStart: number; localEnd: number } | null {
  if (globalEnd <= globalStart || !pages.length) return null;
  const sorted = [...pages].sort((a, b) => a.pageNumber - b.pageNumber);
  const pn = viewerPageNumberFromStartOffset(sorted, globalStart);
  if (pn == null) return null;
  const idx = sorted.findIndex((p) => p.pageNumber === pn);
  if (idx < 0) return null;
  const g0 = globalStartOfViewerPage(sorted, idx);
  const pageLen = (sorted[idx]?.content ?? '').length;
  const ls = Math.max(0, Math.min(pageLen, globalStart - g0));
  const le = Math.max(ls + 1, Math.min(pageLen, globalEnd - g0));
  if (ls >= pageLen) return null;
  return { pageNumber: pn, localStart: ls, localEnd: Math.min(pageLen, le) };
}

function workspaceGlobalSpanOverlapWithViewerPage(
  globalStart: number,
  globalEnd: number,
  viewerPageNumber: number,
  pages: Array<{ pageNumber: number; content: string }>
): { pageNumber: number; localStart: number; localEnd: number } | null {
  if (globalEnd <= globalStart || !pages.length) return null;
  const sorted = [...pages].sort((a, b) => a.pageNumber - b.pageNumber);
  const idx = sorted.findIndex((p) => p.pageNumber === viewerPageNumber);
  if (idx < 0) return null;
  const pageLen = (sorted[idx]?.content ?? '').length;
  if (pageLen <= 0) return null;
  const g0 = globalStartOfViewerPage(sorted, idx);
  const g1 = g0 + pageLen;
  const overlapStart = Math.max(globalStart, g0);
  const overlapEnd = Math.min(globalEnd, g1);
  if (overlapEnd <= overlapStart) return null;
  return {
    pageNumber: viewerPageNumber,
    localStart: overlapStart - g0,
    localEnd: overlapEnd - g0,
  };
}

function viewerPageLocalSpanToGlobal(
  pageNumber: number,
  localStart: number,
  localEnd: number,
  pages: Array<{ pageNumber: number; content: string }>
): { globalStart: number; globalEnd: number } | null {
  if (localEnd <= localStart || !pages.length) return null;
  const sorted = [...pages].sort((a, b) => a.pageNumber - b.pageNumber);
  const idx = sorted.findIndex((p) => p.pageNumber === pageNumber);
  if (idx < 0) return null;
  const pageLen = (sorted[idx]?.content ?? '').length;
  if (pageLen <= 0 || localStart >= pageLen) return null;
  const g0 = globalStartOfViewerPage(sorted, idx);
  return {
    globalStart: g0 + Math.max(0, Math.min(pageLen, localStart)),
    globalEnd: g0 + Math.max(localStart + 1, Math.min(pageLen, localEnd)),
  };
}

function resolveFindingViaStoredPageData(
  finding: AnalysisFinding,
  pages: Array<{ pageNumber: number; content: string }>,
  locateInText: (
    content: string,
    finding: AnalysisFinding,
    opts?: { sliceGlobalStart?: number; pageSlice?: boolean }
  ) => { start: number; end: number; matched: boolean } | null,
  opts?: { strictExactOnly?: boolean }
): { pageNumber: number; localStart: number; localEnd: number; globalStart: number; globalEnd: number; method: 'stored_offsets' | 'stored_page_search' | 'page_exact' } | null {
  const pageNumber = findingPreferredPageNumber(finding);
  if (!pages.length || pageNumber == null || pageNumber < 1) return null;
  const page = pages.find((p) => p.pageNumber === pageNumber);
  if (!page) return null;
  const pageLen = (page.content ?? '').length;
  if (pageLen <= 0) return null;

  const evidenceNorm = findingPreferredAnchorText(finding);
  const startOffsetPage = findingPreferredStartOffsetPage(finding);
  const endOffsetPage = findingPreferredEndOffsetPage(finding);
  const strictExactOnly = opts?.strictExactOnly === true;

  if (strictExactOnly) {
    const strictHit = locateSpanByStrictExactSearch(page.content ?? '', finding, {
      hintStart: startOffsetPage,
    });
    if (strictHit) {
      const globalSpan = viewerPageLocalSpanToGlobal(page.pageNumber, strictHit.start, strictHit.end, pages);
      if (globalSpan) {
        return { pageNumber: page.pageNumber, localStart: strictHit.start, localEnd: strictHit.end, ...globalSpan, method: 'page_exact' };
      }
    }
    const pageScopedHit =
      locateSpanByEvidenceSearch(page.content ?? '', finding, { pageSlice: true, sliceGlobalStart: 0 }) ??
      locateInText(page.content ?? '', finding, { pageSlice: true, sliceGlobalStart: 0 });
    if (!pageScopedHit) return null;
    const globalSpan = viewerPageLocalSpanToGlobal(page.pageNumber, pageScopedHit.start, pageScopedHit.end, pages);
    if (!globalSpan) return null;
    return {
      pageNumber: page.pageNumber,
      localStart: pageScopedHit.start,
      localEnd: pageScopedHit.end,
      ...globalSpan,
      method: 'stored_page_search',
    };
  }

  if (
    typeof startOffsetPage === 'number' &&
    typeof endOffsetPage === 'number' &&
    startOffsetPage >= 0 &&
    endOffsetPage > startOffsetPage
  ) {
    const localStart = Math.max(0, Math.min(pageLen, startOffsetPage));
    const localEnd = Math.max(localStart + 1, Math.min(pageLen, endOffsetPage));
    if (localStart < pageLen) {
      const slice = page.content.slice(localStart, localEnd);
      const sliceNorm = canonicalNormalize(slice);
      const evidenceCanonical = canonicalNormalize(evidenceNorm);
      const lenRatio =
        evidenceCanonical.length > 0
          ? Math.min(sliceNorm.length, evidenceCanonical.length) / Math.max(sliceNorm.length, evidenceCanonical.length)
          : 0;
      const looksReasonable =
        !evidenceCanonical ||
        sliceNorm === evidenceCanonical ||
        (sliceNorm && evidenceCanonical && lenRatio >= 0.55 && (sliceNorm.includes(evidenceCanonical) || evidenceCanonical.includes(sliceNorm)));
      if (looksReasonable) {
        const globalSpan = viewerPageLocalSpanToGlobal(page.pageNumber, localStart, localEnd, pages);
        if (globalSpan) {
          return { pageNumber: page.pageNumber, localStart, localEnd, ...globalSpan, method: 'stored_offsets' };
        }
      }
    }
  }

  const searched = locateSpanByEvidenceSearch(page.content ?? '', finding, { pageSlice: true, sliceGlobalStart: 0 });
  if (!searched) return null;
  const globalSpan = viewerPageLocalSpanToGlobal(page.pageNumber, searched.start, searched.end, pages);
  if (!globalSpan) return null;
  return {
    pageNumber: page.pageNumber,
    localStart: searched.start,
    localEnd: searched.end,
    ...globalSpan,
    method: 'stored_page_search',
  };
}

type WorkspaceFindingResolution = {
  resolved: boolean;
  pageNumber: number | null;
  localStart: number | null;
  localEnd: number | null;
  globalStart: number | null;
  globalEnd: number | null;
  method: 'stored_offsets' | 'stored_page_search' | 'page_exact' | 'document_exact' | 'global_search' | 'workspace_search' | 'unresolved';
};

function isValidWorkspaceFindingResolution(
  value: unknown
): value is WorkspaceFindingResolution {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.resolved === 'boolean' &&
    (row.pageNumber == null || typeof row.pageNumber === 'number') &&
    (row.localStart == null || typeof row.localStart === 'number') &&
    (row.localEnd == null || typeof row.localEnd === 'number') &&
    (row.globalStart == null || typeof row.globalStart === 'number') &&
    (row.globalEnd == null || typeof row.globalEnd === 'number') &&
    typeof row.method === 'string'
  );
}

/** Ctrl+F the full workspace text (all pages), then map hit to viewer page. */
function resolveFindingViaWorkspaceSearch(
  f: AnalysisFinding,
  workspacePlain: string,
  pages: Array<{ pageNumber: number; content: string }>,
  locateInFullDoc: (
    content: string,
    finding: AnalysisFinding,
    opts?: { sliceGlobalStart?: number; pageSlice?: boolean }
  ) => { start: number; end: number; matched: boolean } | null
): { pageNumber: number; localStart: number; localEnd: number } | null {
  if (!workspacePlain.trim() || !pages.length) return null;
  const span = resolveFindingSpanInText(workspacePlain, f, locateInFullDoc);
  if (!span || span.end <= span.start) return null;
  return workspaceGlobalSpanToPageLocal(span.start, span.end, pages);
}

function resolveFindingViaStrictWorkspaceSearch(
  f: AnalysisFinding,
  workspacePlain: string,
  pages: Array<{ pageNumber: number; content: string }>
): { pageNumber: number; localStart: number; localEnd: number; globalStart: number; globalEnd: number; method: 'document_exact' } | null {
  if (!workspacePlain.trim() || !pages.length) return null;
  const span = locateSpanByStrictExactSearch(workspacePlain, f, {
    hintStart: findingPreferredStartOffsetGlobal(f),
  });
  if (!span || span.end <= span.start) return null;
  const hit = workspaceGlobalSpanToPageLocal(span.start, span.end, pages);
  if (!hit) return null;
  return {
    pageNumber: hit.pageNumber,
    localStart: hit.localStart,
    localEnd: hit.localEnd,
    globalStart: span.start,
    globalEnd: span.end,
    method: 'document_exact',
  };
}

function resolveFindingSpanInText(
  plain: string,
  finding: AnalysisFinding,
  locateInText: (
    content: string,
    finding: AnalysisFinding,
    opts?: { sliceGlobalStart?: number; pageSlice?: boolean }
  ) => { start: number; end: number; matched: boolean } | null,
  opts?: { sliceGlobalStart?: number; pageSlice?: boolean }
): { start: number; end: number } | null {
  if (!plain.trim()) return null;

  let matchedExactCardText = false;
  let span = tryExactEvidenceSpan(plain, finding.evidenceSnippet ?? '');
  if (span) {
    matchedExactCardText = true;
  }
  if (!span) {
    span = locateSpanByEvidenceSearch(plain, finding, opts);
  }
  if (!span) {
    const located = locateInText(plain, finding, opts);
    if (located) span = { start: located.start, end: located.end };
  }
  if (!span || span.end <= span.start) return null;

  const evidence = normalizeEvidenceForSearch(finding.evidenceSnippet ?? '');
  if (evidence.length >= 4) {
    span = tightenHighlightRangeToEvidence(plain, span.start, span.end, evidence);
  }
  if (matchedExactCardText) {
    return span.end > span.start ? span : null;
  }
  span = expandHighlightRangeToSentence(plain, span.start, span.end);
  return span.end > span.start ? span : null;
}

/** Exact substring match (then NFC) for evidence in full workspace text. */
function tryExactEvidenceSpan(fullText: string, evidence: string): { start: number; end: number } | null {
  const ev = (evidence ?? '').trim();
  if (ev.length < 2) return null;
  let i = fullText.indexOf(ev);
  if (i >= 0) return { start: i, end: i + ev.length };
  const evN = ev.normalize('NFC');
  const tN = fullText.normalize('NFC');
  i = tN.indexOf(evN);
  if (i >= 0) return { start: i, end: i + evN.length };
  return null;
}

function safeUploadFileName(fileName: string): string {
  const trimmed = fileName.trim();
  const dotIdx = trimmed.lastIndexOf('.');
  const ext = dotIdx > 0 ? trimmed.slice(dotIdx).toLowerCase() : '';
  const base = (dotIdx > 0 ? trimmed.slice(0, dotIdx) : trimmed)
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 64);
  const safeBase = base || 'script_file';
  return `${safeBase}_${Date.now()}${ext}`;
}

function isTerminalJobStatus(status?: string | null): boolean {
  const s = (status ?? '').toLowerCase();
  return s === 'completed' || s === 'failed' || s === 'done' || s === 'succeeded' || s === 'cancelled' || s === 'canceled';
}

function isSuccessfulJobStatus(status?: string | null): boolean {
  const s = (status ?? '').toLowerCase();
  return s === 'completed' || s === 'done' || s === 'succeeded';
}

function isPausedJobStatus(status?: string | null): boolean {
  return (status ?? '').toLowerCase() === 'paused';
}

function isStoppingJobStatus(status?: string | null): boolean {
  return (status ?? '').toLowerCase() === 'stopping';
}

function isCancelledJobStatus(status?: string | null): boolean {
  const s = (status ?? '').toLowerCase();
  return s === 'cancelled' || s === 'canceled';
}

function isQueuedJobStatus(status?: string | null): boolean {
  return (status ?? '').toLowerCase() === 'queued';
}

export function ScriptWorkspace() {

  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { lang, t } = useLangStore();
  const { settings } = useSettingsStore();
  const { scripts, findings, updateFindingStatus, updateScript, fetchInitialData, isLoading, error: dataError } = useDataStore();
  const { user, hasPermission } = useAuthStore();
  const dateFormat = settings?.platform?.dateFormat;

  const scriptFromList = scripts.find(s => s.id === id);
  const [scriptFetched, setScriptFetched] = useState<Script | null>(null);
  const [scriptByIdLoading, setScriptByIdLoading] = useState(true);
  const script = scriptFromList ?? scriptFetched ?? undefined;
  const isClientCanceledScript = ['canceled', 'cancelled'].includes(String(script?.status ?? '').toLowerCase());
  const scriptFindings = findings.filter(f => f.scriptId === id);
  const manualScriptFindings = useMemo(
    () => scriptFindings.filter((f) => f.source === 'manual'),
    [scriptFindings]
  );
  const legacyAutomatedScriptFindings = useMemo(
    () => scriptFindings.filter((f) => f.source !== 'manual'),
    [scriptFindings]
  );
  const isQuickContext = useMemo(() => {
    const fromQuery = new URLSearchParams(location.search).get('quick') === '1';
    return fromQuery || Boolean(script?.isQuickAnalysis);
  }, [location.search, script?.isQuickAnalysis]);
  const reportQuickQuery = isQuickContext ? '&quick=1' : '';

  // When route id changes (e.g. Open Workspace from Quick Analysis), reset so we show loading
  // instead of flashing the previous script or the error screen.
  useEffect(() => {
    if (!id) {
      setScriptFetched(null);
      setScriptByIdLoading(false);
      return;
    }
    setScriptFetched(null);
    setScriptByIdLoading(true);
  }, [id]);

  useEffect(() => {
    if (!id) {
      setScriptFetched(null);
      setScriptByIdLoading(false);
      return;
    }
    if (scriptFromList) {
      setScriptFetched(null);
      setScriptByIdLoading(false);
      return;
    }
    let cancelled = false;
    setScriptByIdLoading(true);
    scriptsApi
      .getScript(id)
      .then((s) => {
        if (!cancelled) {
          setScriptFetched(s);
          setScriptByIdLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setScriptFetched(null);
          setScriptByIdLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [id, scriptFromList]);

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; text: string; startOffsetGlobal?: number; endOffsetGlobal?: number } | null>(null);
  const [floatingAction, setFloatingAction] = useState<{ x: number; y: number; text: string; startOffsetGlobal?: number; endOffsetGlobal?: number } | null>(null);
  const [isViolationModalOpen, setIsViolationModalOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'extracting' | 'done' | 'failed' | 'aborted'>('idle');
  const [uploadPhaseLabel, setUploadPhaseLabel] = useState<string>('');
  const [uploadStatusMessage, setUploadStatusMessage] = useState<string>('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadStartedAt, setUploadStartedAt] = useState<number | null>(null);
  const [uploadElapsedMs, setUploadElapsedMs] = useState(0);
  const [uploadVersionId, setUploadVersionId] = useState<string | null>(null);
  const [uploadDuplicateInfo, setUploadDuplicateInfo] = useState<DuplicateScriptCheckResponse | null>(null);
  const [uploadDocumentCases, setUploadDocumentCases] = useState<ImportDocumentCases | null>(null);
  const uploadAbortControllerRef = useRef<AbortController | null>(null);
  const uploadSessionIdRef = useRef(0);
  const uploadAutoCloseTimeoutRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const [extractedText, setExtractedText] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisJobId, setAnalysisJobId] = useState<string | null>(null);
  const [analysisModalOpen, setAnalysisModalOpen] = useState(false);
  /** When job completes, we fetch the report id so "View Report" can use by=id. */
  const [reportIdWhenJobCompleted, setReportIdWhenJobCompleted] = useState<string | null>(null);
  const [analysisJob, setAnalysisJob] = useState<AnalysisJob | null>(null);
  const [analysisModeProfile, setAnalysisModeProfile] = useState<AnalysisModeProfile>('balanced');
  const [analysisPipelineVersion] = useState<'v2'>('v2');
  const [analysisControlBusy, setAnalysisControlBusy] = useState<'pause' | 'resume' | 'stop' | null>(null);
  const [debugOpen, setDebugOpen] = useState(false);
  const [chunkStatuses, setChunkStatuses] = useState<ChunkStatus[]>([]);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastFailedAnalysisAlertRef = useRef<string | null>(null);
  const [decisionCan, setDecisionCan] = useState<{ canApprove: boolean; canReject: boolean; reason?: string } | null>(null);
  const isImportModalOpen = uploadStatus !== 'idle';

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
        console.warn('[ScriptWorkspace] Failed to cancel backend extraction', { versionId: versionIdToCancel, error: message });
      });
    }
    if (closeModal) {
      setUploadStatus('idle');
      setUploadError(null);
      setUploadStartedAt(null);
      setUploadElapsedMs(0);
      setUploadDuplicateInfo(null);
      setUploadDocumentCases(null);
      setUploadPhaseLabel('');
      setUploadStatusMessage('');
      return;
    }
    setUploadStatus('aborted');
    setUploadError(null);
    setUploadPhaseLabel(lang === 'ar' ? 'تم إيقاف الاستيراد' : 'Import stopped');
    setUploadStatusMessage(
      lang === 'ar'
        ? 'تم إيقاف عملية الاستيراد الحالية. يمكنك إغلاق النافذة أو إعادة المحاولة لاحقاً.'
        : 'The current import was stopped. You can close this window or try again later.',
    );
  }, [clearImportAutoClose, lang, uploadStatus, uploadVersionId]);

  useEffect(() => () => {
    clearImportAutoClose();
    const controller = uploadAbortControllerRef.current;
    if (controller && !controller.signal.aborted) controller.abort();
  }, [clearImportAutoClose]);

  // Polling for analysis job progress
  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const startPolling = useCallback((jobId: string) => {
    stopPolling();
    lastFailedAnalysisAlertRef.current = null;
    const poll = async () => {
      try {
        const [jobResult, chunksResult] = await Promise.allSettled([
          tasksApi.getJob(jobId),
          tasksApi.getJobChunks(jobId),
        ]);

        if (chunksResult.status === 'fulfilled') {
          setChunkStatuses(chunksResult.value);
        }

        if (jobResult.status !== 'fulfilled') {
          throw jobResult.reason;
        }

        const job = jobResult.value;
        setAnalysisJob(job);
        if (isTerminalJobStatus(job.status)) {
          stopPolling();
          if (job.status === 'failed' && job.errorMessage) {
            const publicErrorMessage = getPublicAnalysisErrorMessage(job.errorMessage) ?? job.errorMessage;
            const alertKey = `${job.id}:${publicErrorMessage}`;
            if (lastFailedAnalysisAlertRef.current !== alertKey) {
              lastFailedAnalysisAlertRef.current = alertKey;
              toast.error(publicErrorMessage);
            }
          }
          // Fetch the report id so "View Report" navigates correctly (by=id preferred)
          if (isSuccessfulJobStatus(job.status)) {
            reportsApi.getByJob(job.id).then((report) => {
              setReportIdWhenJobCompleted(report.id);
            }).catch(() => {});
          }
        }
      } catch (err) {
        console.error('[ScriptWorkspace] poll error:', err);
      }
    };
    poll(); // immediate first fetch
    pollingRef.current = setInterval(poll, 1500);
  }, [stopPolling]);

  // Cleanup polling on unmount
  useEffect(() => () => stopPolling(), [stopPolling]);

  // Fetch backend decision/can so UI matches backend policy (single source of truth)
  const [decisionCanScriptId, setDecisionCanScriptId] = useState<string | null>(null);
  useEffect(() => {
    if (!script?.id) {
      setDecisionCan(null);
      setDecisionCanScriptId(null);
      return;
    }
    let cancelled = false;
    const sid = script.id;
    scriptsApi
      .getDecisionCan(script.id)
      .then((res) => {
        if (!cancelled) {
          setDecisionCan(res);
          setDecisionCanScriptId(sid);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setDecisionCan({
            canApprove: false,
            canReject: false,
            reason: err?.message ?? 'Could not load decision permissions.',
          });
          setDecisionCanScriptId(sid);
        }
      });
    return () => { cancelled = true; };
  }, [script?.id]);
  const showDecisionBar = decisionCan !== null && decisionCanScriptId === script?.id;

  // On mount: fetch latest analysis job for this script so "View Report" has a jobId
  useEffect(() => {
    if (!script?.id) return;

    // Security Check: Ensure user has access
    const hasAccess =
      user?.id === script.assigneeId ||
      user?.id === script.created_by ||
      user?.role === 'Super Admin' ||
      user?.role === 'Admin'; // Or check permissions

    if (!hasAccess) {
      // toast.error('Access denied');
      // navigate('/tasks');
      // return;
      // For now, we trust the route protection, but good to double check
    }

    // Auto-load document if available (Feature: Assigned User Auto-Import)
    const checkAndLoadDocument = async () => {
      try {
        // Use scriptsApi directly as it's not exposed in dataStore
        const versions = await scriptsApi.getScriptVersions(script.id);
        if (versions.length > 0) {
          const latest = versions[0];

          // If we have text and editor is empty, auto-load it silently.
          // This should never re-open the import modal on refresh/navigation.
          if (latest.extraction_status === 'done' && latest.extracted_text && !extractedText) {
            // Only auto-load if text is reasonable size (< 500KB) to prevent widespread lag
            if (latest.extracted_text.length < 500000) {
              setExtractedText(latest.extracted_text);
            } else {
              // Large file warning
              toast(lang === 'ar' ? 'المستند كبير. انقر لاستيراده.' : 'Large document found. Click to import.', {
                icon: '📁',
              });
            }
          }
        }
      } catch (err) {
        console.error('Failed to auto-load document', err);
      }
    };
    checkAndLoadDocument();

    if (analysisJobId) return;
    tasksApi
      .getTasks({ scriptId: script.id, limit: 1 })
      .then((jobs) => {
        // Filter out "assigned tasks" (which are just script pointers) and keep only real analysis jobs
        const analysisJobs = jobs.filter(j => j.versionId);
        if (analysisJobs.length > 0) {
          const latestJob = analysisJobs[0];
          setAnalysisJobId(latestJob.id);
          setAnalysisJob(latestJob);
          if (!isTerminalJobStatus(latestJob.status)) {
            startPolling(latestJob.id);
          } else {
            tasksApi.getJobChunks(latestJob.id).then((chunks) => {
              setChunkStatuses(chunks);
            }).catch(() => { /* ignore */ });
          }
          // Also try to get report id
        }
      })
      .catch(() => { /* ignore — no jobs yet */ });
  }, [script?.id, startPolling]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Report history ──
  const [sidebarTab, setSidebarTab] = useState<'findings' | 'reports'>('findings');
  const [reportHistory, setReportHistory] = useState<ReportListItem[]>([]);
  const [approveDecisionReportId, setApproveDecisionReportId] = useState<string | null>(null);
  const [approveDecisionSubmitting, setApproveDecisionSubmitting] = useState(false);
  const [rejectDecisionReportId, setRejectDecisionReportId] = useState<string | null>(null);
  const [rejectDecisionReason, setRejectDecisionReason] = useState('');
  const [rejectDecisionClientComment, setRejectDecisionClientComment] = useState('');
  const [rejectDecisionShareReports, setRejectDecisionShareReports] = useState(true);
  const [rejectDecisionReportIds, setRejectDecisionReportIds] = useState<string[]>([]);
  const [rejectDecisionSubmitting, setRejectDecisionSubmitting] = useState(false);

  // ── Report findings (for editor highlights) ──
  const [selectedReportForHighlights, setSelectedReportForHighlights] = useState<ReportListItem | null>(null);
  const [selectedReportSummary, setSelectedReportSummary] = useState<AnalysisReport | null>(null);
  const [selectedJobCanonicalHash, setSelectedJobCanonicalHash] = useState<string | null>(null);
  const [reportFindings, setReportFindings] = useState<AnalysisFinding[]>([]);
  const [reportReviewFindings, setReportReviewFindings] = useState<AnalysisReviewFinding[]>([]);
  const [highlightExpectedCount, setHighlightExpectedCount] = useState(0);
  const [highlightLocatableCount, setHighlightLocatableCount] = useState(0);
  const [highlightRenderedCount, setHighlightRenderedCount] = useState(0);
  const [highlightRetryTick, setHighlightRetryTick] = useState(0);
  // const [reportFindingsLoading, setReportFindingsLoading] = useState(false);
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null);
  const [pageNoticesOpen, setPageNoticesOpen] = useState(false);
  /** User clicked a finding card or retried highlight — only this finding is highlighted. */
  const [pinnedHighlight, setPinnedHighlight] = useState<{
    findingId: string;
    globalStart: number;
    globalEnd: number;
    pageNumber?: number | null;
    localStart?: number | null;
    localEnd?: number | null;
  } | null>(null);
  const [tooltipFinding, setTooltipFinding] = useState<AnalysisFinding | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [reportFindingReviewModal, setReportFindingReviewModal] = useState<{
    findingId: string;
    toStatus: 'approved' | 'violation';
    titleAr: string;
  } | null>(null);
  const [editReportFindingModal, setEditReportFindingModal] = useState<AnalysisFinding | null>(null);
  const [editReportFindingSaving, setEditReportFindingSaving] = useState(false);
  const [editReportFindingValidatingSnippet, setEditReportFindingValidatingSnippet] = useState(false);
  const [editReportFindingSnippetValidation, setEditReportFindingSnippetValidation] = useState<string | null>(null);
  const [editReportFindingForm, setEditReportFindingForm] = useState({
    articleId: String(DEFAULT_ACTIONABLE_ARTICLE_ID),
    atomId: '',
    violationTypeId: DEFAULT_VIOLATION_TYPE_ID,
    severity: 'medium',
    evidenceSnippet: '',
    rationaleAr: '',
    manualComment: '',
  });
  const [selectedReportFindingIds, setSelectedReportFindingIds] = useState<string[]>([]);
  const [bulkReportFindingReviewModal, setBulkReportFindingReviewModal] = useState<{
    findingIds: string[];
    toStatus: 'approved' | 'violation';
  } | null>(null);
  const [bulkReportFindingReviewReason, setBulkReportFindingReviewReason] = useState('');
  const [bulkReportFindingReviewSaving, setBulkReportFindingReviewSaving] = useState(false);
  const [reportFindingReviewReason, setReportFindingReviewReason] = useState('');
  const [reportFindingReviewSaving, setReportFindingReviewSaving] = useState(false);
  const findingCardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  /** So we only restore saved highlight once per script (not on every reportHistory change). */
  const restoredHighlightRef = useRef(false);

  useEffect(() => {

  }, [reportFindings]);

  const [formData, setFormData] = useState({
    reportId: '',
    articleId: String(DEFAULT_ACTIONABLE_ARTICLE_ID),
    atomId: '' as string,
    violationTypeId: DEFAULT_VIOLATION_TYPE_ID,
    severity: 'medium' as string,
    comment: '',
    excerpt: '',
  });
  const [manualSaving, setManualSaving] = useState(false);
  const [manualOffsets, setManualOffsets] = useState<{ startOffsetGlobal: number; endOffsetGlobal: number } | null>(null);
  const [persistentSelection, setPersistentSelection] = useState<{ rects: DOMRect[] } | null>(null);

  const safeDateFromValue = useCallback((value: string | null | undefined): Date | null => {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }, []);

  const formatOptionalReportDate = useCallback((value: string | null | undefined) => {
    const parsed = safeDateFromValue(value);
    return parsed ? formatDate(parsed, { lang, format: dateFormat }) : '—';
  }, [dateFormat, lang, safeDateFromValue]);

  const formatOptionalTimeValue = useCallback((value: string | null | undefined) => {
    const parsed = safeDateFromValue(value);
    return parsed ? formatTime(parsed, { lang }) : '—';
  }, [lang, safeDateFromValue]);

  const previousReviewInsight = useMemo(() => {
    if (reportHistory.length === 0) return null;
    const latest = [...reportHistory].sort(
      (a, b) => {
        const left = safeDateFromValue(a.createdAt)?.getTime() ?? 0;
        const right = safeDateFromValue(b.createdAt)?.getTime() ?? 0;
        return right - left;
      }
    )[0];
    const latestActor =
      latest.reportCreatorName ??
      (latest.createdBy === user?.id
        ? (lang === 'ar' ? 'أنت' : 'You')
        : latest.createdBy
          ? `${latest.createdBy.slice(0, 8)}…`
          : (lang === 'ar' ? 'غير معروف' : 'Unknown'));
    const latestDate = formatOptionalReportDate(latest.createdAt);
    const clientLabel =
      latest.clientName ??
      latest.companyNameAr ??
      latest.companyNameEn ??
      (lang === 'ar' ? 'غير محدد' : 'Unknown');
    return {
      totalReports: reportHistory.length,
      latestActor,
      latestDate,
      clientLabel,
      hasExternalReview: reportHistory.some((r) => (r.reportCreatorId ?? r.createdBy ?? null) !== (user?.id ?? null)),
    };
  }, [reportHistory, user?.id, lang, formatOptionalReportDate, safeDateFromValue]);
  const hasGeneratedReport = reportHistory.length > 0 || !!reportIdWhenJobCompleted;
  const missingReportReason = lang === 'ar'
    ? 'لا يمكن تنفيذ هذا الإجراء قبل تشغيل التحليل وإنشاء أول تقرير.'
    : 'You cannot do this before running the analysis and generating the first report.';
  const lockedAcceptedReportReason = lang === 'ar'
    ? 'تم قبول التقرير المحدد. أعده إلى المراجعة أولاً لتفعيل قراري القبول والرفض في مساحة العمل.'
    : 'The selected report has been approved. Send it back to review first to re-enable approve and reject in the workspace.';
  const effectiveDecisionCapabilities = useMemo(() => {
    const baseCapabilities =
      showDecisionBar && decisionCan != null
        ? { canApprove: decisionCan.canApprove, canReject: decisionCan.canReject, reasonIfDisabled: decisionCan.reason ?? null }
        : (user ? getScriptDecisionCapabilities(script, user, hasPermission) : null);

    if (!baseCapabilities) return null;
    if (hasGeneratedReport) return baseCapabilities;

    return {
      canApprove: false,
      canReject: false,
      reasonIfDisabled: missingReportReason,
    };
  }, [showDecisionBar, decisionCan, user, script, hasPermission, hasGeneratedReport, missingReportReason]);
  const selectedWorkspaceReportReviewStatus =
    selectedReportSummary?.reviewStatus ?? selectedReportForHighlights?.reviewStatus ?? null;
  const workspaceDecisionStatus = selectedWorkspaceReportReviewStatus ?? script?.status ?? 'draft';
  const finalDecisionCapabilities = useMemo(() => {
    if (!effectiveDecisionCapabilities) return null;
    if (selectedWorkspaceReportReviewStatus !== 'approved') return effectiveDecisionCapabilities;
    return {
      canApprove: false,
      canReject: false,
      reasonIfDisabled: lockedAcceptedReportReason,
    };
  }, [effectiveDecisionCapabilities, selectedWorkspaceReportReviewStatus, lockedAcceptedReportReason]);

  const workspaceCanonicalHintIds = useMemo(
    () =>
      new Set(
        ((selectedReportSummary?.summaryJson?.report_hints ?? []) as Array<{ canonical_finding_id?: string }>)
          .map((f) => f.canonical_finding_id)
          .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
      ),
    [selectedReportSummary]
  );

  const workspaceCanonicalSummaryFindings = useMemo(
    () =>
      (((selectedReportSummary?.summaryJson?.canonical_findings ?? []) as WorkspaceCanonicalSummaryFinding[]) ?? []).filter(
        (finding) => Boolean(finding?.canonical_finding_id)
      ),
    [selectedReportSummary]
  );

  const workspaceReviewLayerViolations = useMemo(
    () =>
      reportReviewFindings
        .filter((finding) => !finding.isHidden && finding.reviewStatus !== 'approved' && finding.sourceKind !== 'special')
        .map((finding) => synthesizeWorkspaceFindingFromReview(finding, matchWorkspaceRawFindingForReview(finding, reportFindings))),
    [reportReviewFindings, reportFindings]
  );

  const workspaceReviewLayerApproved = useMemo(
    () =>
      reportReviewFindings
        .filter((finding) => !finding.isHidden && finding.reviewStatus === 'approved' && finding.sourceKind !== 'special')
        .map((finding) => synthesizeWorkspaceFindingFromReview(finding, matchWorkspaceRawFindingForReview(finding, reportFindings))),
    [reportReviewFindings, reportFindings]
  );

  const workspaceRealViolationFindings = useMemo(() => {
    const violations = reportFindings.filter(
      (f) => f.reviewStatus !== 'approved' && !shouldTreatFindingAsSpecialNote(f, workspaceCanonicalHintIds)
    );
    return dedupeAnalysisFindings(violations);
  }, [reportFindings, workspaceCanonicalHintIds]);

  const workspaceUseCanonicalFallback = useMemo(
    () =>
      workspaceReviewLayerViolations.length === 0 &&
      workspaceCanonicalSummaryFindings.length > 0 &&
      workspaceRealViolationFindings.length < Math.max(2, Math.ceil(workspaceCanonicalSummaryFindings.length * 0.6)),
    [workspaceCanonicalSummaryFindings.length, workspaceRealViolationFindings.length, workspaceReviewLayerViolations.length]
  );

  const workspaceUsesReviewLayer = workspaceReviewLayerViolations.length > 0 || workspaceReviewLayerApproved.length > 0;

  const workspaceVisibleReportFindings = useMemo(() => {
    if (workspaceUsesReviewLayer) return workspaceReviewLayerViolations;
    if (!workspaceUseCanonicalFallback) return workspaceRealViolationFindings;
    return workspaceCanonicalSummaryFindings.map((finding) => {
      return (
        matchWorkspaceFindingForCanonical(finding, workspaceRealViolationFindings) ??
        synthesizeWorkspaceFindingFromCanonical(
          finding,
          script?.id,
          script?.currentVersionId ?? undefined,
          selectedReportForHighlights?.jobId ?? undefined
        )
      );
    });
  }, [
    workspaceUseCanonicalFallback,
    workspaceUsesReviewLayer,
    workspaceReviewLayerViolations,
    workspaceRealViolationFindings,
    workspaceCanonicalSummaryFindings,
    script?.id,
    script?.currentVersionId,
    selectedReportForHighlights?.jobId,
  ]);

  const workspaceActionableFindings = useMemo(
    () => workspaceVisibleReportFindings.filter((finding) => !isWorkspaceActionDisabledFinding(finding)),
    [workspaceVisibleReportFindings]
  );

  useEffect(() => {
    const visibleIds = new Set(workspaceVisibleReportFindings.map((f) => f.id));
    setSelectedReportFindingIds((prev) => prev.filter((id) => visibleIds.has(id)));
  }, [workspaceVisibleReportFindings]);

  useEffect(() => {
    if (!editReportFindingModal) return;
    setEditReportFindingForm({
      articleId: String(editReportFindingModal.articleId || DEFAULT_ACTIONABLE_ARTICLE_ID),
      atomId: '',
      violationTypeId: resolveViolationTypeId(editReportFindingModal.titleAr) ?? resolveViolationTypeId(editReportFindingModal.descriptionAr) ?? resolveViolationTypeId(editReportFindingModal.evidenceSnippet) ?? 'other',
      severity: (editReportFindingModal.severity || 'medium').toLowerCase(),
      evidenceSnippet: editReportFindingModal.evidenceSnippet ?? '',
      rationaleAr: editReportFindingModal.rationaleAr ?? '',
      manualComment: editReportFindingModal.manualComment ?? '',
    });
    setEditReportFindingSnippetValidation(null);
  }, [editReportFindingModal]);

  const loadReportHistory = useCallback(async () => {
    if (!id) return;
    // setReportHistoryLoading(true);
    try {
      const list = await reportsApi.listByScript(id);
      setReportHistory(list);
    } catch (_) {
      setReportHistory([]);
    }
    // setReportHistoryLoading(false);
  }, [id]);

  const reloadSelectedReportReviewLayer = useCallback(async () => {
    if (!selectedReportSummary?.id && !selectedReportForHighlights?.jobId) return;
    try {
      const rows = selectedReportForHighlights?.jobId
        ? await findingsApi.getReviewByJob(selectedReportForHighlights.jobId)
        : await findingsApi.getReviewByReport(selectedReportSummary!.id);
      setReportReviewFindings(rows);
    } catch {
      // keep current layer if refresh fails
    }
  }, [selectedReportForHighlights?.jobId, selectedReportSummary?.id]);

  // Load report history on mount (so we can restore saved highlight) and when sidebar/modal
  useEffect(() => {
    if (id) loadReportHistory();
  }, [id, loadReportHistory]);
  useEffect(() => {
    if (sidebarTab === 'reports' || isViolationModalOpen) loadReportHistory();
  }, [sidebarTab, isViolationModalOpen, loadReportHistory]);

  // Reset restore flag when switching to another script
  useEffect(() => {
    restoredHighlightRef.current = false;
  }, [id]);

  // When violation modal is open and reports load, default to latest report
  useEffect(() => {
    if (isViolationModalOpen && reportHistory.length > 0 && !formData.reportId) {
      setFormData((prev) => ({ ...prev, reportId: reportHistory[0].id }));
    }
  }, [isViolationModalOpen, reportHistory, formData.reportId]);

  // Also refresh report history when analysis completes
  useEffect(() => {
    if (isSuccessfulJobStatus(analysisJob?.status)) loadReportHistory();
  }, [analysisJob?.status, loadReportHistory]);

  const openRejectDecisionModal = useCallback((reportId: string) => {
    const hasReport = reportHistory.some((report) => report.id === reportId);
    const defaultReportId = hasReport ? reportId : (reportHistory[0]?.id ?? null);
    setRejectDecisionReportId(reportId);
    setRejectDecisionReason('');
    setRejectDecisionClientComment('');
    setRejectDecisionShareReports(true);
    setRejectDecisionReportIds(defaultReportId ? [defaultReportId] : []);
  }, [reportHistory]);

  const openApproveDecisionConfirm = useCallback((reportId: string) => {
    setApproveDecisionReportId(reportId);
  }, []);

  const closeApproveDecisionConfirm = useCallback((force = false) => {
    if (approveDecisionSubmitting && !force) return;
    setApproveDecisionReportId(null);
  }, [approveDecisionSubmitting]);

  const closeRejectDecisionModal = useCallback(() => {
    if (rejectDecisionSubmitting) return;
    setRejectDecisionReportId(null);
    setRejectDecisionReason('');
    setRejectDecisionClientComment('');
    setRejectDecisionShareReports(true);
    setRejectDecisionReportIds([]);
  }, [rejectDecisionSubmitting]);

  const toggleRejectDecisionReportId = useCallback((reportId: string) => {
    setRejectDecisionReportIds((prev) =>
      prev.includes(reportId) ? prev.filter((id) => id !== reportId) : [...prev, reportId]
    );
  }, []);

  const submitRejectDecision = useCallback(async () => {
    if (!script?.id || !rejectDecisionReportId) return;
    const reason = rejectDecisionReason.trim();
    if (!reason) {
      toast.error(lang === 'ar' ? 'يرجى إدخال سبب الرفض' : 'Please enter a rejection reason');
      return;
    }

    setRejectDecisionSubmitting(true);
    try {
      await scriptsApi.makeDecision(
        script.id,
        'reject',
        reason,
        rejectDecisionReportId,
        {
          clientComment: rejectDecisionClientComment.trim(),
          shareReportsToClient: rejectDecisionShareReports,
          shareReportIds: rejectDecisionShareReports ? rejectDecisionReportIds : [],
        },
      );
      toast.success(lang === 'ar' ? 'تم رفض النص وإرسال الملاحظات للعميل' : 'Script rejected and client feedback saved');

      if (selectedReportForHighlights?.id === rejectDecisionReportId) {
        setSelectedReportForHighlights((prev) =>
          prev && prev.id === rejectDecisionReportId
            ? { ...prev, reviewStatus: 'rejected' }
            : prev
        );
        setSelectedReportSummary((prev) =>
          prev && prev.id === rejectDecisionReportId
            ? {
                ...prev,
                reviewStatus: 'rejected',
                reviewNotes: reason,
                reviewedAt: new Date().toISOString(),
                reviewedBy: user?.id ?? prev.reviewedBy ?? null,
              }
            : prev
        );
      }

      await Promise.all([loadReportHistory(), fetchInitialData()]);
      closeRejectDecisionModal();
    } catch (err: any) {
      toast.error(err?.message ?? (lang === 'ar' ? 'فشل تنفيذ قرار الرفض' : 'Failed to reject script'));
    } finally {
      setRejectDecisionSubmitting(false);
    }
  }, [
    closeRejectDecisionModal,
    fetchInitialData,
    lang,
    loadReportHistory,
    rejectDecisionClientComment,
    rejectDecisionReason,
    rejectDecisionReportId,
    rejectDecisionReportIds,
    rejectDecisionShareReports,
    script?.id,
    selectedReportForHighlights?.id,
    user?.id,
  ]);

  const submitApproveDecision = useCallback(async () => {
    if (!script?.id || !approveDecisionReportId) return;
    setApproveDecisionSubmitting(true);
    try {
      await scriptsApi.makeDecision(
        script.id,
        'approve',
        lang === 'ar'
          ? 'تم اعتماد النص من الإدارة'
          : 'Script approved by administration',
        approveDecisionReportId,
      );
      toast.success(lang === 'ar' ? 'تم اعتماد النص وتوليد الشهادة' : 'Script approved and certificate generation started');
      await Promise.all([loadReportHistory(), fetchInitialData()]);
      closeApproveDecisionConfirm(true);
    } catch (err: any) {
      toast.error(err?.message ?? (lang === 'ar' ? 'فشل تنفيذ قرار القبول' : 'Failed to approve script'));
    } finally {
      setApproveDecisionSubmitting(false);
    }
  }, [
    approveDecisionReportId,
    closeApproveDecisionConfirm,
    fetchInitialData,
    lang,
    loadReportHistory,
    script?.id,
  ]);

  const handleReview = async (reportId: string, status: ReviewStatus, notes?: string) => {
    if (status === 'rejected') {
      openRejectDecisionModal(reportId);
      return;
    }

    let resolvedNotes = notes ?? '';
    if (status === 'under_review' && !resolvedNotes.trim()) {
      const promptLabel = lang === 'ar'
        ? 'اذكر سبب إعادة التقرير للمراجعة'
        : 'Enter the reason for sending this report back for review';
      const entered = window.prompt(promptLabel, '');
      if (entered == null) return;
      resolvedNotes = entered.trim();
      if (!resolvedNotes) {
        toast.error(lang === 'ar' ? 'سبب إعادة المراجعة مطلوب' : 'A re-review reason is required');
        return;
      }
    }
    try {
      const shouldSyncScriptStatus = status === 'approved';
      await reportsApi.review(reportId, status, resolvedNotes, shouldSyncScriptStatus);
      toast.success(lang === 'ar' ? 'تم تحديث حالة المراجعة' : 'Review status updated');
      if (selectedReportForHighlights?.id === reportId) {
        setSelectedReportForHighlights((prev) =>
          prev && prev.id === reportId
            ? { ...prev, reviewStatus: status }
            : prev
        );
        setSelectedReportSummary((prev) =>
          prev && prev.id === reportId
            ? {
                ...prev,
                reviewStatus: status,
                reviewNotes: resolvedNotes || prev.reviewNotes,
                reviewedAt: new Date().toISOString(),
                reviewedBy: user?.id ?? prev.reviewedBy ?? null,
              }
            : prev
        );
      }
      loadReportHistory();
      if (shouldSyncScriptStatus) {
        await fetchInitialData();
      }
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to update review');
    }
  };

  const handleDeleteReport = async (reportId: string) => {
    const yes = confirm(lang === 'ar' ? 'هل أنت متأكد من حذف هذا التقرير؟' : 'Are you sure you want to delete this report?');
    if (!yes) return;
    try {
      await reportsApi.deleteReport(reportId);
      toast.success(lang === 'ar' ? 'تم حذف التقرير' : 'Report deleted');
      if (selectedReportForHighlights?.id === reportId) {
        setSelectedReportForHighlights(null);
        setSelectedReportSummary(null);
        setSelectedJobCanonicalHash(null);
        setReportFindings([]);
        setReportReviewFindings([]);
      }
      loadReportHistory();
    } catch (err: any) {
      toast.error(err?.message ?? 'Delete failed');
    }
  };

  const handleSelectReportForHighlights = useCallback(async (report: ReportListItem) => {
    const reportId = report.id;
    const jobId = report.jobId;
    if (!jobId && !reportId) return;
    if (IS_DEV) console.log('[ScriptWorkspace] Highlight clicked:', { reportId, jobId });
    setSelectedReportForHighlights(report);
    setPinnedHighlight(null);
    // setReportFindingsLoading(true);
    setSelectedFindingId(null);
    setSelectedReportFindingIds([]);
    setHighlightExpectedCount(0);
    setHighlightLocatableCount(0);
    setHighlightRenderedCount(0);
    try {
      if (jobId) {
        const [job, list, reviewList, fullReport] = await Promise.all([
          tasksApi.getJob(jobId),
          findingsApi.getByJob(jobId),
          findingsApi.getReviewByJob(jobId),
          reportsApi.getByJob(jobId),
        ]);
        setSelectedJobCanonicalHash((job as { scriptContentHash?: string | null }).scriptContentHash ?? null);
        setSelectedReportSummary(fullReport);
        setReportFindings(list);
        setReportReviewFindings(reviewList);
        if (IS_DEV) console.log('[ScriptWorkspace] Findings loaded for highlights:', list.length);
        if (id) {
          scriptsApi.setHighlightPreference(id, jobId).catch(() => { });
        }
      } else {
        setSelectedJobCanonicalHash(null);
        const [list, reviewList, fullReport] = await Promise.all([
          findingsApi.getByReport(reportId!),
          findingsApi.getReviewByReport(reportId!),
          reportsApi.getById(reportId!),
        ]);
        setSelectedReportSummary(fullReport);
        setReportFindings(list);
        setReportReviewFindings(reviewList);
        if (IS_DEV) console.log('[ScriptWorkspace] Findings loaded for highlights:', list.length);
      }
    } catch (_) {
      setReportFindings([]);
      setReportReviewFindings([]);
      setSelectedReportSummary(null);
      setSelectedJobCanonicalHash(null);
      toast.error(lang === 'ar' ? 'فشل تحميل الملاحظات' : 'Failed to load findings');
    } finally {
      // setReportFindingsLoading(false);
    }
  }, [id, lang]);

  const handleReportFindingReviewSubmit = useCallback(async () => {
    if (!reportFindingReviewModal) return;
    const reason = reportFindingReviewReason.trim();
    const requireReason = settings?.platform?.requireOverrideReason !== false;
    if (requireReason && reason.length < 2) {
      toast.error(lang === 'ar' ? 'يرجى إدخال سبب' : 'Please enter a reason');
      return;
    }
    setReportFindingReviewSaving(true);
    try {
      await findingsApi.reviewFinding(reportFindingReviewModal.findingId, reportFindingReviewModal.toStatus, reason || '');
      setReportFindings((prev) =>
        prev.map((f) =>
          f.id === reportFindingReviewModal.findingId
            ? {
                ...f,
                reviewStatus: reportFindingReviewModal.toStatus,
                reviewReason: reason,
                reviewedAt: new Date().toISOString(),
                reviewedBy: user?.id ?? null,
              }
            : f
        )
      );
      await reloadSelectedReportReviewLayer();
      toast.success(
        reportFindingReviewModal.toStatus === 'approved'
          ? lang === 'ar'
            ? 'تم اعتماد الملاحظة كآمنة'
            : 'Finding marked as safe'
          : lang === 'ar'
            ? 'تم إعادة الملاحظة كمخالفة'
            : 'Finding reverted to violation'
      );
      setReportFindingReviewModal(null);
      setReportFindingReviewReason('');
      setHighlightRetryTick((n) => n + 1);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : lang === 'ar' ? 'فشل الحفظ' : 'Failed');
    } finally {
      setReportFindingReviewSaving(false);
    }
  }, [reportFindingReviewModal, reportFindingReviewReason, settings?.platform?.requireOverrideReason, lang, user?.id, reloadSelectedReportReviewLayer]);

  const handleBulkReportFindingReviewSubmit = useCallback(async () => {
    if (!bulkReportFindingReviewModal) return;
    const reason = bulkReportFindingReviewReason.trim();
    const requireReason = settings?.platform?.requireOverrideReason !== false;
    if (requireReason && reason.length < 2) {
      toast.error(lang === 'ar' ? 'يرجى إدخال سبب' : 'Please enter a reason');
      return;
    }
    setBulkReportFindingReviewSaving(true);
    try {
      await Promise.all(
        bulkReportFindingReviewModal.findingIds.map((findingId) =>
          findingsApi.reviewFinding(findingId, bulkReportFindingReviewModal.toStatus, reason || '')
        )
      );
      const selectedIds = new Set(bulkReportFindingReviewModal.findingIds);
      setReportFindings((prev) =>
        prev.map((f) =>
          selectedIds.has(f.id)
            ? {
                ...f,
                reviewStatus: bulkReportFindingReviewModal.toStatus,
                reviewReason: reason,
                reviewedAt: new Date().toISOString(),
                reviewedBy: user?.id ?? null,
              }
            : f
        )
      );
      await reloadSelectedReportReviewLayer();
      setSelectedReportFindingIds([]);
      toast.success(
        bulkReportFindingReviewModal.toStatus === 'approved'
          ? (lang === 'ar'
              ? `تم اعتماد ${bulkReportFindingReviewModal.findingIds.length} ملاحظة كآمنة`
              : `${bulkReportFindingReviewModal.findingIds.length} findings marked safe`)
          : (lang === 'ar'
              ? `تمت إعادة ${bulkReportFindingReviewModal.findingIds.length} ملاحظة كمخالفات`
              : `${bulkReportFindingReviewModal.findingIds.length} findings reverted to violations`)
      );
      setBulkReportFindingReviewModal(null);
      setBulkReportFindingReviewReason('');
    } catch (err: any) {
      toast.error(err?.message ?? (lang === 'ar' ? 'فشلت المراجعة الجماعية' : 'Bulk review failed'));
    } finally {
      setBulkReportFindingReviewSaving(false);
    }
  }, [
    bulkReportFindingReviewModal,
    bulkReportFindingReviewReason,
    settings?.platform?.requireOverrideReason,
    lang,
    user?.id,
    reloadSelectedReportReviewLayer,
  ]);

  const handleEditReportFindingSubmit = useCallback(async () => {
    if (!editReportFindingModal) return;
    if (!editReportFindingForm.evidenceSnippet.trim()) {
      toast.error(lang === 'ar' ? 'النص المقتبس مطلوب' : 'Snippet text is required');
      return;
    }
    setEditReportFindingSaving(true);
    try {
      const res = await findingsApi.reclassifyFinding({
        findingId: editReportFindingModal.id,
        articleId: parseInt(editReportFindingForm.articleId, 10) || DEFAULT_ACTIONABLE_ARTICLE_ID,
        atomId: null,
        severity: editReportFindingForm.severity,
        evidenceSnippet: editReportFindingForm.evidenceSnippet?.trim() || null,
        rationaleAr: editReportFindingForm.rationaleAr?.trim() || null,
        manualComment: editReportFindingForm.manualComment?.trim() || null,
      });
      if (res.finding) {
        setReportFindings((prev) => prev.map((f) => (f.id === res.finding!.id ? res.finding! : f)));
      }
      await reloadSelectedReportReviewLayer();
      if (res.atomMappingWarning) {
        toast((t) => (
          <div className="max-w-sm text-sm">
            <p className="font-semibold mb-1">{lang === 'ar' ? 'تم الحفظ مع ملاحظة' : 'Saved with note'}</p>
            <p>{res.atomMappingWarning}</p>
          </div>
        ));
      } else {
        toast.success(lang === 'ar' ? 'تم تحديث التصنيف' : 'Finding classification updated');
      }
      setEditReportFindingSnippetValidation(null);
      setEditReportFindingModal(null);
    } catch (err: any) {
      toast.error(err?.message ?? (lang === 'ar' ? 'تعذر تحديث التصنيف' : 'Failed to update finding'));
    } finally {
      setEditReportFindingSaving(false);
    }
  }, [editReportFindingModal, editReportFindingForm, lang, reloadSelectedReportReviewLayer]);

  const handleValidateEditedReportFindingSnippet = useCallback(async () => {
    if (!editReportFindingModal) return;
    const snippet = editReportFindingForm.evidenceSnippet.trim();
    if (!snippet) {
      toast.error(lang === 'ar' ? 'أدخل النص أولاً للتحقق منه' : 'Enter snippet text first');
      return;
    }
    setEditReportFindingValidatingSnippet(true);
    try {
      const res = await findingsApi.validateFindingSnippet({
        findingId: editReportFindingModal.id,
        snippet,
      });
      if (!res.found) {
        setEditReportFindingSnippetValidation(lang === 'ar' ? 'النص غير موجود في المستند.' : 'Snippet not found in the document.');
        toast.error(lang === 'ar' ? 'النص غير موجود في المستند' : 'Snippet not found in the document');
        return;
      }
      if (res.snippet) {
        setEditReportFindingForm((prev) => ({ ...prev, evidenceSnippet: res.snippet ?? prev.evidenceSnippet }));
      }
      const locationLabel = res.pageNumber != null
        ? (lang === 'ar' ? `تم العثور على النص في الصفحة ${res.pageNumber}.` : `Snippet found on page ${res.pageNumber}.`)
        : (lang === 'ar' ? 'تم العثور على النص في المستند.' : 'Snippet found in the document.');
      const duplicateLabel = (res.matchCount ?? 0) > 1
        ? (lang === 'ar' ? ' سيتم ربط أقرب تطابق إلى الموقع الحالي.' : ' The nearest match to the current location will be used.')
        : '';
      const message = `${locationLabel}${duplicateLabel}`;
      setEditReportFindingSnippetValidation(message);
      toast.success(message);
    } catch (err: any) {
      const message = err?.message ?? (lang === 'ar' ? 'تعذر التحقق من النص' : 'Could not validate snippet');
      setEditReportFindingSnippetValidation(message);
      toast.error(message);
    } finally {
      setEditReportFindingValidatingSnippet(false);
    }
  }, [editReportFindingForm.evidenceSnippet, editReportFindingModal, lang]);

  // Restore saved highlight preference when report list is ready (persists across logout/login)
  useEffect(() => {
    if (!id || reportHistory.length === 0 || restoredHighlightRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        const pref = await scriptsApi.getHighlightPreference(id);
        if (cancelled) return;
        if (!pref.jobId) {
          restoredHighlightRef.current = true;
          return;
        }
        const report = reportHistory.find((r) => r.jobId === pref.jobId);
        if (!report) {
          restoredHighlightRef.current = true;
          return;
        }
        restoredHighlightRef.current = true;
        handleSelectReportForHighlights(report);
      } catch (_) {
        if (!cancelled) restoredHighlightRef.current = true;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, reportHistory, handleSelectReportForHighlights]);

  useEffect(() => {
    if (selectedFindingId && findingCardRefs.current[selectedFindingId]) {
      findingCardRefs.current[selectedFindingId]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [selectedFindingId]);

  const editorRef = useRef<HTMLDivElement>(null);
  const viewerScrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isSelectingRef = useRef(false);
  /** Tracks contentHtml we last wrote to the editor div so we only set innerHTML when it changes (keeps highlight spans from being wiped by React). */
  // const editorContentHtmlSetRef = useRef<string | null>(null);
  /** Tracks contentHtml we last built domTextIndex for; skip rebuild when unchanged so closing modal doesn't trigger rebuild → highlight re-run race. */
  // const lastContentHtmlForIndexRef = useRef<string | null>(null);
  /** DEV: cap guard/applied logs to when findings length changed (avoid spam). */
  const lastHighlightGuardLogFindingsRef = useRef<number | null>(null);
  // const lastHighlightAppliedLogFindingsRef = useRef<number | null>(null);
  const [domTextIndex, setDomTextIndex] = useState<DomTextIndex | null>(null);

  // Editor content and sections (from GET /scripts/editor)
  const [editorData, setEditorData] = useState<EditorContentResponse | null>(null);
  const [editorLoading, setEditorLoading] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [isDownloadingAnnotatedPdf, setIsDownloadingAnnotatedPdf] = useState(false);

  // Page-based view (when editorData.pages exists)
  const [currentPage, setCurrentPage] = useState(1);
  const [zoomLevel, setZoomLevel] = useState(1);
  /** Original PDF canvas vs extracted HTML (PDF imports only). */
  const [workspaceViewMode, setWorkspaceViewMode] = useState<'text' | 'pdf'>('text');
  const totalPages = editorData?.pages?.length ?? 0;
  const isPageMode = totalPages > 0;
  const safeCurrentPage = Math.max(1, Math.min(currentPage, totalPages || 1));
  const strictImportedAnchoring = !editorData?.sourcePdfSignedUrl;
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    setPageNoticesOpen(false);
  }, [safeCurrentPage, workspaceViewMode]);

  useEffect(() => {
    const p = searchParams.get('page');
    if (!isPageMode || !p || !totalPages) return;
    const n = parseInt(p, 10);
    if (Number.isFinite(n) && n >= 1 && n <= totalPages) setCurrentPage(n);
  }, [searchParams, isPageMode, totalPages]);

  useEffect(() => {
    if (!editorData?.sourcePdfSignedUrl) {
      setWorkspaceViewMode('text');
      return;
    }
    if (!script?.id || !script?.currentVersionId) {
      setWorkspaceViewMode('pdf');
      return;
    }
    const key = `workspace-view-mode:${script.id}:${script.currentVersionId}`;
    try {
      const saved = window.localStorage.getItem(key);
      if (saved === 'pdf' || saved === 'text') {
        setWorkspaceViewMode(saved);
      } else {
        setWorkspaceViewMode('pdf');
      }
    } catch {
      setWorkspaceViewMode('pdf');
    }
  }, [editorData?.sourcePdfSignedUrl, script?.id, script?.currentVersionId]);

  useEffect(() => {
    if (!editorData?.sourcePdfSignedUrl || !script?.id || !script?.currentVersionId) return;
    const key = `workspace-view-mode:${script.id}:${script.currentVersionId}`;
    try {
      window.localStorage.setItem(key, workspaceViewMode);
    } catch {
      // Ignore persistence issues.
    }
  }, [workspaceViewMode, editorData?.sourcePdfSignedUrl, script?.id, script?.currentVersionId]);

  const loadEditor = useCallback(async () => {
    if (!script?.id || !script?.currentVersionId) {
      setEditorData(null);
      return;
    }
    setEditorLoading(true);
    setEditorError(null);
    try {
      const data = await scriptsApi.getEditor(script.id, script.currentVersionId);
      setEditorData(data);
    } catch (err: any) {
      setEditorError(err?.message ?? 'Failed to load editor');
      setEditorData(null);
    } finally {
      setEditorLoading(false);
    }
  }, [script?.id, script?.currentVersionId]);

  useEffect(() => {
    loadEditor();
  }, [loadEditor]);

  // When editor data gets pages, reset to page 1 if current is out of range
  useEffect(() => {
    if (totalPages > 0 && (currentPage < 1 || currentPage > totalPages)) {
      setCurrentPage(1);
    }
  }, [totalPages, currentPage]);

  // After import, refetch editor so new content/sections appear
  useEffect(() => {
    if (uploadStatus === 'done' && script?.id && script?.currentVersionId) {
      loadEditor();
    }
  }, [uploadStatus, script?.id, script?.currentVersionId, loadEditor]);

  // const scrollToSection = useCallback((startOffset: number, index: number) => {
  //   const el = viewerScrollRef.current?.querySelector(`[data-section-index="${index}"]`);
  //   if (el) {
  //     el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  //   }
  // }, []);

  useEffect(() => {
    if (!location.hash) return;
    const hashId = location.hash.replace('#', '');
    const findingUuid = hashId.startsWith('highlight-') ? hashId.slice('highlight-'.length) : '';
    const delay = isPageMode && findingUuid ? 600 : 500;
    const t = window.setTimeout(() => {
      let el: Element | null = document.getElementById(hashId);
      if (!el && findingUuid && editorRef.current) {
        el = editorRef.current.querySelector(`[data-finding-id="${findingUuid}"]`);
      }
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('bg-primary/30', 'animate-pulse');
        setTimeout(() => el.classList.remove('bg-primary/30', 'animate-pulse'), 3000);
      }
    }, delay);
    return () => window.clearTimeout(t);
  }, [location.hash, scriptFindings, isPageMode, safeCurrentPage]);

  // Build DOM text index: full script HTML (scroll mode) OR current page container (page mode).
  // Page mode must not use full-document innerHTML — ref holds per-page HTML only.
  useEffect(() => {
    const pageData = editorData?.pages?.[safeCurrentPage - 1];
    const inPageMode = (editorData?.pages?.length ?? 0) > 0;

    if (inPageMode) {
      // Per-page HTML: index is built in useLayoutEffect right after innerHTML (avoids React
      // wiping highlights and avoids re-indexing DOM that already contains highlight spans).
      if (!strictImportedAnchoring && pageData?.contentHtml?.trim()) {
        return;
      }
      const timer = setTimeout(() => {
        if (!editorRef.current || (!pageData?.contentHtml && !(pageData?.content?.length))) {
          setDomTextIndex(null);
          return;
        }
        const idx = buildDomTextIndex(editorRef.current);
        setDomTextIndex(idx);
        if (IS_DEV && idx) {
          console.log('[ScriptWorkspace] Page DOM text index len:', idx.normalizedText.length, 'page', safeCurrentPage);
        }
      }, 160);
      return () => clearTimeout(timer);
    }

    if (strictImportedAnchoring || !editorData?.contentHtml) {
      setDomTextIndex(null);
      return;
    }
    const timer = setTimeout(() => {
      if (editorRef.current) {
        const idx = buildDomTextIndex(editorRef.current);
        setDomTextIndex(idx);
        if (IS_DEV && idx) console.log('[ScriptWorkspace] Full-doc DOM text index len:', idx.normalizedText.length);
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [editorData?.contentHtml, editorData?.pages, safeCurrentPage, strictImportedAnchoring]);

  // Inject full-document HTML only in scroll mode (page mode uses React per-page content).
  useLayoutEffect(() => {
    if ((editorData?.pages?.length ?? 0) > 0) return;
    if (strictImportedAnchoring) return;
    if (!editorRef.current || !editorData?.contentHtml) return;
    const newHtml = sanitizeFormattedHtml(editorData.contentHtml);
    if (editorRef.current.innerHTML !== newHtml) {
      editorRef.current.innerHTML = newHtml;
      if (IS_DEV) console.log('[ScriptWorkspace] innerHTML updated (scroll mode)');
    }
  }, [editorData?.contentHtml, editorData?.pages?.length, strictImportedAnchoring]);

  /**
   * Page mode + formatted HTML: set innerHTML on the viewer div imperatively.
   * A child with dangerouslySetInnerHTML is re-applied on every React re-render (sidebar,
   * highlight counts, selection), wiping highlight spans from applyHighlightMarks.
   */
  const pageHtmlForLayout = editorData?.pages?.[safeCurrentPage - 1]?.contentHtml;
  useLayoutEffect(() => {
    if ((editorData?.pages?.length ?? 0) === 0) return;
    if (strictImportedAnchoring) return;
    // Editor div unmounts in PDF view; switching back must re-apply HTML (deps were unchanged).
    if (workspaceViewMode !== 'text') return;
    const el = editorRef.current;
    if (!pageHtmlForLayout?.trim() || !el) return;
    const html = sanitizeFormattedHtml(pageHtmlForLayout);
    if (el.innerHTML !== html) {
      el.innerHTML = html;
      const idx = buildDomTextIndex(el);
      setDomTextIndex(idx ?? null);
    }
  }, [editorData?.pages?.length, safeCurrentPage, pageHtmlForLayout, workspaceViewMode, strictImportedAnchoring]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null);
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, []);

  // Keep workspace content visible once script is loaded; global background refreshes should
  // not blank the editor text view. When script is not in list we fetch by id (e.g. after Quick Analysis);
  // treat that as loading so we don't flash the error screen.
  const showLoading = (isLoading && !script) || (scriptByIdLoading && !script);
  const showError = !isLoading && !scriptByIdLoading && !script;

  const handleRetryScript = async () => {
    await fetchInitialData();
  };

  const handleStartAnalysis = async () => {
    if (!script?.currentVersionId) {
      toast.error(lang === 'ar' ? 'ارفع ملف نص أولاً لتفعيل التحليل.' : 'Upload a script file first to run analysis.');
      return;
    }
    setIsAnalyzing(true);
    try {
      const { jobId, manualReviewContextCount } = await scriptsApi.createTask(script.currentVersionId, {
        forceFresh: true,
        analysisProfile: analysisModeProfile,
        pipelineVersion: 'v2',
      });
      setAnalysisJobId(jobId);
      setAnalysisJob(null);
      setChunkStatuses([]);
      setDebugOpen(false);
      setAnalysisModalOpen(true);
      startPolling(jobId);
      toast.success(lang === 'ar' ? 'تم بدء التحليل.' : 'Analysis started.');
      if ((manualReviewContextCount ?? 0) > 0) {
        toast(
          lang === 'ar'
            ? `تم حمل ${manualReviewContextCount} ملاحظة يدوية من المراجعات السابقة إلى هذه الجولة.`
            : `${manualReviewContextCount} manual review notes were carried into this analysis run.`,
          { duration: 5000 }
        );
      }
    } catch (err: any) {
      console.error('[ScriptWorkspace] Analysis trigger failed:', err);
      toast.error(err?.message ?? (lang === 'ar' ? 'فشل تفعيل التحليل' : 'Failed to start analysis'));
    } finally {
      setIsAnalyzing(false);
    }
  };



  const isAnalysisRunning = analysisJob != null && !isTerminalJobStatus(analysisJob.status);
  const chunkCountFromJob = Math.max(0, (analysisJob?.progressTotal ?? 0) - 1);
  const hasTrackedChunks = chunkStatuses.length > 0;
  const totalChunksTracked = hasTrackedChunks ? chunkStatuses.length : chunkCountFromJob;
  const doneChunks = chunkStatuses.filter((c) => c.status === 'done').length;
  const isCompletedSuccessfully = analysisJob != null && isSuccessfulJobStatus(analysisJob.status);
  const progressDisplayDone = isCompletedSuccessfully
    ? (analysisJob?.isPartialReport
        ? (hasTrackedChunks ? doneChunks : (analysisJob?.progressDone ?? 0))
        : (totalChunksTracked > 0 ? totalChunksTracked : (analysisJob?.progressTotal ?? 0)))
    : totalChunksTracked > 0
      ? doneChunks
      : (analysisJob?.progressDone ?? 0);
  const progressDisplayTotal = totalChunksTracked > 0 ? totalChunksTracked : (analysisJob?.progressTotal ?? 0);
  const progressDisplayPair = `${progressDisplayDone} / ${progressDisplayTotal}`;
  const activeChunk = chunkStatuses.find((c) => c.status === 'judging') ?? null;
  const activeChunkNumber = activeChunk ? activeChunk.chunkIndex + 1 : null;
  const activeChunkLabel = activeChunkNumber != null
    ? (lang === 'ar' ? `الجزء ${activeChunkNumber}` : `Chunk ${activeChunkNumber}`)
    : null;

  const activePhaseLabel = useMemo(() => {
    const p = activeChunk?.processingPhase;
    if (!p) return null;
    const m = PROCESSING_PHASE_LABELS[p];
    return m ? (lang === 'ar' ? m.ar : m.en) : p;
  }, [activeChunk?.processingPhase, lang]);

  const passProgressLine = useMemo(() => {
    if (activeChunk?.status !== 'judging') return null;
    const t = activeChunk.passesTotal ?? 0;
    const d = activeChunk.passesCompleted ?? 0;
    if (t <= 0) return null;
    return lang === 'ar'
      ? `المكشوفات المكتملة: ${d} من ${t} (تُحدَّث أثناء التشغيل المتوازي)`
      : `Detectors finished: ${d} of ${t} (parallel; completion order varies)`;
  }, [activeChunk, lang]);

  const [analysisTimerNow, setAnalysisTimerNow] = useState(() => Date.now());
  useEffect(() => {
    const shouldTick =
      analysisModalOpen &&
      analysisJob != null &&
      analysisJob.startedAt != null &&
      !analysisJob.completedAt &&
      !isPausedJobStatus(analysisJob.status);
    if (!shouldTick) return;
    setAnalysisTimerNow(Date.now());
    const timer = window.setInterval(() => setAnalysisTimerNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [analysisModalOpen, analysisJob?.startedAt, analysisJob?.completedAt, analysisJob?.status]);

  const analysisElapsedLabel = useMemo(() => {
    if (!analysisJob) return null;
    const startedAtMs = analysisJob.startedAt ? new Date(analysisJob.startedAt).getTime() : null;
    const fallbackStartMs = analysisJob.createdAt ? new Date(analysisJob.createdAt).getTime() : null;
    const pausedAtMs = analysisJob.pausedAt ? new Date(analysisJob.pausedAt).getTime() : null;
    const endAtMs = analysisJob.completedAt
      ? new Date(analysisJob.completedAt).getTime()
      : pausedAtMs ?? analysisTimerNow;
    const startMs = startedAtMs ?? fallbackStartMs;
    if (!startMs || !Number.isFinite(startMs) || !Number.isFinite(endAtMs)) return null;
    const elapsedMs = Math.max(0, endAtMs - startMs);
    return lang === 'ar'
      ? `المدة: ${formatAnalysisElapsed(elapsedMs, lang)}`
      : `Elapsed: ${formatAnalysisElapsed(elapsedMs, lang)}`;
  }, [analysisJob, analysisTimerNow, lang]);

  const activeChunkAgeMs = useMemo(() => {
    if (!activeChunk?.judgingStartedAt) return null;
    const started = new Date(activeChunk.judgingStartedAt).getTime();
    if (!Number.isFinite(started)) return null;
    return Math.max(0, analysisTimerNow - started);
  }, [activeChunk?.judgingStartedAt, analysisTimerNow]);

  const activeChunkAgeLabel = useMemo(() => {
    if (activeChunkAgeMs == null) return null;
    return lang === 'ar'
      ? `زمن الجزء الجاري: ${formatRelativeDuration(activeChunkAgeMs, lang)}`
      : `Active chunk time: ${formatRelativeDuration(activeChunkAgeMs, lang)}`;
  }, [activeChunkAgeMs, lang]);

  const activeChunkActivitySignature = useMemo(
    () =>
      activeChunk == null
        ? null
        : [
            activeChunk.chunkIndex,
            activeChunk.status,
            activeChunk.processingPhase ?? '',
            activeChunk.passesCompleted ?? '',
            activeChunk.passesTotal ?? '',
            activeChunk.pageNumberMin ?? '',
            activeChunk.pageNumberMax ?? '',
            activeChunk.lastError ?? '',
          ].join('|'),
    [activeChunk],
  );
  const [activeChunkLastMovementAt, setActiveChunkLastMovementAt] = useState<number | null>(null);
  const activeChunkLastMovementSignatureRef = useRef<string | null>(null);
  const completedChunksCount = useMemo(
    () => chunkStatuses.filter((c) => c.status === 'done').length,
    [chunkStatuses],
  );
  const completedChunksCountRef = useRef(0);

  useEffect(() => {
    if (!analysisModalOpen) return;
    if (!analysisJob || isTerminalJobStatus(analysisJob.status) || isPausedJobStatus(analysisJob.status)) return;
    if (!activeChunkActivitySignature) return;

    const completedChanged = completedChunksCount !== completedChunksCountRef.current;
    const signatureChanged = activeChunkActivitySignature !== activeChunkLastMovementSignatureRef.current;
    if (signatureChanged || completedChanged) {
      activeChunkLastMovementSignatureRef.current = activeChunkActivitySignature;
      completedChunksCountRef.current = completedChunksCount;
      setActiveChunkLastMovementAt(Date.now());
    }
  }, [
    analysisModalOpen,
    analysisJob,
    activeChunkActivitySignature,
    completedChunksCount,
  ]);

  useEffect(() => {
    if (!analysisModalOpen || !analysisJobId) {
      activeChunkLastMovementSignatureRef.current = null;
      completedChunksCountRef.current = 0;
      setActiveChunkLastMovementAt(null);
      return;
    }
    if (isTerminalJobStatus(analysisJob?.status) || isPausedJobStatus(analysisJob?.status)) {
      activeChunkLastMovementSignatureRef.current = activeChunkActivitySignature;
      completedChunksCountRef.current = completedChunksCount;
      setActiveChunkLastMovementAt(null);
    }
  }, [
    analysisModalOpen,
    analysisJobId,
    analysisJob?.status,
    activeChunkActivitySignature,
    completedChunksCount,
  ]);

  const activeChunkIdleMs = useMemo(() => {
    if (!activeChunkActivitySignature || activeChunkLastMovementAt == null) return null;
    return Math.max(0, analysisTimerNow - activeChunkLastMovementAt);
  }, [activeChunkActivitySignature, activeChunkLastMovementAt, analysisTimerNow]);

  const activeChunkIsStalled = useMemo(() => {
    if (activeChunkIdleMs == null) return false;
    return activeChunkIdleMs >= 10 * 60 * 1000;
  }, [activeChunkIdleMs]);

  const latestCompletedChunk = useMemo(() => {
    const done = chunkStatuses.filter((c) => c.status === 'done');
    if (done.length === 0) return null;
    return [...done].sort((a, b) => b.chunkIndex - a.chunkIndex)[0] ?? null;
  }, [chunkStatuses]);

  const previewContextLabel = useMemo(() => {
    if (activeChunkLabel) return activeChunkLabel;
    if (latestCompletedChunk) {
      return lang === 'ar'
        ? `آخر جزء مكتمل: الجزء ${latestCompletedChunk.chunkIndex + 1}`
        : `Last completed chunk: chunk ${latestCompletedChunk.chunkIndex + 1}`;
    }
    return lang === 'ar'
      ? 'يعرض هذا القسم النص الجاري فحصه أو آخر جزء اكتمل.'
      : 'This panel shows the active chunk text or the most recently completed one.';
  }, [activeChunkLabel, latestCompletedChunk, lang]);

  const analysisStatusCaption = useMemo(() => {
    if (isSuccessfulJobStatus(analysisJob?.status)) {
      return analysisJob?.isPartialReport
        ? (lang === 'ar' ? 'تم حفظ التقدم الحالي وتحويله إلى تقرير جزئي جاهز للمراجعة.' : 'The saved progress has been turned into a partial report ready for review.')
        : (lang === 'ar' ? 'اكتمل الفحص ويمكنك الآن فتح التقرير النهائي.' : 'The analysis is complete and the final report is ready.');
    }
    if ((analysisJob?.status ?? '').toLowerCase() === 'cancelled') {
      return lang === 'ar'
        ? 'تم إيقاف التحليل بالكامل. لن تتم متابعة أي أجزاء جديدة ولن يتم إنشاء تقرير جزئي لهذه الجلسة.'
        : 'The analysis was cancelled completely. No new chunks will be processed and no partial report will be created for this run.';
    }
    if (isStoppingJobStatus(analysisJob?.status)) {
      return lang === 'ar'
        ? 'لن يبدأ النظام أجزاء جديدة الآن. سيُنهي الجزء الجاري فقط ثم يبني تقريراً جزئياً سريعاً من النتائج المكتملة بدون تشغيل التحسينات الثقيلة.'
        : 'No new chunks will be started now. The worker will finish only the current chunk, then build a faster partial report from the completed results without the heavier enrichments.';
    }
    if (isPausedJobStatus(analysisJob?.status)) {
      return lang === 'ar'
        ? 'التقدم محفوظ. يمكنك استئناف التحليل لاحقاً من نفس النقطة تقريباً.'
        : 'Your progress is preserved. You can resume analysis later from roughly the same point.';
    }
    if ((analysisJob?.status ?? '').toLowerCase() === 'failed') {
      return lang === 'ar'
        ? 'توقف التحليل بسبب خطأ. يمكنك الإغلاق أو إعادة المحاولة بعد مراجعة الرسالة.'
        : 'The analysis stopped because of an error. You can close this dialog or retry after reviewing the message.';
    }
    if (isQueuedJobStatus(analysisJob?.status)) {
      return lang === 'ar'
        ? 'تمت جدولة المهمة وهي بانتظار أن يلتقطها العامل. سيبدأ عرض الجزء الجاري فور بدء التنفيذ الفعلي.'
        : 'The job is queued and waiting for the worker to pick it up. The active chunk will appear as soon as execution starts.';
    }
    return lang === 'ar'
      ? 'يعمل النظام على تحليل النص جزءاً بعد جزء مع تحديثات مباشرة عن المرحلة الحالية.'
      : 'The system is analyzing the script chunk by chunk and updating this panel live.';
  }, [analysisJob?.isPartialReport, analysisJob?.status, lang]);

  const analysisStatusToneClass = isSuccessfulJobStatus(analysisJob?.status)
    ? 'text-success'
    : isCancelledJobStatus(analysisJob?.status)
      ? 'text-warning'
    : isQueuedJobStatus(analysisJob?.status)
      ? 'text-text-muted'
    : isStoppingJobStatus(analysisJob?.status)
      ? 'text-warning'
      : isPausedJobStatus(analysisJob?.status)
        ? 'text-warning'
        : (analysisJob?.status ?? '').toLowerCase() === 'failed'
          ? 'text-error'
          : 'text-primary';

  const selectedAnalysisModeMeta = useMemo(
    () => ANALYSIS_MODE_OPTIONS.find((option) => option.value === (analysisJob?.analysisMode ?? analysisModeProfile)) ?? ANALYSIS_MODE_OPTIONS[1],
    [analysisJob?.analysisMode, analysisModeProfile]
  );
  const selectedPipelineMeta = useMemo(
    () => ANALYSIS_PIPELINE_OPTIONS.find((option) => option.value === (analysisJob?.pipelineVersion ?? analysisPipelineVersion)) ?? ANALYSIS_PIPELINE_OPTIONS[0],
    [analysisJob?.pipelineVersion, analysisPipelineVersion]
  );
  const activeChunkTimerValue = activeChunkAgeLabel
    ? activeChunkAgeLabel.replace(/^زمن الجزء الجاري:\s*/, '').replace(/^Active chunk time:\s*/, '')
    : '—';
  const handlePauseAnalysis = useCallback(async () => {
    if (!analysisJobId || analysisControlBusy) return;
    setAnalysisControlBusy('pause');
    try {
      const job = await tasksApi.pauseJob(analysisJobId);
      setAnalysisJob(job);
      toast.success(lang === 'ar' ? 'تم إيقاف التحليل مؤقتاً.' : 'Analysis paused.');
    } catch (err: any) {
      toast.error(err?.message ?? (lang === 'ar' ? 'تعذر إيقاف التحليل مؤقتاً' : 'Failed to pause analysis'));
    } finally {
      setAnalysisControlBusy(null);
    }
  }, [analysisJobId, analysisControlBusy, lang]);

  const handleResumeAnalysis = useCallback(async () => {
    if (!analysisJobId || analysisControlBusy) return;
    setAnalysisControlBusy('resume');
    try {
      const job = await tasksApi.resumeJob(analysisJobId);
      setAnalysisJob(job);
      startPolling(analysisJobId);
      toast.success(lang === 'ar' ? 'تم استئناف التحليل.' : 'Analysis resumed.');
    } catch (err: any) {
      toast.error(err?.message ?? (lang === 'ar' ? 'تعذر استئناف التحليل' : 'Failed to resume analysis'));
    } finally {
      setAnalysisControlBusy(null);
    }
  }, [analysisJobId, analysisControlBusy, lang, startPolling]);

  const handleStopAnalysis = useCallback(async () => {
    if (!analysisJobId || analysisControlBusy) return;
    setAnalysisControlBusy('stop');
    try {
      const job = await tasksApi.stopJob(analysisJobId);
      setAnalysisJob(job);
      toast.success(lang === 'ar' ? 'سيتم إنشاء تقرير جزئي بعد إنهاء الجزء الجاري.' : 'A partial report will be generated after the current chunk finishes.');
    } catch (err: any) {
      toast.error(err?.message ?? (lang === 'ar' ? 'تعذر إيقاف التحليل وإنشاء تقرير جزئي' : 'Failed to stop analysis and generate a partial report'));
    } finally {
      setAnalysisControlBusy(null);
    }
  }, [analysisJobId, analysisControlBusy, lang]);

  const handleCancelAnalysis = useCallback(async () => {
    if (!analysisJobId || analysisControlBusy) return;
    const confirmed = window.confirm(
      lang === 'ar'
        ? 'سيتم إيقاف التحليل بالكامل وإغلاقه دون إنشاء تقرير جزئي. هل تريد المتابعة؟'
        : 'This will cancel the analysis completely without generating a partial report. Continue?',
    );
    if (!confirmed) return;
    setAnalysisControlBusy('cancel');
    try {
      const job = await tasksApi.cancelJob(analysisJobId);
      setAnalysisJob(job);
      stopPolling();
      toast.success(lang === 'ar' ? 'تم إيقاف التحليل بالكامل.' : 'Analysis cancelled completely.');
    } catch (err: any) {
      toast.error(err?.message ?? (lang === 'ar' ? 'تعذر إيقاف التحليل بالكامل' : 'Failed to cancel analysis completely'));
    } finally {
      setAnalysisControlBusy(null);
    }
  }, [analysisJobId, analysisControlBusy, lang, stopPolling]);

  const canReplaceFile = user?.role === 'Super Admin' || user?.role === 'Admin';
  const hasVersionForAnalysis = Boolean(script?.currentVersionId);

  const handleOpenFilePicker = useCallback(() => {
    if (!canReplaceFile || isUploading) return;
    const replacingExistingContent =
      ((editorData?.content != null && editorData.content.trim() !== '') || !!extractedText) ||
      reportHistory.length > 0 ||
      hasVersionForAnalysis;
    if (replacingExistingContent) {
      const ok = window.confirm(
        lang === 'ar'
          ? 'استبدال الملف سيحذف نتائج التحليل السابقة والتقارير المرتبطة بهذا النص. هل تريد المتابعة؟'
          : 'Replacing this file will delete previous analysis findings and reports for this script. Continue?'
      );
      if (!ok) return;
    }
    fileInputRef.current?.click();
  }, [canReplaceFile, isUploading, editorData?.content, extractedText, reportHistory.length, hasVersionForAnalysis, lang]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !script) return;

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
    setUploadPhaseLabel(lang === 'ar' ? 'رفع الملف' : 'Uploading file');
    setUploadStatusMessage(
      lang === 'ar'
        ? 'يجري تجهيز الملف ورفعه إلى التخزين الآمن قبل بدء الاستخراج.'
        : 'Preparing and uploading the document before extraction starts.',
    );
    setUploadError(null);
    setUploadDuplicateInfo(null);
    setUploadStartedAt(Date.now());
    setUploadElapsedMs(0);

    try {
      ensureImportActive();
      setUploadStatus('uploading');
      setUploadPhaseLabel(lang === 'ar' ? 'رفع الملف' : 'Uploading file');
      const uploadName = safeUploadFileName(file.name);
      const { url, path } = await scriptsApi.getUploadUrl(uploadName, { signal: controller.signal });
      ensureImportActive();
      await scriptsApi.uploadToSignedUrl(file, url, { signal: controller.signal });
      ensureImportActive();
      setUploadStatusMessage(
        lang === 'ar'
          ? 'تم رفع الملف. يجري الآن إنشاء نسخة جديدة وربطها بهذا النص.'
          : 'Upload completed. Creating a fresh version for this script.',
      );

      const storagePath = path ?? url;
      const ext = file.name.toLowerCase().split('.').pop() || '';
      const sourceFileType = file.type || (ext === 'txt' ? 'text/plain' : ext === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');

      const version = await scriptsApi.createVersion(script.id, {
        source_file_name: file.name.normalize('NFC'),
        source_file_type: sourceFileType,
        source_file_size: file.size,
        source_file_path: storagePath,
        source_file_url: storagePath,
        clearAnalysisOnReplace: true,
      }, { signal: controller.signal });
      ensureImportActive();
      setUploadVersionId(version.id);
      
      setUploadStatus('extracting');
      setUploadPhaseLabel(lang === 'ar' ? 'استخراج النص' : 'Extracting text');
      setUploadStatusMessage(
        lang === 'ar'
          ? ext === 'pdf'
            ? 'ملفات PDF قد تستغرق وقتاً أطول لأن النظام يحلل الصفحات ويعيد بناء النص خطوة بخطوة.'
            : 'يجري الآن استخراج النص وتجهيزه لعرضه داخل مساحة العمل.'
          : ext === 'pdf'
            ? 'PDF imports can take longer while the worker reconstructs page text.'
            : 'Extracting and preparing the document text for the workspace.',
      );
      let textToShow = '';
      let detectedDocumentCases: ImportDocumentCases | null = null;
      if (ext === 'txt') {
        const fileText = await file.text();
        ensureImportActive();
        const res = await scriptsApi.extractText(version.id, fileText, { enqueueAnalysis: false });
        detectedDocumentCases = parseImportDocumentCases((res as { extraction_progress?: Record<string, unknown> }).extraction_progress);
        setUploadDocumentCases(detectedDocumentCases);
        textToShow = (res as { extracted_text?: string })?.extracted_text ?? fileText;
      } else if (ext === 'pdf') {
        try {
          setUploadStatusMessage(
            lang === 'ar'
              ? 'تم إرسال الطلب إلى الخادم. ننتظر اكتمال استخراج صفحات PDF في الخلفية.'
              : 'The request was queued. Waiting for backend PDF extraction to finish.',
          );
          await scriptsApi.extractText(version.id, undefined, {
            enqueueAnalysis: false,
            signal: controller.signal,
          });
          ensureImportActive();
          const extractedVersion = await waitForVersionExtraction(script.id, version.id, {
            timeoutMs: PDF_EXTRACTION_TIMEOUT_MS,
            intervalMs: PDF_EXTRACTION_INTERVAL_MS,
            signal: controller.signal,
            onUpdate: (currentVersion) => {
              const progressMessage = formatExtractionProgressMessage(currentVersion.extraction_progress, lang);
              if (progressMessage) {
                setUploadStatusMessage(progressMessage);
              }
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
          textToShow = extractedVersion.extracted_text ?? '';
          if (!textToShow.trim()) {
            toast.error(lang === 'ar' ? 'لم يتم العثور على نص في الملف' : 'No text found in document');
            setUploadStatus('failed');
            return;
          }
        } catch (pdfErr: unknown) {
          const msg = pdfErr instanceof Error ? pdfErr.message : String(pdfErr);
          setUploadError(msg || (lang === 'ar' ? 'فشل استخراج الملف' : 'Extraction failed'));
          setUploadStatusMessage(
            lang === 'ar'
              ? 'تعذر استخراج النص من ملف PDF. راجع الرسالة أدناه ثم أعد المحاولة.'
              : 'PDF extraction failed. Review the message below and try again.',
          );
          toast.error(msg || (lang === 'ar' ? 'فشل استخراج الملف' : 'Extraction failed'));
          throw pdfErr;
        }
      } else if (ext === 'docx') {
        try {
          setUploadStatusMessage(
            lang === 'ar'
              ? 'يجري تحليل ملف Word واستخراج النص المنسق ثم حفظه في النسخة الحالية.'
              : 'Parsing the Word document and saving the extracted text to this version.',
          );
          const { pages } = await extractDocxWithPages(file);
          ensureImportActive();
          const res = await scriptsApi.extractText(version.id, undefined, {
            pages,
            enqueueAnalysis: false,
            signal: controller.signal,
          });
          ensureImportActive();
          detectedDocumentCases = parseImportDocumentCases((res as { extraction_progress?: Record<string, unknown> }).extraction_progress);
          setUploadDocumentCases(detectedDocumentCases);
          const err = (res as { error?: string })?.error;
          if (err) throw new Error(err);
          textToShow = (res as { extracted_text?: string })?.extracted_text ?? plain;
          if (!textToShow.trim()) {
            toast.error(
              lang === 'ar' ? 'لم يتم العثور على نص في الملف' : 'No text found in document'
            );
            setUploadStatus('failed');
            return;
          }
        } catch (docxErr: unknown) {
          const msg = docxErr instanceof Error ? docxErr.message : String(docxErr);
          setUploadError(msg || (lang === 'ar' ? 'فشل استخراج الملف' : 'Extraction failed'));
          setUploadStatusMessage(
            lang === 'ar'
              ? 'تعذر استخراج النص من ملف Word. راجع الخطأ ثم أعد المحاولة.'
              : 'Word extraction failed. Review the error and try again.',
          );
          toast.error(lang === 'ar' ? 'فشل استخراج الملف' : msg || 'Extraction failed');
          throw docxErr;
        }
      } else {
        toast.error(lang === 'ar' ? 'نوع الملف غير مدعوم' : 'Unsupported file type');
        setUploadStatus('failed');
        setUploadError(lang === 'ar' ? 'نوع الملف غير مدعوم' : 'Unsupported file type');
        setUploadStatusMessage(
          lang === 'ar'
            ? 'يمكن استيراد ملفات PDF أو DOCX أو TXT فقط.'
            : 'Only PDF, DOCX, or TXT files can be imported.',
        );
        return;
      }
      ensureImportActive();
      let duplicateInfo: DuplicateScriptCheckResponse | null = null;
      try {
        duplicateInfo = await scriptsApi.getDuplicateScripts(version.id);
        ensureImportActive();
      } catch (duplicateErr) {
        const message = duplicateErr instanceof Error ? duplicateErr.message : String(duplicateErr);
        console.warn('[ScriptWorkspace] duplicate script check failed', { versionId: version.id, error: message });
      }
      setUploadDuplicateInfo(duplicateInfo?.exactMatch ? duplicateInfo : null);
      setExtractedText(textToShow);
      // The file/context was replaced: clear stale highlight/report state immediately in UI.
      setReportFindings([]);
      setReportReviewFindings([]);
      setSelectedReportForHighlights(null);
      setSelectedReportSummary(null);
      setSelectedJobCanonicalHash(null);
      setSelectedFindingId(null);
      loadReportHistory();
      setUploadStatus('done');
      setUploadVersionId(null);
      setUploadPhaseLabel(lang === 'ar' ? 'اكتمل الاستيراد' : 'Import complete');
      setUploadStatusMessage(
        duplicateInfo?.exactMatch
          ? lang === 'ar'
            ? `اكتمل الاستيراد، لكن النظام وجد ${duplicateInfo.duplicateCount} ${duplicateInfo.duplicateCount === 1 ? 'نسخة مطابقة' : 'نسخ مطابقة'} بالمحتوى نفسه في السجلات الحالية.`
            : `Import completed, but the system found ${duplicateInfo.duplicateCount} exact content duplicate${duplicateInfo.duplicateCount === 1 ? '' : 's'} in existing records.`
          : detectedDocumentCases
            ? formatImportDocumentCaseSummary(detectedDocumentCases, lang)
          : lang === 'ar'
            ? 'تم استيراد الملف واستخراج النص بنجاح. يمكنك الآن مراجعة المحتوى أو بدء التحليل.'
            : 'Import finished successfully. You can now review the text or start analysis.',
      );
      toast.success(lang === 'ar' ? 'تم استخراج النص بنجاح' : 'Text extracted successfully');
      if (duplicateInfo?.exactMatch) {
        toast(
          lang === 'ar'
            ? 'تم العثور على نسخة مطابقة بالمحتوى نفسه. راجع تفاصيل التنبيه قبل إغلاق النافذة.'
            : 'An exact content duplicate was found. Review the warning details before closing the window.',
          { duration: 6000 },
        );
      } else if (detectedDocumentCases) {
        toast(
          formatImportDocumentCaseSummary(detectedDocumentCases, lang),
          { duration: 6500 },
        );
      } else {
        uploadAutoCloseTimeoutRef.current = window.setTimeout(() => {
          setUploadStatus('idle');
          setUploadError(null);
          setUploadStartedAt(null);
          setUploadElapsedMs(0);
          setUploadDuplicateInfo(null);
          setUploadDocumentCases(null);
          setUploadPhaseLabel('');
          setUploadStatusMessage('');
          uploadAutoCloseTimeoutRef.current = null;
        }, 1800);
      }
      await updateScript(script.id, { currentVersionId: version.id });
      ensureImportActive();
      try {
        const data = await scriptsApi.getEditor(script.id, version.id);
        ensureImportActive();
        setEditorData(data);
      } catch (_) {
        setEditorData(null);
      }
    } catch (err: any) {
      if (isImportAbortError(err)) {
        return;
      }
      setUploadStatus('failed');
      setUploadVersionId(null);
      setUploadDuplicateInfo(null);
      setUploadPhaseLabel(lang === 'ar' ? 'فشل الاستيراد' : 'Import failed');
      setUploadError(err?.message || 'Upload failed');
      setUploadStatusMessage(
        lang === 'ar'
          ? 'توقف الاستيراد قبل اكتماله. راجع السبب أدناه ثم أعد المحاولة.'
          : 'The import stopped before completion. Review the reason below and try again.',
      );
      toast.error(err.message || 'Upload failed');
    } finally {
      if (uploadAbortControllerRef.current === controller) {
        uploadAbortControllerRef.current = null;
      }
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const getSelectionOffsets = useCallback((container: HTMLElement | null): { start: number; end: number; text: string } | null => {
    if (!container) return null;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    if (!container.contains(range.startContainer)) return null;
    try {
      const pre = document.createRange();
      pre.setStart(container, 0);
      pre.setEnd(range.startContainer, range.startOffset);
      const start = pre.toString().length;
      const text = range.toString().trim();
      const end = start + range.toString().length;
      return { start, end, text };
    } catch {
      return null;
    }
  }, []);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const selection = window.getSelection();
    if (selection && selection.toString().trim().length > 0) {
      setFloatingAction(null);
      const text = selection.toString().trim();
      const offsets =
        editorData?.contentHtml && domTextIndex && editorRef.current
          ? selectionToNormalizedOffsets(domTextIndex, selection, editorRef.current)
          : getSelectionOffsets(editorRef.current);
      const globalOffsets = mapSelectionOffsetsToGlobal(
        offsets ? { start: (offsets as { start: number; end: number }).start, end: (offsets as { start: number; end: number }).end } : null
      );
      setContextMenu({
        x: e.pageX,
        y: e.pageY,
        text,
        startOffsetGlobal: globalOffsets?.start,
        endOffsetGlobal: globalOffsets?.end,
      });
    } else {
      setContextMenu(null);
      setFloatingAction(null);
    }
  };

  const handleMouseDown = () => {
    isSelectingRef.current = true;
  };

  const handleMouseUp = () => {
    const selection = window.getSelection();
    const selText = selection?.toString() ?? '';
    if (IS_DEV) {
      console.log('[ScriptWorkspace] mouseup selection (sync):', selText ? `"${selText.slice(0, 40)}…"` : '(none)');
      setTimeout(() => {
        console.log('[ScriptWorkspace] mouseup selection (after tick):', window.getSelection()?.toString() ?? '(none)');
      }, 0);
    }
    requestAnimationFrame(() => {
      isSelectingRef.current = false;
    });
    const text = selText.trim();
    const hasSelection = text.length > 0 && !contextMenu;
    const range = hasSelection && selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

    if (hasSelection && range) {
      setPersistentSelection({ rects: Array.from(range.getClientRects()) });
    } else {
      setPersistentSelection(null);
    }
    const rect = range ? range.getBoundingClientRect() : null;
    const offsets =
      hasSelection && selection && editorRef.current
        ? editorData?.contentHtml && domTextIndex
          ? selectionToNormalizedOffsets(domTextIndex, selection, editorRef.current)
          : getSelectionOffsets(editorRef.current)
        : null;
    const globalOffsets = mapSelectionOffsetsToGlobal(
      offsets && 'start' in offsets && 'end' in offsets
        ? { start: offsets.start, end: offsets.end }
        : (offsets as { start: number; end: number } | null)
    );
    const floatingPayload =
      hasSelection && rect
        ? {
          x: rect.left + rect.width / 2,
          y: rect.bottom + window.scrollY + 10,
          text,
          startOffsetGlobal: globalOffsets?.start,
          endOffsetGlobal: globalOffsets?.end,
        }
        : null;
    setTimeout(() => {
      if (floatingPayload) {
        setFloatingAction(floatingPayload);
      } else {
       setFloatingAction(null);
       setContextMenu(null);
    }
    }, 0);
  };

  const handleClickOutside = () => {
    setContextMenu(null);
    setPersistentSelection(null);
    if (!window.getSelection()?.toString().trim()) {
      setFloatingAction(null);
    }
  };

  const displayContentForOffsets = (editorData?.content != null && editorData.content !== '') ? editorData.content : extractedText;
  const mapSelectionOffsetsToGlobal = useCallback(
    (offsets: { start: number; end: number } | null | undefined): { start: number; end: number } | null => {
      if (!offsets) return null;
      if (!isPageMode) return offsets;
      const activePage = editorData?.pages?.[safeCurrentPage - 1];
      if (!activePage) return offsets;
      const activePageStart = activePage.startOffsetGlobal ?? 0;
      return {
        start: activePageStart + offsets.start,
        end: activePageStart + offsets.end,
      };
    },
    [isPageMode, editorData?.pages, safeCurrentPage]
  );

  const handleMarkViolation = () => {
    const text = contextMenu?.text ?? '';
    let startOffsetGlobal = contextMenu?.startOffsetGlobal ?? 0;
    let endOffsetGlobal = contextMenu?.endOffsetGlobal ?? 0;
    if (startOffsetGlobal == null || endOffsetGlobal == null || endOffsetGlobal <= startOffsetGlobal) {
      const idx = displayContentForOffsets.indexOf(text);
      if (idx !== -1) {
        startOffsetGlobal = idx;
        endOffsetGlobal = idx + text.length;
      }
    }
    setManualOffsets({ startOffsetGlobal, endOffsetGlobal });
    const defaultReportId = reportHistory[0]?.id ?? selectedReportForHighlights?.id ?? '';
    setFormData(prev => ({
      ...prev,
      excerpt: text,
      reportId: defaultReportId || prev.reportId,
      articleId: String(DEFAULT_ACTIONABLE_ARTICLE_ID),
      atomId: '',
      violationTypeId: DEFAULT_VIOLATION_TYPE_ID,
      severity: 'medium',
      comment: '',
    }));
    setIsViolationModalOpen(true);
    setContextMenu(null);
  };

  const saveManualFinding = async () => {
    if (!script?.id || !script?.currentVersionId || !formData.reportId || manualOffsets == null) {
      toast.error(lang === 'ar' ? 'اختر تقريراً وتأكد من وجود نص محدد.' : 'Select a report and ensure text is selected.');
      return;
    }
    setManualSaving(true);
    try {
      const created = await findingsApi.createManual({
        reportId: formData.reportId,
        scriptId: script.id,
        versionId: script.currentVersionId,
        startOffsetGlobal: manualOffsets.startOffsetGlobal,
        endOffsetGlobal: manualOffsets.endOffsetGlobal,
        excerpt: formData.excerpt,
        articleId: parseInt(formData.articleId, 10) || DEFAULT_ACTIONABLE_ARTICLE_ID,
        atomId: null,
        severity: formData.severity,
        manualComment: formData.comment?.trim() || undefined,
      });
      toast.success(lang === 'ar' ? 'تمت إضافة الملاحظة اليدوية' : 'Manual finding added');
      // const report = reportHistory.find((r) => r.id === formData.reportId) ?? selectedReportForHighlights;
      // const jobId = (report as { jobId?: string })?.jobId ?? created.jobId;
      if (selectedReportForHighlights?.jobId === created.jobId) {
        setReportFindings((prev) => [...prev, created]);
      }
      const list = await findingsApi.getByJob(created.jobId);
      setReportFindings(list);
      try {
        const reviewRows = await findingsApi.getReviewByJob(created.jobId);
        setReportReviewFindings(reviewRows);
      } catch {
        // keep existing review-layer state if refresh fails
      }
      const reportForHighlights = reportHistory.find((r) => r.id === formData.reportId);
      if (reportForHighlights) {
        setSelectedReportForHighlights(reportForHighlights);
      } else if (!selectedReportForHighlights || selectedReportForHighlights.id !== formData.reportId) {
        setSelectedReportForHighlights({
          id: formData.reportId,
          jobId: created.jobId,
          scriptId: script.id,
          versionId: script.currentVersionId ?? null,
          findingsCount: list.length,
          severityCounts: { low: 0, medium: 0, high: 0, critical: 0 },
          approvedCount: 0,
          createdAt: new Date().toISOString(),
          reviewStatus: 'under_review',
          reviewedBy: null,
          reviewedAt: null,
          lastReviewedAt: null,
          lastReviewedBy: null,
          lastReviewedRole: null,
          createdBy: user?.id ?? null,
        });
      }
      setSelectedFindingId(created.id);
      setSidebarTab('findings');
    setIsViolationModalOpen(false);
    } catch (err: any) {
      toast.error(err?.message ?? (lang === 'ar' ? 'فشل الحفظ' : 'Save failed'));
    } finally {
      setManualSaving(false);
    }
  };

  const displayContent = (editorData?.content != null && editorData.content.trim() !== '') ? editorData.content : extractedText;
  /** Canonical text for offset-based highlights: script_text.content only. Offsets from AI are relative to this. */
  const canonicalContentForHighlights =
    (editorData?.content != null && editorData.content.trim() !== '') ? editorData.content : null;
  const sections: EditorSectionResponse[] = editorData?.sections ?? [];
  const hasEditorContent = (editorData?.content != null && editorData.content.trim() !== '') || !!extractedText;

  type Segment = { start: number; end: number; finding: AnalysisFinding | null };

  const SEVERITY_ORDER: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
  const findingPriority = (f: AnalysisFinding) => {
    const approved = f.reviewStatus === 'approved';
    const severity = SEVERITY_ORDER[f.severity?.toLowerCase() ?? ''] ?? 0;
    return { approved, severity };
  };

  const extractQuotedTokens = useCallback((text: string): string[] => {
    if (!text || !text.trim()) return [];
    const out: string[] = [];
    const regex = /['"“”«»](.{2,80}?)['"“”«»]/g;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(text)) !== null) {
      const token = m[1]?.trim();
      if (token && token.length >= 2) out.push(token);
    }
    return out;
  }, []);

  // Inside ScriptWorkspace component:

  // const norm = (t: string) => normalizeText(t); // Use our new robust normalizer

  /**
   * Locates the finding in `content`. For paginated viewer text, pass pageSlice + sliceGlobalStart
   * so global offsets map to local positions; otherwise every match is compared to huge global hints
   * and hint 0 biases to the top of the page.
   */
  const locateFindingInContent = useCallback(
    (
      content: string,
      f: AnalysisFinding | Finding,
      opts?: { sliceGlobalStart?: number; pageSlice?: boolean }
    ): { start: number; end: number; matched: boolean } | null => {
      if (!content) return null;

      const pageSlice = opts?.pageSlice === true;
      const sliceStart = opts?.sliceGlobalStart ?? 0;
      const L = content.length;
      const evidence = (f.evidenceSnippet ?? '').trim();
      const hintGlobal = f.startOffsetGlobal ?? -1;
      const hintLocal = hintGlobal >= 0 ? hintGlobal - sliceStart : Number.NaN;
      const title = typeof (f as any).titleAr === 'string' ? (f as any).titleAr.trim() : '';
      const description = typeof (f as any).descriptionAr === 'string' ? (f as any).descriptionAr.trim() : '';

      const pickMatch = (matches: { start: number; end: number }[]): { start: number; end: number } | null => {
        if (matches.length === 0) return null;
        if (matches.length === 1) return matches[0];
        const hintOk =
          hintGlobal > 0 &&
          (pageSlice
            ? hintLocal >= -120 && hintLocal <= L + 120
            : hintGlobal <= L + 200);
        if (hintOk) {
          const h = pageSlice ? Math.max(0, Math.min(hintLocal, L)) : Math.min(hintGlobal, L);
          return findBestMatch(matches as Parameters<typeof findBestMatch>[0], h)!;
        }
        const evN = canonicalNormalize(evidence);
        if (evN.length >= 3) {
          const exact = matches.filter((m) => canonicalNormalize(content.slice(m.start, m.end)) === evN);
          if (exact.length === 1) return exact[0];
        }
        return [...matches].sort((a, b) => b.end - b.start - (a.end - a.start))[0];
      };

      const s = f.startOffsetGlobal ?? -1;
      const e = f.endOffsetGlobal ?? -1;
      if (s >= 0 && e > s) {
        const sLoc = pageSlice ? s - sliceStart : s;
        const eLoc = pageSlice ? e - sliceStart : e;
        if (pageSlice) {
          if (sLoc >= 0 && eLoc <= L && eLoc > sLoc) {
            const slice = content.slice(sLoc, eLoc);
            if (canonicalNormalize(slice) === canonicalNormalize(evidence)) {
              return { start: sLoc, end: eLoc, matched: true };
            }
            const ns = canonicalNormalize(slice);
            const ne = canonicalNormalize(evidence);
            const lenRatio = ne.length > 0 ? Math.min(ns.length, ne.length) / Math.max(ns.length, ne.length) : 0;
            if (ns && ne && lenRatio >= 0.75 && (ns.includes(ne) || ne.includes(ns))) {
              return { start: sLoc, end: eLoc, matched: true };
            }
          }
        } else if (e <= L) {
          const slice0 = content.slice(s, e);
          if (canonicalNormalize(slice0) === canonicalNormalize(evidence)) {
            return { start: s, end: e, matched: true };
          }
          const ns = canonicalNormalize(slice0);
          const ne = canonicalNormalize(evidence);
          const lenRatio = ne.length > 0 ? Math.min(ns.length, ne.length) / Math.max(ns.length, ne.length) : 0;
          if (ns && ne && lenRatio >= 0.75 && (ns.includes(ne) || ne.includes(ns))) {
            return { start: s, end: e, matched: true };
          }
        }
      }

    // 2. Quoted tokens — prefer evidence quotes first (more specific than generic title quotes)
    const quotedFromEv = extractQuotedTokens(evidence);
    const quotedRest = [
      ...extractQuotedTokens(title),
      ...extractQuotedTokens(description),
    ];
    const quotedCandidates = [...quotedFromEv, ...quotedRest];
    const uniqueQuoted = Array.from(new Set(quotedCandidates.map((t) => canonicalNormalize(t)))).filter((t) => t.length >= 2);
    for (const q of uniqueQuoted) {
      const matches = findTextOccurrences(content, q, { minConfidence: 1.0 });
      const best = pickMatch(matches);
      if (best) return { start: best.start, end: best.end, matched: true };
    }

    // 3. Evidence before long description/title (reduces wrong-line matches)
    const baseCandidates = [
      (f as any).excerpt,
      evidence,
      description,
      title,
    ].filter((t): t is string => typeof t === 'string' && t.trim().length > 0);
    const seen = new Set<string>();
    const candidates: string[] = [];
    for (const t of baseCandidates) {
      const key = canonicalNormalize(t);
      if (key && !seen.has(key)) {
        seen.add(key);
        candidates.push(t);
      }
    }
    candidates.sort((a, b) => a.length - b.length);

    for (const textToFind of candidates) {
      const matches = findTextOccurrences(content, textToFind, { minConfidence: 1.0 });
      const best = pickMatch(matches);
      if (best) return { start: best.start, end: best.end, matched: true };
    }

    const minLen = 4;
    if (evidence.length >= minLen) {
      const subs: string[] = [];
      if (evidence.length > 48) subs.push(evidence.slice(0, 48), evidence.slice(-48));
      if (evidence.length > 24) subs.push(evidence.slice(0, 24), evidence.slice(-24));
      for (const sub of subs) {
        if (sub.length < 8) continue;
        const matches = findTextOccurrences(content, sub, { minConfidence: 0.9 });
        const best = pickMatch(matches);
        if (best) return { start: best.start, end: best.end, matched: true };
      }
    }

    return null;
    },
    [extractQuotedTokens]
  );


  const buildFindingSegments = useCallback(
    (content: string, findings: AnalysisFinding[], opts?: { trustOffsets?: boolean }): Segment[] => {
    if (!content || findings.length === 0) return [{ start: 0, end: content.length, finding: null }];

    const locatedFindings = opts?.trustOffsets
      ? (findings
          .map((f) => {
            const s = f.startOffsetGlobal ?? -1;
            const e = f.endOffsetGlobal ?? -1;
            if (s < 0 || e <= s || s >= content.length) return null;
            return { ...f, startOffsetGlobal: s, endOffsetGlobal: Math.min(e, content.length) };
          })
          .filter(Boolean) as AnalysisFinding[])
      : (findings
          .map((f) => {
            const loc = locateFindingInContent(content, f);
            return loc ? { ...f, startOffsetGlobal: loc.start, endOffsetGlobal: loc.end } : null;
          })
          .filter(Boolean) as AnalysisFinding[]);

    if (locatedFindings.length === 0) return [{ start: 0, end: content.length, finding: null }];

    const sorted = [...locatedFindings].sort((a, b) => {
      const pa = findingPriority(a);
      const pb = findingPriority(b);
      if (pa.approved !== pb.approved) return pa.approved ? 1 : -1; // Approved (green) first? actually maybe violations first?
      // Logic: Violations should possibly overlay or be handled. 
      // The original logic puts approved ? 1 : -1. Let's keep original priority logic.
      return (pb.severity - pa.severity) || (a.startOffsetGlobal! - b.startOffsetGlobal!);
    });

    const len = content.length;
    const winner: (AnalysisFinding | null)[] = new Array(len);
    winner.fill(null);

    for (const f of sorted) {
      const s = f.startOffsetGlobal!;
      const e = Math.min(f.endOffsetGlobal!, len);

      for (let i = s; i < e; i++) {
        if (winner[i] == null) winner[i] = f;
        else {
          // Overlap resolution
          const cur = winner[i]!;
          // If we have a higher priority thing, overwrite. 
          // If equal priority, maybe smaller range wins (more specific)? 
          // For now keeping existing logic:
          if (cur.reviewStatus === 'approved' && f.reviewStatus !== 'approved') winner[i] = f;
          else if (SEVERITY_ORDER[f.severity?.toLowerCase() ?? ''] > SEVERITY_ORDER[cur.severity?.toLowerCase() ?? '']) winner[i] = f;
        }
      }
    }

    const segments: Segment[] = [];
    let start = 0;
    let current: AnalysisFinding | null = winner[0] ?? null;

    for (let i = 1; i <= len; i++) {
      const w = i < len ? winner[i] : null;
      if (w !== current) {
        segments.push({ start, end: i, finding: current });
        start = i;
        current = w;
      }
    }
    if (start < len) segments.push({ start, end: len, finding: current });

    return segments;
  },
  [locateFindingInContent]
);

  // Updated getHighlightedText to use locator
  const getHighlightedText = () => {
    let html = displayContent;
    if (!html) return '';

    // Locate all findings first to get fresh offsets
    const located = scriptFindings
      .map(f => {
        const loc = locateFindingInContent(html, f);
        return loc ? { ...f, startOffsetGlobal: loc.start, endOffsetGlobal: loc.end } : null;
      })
      .filter((f): f is any => f !== null)
      .sort((a, b) => (b.startOffsetGlobal ?? 0) - (a.startOffsetGlobal ?? 0)); // Descending for replacement

    // We must apply replacements from end to start so offsets don't shift
    // BUT naive string concat method destroys HTML structure if tags exist??
    // Wait, getHighlightedText is used for "viewerHtml" which seems to be text-only? 
    // "displayContent" is raw text or html?
    // Looking at lines 619/703: "displayContent" is editorData.content (text) or extractedText (text).
    // So safe to assume it's text.

    for (const f of located) {
      const colorClass = (f.source === 'ai' || f.source === 'lexicon_mandatory') ? 'bg-warning/30 border-warning/50' : 'bg-error/30 border-error/50';
      const anchorHash = btoa(unescape(encodeURIComponent(`${script?.id}_${f.startOffsetGlobal}_${f.endOffsetGlobal}_${f.evidenceSnippet}`)));
      const replacement = `<span id="highlight-${f.id}" data-anchor="${anchorHash}" class="border-b-2 cursor-pointer ${colorClass} hover:bg-opacity-50 transition-colors" title="${f.articleId}">${html.substring(f.startOffsetGlobal!, f.endOffsetGlobal!)}</span>`;

      html = html.substring(0, f.startOffsetGlobal!) + replacement + html.substring(f.endOffsetGlobal!);
    }

    return html;
  };

  // ... (Update the DOM highlight effect similarly)


  /** Insert section marker spans into HTML at content character offsets (ignoring tags when counting). */
  const insertSectionMarkers = (html: string, sections: EditorSectionResponse[]): string => {
    if (sections.length === 0) return html;
    const sorted = [...sections].sort((a, b) => a.startOffset - b.startOffset);
    let out = '';
    let contentPos = 0;
    let nextIdx = 0;
    let next = sorted[nextIdx];
    for (let i = 0; i < html.length; i++) {
      if (next && contentPos === next.startOffset) {
        out += `<span id="section-${next.index}" data-section-index="${next.index}"></span>`;
        nextIdx++;
        next = sorted[nextIdx];
      }
      const c = html[i];
      if (c === '<') {
        out += c;
        i++;
        while (i < html.length && html[i] !== '>') {
          out += html[i];
          i++;
        }
        if (i < html.length) out += html[i];
        continue;
      }
      out += c;
      contentPos++;
    }
    if (next && contentPos === next.startOffset) {
      out += `<span id="section-${next.index}" data-section-index="${next.index}"></span>`;
    }
    return out;
  };

  const viewerHtml = insertSectionMarkers(getHighlightedText(), sections);
  // const sectionStarts = new Set(sections.map((s) => s.startOffset));

  // Page-mode: current page data and findings scoped to this page (for toolbar + page view)
  const currentPageData = isPageMode && editorData?.pages?.[safeCurrentPage - 1] ? editorData.pages[safeCurrentPage - 1] : null;
  const pageUsesFormattedHtml = Boolean(currentPageData?.contentHtml?.trim()) && !strictImportedAnchoring;
  const fullViewerUsesFormattedHtml = Boolean(editorData?.contentHtml?.trim()) && !strictImportedAnchoring;
  const currentPageDocumentFlags = useMemo(
    () => getWorkspaceDocumentFlags((currentPageData?.meta as Record<string, unknown> | undefined) ?? undefined),
    [currentPageData?.meta]
  );
  const currentPageStrikeSpanCount = useMemo(() => {
    const meta = (currentPageData?.meta as Record<string, unknown> | undefined) ?? undefined;
    const spans = meta && Array.isArray(meta.strikeSpans) ? meta.strikeSpans : [];
    return spans.length;
  }, [currentPageData?.meta]);
  const currentPageOcrInfo = useMemo(() => {
    const meta = (currentPageData?.meta as Record<string, unknown> | undefined) ?? undefined;
    if (!meta) return null;
    return {
      attempted: meta.ocrAttempted === true,
      selected: meta.ocrSelected === true,
      used: meta.ocrUsed === true,
    };
  }, [currentPageData?.meta]);
  const pageViewerNotices = useMemo(() => {
    const notices: Array<{ id: string; label: string; description: string }> = [];
    for (const item of currentPageDocumentFlags) {
      notices.push({
        id: `flag-${item.flag}`,
        label: lang === 'ar' ? item.labelAr : item.labelEn,
        description: lang === 'ar' ? item.descriptionAr : item.descriptionEn,
      });
    }
    if (currentPageStrikeSpanCount > 0) {
      notices.push({
        id: 'strike-spans',
        label: lang === 'ar' ? `شطب مرصود: ${currentPageStrikeSpanCount}` : `Crossed-out spans: ${currentPageStrikeSpanCount}`,
        description:
          lang === 'ar'
            ? 'تم رصد نصوص مشطوبة في هذه الصفحة. راجع الأصل البصري إذا كانت حالة الشطب مؤثرة على التفسير.'
            : 'Crossed-out text was detected on this page. Review the visual original if strike-through affects interpretation.',
      });
    }
    if (currentPageOcrInfo?.selected) {
      notices.push({
        id: 'ocr-selected',
        label: lang === 'ar' ? 'تم الاعتماد على OCR' : 'OCR selected',
        description:
          lang === 'ar'
            ? 'تم اعتماد ناتج OCR لهذه الصفحة. قد تحتاج الصياغة أو الفواصل إلى تحقق بصري عند الحالات الحساسة.'
            : 'OCR output was selected for this page. Wording or punctuation may need visual verification in sensitive cases.',
      });
    }
    if (strictImportedAnchoring && currentPageData?.contentHtml) {
      notices.push({
        id: 'exact-review-mode',
        label: lang === 'ar' ? 'وضع المراجعة الدقيقة' : 'Exact review mode',
        description:
          lang === 'ar'
            ? 'يتم عرض النص المرجعي المخزن نفسه لضمان أن التمييز يطابق ما حلله النظام، حتى لو اختلف الشكل عن التنسيق الأصلي.'
            : 'The stored reference text is shown so highlights match what the system analyzed, even if the visual formatting differs from the original layout.',
      });
    }
    return notices;
  }, [currentPageDocumentFlags, currentPageStrikeSpanCount, currentPageOcrInfo?.selected, strictImportedAnchoring, currentPageData?.contentHtml, lang]);
  /** PDF import can persist a font stack per page (see pdfDisplayFont + script_pages.display_font_stack). */
  const workspaceBodyFontFamily = useMemo(() => {
    if (isPageMode && currentPageData?.displayFontStack) {
      const s = sanitizeFontStackForCss(currentPageData.displayFontStack);
      if (s) return s;
    }
    return DEFAULT_SCRIPT_EDITOR_FONT_STACK;
  }, [isPageMode, currentPageData?.displayFontStack]);
  const pageStart = currentPageData?.startOffsetGlobal ?? 0;
  const pageEnd = currentPageData ? pageStart + (currentPageData.content?.length ?? 0) : 0;
  const pagesSortedForViewer = useMemo(
    () => [...(editorData?.pages ?? [])].sort((a, b) => a.pageNumber - b.pageNumber),
    [editorData?.pages]
  );
  const workspaceHighlightCacheKey = useMemo(() => {
    const scriptId = script?.id;
    const reportKey = selectedReportForHighlights?.jobId ?? selectedReportForHighlights?.id ?? null;
    const versionKey = script?.currentVersionId ?? null;
    const contentHash = editorData?.contentHash ?? null;
    if (!scriptId || !reportKey || !versionKey || !contentHash) return null;
    return `workspace-highlight-cache:${scriptId}:${versionKey}:${reportKey}:${contentHash}`;
  }, [script?.id, script?.currentVersionId, selectedReportForHighlights?.jobId, selectedReportForHighlights?.id, editorData?.contentHash]);
  const [workspaceHighlightCache, setWorkspaceHighlightCache] = useState<Record<string, WorkspaceFindingResolution>>({});

  useEffect(() => {
    if (!workspaceHighlightCacheKey) {
      setWorkspaceHighlightCache({});
      return;
    }
    try {
      const raw = window.localStorage.getItem(workspaceHighlightCacheKey);
      if (!raw) {
        setWorkspaceHighlightCache({});
        return;
      }
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const next: Record<string, WorkspaceFindingResolution> = {};
      for (const [findingId, value] of Object.entries(parsed ?? {})) {
        if (isValidWorkspaceFindingResolution(value)) {
          next[findingId] = value;
        }
      }
      setWorkspaceHighlightCache(next);
    } catch {
      setWorkspaceHighlightCache({});
    }
  }, [workspaceHighlightCacheKey]);

  useEffect(() => {
    if (!workspaceHighlightCacheKey) return;
    try {
      window.localStorage.setItem(workspaceHighlightCacheKey, JSON.stringify(workspaceHighlightCache));
    } catch {
      // Ignore localStorage quota/availability issues; highlighting still works without cache.
    }
  }, [workspaceHighlightCacheKey, workspaceHighlightCache]);

  /** Full script as stored in workspace (page1 + \\n\\n + page2 + …) — same string search space as Ctrl+F across the doc. */
  const workspacePlainFull = useMemo(() => {
    if (!editorData?.pages?.length) {
      const c = editorData?.content ?? '';
      return c.trim() ? c : '';
    }
    return pagesSortedForViewer.map((p) => p.content ?? '').join('\n\n');
  }, [editorData?.pages, editorData?.content, pagesSortedForViewer]);

  /** Per-finding: where evidence actually appears in the workspace (page + local/global offsets). */
  const findingWorkspaceResolve = useMemo(() => {
    const map = new Map<string, WorkspaceFindingResolution>();
    if (!workspacePlainFull.trim() || !workspaceVisibleReportFindings.length) return map;
    const hasPagedViewer = pagesSortedForViewer.length > 0;
    const pages = hasPagedViewer
      ? pagesSortedForViewer.map((p) => ({ pageNumber: p.pageNumber, content: p.content ?? '' }))
      : [{ pageNumber: 1, content: workspacePlainFull }];
    for (const f of workspaceVisibleReportFindings) {
      const cached = workspaceHighlightCache[f.id];
      if (cached) {
        const cacheAllowedInCurrentMode =
          !strictImportedAnchoring ||
          !cached.resolved ||
          cached.method === 'stored_offsets' ||
          cached.method === 'page_exact' ||
          cached.method === 'document_exact';
        if (
          cacheAllowedInCurrentMode &&
          !cached.resolved ||
          (cacheAllowedInCurrentMode &&
            cached.pageNumber != null &&
            cached.localStart != null &&
            cached.localEnd != null &&
            pages.some((p) => p.pageNumber === cached.pageNumber && (p.content ?? '').length >= cached.localEnd))
        ) {
          map.set(f.id, cached);
          continue;
        }
      }
      const storedHit = resolveFindingViaStoredPageData(f, pages, locateFindingInContent, { strictExactOnly: strictImportedAnchoring });
      if (storedHit) {
        map.set(f.id, { resolved: true, ...storedHit });
        continue;
      }
      if (strictImportedAnchoring) {
        const strictHit = resolveFindingViaStrictWorkspaceSearch(f, workspacePlainFull, pages);
        if (strictHit) {
          map.set(f.id, { resolved: true, ...strictHit });
          continue;
        }
        const softHit = resolveFindingViaWorkspaceSearch(f, workspacePlainFull, pages, locateFindingInContent);
        if (softHit) {
          const pageIndex = Math.max(0, pages.findIndex((p) => p.pageNumber === softHit.pageNumber));
          const pageGlobalStart = hasPagedViewer ? globalStartOfViewerPage(pages, pageIndex) : 0;
          map.set(f.id, {
            resolved: true,
            pageNumber: softHit.pageNumber,
            localStart: softHit.localStart,
            localEnd: softHit.localEnd,
            globalStart: pageGlobalStart + softHit.localStart,
            globalEnd: pageGlobalStart + softHit.localEnd,
            method: 'workspace_search',
          });
          continue;
        }
      }
      if (strictImportedAnchoring) {
        const fallbackPage =
          findingPreferredPageNumber(f) ??
          displayPageForFinding(
            findingPreferredStartOffsetGlobal(f),
            pages.map((p) => ({ pageNumber: p.pageNumber, content: p.content })),
            null,
          );
        map.set(f.id, {
          resolved: false,
          pageNumber: fallbackPage,
          localStart: null,
          localEnd: null,
          globalStart: null,
          globalEnd: null,
          method: 'unresolved',
        });
        continue;
      }
      const globalSpan = resolveFindingSpanInText(workspacePlainFull, f, locateFindingInContent);
      const hit = globalSpan
        ? workspaceGlobalSpanToPageLocal(globalSpan.start, globalSpan.end, pages)
        : resolveFindingViaWorkspaceSearch(f, workspacePlainFull, pages, locateFindingInContent);
      if (hit) {
        const pageIndex = Math.max(0, pages.findIndex((p) => p.pageNumber === hit.pageNumber));
        const pageGlobalStart = hasPagedViewer ? globalStartOfViewerPage(pages, pageIndex) : 0;
        map.set(f.id, {
          resolved: true,
          ...hit,
          globalStart: pageGlobalStart + hit.localStart,
          globalEnd: pageGlobalStart + hit.localEnd,
          method: globalSpan ? 'global_search' : 'workspace_search',
        });
        continue;
      }
      const fallbackPage =
        findingPreferredPageNumber(f) ??
        displayPageForFinding(
          findingPreferredStartOffsetGlobal(f),
          pages.map((p) => ({ pageNumber: p.pageNumber, content: p.content })),
          null,
        );
      map.set(f.id, {
        resolved: false,
        pageNumber: fallbackPage,
        localStart: null,
        localEnd: null,
        globalStart: null,
        globalEnd: null,
        method: 'unresolved',
      });
    }
    return map;
  }, [workspacePlainFull, workspaceVisibleReportFindings, pagesSortedForViewer, locateFindingInContent, workspaceHighlightCache, strictImportedAnchoring]);

  useEffect(() => {
    if (!workspaceHighlightCacheKey || !workspaceVisibleReportFindings.length) return;
    const relevantIds = new Set(workspaceVisibleReportFindings.map((f) => f.id));
    setWorkspaceHighlightCache((prev) => {
      let changed = false;
      const next: Record<string, WorkspaceFindingResolution> = {};
      for (const [findingId, value] of Object.entries(prev)) {
        if (relevantIds.has(findingId)) next[findingId] = value;
        else changed = true;
      }
      for (const f of workspaceVisibleReportFindings) {
        const hit = findingWorkspaceResolve.get(f.id);
        if (!hit) continue;
        const previous = next[f.id];
        const serializedPrev = previous ? JSON.stringify(previous) : null;
        const serializedNext = JSON.stringify(hit);
        if (serializedPrev !== serializedNext) {
          next[f.id] = hit;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [workspaceHighlightCacheKey, workspaceVisibleReportFindings, findingWorkspaceResolve]);

  const sortedWorkspaceVisibleReportFindings = useMemo(() => {
    const pages = pagesSortedForViewer.map((p) => ({ pageNumber: p.pageNumber, content: p.content ?? '' }));
    return workspaceVisibleReportFindings
      .map((finding, index) => ({ finding, index }))
      .sort((left, right) => {
        const a = left.finding;
        const b = right.finding;
        const ra = findingWorkspaceResolve.get(a.id);
        const rb = findingWorkspaceResolve.get(b.id);

        const pageA =
          ra?.pageNumber ??
          displayPageForFinding(a.startOffsetGlobal, pages, a.pageNumber ?? null) ??
          Number.MAX_SAFE_INTEGER;
        const pageB =
          rb?.pageNumber ??
          displayPageForFinding(b.startOffsetGlobal, pages, b.pageNumber ?? null) ??
          Number.MAX_SAFE_INTEGER;
        if (pageA !== pageB) return pageA - pageB;

        const localA =
          ra?.localStart ??
          a.anchorStartOffsetPage ??
          a.startOffsetPage ??
          a.anchorStartOffsetGlobal ??
          a.startOffsetGlobal ??
          Number.MAX_SAFE_INTEGER;
        const localB =
          rb?.localStart ??
          b.anchorStartOffsetPage ??
          b.startOffsetPage ??
          b.anchorStartOffsetGlobal ??
          b.startOffsetGlobal ??
          Number.MAX_SAFE_INTEGER;
        if (localA !== localB) return localA - localB;

        const globalA =
          ra?.globalStart ??
          a.anchorStartOffsetGlobal ??
          a.startOffsetGlobal ??
          Number.MAX_SAFE_INTEGER;
        const globalB =
          rb?.globalStart ??
          b.anchorStartOffsetGlobal ??
          b.startOffsetGlobal ??
          Number.MAX_SAFE_INTEGER;
        if (globalA !== globalB) return globalA - globalB;

        return left.index - right.index;
      })
      .map((item) => item.finding);
  }, [workspaceVisibleReportFindings, pagesSortedForViewer, findingWorkspaceResolve]);

  const activeWorkspaceHighlights = useMemo((): AnalysisFinding[] => {
    if (!selectedReportForHighlights || !workspaceVisibleReportFindings.length) return [];
    const activeIds = selectedReportFindingIds.length > 0 ? new Set(selectedReportFindingIds) : null;
    return workspaceVisibleReportFindings.filter((f) => !activeIds || activeIds.has(f.id));
  }, [selectedReportForHighlights, workspaceVisibleReportFindings, selectedReportFindingIds]);

  const highlightTargetsForPageView = useMemo((): AnalysisFinding[] => {
    if (!workspaceVisibleReportFindings.length || pagesSortedForViewer.length === 0) return [];
    if (pinnedHighlight) {
      const f = workspaceVisibleReportFindings.find((x) => x.id === pinnedHighlight.findingId);
      if (!f) return [];
      const pages = pagesSortedForViewer.map((p) => ({ pageNumber: p.pageNumber, content: p.content ?? '' }));
      const pinnedPageHit =
        pinnedHighlight.pageNumber != null &&
        pinnedHighlight.localStart != null &&
        pinnedHighlight.localEnd != null
          ? {
              pageNumber: pinnedHighlight.pageNumber,
              localStart: pinnedHighlight.localStart,
              localEnd: pinnedHighlight.localEnd,
            }
          : workspaceGlobalSpanToPageLocal(pinnedHighlight.globalStart, pinnedHighlight.globalEnd, pages);
      const hit =
        pinnedPageHit?.pageNumber === safeCurrentPage
          ? pinnedPageHit
          : workspaceGlobalSpanOverlapWithViewerPage(
              pinnedHighlight.globalStart,
              pinnedHighlight.globalEnd,
              safeCurrentPage,
              pages,
            );
      if (!hit) return [];
      const pageScopedFinding: AnalysisFinding = {
        ...f,
        startOffsetGlobal: hit.localStart,
        endOffsetGlobal: hit.localEnd,
        startOffsetPage: hit.localStart,
        endOffsetPage: hit.localEnd,
        anchorStartOffsetPage: hit.localStart,
        anchorEndOffsetPage: hit.localEnd,
        anchorStartOffsetGlobal: hit.localStart,
        anchorEndOffsetGlobal: hit.localEnd,
      };
      const visibleSpan =
        currentPageData?.content
          ? resolveFindingSpanInText(currentPageData.content, pageScopedFinding, locateFindingInContent, {
              pageSlice: true,
              sliceGlobalStart: 0,
            })
          : null;
      if (visibleSpan && visibleSpan.end > visibleSpan.start) {
        return [{ ...f, startOffsetGlobal: visibleSpan.start, endOffsetGlobal: visibleSpan.end }];
      }
      return [{ ...f, startOffsetGlobal: hit.localStart, endOffsetGlobal: hit.localEnd }];
    }
    return activeWorkspaceHighlights.flatMap((f) => {
      const hit = findingWorkspaceResolve.get(f.id);
      if (!hit?.resolved || hit.pageNumber !== safeCurrentPage || hit.localStart == null || hit.localEnd == null) return [];
      return [{ ...f, startOffsetGlobal: hit.localStart, endOffsetGlobal: hit.localEnd }];
    });
  }, [pinnedHighlight, workspaceVisibleReportFindings, pagesSortedForViewer, safeCurrentPage, activeWorkspaceHighlights, findingWorkspaceResolve, currentPageData?.content, locateFindingInContent]);

  const highlightTargetsForScrollView = useMemo((): AnalysisFinding[] => {
    if (!workspaceVisibleReportFindings.length) return [];
    if ((editorData?.pages?.length ?? 0) > 0) return [];
    if (pinnedHighlight) {
      const f = workspaceVisibleReportFindings.find((x) => x.id === pinnedHighlight.findingId);
      if (!f) return [];
      return [{ ...f, startOffsetGlobal: pinnedHighlight.globalStart, endOffsetGlobal: pinnedHighlight.globalEnd }];
    }
    return activeWorkspaceHighlights.flatMap((f) => {
      const hit = findingWorkspaceResolve.get(f.id);
      if (!hit?.resolved || hit.globalStart == null || hit.globalEnd == null) return [];
      return [{ ...f, startOffsetGlobal: hit.globalStart, endOffsetGlobal: hit.globalEnd }];
    });
  }, [pinnedHighlight, workspaceVisibleReportFindings, editorData?.pages?.length, activeWorkspaceHighlights, findingWorkspaceResolve]);

  const activeWorkspaceHighlightStats = useMemo(() => {
    const activeIds = new Set(activeWorkspaceHighlights.map((f) => f.id));
    let total = 0;
    let resolved = 0;
    let unresolved = 0;
    for (const id of activeIds) {
      total += 1;
      const hit = findingWorkspaceResolve.get(id);
      if (hit?.resolved) resolved += 1;
      else unresolved += 1;
    }
    return { total, resolved, unresolved };
  }, [activeWorkspaceHighlights, findingWorkspaceResolve]);

  const annotatedWorkspaceExport = useMemo(() => {
    if (!strictImportedAnchoring || !pagesSortedForViewer.length || !activeWorkspaceHighlights.length) {
      return {
        pages: [] as Array<{
          pageNumber: number;
          segments: Array<{ text: string; highlighted?: boolean }>;
          notes: Array<{ marker: number; title: string; articleLabel: string; evidenceSnippet: string; anchorMethod?: string | null }>;
        }>,
        unresolved: [] as Array<{ title: string; evidenceSnippet: string }>,
      };
    }

    const exactResolved = activeWorkspaceHighlights.map((finding) => ({
      finding,
      resolved: findingWorkspaceResolve.get(finding.id),
    }));

    const pages = pagesSortedForViewer.map((page) => {
      const pageHits = exactResolved
        .filter(
          (item) =>
            item.resolved?.resolved &&
            item.resolved.pageNumber === page.pageNumber &&
            item.resolved.localStart != null &&
            item.resolved.localEnd != null &&
            item.resolved.localEnd > item.resolved.localStart,
        )
        .sort((a, b) => {
          const sa = a.resolved?.localStart ?? 0;
          const sb = b.resolved?.localStart ?? 0;
          if (sa !== sb) return sa - sb;
          return (a.resolved?.localEnd ?? 0) - (b.resolved?.localEnd ?? 0);
        });

      const segments: Array<{ text: string; highlighted?: boolean }> = [];
      const notes: Array<{ marker: number; title: string; articleLabel: string; evidenceSnippet: string; anchorMethod?: string | null }> = [];
      let cursor = 0;
      let marker = 1;

      for (const item of pageHits) {
        const localStart = Math.max(0, Math.min(page.content.length, item.resolved?.localStart ?? 0));
        const localEnd = Math.max(localStart + 1, Math.min(page.content.length, item.resolved?.localEnd ?? localStart + 1));
        if (localStart < cursor) continue;
        if (localStart > cursor) {
          segments.push({ text: page.content.slice(cursor, localStart) });
        }
        segments.push({ text: page.content.slice(localStart, localEnd), highlighted: true });
        const atomDisplay = item.finding.atomId ? ` • ${formatAtomDisplay(item.finding.articleId, item.finding.atomId)}` : "";
        notes.push({
          marker,
          title: item.finding.titleAr || item.finding.descriptionAr || item.finding.evidenceSnippet || "—",
          articleLabel:
            lang === "ar"
              ? `المادة ${item.finding.articleId}${atomDisplay}`
              : `Art ${item.finding.articleId}${atomDisplay}`,
          evidenceSnippet: findingPreferredAnchorText(item.finding) || item.finding.evidenceSnippet || item.finding.descriptionAr || "—",
          anchorMethod: item.resolved?.method ?? item.finding.anchorMethod ?? null,
        });
        marker += 1;
        cursor = localEnd;
      }

      if (cursor < page.content.length) segments.push({ text: page.content.slice(cursor) });
      if (segments.length === 0) segments.push({ text: page.content });

      return {
        pageNumber: page.pageNumber,
        segments,
        notes,
      };
    });

    const unresolved = exactResolved
      .filter((item) => !item.resolved?.resolved)
      .map((item) => ({
        title: item.finding.titleAr || item.finding.descriptionAr || "—",
        evidenceSnippet: findingPreferredAnchorText(item.finding) || item.finding.evidenceSnippet || "—",
      }));

    return { pages, unresolved };
  }, [strictImportedAnchoring, pagesSortedForViewer, activeWorkspaceHighlights, findingWorkspaceResolve, lang]);

  const findingSegments = useMemo(
    () =>
      highlightTargetsForScrollView.length > 0 && canonicalContentForHighlights
        ? buildFindingSegments(canonicalContentForHighlights, highlightTargetsForScrollView, { trustOffsets: true })
        : null,
    [canonicalContentForHighlights, highlightTargetsForScrollView, buildFindingSegments]
  );

  const pageFindingSegments = useMemo(
    () =>
      isPageMode && currentPageData?.content && highlightTargetsForPageView.length > 0
        ? buildFindingSegments(currentPageData.content, highlightTargetsForPageView, { trustOffsets: true })
        : currentPageData?.content
          ? buildFindingSegments(currentPageData.content, [], { trustOffsets: true })
          : null,
    [isPageMode, currentPageData?.content, highlightTargetsForPageView, buildFindingSegments]
  );

  const selectedWorkspaceFinding = useMemo(
    () => workspaceVisibleReportFindings.find((item) => item.id === selectedFindingId) ?? null,
    [workspaceVisibleReportFindings, selectedFindingId],
  );

  const selectedFindingDebugInfo = useMemo(() => {
    if (!selectedWorkspaceFinding) return null;
    const resolved = findingWorkspaceResolve.get(selectedWorkspaceFinding.id) ?? null;
    const pageText = currentPageData?.content ?? '';
    const evidence = selectedWorkspaceFinding.evidenceSnippet ?? '';
    const anchorText = selectedWorkspaceFinding.anchorText ?? '';
    const evidenceExactIndex = evidence ? pageText.indexOf(evidence) : -1;
    const anchorExactIndex = anchorText ? pageText.indexOf(anchorText) : -1;
    const pageScopedFinding: AnalysisFinding =
      resolved?.resolved && resolved.localStart != null && resolved.localEnd != null
        ? {
            ...selectedWorkspaceFinding,
            startOffsetGlobal: resolved.localStart,
            endOffsetGlobal: resolved.localEnd,
            startOffsetPage: resolved.localStart,
            endOffsetPage: resolved.localEnd,
            anchorStartOffsetPage: resolved.localStart,
            anchorEndOffsetPage: resolved.localEnd,
            anchorStartOffsetGlobal: resolved.localStart,
            anchorEndOffsetGlobal: resolved.localEnd,
          }
        : selectedWorkspaceFinding;
    const visibleSpan =
      pageText && safeCurrentPage === (resolved?.pageNumber ?? safeCurrentPage)
        ? resolveFindingSpanInText(pageText, pageScopedFinding, locateFindingInContent, {
            pageSlice: true,
            sliceGlobalStart: 0,
          })
        : null;
    const matchingSegments = (pageFindingSegments ?? [])
      .filter((segment) => segment.finding?.id === selectedWorkspaceFinding.id)
      .map((segment) => ({
        start: segment.start,
        end: segment.end,
        text: (currentPageData?.content ?? '').slice(segment.start, segment.end),
      }));

    return {
      findingId: selectedWorkspaceFinding.id,
      currentPage: safeCurrentPage,
      strictImportedAnchoring,
      workspaceViewMode,
      resolved,
      pinnedHighlight,
      selectedFindingId,
      pageUsesFormattedHtml,
      pageTextLength: pageText.length,
      evidenceSnippet: evidence,
      anchorText,
      evidenceExactIndex,
      anchorExactIndex,
      visibleSpan,
      matchingSegments,
      pagePreview:
        pageText && visibleSpan
          ? pageText.slice(Math.max(0, visibleSpan.start - 40), Math.min(pageText.length, visibleSpan.end + 40))
          : pageText
            ? pageText.slice(0, 220)
            : '',
    };
  }, [
    selectedWorkspaceFinding,
    findingWorkspaceResolve,
    currentPageData?.content,
    pageFindingSegments,
    safeCurrentPage,
    strictImportedAnchoring,
    workspaceViewMode,
    pinnedHighlight,
    selectedFindingId,
    pageUsesFormattedHtml,
    locateFindingInContent,
  ]);

  const forcedPinnedFindingRender = useMemo(() => {
    if (!isPageMode || pageUsesFormattedHtml || !currentPageData?.content || !selectedWorkspaceFinding) {
      return null;
    }

    const resolved = findingWorkspaceResolve.get(selectedWorkspaceFinding.id) ?? null;
    if (resolved?.pageNumber != null && resolved.pageNumber !== safeCurrentPage) {
      return null;
    }

    const fallbackSegment = selectedFindingDebugInfo?.matchingSegments?.[0] ?? null;
    const spanStart =
      selectedFindingDebugInfo?.visibleSpan?.start ??
      fallbackSegment?.start ??
      (resolved?.localStart ?? null);
    const spanEnd =
      selectedFindingDebugInfo?.visibleSpan?.end ??
      fallbackSegment?.end ??
      (resolved?.localEnd ?? null);

    if (spanStart == null || spanEnd == null || spanEnd <= spanStart) {
      return null;
    }

    const pageText = currentPageData.content;
    const safeStart = Math.max(0, Math.min(spanStart, pageText.length));
    const safeEnd = Math.max(safeStart + 1, Math.min(spanEnd, pageText.length));
    if (safeEnd <= safeStart) {
      return null;
    }

    return {
      finding: selectedWorkspaceFinding,
      start: safeStart,
      end: safeEnd,
      before: pageText.slice(0, safeStart),
      focus: pageText.slice(safeStart, safeEnd),
      after: pageText.slice(safeEnd),
    };
  }, [
    isPageMode,
    pageUsesFormattedHtml,
    currentPageData?.content,
    selectedWorkspaceFinding,
    findingWorkspaceResolve,
    safeCurrentPage,
    selectedFindingDebugInfo,
  ]);

  const handlePinFindingInScript = useCallback(
    (f: AnalysisFinding, e?: React.MouseEvent, opts?: { silent?: boolean }) => {
      e?.stopPropagation();
      if (!workspacePlainFull.trim()) {
        toast.error(lang === 'ar' ? 'لا يوجد نص محمّل' : 'No script text loaded');
        return;
      }
      const pages = pagesSortedForViewer.length
        ? pagesSortedForViewer.map((p) => ({ pageNumber: p.pageNumber, content: p.content ?? '' }))
        : [{ pageNumber: 1, content: workspacePlainFull }];
      const resolvedHit = findingWorkspaceResolve.get(f.id);
      if (resolvedHit?.resolved && resolvedHit.globalStart != null && resolvedHit.globalEnd != null) {
        setPinnedHighlight({
          findingId: f.id,
          globalStart: resolvedHit.globalStart,
          globalEnd: resolvedHit.globalEnd,
          pageNumber: resolvedHit.pageNumber,
          localStart: resolvedHit.localStart,
          localEnd: resolvedHit.localEnd,
        });
        setSelectedFindingId(f.id);
        if (resolvedHit.pageNumber != null && pagesSortedForViewer.length > 0) {
          setCurrentPage(resolvedHit.pageNumber);
          setSearchParams(
            (prev) => {
              const n = new URLSearchParams(prev);
              n.set('page', String(resolvedHit.pageNumber));
              return n;
            },
            { replace: true }
          );
        }
        setHighlightRetryTick((n) => n + 1);
        if (!opts?.silent) {
          toast.success(
            workspaceViewMode === 'pdf'
              ? (lang === 'ar' ? 'تم الانتقال إلى الصفحة الأصلية ذات الصلة.' : 'Moved to the relevant original page.')
              : (lang === 'ar' ? 'تم العثور على النص وتمييزه' : 'Found and highlighted in script')
          );
        }
        return;
      }
      const resolvedSpan = strictImportedAnchoring
        ? null
        : resolveFindingSpanInText(workspacePlainFull, f, locateFindingInContent);
      let gs = resolvedSpan?.start ?? null;
      let ge = resolvedSpan?.end ?? null;
      if (gs == null || ge == null) {
        if (strictImportedAnchoring) {
          const syntheticHit = resolveFindingViaWorkspaceSearch(f, workspacePlainFull, pages, locateFindingInContent);
          if (syntheticHit) {
            const pageIndex = Math.max(0, pages.findIndex((p) => p.pageNumber === syntheticHit.pageNumber));
            const pageGlobalStart = pagesSortedForViewer.length > 0 ? globalStartOfViewerPage(pages, pageIndex) : 0;
            gs = pageGlobalStart + syntheticHit.localStart;
            ge = pageGlobalStart + syntheticHit.localEnd;
          }
        }
      }
      if (gs == null || ge == null) {
        const fallbackPage =
          findingWorkspaceResolve.get(f.id)?.pageNumber ??
          displayPageForFinding(findingPreferredStartOffsetGlobal(f), pages, findingPreferredPageNumber(f));
        if (fallbackPage != null && pagesSortedForViewer.length > 0) {
          setCurrentPage(fallbackPage);
          setSearchParams(
            (prev) => {
              const n = new URLSearchParams(prev);
              n.set('page', String(fallbackPage));
              return n;
            },
            { replace: true }
          );
        }
        toast(
          lang === 'ar'
            ? 'تعذر تحديد موضع هذه الملاحظة بدقة داخل العرض الحالي. ستبقى البطاقة ظاهرة كعنصر يحتاج تحققًا يدويًا.'
            : 'Could not place this finding precisely in the current viewer. The card will remain marked for manual verification.'
        );
        return;
      }
      if (ge <= gs) {
        toast.error(lang === 'ar' ? 'مدى غير صالح' : 'Invalid match range');
        return;
      }
      const hit = workspaceGlobalSpanToPageLocal(gs, ge, pages);
      if (!hit) {
        toast.error(lang === 'ar' ? 'تعذر تحديد الصفحة' : 'Could not map to a page');
        return;
      }
      setPinnedHighlight({
        findingId: f.id,
        globalStart: gs,
        globalEnd: ge,
        pageNumber: hit.pageNumber,
        localStart: hit.localStart,
        localEnd: hit.localEnd,
      });
      setSelectedFindingId(f.id);
      if (pagesSortedForViewer.length > 0 && hit.pageNumber >= 1 && hit.pageNumber <= pagesSortedForViewer.length) {
        setCurrentPage(hit.pageNumber);
        setSearchParams(
          (prev) => {
            const n = new URLSearchParams(prev);
            n.set('page', String(hit.pageNumber));
            return n;
          },
          { replace: true }
        );
      }
      setHighlightRetryTick((n) => n + 1);
      if (!opts?.silent) {
        toast.success(
          workspaceViewMode === 'pdf'
            ? (lang === 'ar' ? 'تم الانتقال إلى الصفحة الأصلية ذات الصلة.' : 'Moved to the relevant original page.')
            : (lang === 'ar' ? 'تم العثور على النص وتمييزه' : 'Found and highlighted in script')
        );
      }
    },
    [workspacePlainFull, pagesSortedForViewer, locateFindingInContent, lang, setSearchParams, setCurrentPage, findingWorkspaceResolve, workspaceViewMode, strictImportedAnchoring]
  );

  // Apply finding highlights in formatted HTML by wrapping DOM ranges (no innerHTML replace).
  // Skip if job was run against different canonical text (hash mismatch) or different version.
  const versionMismatch =
    selectedReportForHighlights?.versionId != null &&
    script?.currentVersionId != null &&
    selectedReportForHighlights.versionId !== script.currentVersionId;
  /** Same script version but editor text hash ≠ job hash (edits after analysis). Still try evidence-based highlights. */
  const scriptHashMismatch =
    !versionMismatch &&
    selectedJobCanonicalHash != null &&
    editorData?.contentHash != null &&
    selectedJobCanonicalHash !== editorData.contentHash;
  /** Only block highlights when viewing a different script version than the job. */
  const blockHighlightsCompletely = versionMismatch;
  const applyHighlightMarks = useCallback(
    (
      container: HTMLElement,
      idx: DomTextIndex,
      findingsList: AnalysisFinding[],
      locateOpts?: { pageSlice?: boolean; sliceGlobalStart?: number }
    ) => {
      unwrapFindingMarks(container);
      const sorted = [...findingsList].sort((a, b) => {
        const sa = a.startOffsetGlobal ?? 0;
        const sb = b.startOffsetGlobal ?? 0;
        if (sa !== sb) return sa - sb;
        return (b.endOffsetGlobal ?? 0) - (a.endOffsetGlobal ?? 0);
      });
      let lastEnd = -1;
      let appliedCount = 0;
      const domRaw = idx.segments.map((s) => s.text).join('');
      for (const f of sorted) {
        let rawStart: number;
        let rawEnd: number;
        const isPinnedFinding = pinnedHighlight?.findingId === f.id || selectedFindingId === f.id;
        if (strictImportedAnchoring) {
          const resolved = findingWorkspaceResolve.get(f.id);
          if (!resolved?.resolved) continue;
          if (locateOpts?.pageSlice) {
            if (resolved.pageNumber !== safeCurrentPage || resolved.localStart == null || resolved.localEnd == null) continue;
            rawStart = resolved.localStart;
            rawEnd = resolved.localEnd;
          } else {
            if (resolved.globalStart == null || resolved.globalEnd == null) continue;
            rawStart = resolved.globalStart;
            rawEnd = resolved.globalEnd;
          }
        } else {
          const resolvedInDom =
            resolveFindingSpanInText(domRaw, f, locateFindingInContent, locateOpts) ??
            (currentPageData?.content
              ? resolveFindingSpanInText(currentPageData.content, f, locateFindingInContent, locateOpts)
              : null);
          if (resolvedInDom) {
            rawStart = resolvedInDom.start;
            rawEnd = resolvedInDom.end;
          } else {
            rawStart = f.startOffsetGlobal ?? -1;
            rawEnd = f.endOffsetGlobal ?? -1;
            if (rawStart < 0 || rawEnd <= rawStart) continue;
          }
        }
        const maxRaw = Math.max(0, idx.rawToNorm.length - 1);
        rawStart = Math.max(0, Math.min(rawStart, maxRaw));
        rawEnd = Math.max(rawStart + 1, Math.min(rawEnd, maxRaw + 1));
        const startNorm = idx.getNormalizedIndexFromRawOffset(rawStart);
        const endNorm = idx.getNormalizedIndexFromRawOffset(rawEnd);
        if (startNorm >= endNorm) continue;
        if (startNorm < lastEnd) continue;
        lastEnd = Math.max(lastEnd, endNorm);
        const range = rangeFromNormalizedOffsets(idx, startNorm, endNorm);
        if (!range) continue;

        const el = document.createElement('span');
        el.setAttribute('data-finding-id', f.id);
        el.className = 'ap-highlight cursor-pointer';
        el.style.backgroundColor = isPinnedFinding
          ? (f.reviewStatus === 'approved' ? 'rgba(22, 163, 74, 0.18)' : 'rgba(254, 240, 138, 0.95)')
          : f.severity === 'critical'
            ? 'rgba(255, 0, 0, 0.35)'
            : f.severity === 'high'
              ? 'rgba(255, 0, 0, 0.28)'
              : 'rgba(255, 165, 0, 0.28)';
        el.style.borderBottom = isPinnedFinding
          ? (f.reviewStatus === 'approved' ? '3px solid rgb(22, 163, 74)' : '3px solid rgb(220, 38, 38)')
          : f.severity === 'critical'
            ? '2px solid red'
            : f.severity === 'high'
              ? '2px solid rgba(255, 0, 0, 0.8)'
              : '2px solid orange';
        el.style.borderRadius = '2px';
        el.style.transition = 'background-color 0.2s';
        if (isPinnedFinding) {
          el.style.color = f.reviewStatus === 'approved' ? 'rgb(21, 128, 61)' : 'rgb(153, 27, 27)';
          el.style.fontWeight = '800';
          el.style.paddingInline = '2px';
          el.style.boxShadow = '0 0 0 1px rgba(220, 38, 38, 0.18)';
        }
        const baseBg = el.style.backgroundColor;
        el.onmouseenter = () => {
          el.style.backgroundColor = 'rgba(255, 255, 0, 0.45)';
        };
        el.onmouseleave = () => {
          el.style.backgroundColor = baseBg;
        };

        try {
          const clonedRange = range.cloneRange();
          clonedRange.collapse(false);
          const closeTag = document.createElement('span');
          closeTag.style.display = 'none';
          clonedRange.insertNode(closeTag);
          range.collapse(true);
          range.insertNode(el);
          const parentEl = el.parentNode;
          if (parentEl) {
            let node = el.nextSibling;
            while (node && node !== closeTag) {
              const next = node.nextSibling;
              el.appendChild(node);
              node = next;
            }
            closeTag.parentNode?.removeChild(closeTag);
          }
          appliedCount++;
        } catch (err) {
          if (IS_DEV) console.error(`[ScriptWorkspace] insertNode failed for ${f.id}:`, err);
        }
      }
      return appliedCount;
    },
    [locateFindingInContent, currentPageData?.content, findingWorkspaceResolve, safeCurrentPage, strictImportedAnchoring, pinnedHighlight?.findingId, selectedFindingId]
  );

  useEffect(() => {
    const container = editorRef.current;
    if (container) unwrapFindingMarks(container);
    const inPageMode = (editorData?.pages?.length ?? 0) > 0;

    if (blockHighlightsCompletely || workspaceViewMode === 'pdf') {
      setHighlightExpectedCount(0);
      setHighlightLocatableCount(0);
      setHighlightRenderedCount(0);
      return;
    }

    const expectedCount = inPageMode ? highlightTargetsForPageView.length : highlightTargetsForScrollView.length;

    if (!selectedReportForHighlights && !pinnedHighlight) {
      setHighlightExpectedCount(0);
      setHighlightLocatableCount(0);
      setHighlightRenderedCount(0);
      return;
    }

    if (inPageMode && !pageUsesFormattedHtml) {
      const n = highlightTargetsForPageView.length;
      setHighlightExpectedCount(n);
      setHighlightLocatableCount(n);
      setHighlightRenderedCount(n);
      return;
    }

    if (!inPageMode && !fullViewerUsesFormattedHtml) {
      const n = highlightTargetsForScrollView.length;
      setHighlightExpectedCount(n);
      setHighlightLocatableCount(n);
      setHighlightRenderedCount(n);
      return;
    }

    if (!container || !domTextIndex || !canonicalContentForHighlights) {
      setHighlightExpectedCount(expectedCount);
      setHighlightLocatableCount(0);
      setHighlightRenderedCount(0);
      return;
    }

    lastHighlightGuardLogFindingsRef.current = null;

    if (inPageMode && pageUsesFormattedHtml) {
      const resolved = highlightTargetsForPageView;
      setHighlightExpectedCount(resolved.length);
      if (!resolved.length) {
        setHighlightLocatableCount(0);
        setHighlightRenderedCount(0);
        return;
      }
      setHighlightLocatableCount(resolved.length);
      const applied = applyHighlightMarks(container, domTextIndex, resolved, {
        pageSlice: true,
        sliceGlobalStart: 0,
      });
      setHighlightRenderedCount(applied);
      return;
    }

    const resolved = highlightTargetsForScrollView;
    setHighlightExpectedCount(resolved.length);
    if (!resolved.length) {
      setHighlightLocatableCount(0);
      setHighlightRenderedCount(0);
      return;
    }
    setHighlightLocatableCount(resolved.length);
    const applied = applyHighlightMarks(container, domTextIndex, resolved);
    setHighlightRenderedCount(applied);
  }, [
    domTextIndex,
    canonicalContentForHighlights,
    pinnedHighlight,
    selectedReportForHighlights,
    blockHighlightsCompletely,
    editorData?.contentHtml,
    editorData?.pages,
    currentPageData?.content,
    safeCurrentPage,
    highlightRetryTick,
    applyHighlightMarks,
    workspaceViewMode,
    highlightTargetsForPageView,
    highlightTargetsForScrollView,
    pageUsesFormattedHtml,
    fullViewerUsesFormattedHtml,
  ]);

  /** After page switch + highlight paint, scroll to the selected finding (click handler's setTimeout often ran too early). */
  useEffect(() => {
    if (!selectedFindingId || blockHighlightsCompletely) return;
    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 50;

    const tryScroll = () => {
      if (cancelled || !editorRef.current) return;
      const sel = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(selectedFindingId) : selectedFindingId.replace(/["\\]/g, '');
      const el = editorRef.current.querySelector(`[data-finding-id="${sel}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('finding-flash');
        window.setTimeout(() => {
          el.classList.remove('finding-flash');
        }, 2000);
        return;
      }
      attempts += 1;
      if (attempts < maxAttempts) {
        window.setTimeout(tryScroll, 100);
      }
    };

    const t0 = window.setTimeout(tryScroll, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(t0);
    };
  }, [selectedFindingId, safeCurrentPage, highlightRenderedCount, highlightRetryTick, blockHighlightsCompletely]);

  if (showLoading) {
    return (
      <div className="p-8 text-center">
        <p className="text-text-muted">{lang === 'ar' ? 'جاري التحميل…' : 'Loading…'}</p>
      </div>
    );
  }

  if (showError) {
    return (
      <div className="p-8 text-center space-y-4">
        <p className="text-text-muted">
          {lang === 'ar' ? 'النص غير موجود أو فشل التحميل.' : 'Script not found or failed to load.'}
        </p>
        {dataError && <p className="text-sm text-red-500">{dataError}</p>}
        <Button variant="outline" onClick={handleRetryScript}>
          {lang === 'ar' ? 'إعادة المحاولة' : 'Retry'}
        </Button>
        <div className="pt-2">
          <Button variant="ghost" onClick={() => navigate(-1)}>{lang === 'ar' ? 'رجوع' : 'Go back'}</Button>
        </div>
      </div>
    );
  }

  if (!script) return null;

  const handleFindingCardClick = (f: AnalysisFinding) => {
    if (IS_DEV) console.log(`[ScriptWorkspace] Card clicked for ${f.id}`);
    handlePinFindingInScript(f, undefined, { silent: true });
  };

  const handleDownloadAnnotatedWorkspacePdf = async () => {
    if (!annotatedWorkspaceExport.pages.length) {
      toast.error(
        lang === "ar"
          ? "لا توجد نسخة مستوردة جاهزة لهذا التصدير أو لا توجد ملاحظات مرتبطة بها بعد."
          : "There is no imported working copy ready for this export yet.",
      );
      return;
    }
    setIsDownloadingAnnotatedPdf(true);
    try {
      const { downloadAnnotatedWorkspacePdf } = await import("@/components/reports/workspace-annotated/download");
      await downloadAnnotatedWorkspacePdf({
        scriptTitle: script.title || (lang === "ar" ? "نسخة عمل" : "Working copy"),
        reportLabel: selectedReportForHighlights?.jobId ? `Job ${selectedReportForHighlights.jobId.slice(0, 8)}` : undefined,
        lang,
        pages: annotatedWorkspaceExport.pages,
        unresolved: annotatedWorkspaceExport.unresolved,
      });
      toast.success(
        lang === "ar"
          ? "تم تنزيل النسخة المعلّقة من المستند"
          : "Annotated working copy downloaded",
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(message || (lang === "ar" ? "تعذر تنزيل النسخة المعلّقة" : "Annotated export failed"));
    } finally {
      setIsDownloadingAnnotatedPdf(false);
    }
  };

  const importStatusDescription =
    uploadStatus === 'uploading'
      ? (lang === 'ar' ? 'يتم رفع الملف إلى التخزين وربطه بالنص الحالي.' : 'Uploading the document and linking it to this script.')
      : uploadStatus === 'extracting'
        ? (lang === 'ar' ? 'يتم الآن استخراج النص في الخلفية. قد تستغرق ملفات PDF الكبيرة وقتاً أطول.' : 'The text is currently being extracted in the background. Large PDFs can take longer.')
        : uploadStatus === 'aborted'
          ? (lang === 'ar' ? 'تم إيقاف هذه العملية قبل اكتمالها. لن يتم تحديث النص الحالي من هذه الجلسة.' : 'This import was stopped before completion. The current text will not be updated from this session.')
          : uploadStatus === 'done'
            ? (lang === 'ar' ? 'انتهى الاستيراد بنجاح وتم تحديث النص المعروض.' : 'Import completed successfully and the displayed text was updated.')
            : (lang === 'ar' ? 'توقف الاستيراد قبل اكتماله.' : 'The import stopped before completion.');
  const importFooterHint =
    uploadStatus === 'failed'
      ? (lang === 'ar' ? 'يمكنك إغلاق هذه النافذة ثم إعادة محاولة الاستيراد.' : 'You can close this window and try the import again.')
      : uploadStatus === 'aborted'
        ? (lang === 'ar' ? 'تم إيقاف الاستيراد يدوياً. يمكنك إغلاق النافذة أو بدء استيراد جديد.' : 'The import was stopped manually. You can close this window or start a new import.')
        : uploadStatus === 'done'
          ? (lang === 'ar' ? 'سيتم إغلاق هذه النافذة تلقائياً بعد لحظة قصيرة.' : 'This window will close automatically shortly.')
          : (lang === 'ar' ? 'سيبقى هذا المؤشر مفتوحاً حتى نعرف أين وصلت عملية الاستيراد.' : 'This panel stays open so you can see where the import currently stands.');

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] -m-6 md:-m-8 bg-background overflow-hidden" onClick={handleClickOutside}>
      <style>{`
        @keyframes finding-flash {
          0%, 100% { background-color: rgba(255, 0, 0, 0.2); outline-color: rgba(255, 0, 0, 0.6); }
          50% { background-color: rgba(var(--primary-rgb), 0.5); outline-color: var(--primary); transform: scale(1.02); }
        }
        .finding-flash {
          animation: finding-flash 0.8s ease-in-out 2;
          z-index: 50;
        }
      `}</style>
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
      {/* Workspace Header */}
      <div className="h-16 flex-shrink-0 bg-surface border-b border-border flex items-center justify-between px-6 z-10 shadow-sm">
        <div className="flex items-center gap-4">
          <Button variant="ghost" className="px-2" onClick={() => navigate(-1)} aria-label="Go back">
            <ArrowLeft className="w-5 h-5 rtl:rotate-180" />
          </Button>
          <div className="flex items-center gap-3 border-s border-border ps-4">
            <h1 className="font-bold text-lg text-text-main truncate max-w-xs">{script.title}</h1>
            <Badge variant="outline" className="font-mono text-[10px] tracking-wider uppercase bg-background">Draft v1.0</Badge>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            accept=".pdf,.docx,.txt" 
            onChange={handleFileUpload}
          />
          {canReplaceFile && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleOpenFilePicker}
              disabled={isUploading || isClientCanceledScript}
              className="hidden sm:flex gap-2 relative overflow-hidden group"
            >
              <Upload className="w-4 h-4" />
              {isUploading ? (
                uploadStatus === 'uploading' ? 'Uploading...' : 'Extracting...'
              ) : extractedText ? (
                lang === 'ar' ? 'استبدال الملف' : 'Replace File'
              ) : (
                lang === 'ar' ? 'استيراد ملف النص' : 'Import Script Document'
              )}
            </Button>
          )}
          <div className="hidden sm:flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold text-text-main">
                {lang === 'ar' ? 'نمط التحليل' : 'Analysis mode'}
              </p>
              <p className="text-[10px] text-text-muted truncate max-w-[10rem]">
                {lang === 'ar' ? selectedAnalysisModeMeta.hintAr : selectedAnalysisModeMeta.hintEn}
              </p>
            </div>
            <select
              value={analysisModeProfile}
              onChange={(e) => setAnalysisModeProfile(e.target.value as AnalysisModeProfile)}
              className="h-9 rounded-lg border border-border bg-background px-2.5 text-sm text-text-main focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
              disabled={isAnalyzing || isAnalysisRunning || isClientCanceledScript}
              title={lang === 'ar' ? 'اختر نمط التحليل قبل بدء الفحص' : 'Choose an analysis mode before starting'}
            >
              {ANALYSIS_MODE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {lang === 'ar' ? option.labelAr : option.labelEn}
                </option>
              ))}
            </select>
          </div>
          <div className="relative hidden sm:block">
            <Button
              variant="outline"
              size="sm"
              className="flex gap-2"
              onClick={isAnalysisRunning ? () => setAnalysisModalOpen(true) : handleStartAnalysis}
              disabled={!hasVersionForAnalysis || isAnalyzing || isClientCanceledScript}
              title={!hasVersionForAnalysis ? (lang === 'ar' ? 'ارفع ملف نص أولاً' : 'Upload a script file first') : isAnalysisRunning ? (lang === 'ar' ? 'عرض التقدم' : 'View progress') : (lang === 'ar' ? 'تشغيل التحليل الذكي' : 'Queue analysis')}
            >
              {isAnalysisRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />}
              {isAnalyzing ? (lang === 'ar' ? 'في انتظار الدور…' : 'Queuing…') : isAnalysisRunning ? `${analysisJob?.progressPercent ?? 0}%` : (lang === 'ar' ? 'تحليل ذكي' : 'Start Smart Analysis')}
          </Button>
            {isAnalysisRunning && (
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-warning rounded-full animate-pulse border-2 border-surface" />
            )}
          </div>
          <Button 
            size="sm" 
            className="flex gap-2"
            onClick={() => navigate(analysisJobId ? `/report/${analysisJobId}?by=job${reportQuickQuery}` : `/report/${script.id}?by=script${reportQuickQuery}`)}
            disabled={!hasGeneratedReport || isClientCanceledScript}
            title={!hasGeneratedReport ? missingReportReason : undefined}
          >
            <FileText className="w-4 h-4" />
            {lang === 'ar' ? 'توليد التقرير' : 'Generate Report'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex gap-2"
            onClick={handleDownloadAnnotatedWorkspacePdf}
            disabled={!strictImportedAnchoring || !selectedReportForHighlights || isDownloadingAnnotatedPdf || !annotatedWorkspaceExport.pages.length || isClientCanceledScript}
            title={
              !strictImportedAnchoring
                ? (lang === 'ar' ? 'هذا التصدير مخصص للنسخة المستوردة داخل مساحة العمل.' : 'This export is for the imported working copy inside the workspace.')
                : undefined
            }
          >
            {isDownloadingAnnotatedPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {isDownloadingAnnotatedPdf
              ? (lang === 'ar' ? 'جاري تجهيز النسخة المعلّقة...' : 'Preparing annotated copy...')
              : (lang === 'ar' ? 'تنزيل النسخة المعلّقة' : 'Download annotated copy')}
          </Button>
        </div>
      </div>

      <div className="flex-1 flex min-h-0 relative">
        {isClientCanceledScript && (
          <div className="absolute top-0 left-0 right-0 z-20 bg-error/15 border-b border-error/40 px-4 py-2 text-sm text-error">
            {lang === 'ar'
              ? 'تم إلغاء هذا النص من قبل العميل. تم إيقاف إجراءات مساحة العمل.'
              : 'This script was canceled by the client. Workspace actions are disabled.'}
          </div>
        )}

        <div
          ref={viewerScrollRef}
          className="flex-1 flex flex-col min-w-0 bg-background overflow-y-auto"
        >
          <div className="max-w-[980px] w-full mx-auto px-4 lg:px-6 py-4 pb-32">
            {editorLoading && !editorData?.content && (
              <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            )}
            {editorError && !hasEditorContent && (
              <div className="bg-surface border border-border rounded-xl p-6 text-center text-text-muted">
                <p className="text-sm">{editorError}</p>
              </div>
            )}
            {hasEditorContent && (
              <>
                {versionMismatch && selectedReportForHighlights && reportFindings.length > 0 && (
                  <div className="mb-3 px-4 py-3 rounded-lg bg-warning/15 border border-warning/40 text-sm text-text-main" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
                    {lang === 'ar'
                      ? 'هذا التقرير لنسخة أخرى من السيناريو. لا يمكن تمييز الملاحظات في النص الحالي — افتح النسخة الصحيحة أو أعد التحليل.'
                      : 'This report is for a different script version. Highlights are disabled — open the matching version or re-run analysis.'}
                  </div>
                )}
                {scriptHashMismatch && selectedReportForHighlights && reportFindings.length > 0 && (
                  <div className="mb-3 px-4 py-3 rounded-lg bg-primary/10 border border-primary/25 text-sm text-text-main" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
                    {lang === 'ar'
                      ? 'النص تغيّر قليلاً عن نسخة التحليل. يُعرض تمييز تقريبي حسب المقتطفات؛ لأدق نتيجة أعد تشغيل التحليل الذكي.'
                      : 'Text may differ from the analyzed version. Highlights are best-effort from snippets; re-run Smart Analysis for full accuracy.'}
                  </div>
                )}
                {isPageMode && (
                  <div className="mb-3 space-y-2">
                    <div className="flex flex-wrap items-center gap-3 py-2 px-4 bg-surface border border-border rounded-xl">
                    <span className="text-sm text-text-muted font-medium">
                      {lang === 'ar' ? 'صفحة' : 'Page'} {safeCurrentPage} / {totalPages}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={safeCurrentPage <= 1}
                        className="p-1.5 rounded-md border border-border bg-surface hover:bg-surface-hover disabled:opacity-40 disabled:pointer-events-none"
                        aria-label={lang === 'ar' ? 'السابق' : 'Previous page'}
                      >
                        <ChevronRight className="w-5 h-5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        disabled={safeCurrentPage >= totalPages}
                        className="p-1.5 rounded-md border border-border bg-surface hover:bg-surface-hover disabled:opacity-40 disabled:pointer-events-none"
                        aria-label={lang === 'ar' ? 'التالي' : 'Next page'}
                      >
                        <ChevronLeft className="w-5 h-5" />
                      </button>
                    </div>
                    <div className="h-4 w-px bg-border" />
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setZoomLevel((z) => Math.max(0.5, z - 0.1))}
                        className="p-1.5 rounded-md border border-border bg-surface hover:bg-surface-hover"
                        aria-label={lang === 'ar' ? 'تصغير' : 'Zoom out'}
                      >
                        <ZoomOut className="w-5 h-5" />
                      </button>
                      <span className="text-sm text-text-muted min-w-[3rem] text-center">{Math.round(zoomLevel * 100)}%</span>
                      <button
                        type="button"
                        onClick={() => setZoomLevel((z) => Math.min(2, z + 0.1))}
                        className="p-1.5 rounded-md border border-border bg-surface hover:bg-surface-hover"
                        aria-label={lang === 'ar' ? 'تكبير' : 'Zoom in'}
                      >
                        <ZoomIn className="w-5 h-5" />
                      </button>
                    </div>
                    {editorData?.sourcePdfSignedUrl && (
                      <>
                        <div className="h-4 w-px bg-border" />
                        <div className="flex rounded-lg border border-border overflow-hidden text-xs">
                          <button
                            type="button"
                            className={cn(
                              'px-3 py-1.5 font-medium',
                              workspaceViewMode === 'text' ? 'bg-primary text-primary-foreground' : 'bg-surface hover:bg-surface-hover'
                            )}
                            onClick={() => setWorkspaceViewMode('text')}
                          >
                            {lang === 'ar' ? 'النص المستخرج' : 'Extracted text'}
                          </button>
                          <button
                            type="button"
                            className={cn(
                              'px-3 py-1.5 font-medium',
                              workspaceViewMode === 'pdf' ? 'bg-primary text-primary-foreground' : 'bg-surface hover:bg-surface-hover'
                            )}
                            onClick={() => setWorkspaceViewMode('pdf')}
                          >
                            {lang === 'ar' ? 'PDF الأصلي' : 'Original PDF'}
                          </button>
                        </div>
                      </>
                    )}
                    {pageViewerNotices.length > 0 && (
                      <>
                        <div className="h-4 w-px bg-border" />
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 text-[11px]"
                          onClick={() => setPageNoticesOpen((value) => !value)}
                        >
                          <span>{lang === 'ar' ? 'ملاحظات الصفحة' : 'Page notes'}</span>
                          <Badge variant="outline" className="ms-1 text-[10px]">{pageViewerNotices.length}</Badge>
                          {pageNoticesOpen ? <ChevronUp className="w-3.5 h-3.5 ms-1" /> : <ChevronDown className="w-3.5 h-3.5 ms-1" />}
                        </Button>
                      </>
                    )}
                    </div>
                    {pageNoticesOpen && pageViewerNotices.length > 0 && (
                      <div className="rounded-xl border border-warning/25 bg-warning/5 px-4 py-3 space-y-3" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
                        <p className="text-xs font-semibold text-warning">
                          {lang === 'ar' ? 'ملاحظات مرتبطة بهذه الصفحة' : 'Notes for this page'}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {pageViewerNotices.map((item) => (
                            <Badge key={item.id} variant="outline" className="text-[11px]">
                              {item.label}
                            </Badge>
                          ))}
                        </div>
                        <div className="space-y-1.5">
                          {pageViewerNotices.map((item) => (
                            <p key={`${item.id}-desc`} className="text-xs text-text-muted leading-6">
                              <span className="font-semibold text-text-main">{item.label}:</span> {item.description}
                            </p>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {isPageMode && currentPageData ? (
                  <div className="workspace-a4-stage flex justify-center py-6 px-2 overflow-x-auto">
                    <div className="w-full max-w-4xl space-y-3">
                    {workspaceViewMode === 'pdf' && editorData?.sourcePdfSignedUrl ? (
                      <div className="w-full">
                        {selectedFindingId && (() => {
                          const focusedFinding = workspaceVisibleReportFindings.find((item) => item.id === selectedFindingId) ?? null;
                          if (!focusedFinding) return null;
                          const focusedHit = findingWorkspaceResolve.get(focusedFinding.id);
                          return (
                            <div className="mb-3 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 space-y-2" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
                              <div className="flex items-center justify-between gap-3 flex-wrap">
                                <div className="space-y-1">
                                  <p className="text-xs font-semibold text-primary">
                                    {lang === 'ar' ? 'المرجع الحالي في الأصل البصري' : 'Current reference in visual original'}
                                  </p>
                                  <p className="text-sm text-text-main leading-6" dir="rtl">
                                    {focusedFinding.evidenceSnippet || focusedFinding.descriptionAr}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  {focusedHit?.pageNumber != null && (
                                    <Badge variant="outline" className="text-[11px]">
                                      {lang === 'ar' ? `صفحة ${focusedHit.pageNumber}` : `Page ${focusedHit.pageNumber}`}
                                    </Badge>
                                  )}
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="h-8 text-[11px]"
                                    onClick={() => setWorkspaceViewMode('text')}
                                  >
                                    {lang === 'ar' ? 'فتح النص المستخرج للتمييز الدقيق' : 'Open extracted text for exact highlight'}
                                  </Button>
                                </div>
                              </div>
                              <p className="text-[11px] text-text-muted">
                                {lang === 'ar'
                                  ? 'هذا العرض يطابق الملف الأصلي بصريًا. إذا احتجت تمييز الكلمة أو الجملة نفسها حرفيًا، افتح النص المستخرج.'
                                  : 'This view matches the original file visually. If you need exact word/sentence highlighting, open the extracted text view.'}
                              </p>
                            </div>
                          );
                        })()}
                        <p className="text-[11px] text-text-muted mb-2 text-center" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
                          {lang === 'ar'
                            ? 'هذا هو الأصل البصري المرجعي للملف. التمييز الحرفي والتحليل يعملان على النص المستخرج.'
                            : 'This is the visual source of truth for the file. Exact highlighting and analysis operate on extracted text.'}
                        </p>
                        <PdfOriginalViewer
                          signedUrl={editorData.sourcePdfSignedUrl}
                          pageNumber={safeCurrentPage}
                          scale={Math.max(0.6, zoomLevel * 1.15)}
                        />
                      </div>
                    ) : (
                    <div
                      className="workspace-a4-zoom-inner"
                      style={{
                        transform: `scale(${zoomLevel})`,
                        transformOrigin: 'top center',
                      }}
                    >
                      <article className="workspace-a4-sheet">
                        <div
                          key={`page-editor-${safeCurrentPage}-${forcedPinnedFindingRender?.finding.id ?? 'none'}-${forcedPinnedFindingRender?.start ?? 'na'}-${forcedPinnedFindingRender?.end ?? 'na'}`}
                          ref={editorRef}
                          className={cn(
                            'script-import-body text-text-main outline-none focus-visible:ring-2 focus-visible:ring-primary/20 break-words text-right select-text',
                            pageUsesFormattedHtml ? '[&_p]:mb-2 [&_*]:max-w-full [&_mark]:rounded-sm' : 'whitespace-pre-wrap'
                          )}
                          style={{ fontFamily: workspaceBodyFontFamily }}
                          dir="rtl"
                          lang={lang === 'ar' ? 'ar' : undefined}
                          onMouseDown={handleMouseDown}
                          onContextMenu={handleContextMenu}
                          onMouseUp={handleMouseUp}
                          onTouchEnd={() => handleMouseUp()}
                          onClick={(e) => {
                            if (!pageUsesFormattedHtml) return;
                            const mark = (e.target as HTMLElement).closest?.('[data-finding-id]');
                            if (mark) {
                              const id = mark.getAttribute('data-finding-id');
                              if (id) {
                                setSelectedFindingId(id);
                                setSidebarTab('findings');
                              }
                            }
                          }}
                          tabIndex={0}
                          role="region"
                          aria-label={lang === 'ar' ? 'محتوى الصفحة' : 'Page content'}
                        >
                          {pageUsesFormattedHtml ? null : forcedPinnedFindingRender ? (
                            <>
                              <span>{forcedPinnedFindingRender.before}</span>
                              <span
                                data-finding-id={forcedPinnedFindingRender.finding.id}
                                className={cn(
                                  'cursor-pointer border-b-2 transition-colors px-0.5 rounded-sm',
                                  forcedPinnedFindingRender.finding.reviewStatus === 'approved'
                                    ? 'bg-success/15 text-success font-extrabold border-success shadow-[0_0_0_1px_rgba(22,163,74,0.18)]'
                                    : 'bg-yellow-200 text-red-800 font-extrabold border-red-600 shadow-[0_0_0_1px_rgba(220,38,38,0.18)]'
                                )}
                                onClick={() => {
                                  setSelectedFindingId(forcedPinnedFindingRender.finding.id);
                                  setSidebarTab('findings');
                                }}
                              >
                                {forcedPinnedFindingRender.focus}
                              </span>
                              <span>{forcedPinnedFindingRender.after}</span>
                            </>
                          ) : pageFindingSegments ? (
                            pageFindingSegments.map((seg) => {
                              const key = `page-seg-${seg.start}-${seg.end}-${seg.finding?.id ?? 'none'}`;
                              const text = (currentPageData.content ?? '').slice(seg.start, seg.end);
                              const isPinnedFinding =
                                !!seg.finding &&
                                (selectedFindingId === seg.finding.id || pinnedHighlight?.findingId === seg.finding.id);
                              return (
                                <span key={key}>
                                  {seg.finding ? (
                                    <span
                                      data-finding-id={seg.finding.id}
                                      className={cn(
                                        'cursor-pointer border-b-2 transition-colors',
                                        seg.finding.reviewStatus === 'approved'
                                          ? 'bg-success/20 border-success/50 hover:bg-success/30'
                                          : 'bg-error/20 border-error/50 hover:bg-error/30',
                                        isPinnedFinding &&
                                          (seg.finding.reviewStatus === 'approved'
                                            ? 'bg-success/15 text-success font-extrabold border-success shadow-[0_0_0_1px_rgba(22,163,74,0.18)] px-0.5 rounded-sm'
                                            : 'bg-yellow-200 text-red-800 font-extrabold border-red-600 shadow-[0_0_0_1px_rgba(220,38,38,0.18)] px-0.5 rounded-sm')
                                      )}
                                      onClick={() => {
                                        setSelectedFindingId(seg.finding!.id);
                                        setSidebarTab('findings');
                                      }}
                                    >
                                      {text}
                                    </span>
                                  ) : (
                                    <span>{text}</span>
                                  )}
                                </span>
                              );
                            })
                          ) : (
                            currentPageData.content ?? ''
                          )}
                        </div>
                      </article>
                    </div>
                    )}
                    </div>
                  </div>
                ) : fullViewerUsesFormattedHtml ? (
                  <div className="workspace-a4-stage workspace-a4-stage--fluid">
                    <div className="workspace-a4-sheet workspace-a4-sheet--scroll">
                  <div
                    key="editor-with-html"
              ref={editorRef}
                    className="script-import-body min-h-[480px] text-text-main break-words text-right select-text [&_p]:mb-2 [&_*]:max-w-full [&_mark]:rounded-sm"
                    style={{ fontFamily: workspaceBodyFontFamily }}
                    dir="rtl"
                    lang={lang === 'ar' ? 'ar' : undefined}
                    onMouseDown={handleMouseDown}
              onContextMenu={handleContextMenu}
              onMouseUp={handleMouseUp}
              onTouchEnd={() => handleMouseUp()}
                    onMouseMove={(e) => {
                      if (isSelectingRef.current) return;
                      const mark = (e.target as HTMLElement).closest?.('[data-finding-id]');
                      if (mark) {
                        const id = mark.getAttribute('data-finding-id');
                        const finding = workspaceVisibleReportFindings.find((f) => f.id === id);
                        if (finding) {
                          setTooltipFinding(finding);
                          setTooltipPos({ x: e.clientX, y: e.clientY });
                        }
                      } else {
                        setTooltipFinding(null);
                      }
                    }}
                    onMouseLeave={() => setTooltipFinding(null)}
                    onClick={(e) => {
                      const mark = (e.target as HTMLElement).closest?.('[data-finding-id]');
                      if (mark) {
                        const id = mark.getAttribute('data-finding-id');
                        if (id) {
                          setSelectedFindingId(id);
                          setSidebarTab('findings');
                        }
                      }
                    }}
              tabIndex={0}
              role="region"
                    aria-label={lang === 'ar' ? 'محتوى النص' : 'Script content'}
                  />
                    </div>
                  </div>
                ) : (
                  <div className="workspace-a4-stage workspace-a4-stage--fluid">
                    <div className="workspace-a4-sheet workspace-a4-sheet--scroll">
                  <div
                    key="editor-fallback"
                    ref={editorRef}
                    className="script-import-body min-h-[480px] text-text-main outline-none focus-visible:ring-2 focus-visible:ring-primary/20 break-words whitespace-pre-wrap text-right select-text"
                    style={{ fontFamily: workspaceBodyFontFamily }}
                    dir="rtl"
                    lang={lang === 'ar' ? 'ar' : undefined}
                    onMouseDown={handleMouseDown}
                    onContextMenu={handleContextMenu}
                    onMouseUp={handleMouseUp}
                    onTouchEnd={() => handleMouseUp()}
                    tabIndex={0}
                    role="region"
                    aria-label={lang === 'ar' ? 'محتوى النص' : 'Script content'}
                  >
                    {findingSegments ? (
                      findingSegments.map((seg) => {
                        const key = `seg-${seg.start}-${seg.end}-${seg.finding?.id ?? 'none'}`;
                        const text = (canonicalContentForHighlights ?? displayContent).slice(seg.start, seg.end);
                        const sectionAtStart = sections.find((s) => s.startOffset === seg.start);
                        return (
                          <span key={key}>
                            {sectionAtStart != null && (
                              <span data-section-index={sectionAtStart.index} id={`section-${sectionAtStart.index}`} />
                            )}
                            {seg.finding ? (
                              <span
                                data-finding-id={seg.finding.id}
                                className={cn(
                                  'cursor-pointer border-b-2 transition-colors',
                                  seg.finding.reviewStatus === 'approved'
                                    ? 'bg-success/20 border-success/50 hover:bg-success/30'
                                    : 'bg-error/20 border-error/50 hover:bg-error/30'
                                )}
                                onMouseEnter={(e) => {
                                  if (isSelectingRef.current) return;
                                  setTooltipFinding(seg.finding!);
                                  setTooltipPos({ x: e.clientX, y: e.clientY });
                                }}
                                onMouseLeave={() => setTooltipFinding(null)}
                                onClick={() => {
                                  setSelectedFindingId(seg.finding!.id);
                                  setSidebarTab('findings');
                                }}
                              >
                                {text}
                              </span>
                            ) : (
                              text
                            )}
                          </span>
                        );
                      })
                    ) : (
                      <span dangerouslySetInnerHTML={{ __html: viewerHtml }} />
                    )}
                  </div>
                    </div>
                  </div>
                )}
                {tooltipFinding && (
                  <div
                    className="fixed z-[100] bg-surface border border-border rounded-lg shadow-xl p-3 max-w-xs pointer-events-none"
                    style={{ left: tooltipPos.x + 12, top: tooltipPos.y + 8 }}
                  >
                    <div className="text-xs font-semibold text-text-muted mb-1">
                            {getFindingDisplayTitle(tooltipFinding, lang)}
                    </div>
                    <p className="text-sm text-text-main line-clamp-3" dir="rtl">{tooltipFinding.descriptionAr || tooltipFinding.evidenceSnippet}</p>
                    <Badge variant={tooltipFinding.reviewStatus === 'approved' ? 'success' : 'error'} className="mt-1.5 text-[10px]">
                      {tooltipFinding.reviewStatus === 'approved' ? (lang === 'ar' ? 'آمن' : 'Safe') : (lang === 'ar' ? 'مخالفة' : 'Violation')}
                    </Badge>
                  </div>
                )}
              </>
            )}
            {!editorLoading && !editorError && !hasEditorContent && (
              <div className="bg-surface border border-border rounded-xl min-h-[400px] flex items-center justify-center p-8 text-center text-text-muted" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
                <p>{lang === 'ar' ? 'استورد ملف النص (PDF أو DOCX أو TXT) لعرض المحتوى هنا' : 'Import a script document (PDF, DOCX or TXT) to view content here'}</p>
              </div>
            )}
          </div>
        </div>

        {/* Right: Sidebar Panel */}
        <div className="w-80 flex-shrink-0 bg-surface border-s border-border flex flex-col shadow-[-4px_0_24px_rgba(0,0,0,0.02)] z-10">

          {/* Sidebar tab bar */}
          <div className="flex border-b border-border bg-background/50">
            <button
              className={cn("flex-1 py-3 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5",
                sidebarTab === 'findings' ? 'text-primary border-b-2 border-primary' : 'text-text-muted hover:text-text-main')}
              onClick={() => setSidebarTab('findings')}
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              {lang === 'ar' ? 'الملاحظات' : 'Findings'}
              <Badge variant="outline" className="text-[10px] px-1.5">{
                (Number.isFinite(manualScriptFindings.length) ? manualScriptFindings.length : 0) +
                (Number.isFinite(legacyAutomatedScriptFindings.length) ? legacyAutomatedScriptFindings.length : 0) +
                (Number.isFinite(workspaceVisibleReportFindings.length) ? workspaceVisibleReportFindings.length : 0)
              }</Badge>
            </button>
            <button
              className={cn("flex-1 py-3 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5",
                sidebarTab === 'reports' ? 'text-primary border-b-2 border-primary' : 'text-text-muted hover:text-text-main')}
              onClick={() => setSidebarTab('reports')}
            >
              <FileText className="w-3.5 h-3.5" />
              {lang === 'ar' ? 'التقارير' : 'Reports'}
              {reportHistory.length > 0 && <Badge variant="outline" className="text-[10px] px-1.5">{reportHistory.length}</Badge>}
            </button>
          </div>

          {previousReviewInsight && (
            <div className="border-b border-border bg-primary/5 px-4 py-3">
              <div className="rounded-xl border border-primary/15 bg-surface/80 p-3 space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold text-text-main">
                    {lang === 'ar' ? 'سبق مراجعة هذا النص' : 'Previously reviewed script'}
                  </p>
                  <Badge variant="outline" className="text-[10px] px-1.5">
                    {lang === 'ar'
                      ? `${previousReviewInsight.totalReports} تقارير`
                      : `${previousReviewInsight.totalReports} reports`}
                  </Badge>
                </div>
                <p className="text-[11px] text-text-muted leading-5">
                  {lang === 'ar'
                    ? `آخر تقرير ${previousReviewInsight.latestDate ? `بتاريخ ${previousReviewInsight.latestDate}` : 'مسجل'} بواسطة ${previousReviewInsight.latestActor} للعميل ${previousReviewInsight.clientLabel}.`
                    : `Latest report ${previousReviewInsight.latestDate ? `on ${previousReviewInsight.latestDate}` : 'recorded'} by ${previousReviewInsight.latestActor} for client ${previousReviewInsight.clientLabel}.`}
                </p>
                {previousReviewInsight.hasExternalReview && (
                  <p className="text-[11px] text-warning">
                    {lang === 'ar'
                      ? 'هناك عمل مراجعة سابق من مستخدم آخر، فراجع التقارير الحالية قبل تكرار التحليل أو إعادة التصنيف.'
                      : 'Another user has already reviewed this script, so check the existing reports before repeating analysis or reclassification.'}
                  </p>
                )}
              </div>
            </div>
          )}
          
          {/* ── Findings tab ── */}
          {sidebarTab === 'findings' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-background/30">
              <div className="flex flex-col gap-1.5 pb-2 mb-2 border-b border-border/50">
                <span className="text-xs font-medium text-text-muted">
                  {selectedReportForHighlights
                    ? lang === 'ar'
                      ? 'تُميَّز الملاحظات القابلة للتحديد تلقائياً داخل النص، ويمكنك الضغط على أي بطاقة للتركيز عليها.'
                      : 'Resolvable findings are highlighted automatically in the script, and you can click any card to focus it.'
                    : lang === 'ar'
                      ? 'اختر تقريراً لعرض الملاحظات.'
                      : 'Select a report to view findings.'}
                </span>
                {selectedReportForHighlights && pinnedHighlight && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[10px] self-start"
                    onClick={() => setPinnedHighlight(null)}
                  >
                    {lang === 'ar' ? 'إلغاء التمييز في النص' : 'Clear highlight in script'}
                  </Button>
                )}
                {selectedReportForHighlights && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-[10px] px-2 text-error hover:text-error hover:bg-error/10"
                    onClick={() => {
                      setSelectedReportForHighlights(null);
                      setSelectedReportSummary(null);
                      setReportFindings([]);
                      setReportReviewFindings([]);
                      setSelectedFindingId(null);
                      setSelectedReportFindingIds([]);
                      setPinnedHighlight(null);
                    }}
                  >
                    {lang === 'ar' ? 'إخفاء التمييز' : 'Hide Highlights'}
                  </Button>
                )}
              </div>

              {!selectedReportForHighlights && reportHistory.length > 0 && (
                <div className="bg-surface rounded-xl p-3 border border-border/50 mb-4">
                  <Select
                    label={lang === 'ar' ? 'اختر تقريراً لعرض الملاحظات' : 'Select report to view findings'}
                    value=""
                    onChange={(e) => {
                      const r = reportHistory.find(rep => rep.id === e.target.value);
                      if (r) handleSelectReportForHighlights(r);
                    }}
                    options={[
                      { label: lang === 'ar' ? 'اختر...' : 'Select...', value: '' },
                      ...reportHistory.map(r => ({
                        label: `${formatOptionalReportDate(r.createdAt)} - ${r.findingsCount} findings`,
                        value: r.id
                      }))
                    ]}
                  />
                </div>
              )}

              {workspaceVisibleReportFindings.length > 0 && (
                <div className="space-y-2 mb-4">
                  {workspaceUseCanonicalFallback && !workspaceUsesReviewLayer && (
                    <div className="rounded-md border border-primary/20 bg-primary/5 p-2.5 text-[11px] text-text-main" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
                      {lang === 'ar'
                        ? 'يعرض هذا التبويب بطاقات التقرير النهائي كنسخة احتياطية لأن صفوف الملاحظات التفصيلية المحمّلة أقل من المتوقع. ستبقى البطاقات ظاهرة للمراجعة، لكن الاعتماد والتعديل متاحان فقط عندما تتوفر صفوف DB الحقيقية.'
                        : 'This tab is showing final-report cards as a fallback because the loaded detailed finding rows are fewer than expected. Cards stay visible for review, but approve/edit actions are only available when the real DB rows are present.'}
                    </div>
                  )}
                  {workspaceUsesReviewLayer && (
                    <div className="rounded-md border border-success/20 bg-success/5 p-2.5 text-[11px] text-text-main" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
                      {lang === 'ar'
                        ? 'تُعرض هذه البطاقات الآن من طبقة المراجعة الموحدة. ستتبع الأرقام والحالة الحالية للمراجعة نفسها، بينما تبقى بعض الإجراءات مرهونة بوجود صف الملاحظة الخام المرتبط.'
                        : 'These cards are now reading from the unified review layer. Counts and review states follow the same source, while some actions still require a linked raw finding row.'}
                    </div>
                  )}
                  {selectedReportForHighlights && activeWorkspaceHighlightStats.total > 0 && (
                    <div className="rounded-md border border-border/60 bg-surface/80 p-2.5 text-[11px] text-text-main">
                      <span dir={lang === 'ar' ? 'rtl' : 'ltr'}>
                        {lang === 'ar'
                          ? `تغطية التمييز: ${activeWorkspaceHighlightStats.resolved} من ${activeWorkspaceHighlightStats.total}`
                          : `Highlight coverage: ${activeWorkspaceHighlightStats.resolved} of ${activeWorkspaceHighlightStats.total}`}
                      </span>
                      {activeWorkspaceHighlightStats.unresolved > 0 && (
                        <p className="mt-1 text-warning" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
                          {lang === 'ar'
                            ? `${activeWorkspaceHighlightStats.unresolved} ملاحظة لم تُحل بصريًا بعد، وستبقى ظاهرة في القائمة مع حاجة لتحقق يدوي.`
                            : `${activeWorkspaceHighlightStats.unresolved} findings are not yet visually anchored and remain listed for manual verification.`}
                        </p>
                      )}
                    </div>
                  )}
                  {!blockHighlightsCompletely &&
                    pinnedHighlight &&
                    highlightExpectedCount > 0 &&
                    highlightRenderedCount < highlightExpectedCount && (
                    <div className="rounded-md border border-warning/40 bg-warning/10 p-2.5 text-[11px] text-text-main">
                      <p>
                        {lang === 'ar'
                          ? 'تعذر رسم التمييز في هذا العرض. جرّب وضع «النص المستخرج» أو صفحة بلا تنسيق HTML.'
                          : 'Could not draw highlight in this view. Try extracted-text mode or a plain (non-HTML) page.'}
                      </p>
                      <div className="mt-2 flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-[10px]"
                          onClick={() => setHighlightRetryTick((n) => n + 1)}
                        >
                          {lang === 'ar' ? 'إعادة محاولة التمييز' : 'Retry highlight mapping'}
                        </Button>
                        {selectedReportForHighlights && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 px-2 text-[10px]"
                            onClick={() => handleSelectReportForHighlights(selectedReportForHighlights)}
                          >
                            {lang === 'ar' ? 'إعادة تحميل ملاحظات التقرير' : 'Reload report findings'}
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                  <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                    {lang === 'ar' ? 'ملاحظات التقرير' : 'Report findings'}
                  </h3>
                  <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-surface/70 p-2.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 text-[10px] px-2"
                      onClick={() => setSelectedReportFindingIds(workspaceActionableFindings.map((f) => f.id))}
                      disabled={workspaceActionableFindings.length === 0}
                    >
                      {lang === 'ar' ? 'تحديد الكل' : 'Select all'}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 text-[10px] px-2"
                      onClick={() => setSelectedReportFindingIds([])}
                      disabled={selectedReportFindingIds.length === 0}
                    >
                      {lang === 'ar' ? 'إلغاء التحديد' : 'Clear selection'}
                    </Button>
                    <span className="text-[11px] text-text-muted">
                      {lang === 'ar'
                        ? `${selectedReportFindingIds.length} محددة من ${workspaceVisibleReportFindings.length}`
                        : `${selectedReportFindingIds.length} selected of ${workspaceVisibleReportFindings.length}`}
                    </span>
                    <div className="flex-1" />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 text-[10px] px-2 text-success border-success/30 hover:bg-success/10"
                      disabled={selectedReportFindingIds.length === 0}
                      onClick={() => {
                        setBulkReportFindingReviewModal({ findingIds: selectedReportFindingIds, toStatus: 'approved' });
                        setBulkReportFindingReviewReason('');
                      }}
                    >
                      {lang === 'ar' ? 'اعتماد المحدد كآمن' : 'Mark selected safe'}
                    </Button>
                  </div>
                  {sortedWorkspaceVisibleReportFindings.map((f) => (
                    <div
                      key={f.id}
                      ref={(el) => { findingCardRefs.current[f.id] = el; }}
                      role="button"
                      tabIndex={0}
                      className={cn(
                        'bg-surface border rounded-xl p-3 shadow-sm cursor-pointer transition-all hover:border-primary/50',
                        selectedFindingId === f.id ? 'ring-2 ring-primary border-primary' : 'border-border',
                        f.reviewStatus === 'approved' ? 'border-success/30' : 'border-error/30'
                      )}
                      onClick={() => handleFindingCardClick(f)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleFindingCardClick(f);
                        }
                      }}
                    >
                      {(() => {
                        const cardPrimaryText = (f.evidenceSnippet || f.titleAr || f.descriptionAr || '').trim();
                        const cardSecondaryText = (() => {
                          const rationale = pickFindingRationale(f);
                          if (!rationale || rationale === cardPrimaryText) return '';
                          return rationale;
                        })();
                        const manualComment = (f.manualComment || '').trim();
                        const isEdited = Boolean(f.editedAt || f.editedBy);
                        const noteLabel = isEdited
                          ? (lang === 'ar' ? 'ملاحظة المراجع' : 'Reviewer note')
                          : f.source === 'manual'
                            ? (lang === 'ar' ? 'تعليق يدوي' : 'Manual comment')
                            : (lang === 'ar' ? 'ملاحظة المراجع' : 'Reviewer note');
                        return (
                          <>
                      <div className="flex items-center justify-between mb-1 flex-wrap gap-1">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary"
                            checked={selectedReportFindingIds.includes(f.id)}
                            disabled={isWorkspaceActionDisabledFinding(f)}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setSelectedReportFindingIds((prev) =>
                                checked ? [...prev, f.id] : prev.filter((id) => id !== f.id)
                              );
                            }}
                            aria-label={lang === 'ar' ? 'تحديد الملاحظة' : 'Select finding'}
                          />
                          <span className="text-[10px] font-semibold text-text-main">
                            {getFindingDisplayTitle(f, lang)}
                            {(() => {
                              const ws = findingWorkspaceResolve.get(f.id);
                              const dp =
                                ws?.pageNumber ??
                                displayPageForFinding(
                                  f.startOffsetGlobal,
                                  pagesSortedForViewer.map((p) => ({ pageNumber: p.pageNumber, content: p.content ?? '' })),
                                  f.pageNumber ?? null
                                );
                              return dp != null ? (
                                <span className="ms-2 text-primary font-semibold">
                                  {lang === 'ar' ? `صفحة ${dp}` : `p.${dp}`}
                                </span>
                              ) : null;
                            })()}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          {f.source === 'manual' ? (
                            <Badge variant="outline" className="text-[10px]">{lang === 'ar' ? 'يدوي' : 'Manual'}</Badge>
                          ) : (f.source === 'ai' || f.source === 'lexicon_mandatory') ? (
                            <Badge variant="warning" className="text-[10px]">{f.source === 'lexicon_mandatory' ? t('findingSourceGlossary') : 'AI'}</Badge>
                          ) : isReviewLayerOnlyWorkspaceFinding(f) ? (
                            <Badge variant="outline" className="text-[10px] border-success/30 text-success">
                              {lang === 'ar' ? 'من طبقة المراجعة' : 'Review layer'}
                            </Badge>
                          ) : isSyntheticWorkspaceFinding(f) ? (
                            <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">
                              {lang === 'ar' ? 'من التقرير النهائي' : 'From final report'}
                            </Badge>
                          ) : null}
                          {findingWorkspaceResolve.get(f.id)?.resolved === false && (
                            <Badge variant="outline" className="text-[10px] border-warning/40 text-warning">
                              {lang === 'ar' ? 'يتطلب تموضعًا يدويًا' : 'Needs manual anchoring'}
                            </Badge>
                          )}
                          {isEdited && (
                            <Badge variant="outline" className="text-[10px] border-info/40 text-info">
                              {lang === 'ar' ? 'معدّل' : 'Edited'}
                            </Badge>
                          )}
                          <Badge variant={f.reviewStatus === 'approved' ? 'success' : 'error'} className="text-[10px]">
                            {f.reviewStatus === 'approved' ? (lang === 'ar' ? 'آمن' : 'Safe') : (lang === 'ar' ? 'مخالفة' : 'Violation')}
                          </Badge>
                        </div>
                      </div>
                      {cardPrimaryText && (
                        <p className="text-sm font-medium text-text-main line-clamp-3 mb-1.5 bg-surface-hover/50 p-2 rounded" dir="rtl">
                          "{cardPrimaryText}"
                        </p>
                      )}
                      {cardSecondaryText && (
                        <p className="text-[11px] text-text-muted line-clamp-2 mb-1" dir="rtl">
                          {cardSecondaryText}
                        </p>
                      )}
                      {manualComment && (
                        <p className="text-[11px] text-text-main mb-1.5" dir="rtl">
                          <span className="font-semibold">{noteLabel}: </span>
                          {manualComment}
                        </p>
                      )}
                      <p className="mt-2 text-[11px] text-text-muted" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
                        {isReviewLayerOnlyWorkspaceFinding(f)
                          ? lang === 'ar'
                            ? 'هذه البطاقة موجودة في طبقة المراجعة الموحدة، لكن لم يُعثر بعد على صف الملاحظة الخام المرتبط بها لتنفيذ الاعتماد أو التعديل.'
                            : 'This card exists in the unified review layer, but its linked raw finding row is not available yet for review actions.'
                          : isSyntheticWorkspaceFinding(f)
                          ? lang === 'ar'
                            ? 'هذه البطاقة جاءت من التقرير النهائي لأن صف الملاحظة التفصيلي لم يُحمّل بعد. ستبقى ظاهرة للمراجعة ولن تتيح إجراءات الاعتماد حتى تتوفر البيانات التفصيلية.'
                            : 'This card comes from the final report because the detailed finding row is not available yet. It remains visible for review, but action buttons stay disabled until the detailed record is available.'
                          : findingWorkspaceResolve.get(f.id)?.resolved === false
                          ? lang === 'ar'
                            ? 'هذه الملاحظة لم تُحل بصريًا بعد. الضغط عليها سينقلك لأقرب صفحة مع إبقائها ظاهرة للمراجعة اليدوية.'
                            : 'This finding is not visually anchored yet. Clicking it will take you to the closest page and keep it flagged for manual verification.'
                          : lang === 'ar'
                            ? 'اضغط على البطاقة للانتقال إلى موضعها وتمييزها داخل النص.'
                            : 'Click the card to jump to and highlight its location in the script.'}
                      </p>
                      {f.source !== 'manual' && !isWorkspaceActionDisabledFinding(f) && (
                        <div className="flex flex-wrap gap-1.5 mt-2" onClick={(e) => e.stopPropagation()}>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 text-[10px] px-2"
                            onClick={() => setEditReportFindingModal(f)}
                          >
                            {lang === 'ar' ? 'تعديل' : 'Edit'}
                          </Button>
                          {f.reviewStatus !== 'approved' ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 text-[10px] px-2 text-success border-success/30 hover:bg-success/10"
                              onClick={() => {
                                setReportFindingReviewModal({ findingId: f.id, toStatus: 'approved', titleAr: f.titleAr || f.descriptionAr || '' });
                                setReportFindingReviewReason('');
                              }}
                            >
                              <CheckCircle2 className="w-3 h-3 me-1" />
                              {lang === 'ar' ? 'اعتماد كآمن' : 'Mark safe'}
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 text-[10px] px-2 text-error border-error/30 hover:bg-error/10"
                              onClick={() => {
                                setReportFindingReviewModal({ findingId: f.id, toStatus: 'violation', titleAr: f.titleAr || f.descriptionAr || '' });
                                setReportFindingReviewReason('');
                              }}
                            >
                              <ShieldAlert className="w-3 h-3 me-1" />
                              {lang === 'ar' ? 'إعادة كمخالفة' : 'Revert'}
                            </Button>
                          )}
                        </div>
                      )}
                      {f.reviewStatus === 'approved' && f.reviewReason && (
                        <p className="text-[10px] text-success mt-1.5" dir="rtl">
                          {lang === 'ar' ? 'السبب:' : 'Reason:'} {f.reviewReason}
                        </p>
                      )}
                          </>
                        );
                      })()}
                    </div>
                  ))}
                </div>
              )}
              {manualScriptFindings.length > 0 && (
                <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                  {lang === 'ar' ? 'ملاحظات يدوية' : 'Manual findings'}
                </h3>
              )}
            {manualScriptFindings.map(f => (
              <div 
                key={f.id} 
                className={cn(
                  "bg-surface border rounded-xl p-4 shadow-sm transition-all cursor-pointer group hover:border-primary/50",
                    'border-error/30'
                )}
              >
                <div className="flex items-center justify-between mb-2">
                    <Badge variant="error" className="text-[10px]">
                      {lang === 'ar' ? 'يدوي' : 'Manual'}
                  </Badge>
                </div>
                <p className="text-sm font-medium text-text-main leading-snug mb-2 line-clamp-3 bg-background/50 p-2 rounded-md border border-border/50" dir="rtl">
                  "{f.excerpt}"
                </p>
                <div className="flex items-center justify-between mt-3 text-xs text-text-muted">
                  <span className="font-medium text-text-main">{getFindingDisplayTitle(f as any, lang)}</span>
                  {f.status !== 'open' && (
                    <Badge variant={f.status === 'accepted' ? 'success' : 'error'} className="text-[10px]">
                      {f.status}
                    </Badge>
                  )}
                </div>
              </div>
            ))}
              {legacyAutomatedScriptFindings.length > 0 && (
                <>
                  <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                    {lang === 'ar' ? 'ملاحظات آلية من مساحة العمل' : 'Workspace AI findings'}
                  </h3>
                  {legacyAutomatedScriptFindings.map(f => (
                    <div 
                      key={f.id} 
                      className="bg-surface border border-warning/30 rounded-xl p-4 shadow-sm transition-all cursor-pointer group hover:border-primary/50"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <Badge variant="warning" className="text-[10px]">
                          {f.source === 'lexicon_mandatory' ? t('findingSourceGlossary') : 'AI Agent'}
                        </Badge>
                      </div>
                      <p className="text-sm font-medium text-text-main leading-snug mb-2 line-clamp-3 bg-background/50 p-2 rounded-md border border-border/50" dir="rtl">
                        "{f.excerpt}"
                      </p>
                      <div className="flex items-center justify-between mt-3 text-xs text-text-muted">
                        <span className="font-medium text-text-main">{getFindingDisplayTitle(f as any, lang)}</span>
                        {f.status === 'open' && (
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                              onClick={(e) => { e.stopPropagation(); updateFindingStatus(f.id, 'accepted', 'Override AI finding', user?.name); }}
                              className="p-1.5 bg-success/10 text-success rounded hover:bg-success/20 transition-colors" title="Accept/Override"
                            >
                              <Check className="w-3 h-3" />
                            </button>
                            <button 
                              onClick={(e) => { e.stopPropagation(); updateFindingStatus(f.id, 'confirmed', 'Confirm Violation', user?.name); }}
                              className="p-1.5 bg-error/10 text-error rounded hover:bg-error/20 transition-colors" title="Confirm Violation"
                            >
                              <ShieldAlert className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                        {f.status !== 'open' && (
                          <Badge variant={f.status === 'accepted' ? 'success' : 'error'} className="text-[10px]">
                            {f.status}
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </>
              )}
              {manualScriptFindings.length === 0 && legacyAutomatedScriptFindings.length === 0 && workspaceVisibleReportFindings.length === 0 && (
              <div className="text-center p-8 text-text-muted text-sm border-2 border-dashed border-border rounded-xl">
                  {lang === 'ar' ? 'لا توجد ملاحظات. اختر تقريراً لعرض التمييز، أو حدد نصاً وانقر بزر الماوس الأيمن لإضافة ملاحظة.' : 'No findings. Select a report to show highlights, or select text and right-click to add a manual finding.'}
              </div>
            )}
          </div>
          )}

          {/* ── Reports tab ── */}
          {sidebarTab === 'reports' && (
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-background/30">
              {/* reports tab */}
              {reportHistory.length === 0 ? (
                <div className="text-center p-8 text-text-muted text-sm border-2 border-dashed border-border rounded-xl">
                  {lang === 'ar' ? 'لا توجد تقارير بعد. قم بتشغيل التحليل لإنشاء تقرير.' : 'No reports yet. Run analysis to generate one.'}
                </div>
              ) : (
                reportHistory.map((r) => {
                  const total = r.findingsCount ?? 0;
                  const approved = (r as any).approvedCount ?? 0;
                  const reviewColor = r.reviewStatus === 'approved' ? 'success' : r.reviewStatus === 'rejected' ? 'error' : 'warning';
                  const reviewLabel = r.reviewStatus === 'approved' ? (lang === 'ar' ? 'مقبول' : 'Approved')
                    : r.reviewStatus === 'rejected' ? (lang === 'ar' ? 'مرفوض' : 'Rejected')
                      : (lang === 'ar' ? 'قيد المراجعة' : 'Under Review');

                  const isSelectedForHighlights = selectedReportForHighlights?.id === r.id;
                  const createdByLabel = r.createdBy ? (r.createdBy === user?.id ? (lang === 'ar' ? 'أنت' : 'You') : (r.createdBy.slice(0, 8) + '…')) : '—';
                  return (
                    <div
                      key={r.id}
                      role="button"
                      tabIndex={0}
                      onClick={(e) => { if (!(e.target as HTMLElement).closest('button')) handleSelectReportForHighlights(r); }}
                      onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !(e.target as HTMLElement).closest('button')) { e.preventDefault(); handleSelectReportForHighlights(r); } }}
                      className={cn("bg-surface border rounded-xl p-3 shadow-sm space-y-2 group cursor-pointer hover:border-primary/40", isSelectedForHighlights && "ring-2 ring-primary")}
                    >
                      {/* Header: created_at, status */}
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-text-muted font-mono">{formatOptionalReportDate(r.createdAt)}</span>
                        <Badge variant={reviewColor as any} className="text-[10px]">{reviewLabel}</Badge>
                      </div>
                      {/* created_by (audit) */}
                      <div className="text-[10px] text-text-muted">
                        {lang === 'ar' ? 'بواسطة: ' : 'By: '}{createdByLabel}
                      </div>
                      {/* Counts */}
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-semibold text-text-main">{total} {lang === 'ar' ? 'ملاحظة' : 'findings'}</span>
                        {approved > 0 && <span className="text-success">{approved}{lang === 'ar' ? ' آمن' : ' safe'}</span>}
                        {total === 0 && approved === 0 && <span className="text-success">{lang === 'ar' ? 'نظيف' : 'Clean'}</span>}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 pt-1 border-t border-border/50 flex-wrap">
                        <Button size="sm" variant="ghost" className="h-7 text-[11px] px-2" onClick={() => navigate(`/report/${(r as any).jobId ?? r.id}?by=job${reportQuickQuery}`)}>
                          <FileText className="w-3 h-3 mr-1" />
                          {lang === 'ar' ? 'عرض' : 'View'}
                        </Button>

                        {r.reviewStatus !== 'approved' && (
                          <Button size="sm" variant="ghost" className="h-7 text-[11px] px-2 text-success hover:text-success" onClick={() => openApproveDecisionConfirm(r.id)}>
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            {lang === 'ar' ? 'قبول' : 'Approve'}
                          </Button>
                        )}
                        {r.reviewStatus !== 'rejected' && (
                          <Button size="sm" variant="ghost" className="h-7 text-[11px] px-2 text-error hover:text-error" onClick={() => handleReview(r.id, 'rejected')}>
                            <XCircle className="w-3 h-3 mr-1" />
                            {lang === 'ar' ? 'رفض' : 'Reject'}
                          </Button>
                        )}
                        {r.reviewStatus !== 'under_review' && (
                          <Button size="sm" variant="ghost" className="h-7 text-[11px] px-2" onClick={() => handleReview(r.id, 'under_review')}>
                            {lang === 'ar' ? 'إعادة للمراجعة' : 'Re-review'}
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="h-7 text-[11px] px-2" onClick={() => {
                          const url = URL.createObjectURL(new Blob([JSON.stringify(r, null, 2)], { type: 'application/json' }));
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `report-${r.id}.json`;
                          a.click();
                        }}>
                          <Download className="w-3 h-3 mr-1" />
                          JSON
                        </Button>
                        <div className="flex-1" />
                        <button
                          onClick={() => handleDeleteReport(r.id)}
                          className="p-1 text-text-muted hover:text-error hover:bg-error/10 rounded transition-colors opacity-0 group-hover:opacity-100"
                          title={lang === 'ar' ? 'حذف التقرير' : 'Delete report'}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>

      {/* Context Menu or Floating Touch Action */}
      {floatingAction && !contextMenu && (
        <button
          className="fixed z-50 bg-surface border border-border shadow-xl rounded-full p-2 animate-in fade-in zoom-in-95 duration-100 flex items-center justify-center text-primary"
          style={{ top: floatingAction.y, left: floatingAction.x, transform: 'translate(-50%, 0)' }}
          onClick={(e) => {
            e.stopPropagation();
            setContextMenu({
              x: floatingAction.x,
              y: floatingAction.y,
              text: floatingAction.text,
              startOffsetGlobal: floatingAction.startOffsetGlobal,
              endOffsetGlobal: floatingAction.endOffsetGlobal,
            });
            setFloatingAction(null);
          }}
          aria-label={lang === 'ar' ? 'خيارات' : 'Options'}
        >
          <Bot className="w-5 h-5" />
        </button>
      )}

      {contextMenu && (
        <div 
          className="fixed z-50 bg-surface border border-border shadow-xl rounded-lg py-1 w-48 animate-in fade-in zoom-in-95 duration-100"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <button 
            className="w-full text-start px-4 py-2 text-sm text-text-main hover:bg-background hover:text-primary flex items-center gap-2 transition-colors"
            onClick={(e) => { e.stopPropagation(); handleMarkViolation(); }}
          >
            <ShieldAlert className="w-4 h-4 text-error" />
            {lang === 'ar' ? 'إضافة ملاحظة يدوية' : 'Add manual finding'}
          </button>
        </div>
      )}

      {/* Add Manual Finding / Add to findings Modal */}
      <Modal isOpen={isViolationModalOpen} onClose={() => setIsViolationModalOpen(false)} title={lang === 'ar' ? 'إضافة ملاحظة يدوية' : 'Add manual finding'}>
        <div className="space-y-4">
          <div className="p-3 bg-error/5 border border-error/20 rounded-md text-sm text-text-main italic font-medium" dir="rtl">
            &quot;{formData.excerpt}&quot;
          </div>

          <Select
            label={lang === 'ar' ? 'التقرير' : 'Report'}
            value={formData.reportId}
            onChange={(e) => setFormData({ ...formData, reportId: e.target.value })}
            options={reportHistory.map((r) => ({
              label: `${formatOptionalReportDate(r.createdAt)} — ${r.findingsCount ?? 0} findings`,
              value: r.id,
            }))}
          />
          {reportHistory.length === 0 && (
            <p className="text-xs text-text-muted">{lang === 'ar' ? 'قم بتشغيل التحليل أولاً لإنشاء تقرير.' : 'Run analysis first to create a report.'}</p>
          )}
          
          <Select
            label={lang === 'ar' ? 'نوع المخالفة' : 'Violation type'}
            value={formData.violationTypeId}
            onChange={(e) => {
              const violationTypeId = e.target.value as ViolationTypeId;
              setFormData((prev) => ({
                ...prev,
                violationTypeId,
                articleId: String(getLegacyPolicyArticleIdForViolationTypeId(violationTypeId)),
                atomId: '',
              }));
            }}
            options={VIOLATION_TYPES_OPTIONS.map((item) => ({
              label: lang === 'ar' ? item.titleAr : item.titleEn,
              value: item.id,
            }))}
          />

          <Textarea 
            label={lang === 'ar' ? 'التعليق' : 'Comment'}
            value={formData.comment}
            onChange={(e) => setFormData({ ...formData, comment: e.target.value })}
            placeholder={lang === 'ar' ? 'أضف تفسيرك للمخالفة...' : 'Add your explanation...'}
          />

          <div className="flex justify-end gap-3 pt-4 border-t border-border mt-6">
            <Button variant="outline" onClick={() => setIsViolationModalOpen(false)}>{lang === 'ar' ? 'إلغاء' : 'Cancel'}</Button>
            <Button variant="danger" onClick={saveManualFinding} disabled={manualSaving || !formData.reportId || reportHistory.length === 0}>
              {manualSaving ? (lang === 'ar' ? 'جاري الحفظ…' : 'Saving…') : (lang === 'ar' ? 'حفظ الملاحظة' : 'Save Finding')}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={approveDecisionReportId != null}
        onClose={closeApproveDecisionConfirm}
        title={lang === 'ar' ? 'تأكيد اعتماد النص' : 'Confirm Script Approval'}
      >
        <div className="space-y-4">
          <p className="text-sm leading-7 text-text-muted">
            {lang === 'ar'
              ? 'هذا الإجراء سيُنشئ شهادة الاعتماد تلقائياً، ثم تُحفظ حتى يدفع العميل رسوم الشهادة. هل تريد المتابعة؟'
              : 'This action will generate the approval certificate automatically, then keep it stored until the client pays the certificate fee. Do you want to continue?'}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              isLoading={approveDecisionSubmitting}
              onClick={() => void submitApproveDecision()}
            >
              {lang === 'ar' ? 'نعم، اعتمد' : 'Yes, approve'}
            </Button>
            <Button
              variant="outline"
              onClick={closeApproveDecisionConfirm}
              disabled={approveDecisionSubmitting}
            >
              {lang === 'ar' ? 'لا' : 'No'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={rejectDecisionReportId != null}
        onClose={closeRejectDecisionModal}
        title={lang === 'ar' ? 'رفض النص وإرسال الملاحظات للعميل' : 'Reject Script & Send Client Feedback'}
      >
        <div className="space-y-4">
          <Textarea
            label={lang === 'ar' ? 'سبب الرفض (داخلي)' : 'Rejection reason (internal)'}
            value={rejectDecisionReason}
            onChange={(e) => setRejectDecisionReason(e.target.value)}
            rows={4}
            placeholder={lang === 'ar' ? 'اكتب سبب الرفض المطلوب في السجل الداخلي…' : 'Write the internal rejection reason…'}
          />

          <Textarea
            label={lang === 'ar' ? 'ملاحظة للعميل (اختياري)' : 'Client comment (optional)'}
            value={rejectDecisionClientComment}
            onChange={(e) => setRejectDecisionClientComment(e.target.value)}
            rows={3}
            placeholder={lang === 'ar' ? 'سيظهر هذا النص للعميل في بوابة العميل.' : 'This message will be shown to the client in their portal.'}
          />

          <div className="rounded-md border border-border bg-background p-3 space-y-3">
            <label className="inline-flex items-center gap-2 text-sm font-medium text-text-main">
              <input
                type="checkbox"
                checked={rejectDecisionShareReports}
                onChange={(e) => setRejectDecisionShareReports(e.target.checked)}
              />
              <span>{lang === 'ar' ? 'إرفاق تقارير/مخرجات التحليل مع قرار الرفض' : 'Attach analysis report(s) to this rejection'}</span>
            </label>

            {rejectDecisionShareReports && (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {reportHistory.length === 0 ? (
                  <p className="text-xs text-text-muted">
                    {lang === 'ar' ? 'لا توجد تقارير متاحة لهذا النص حالياً.' : 'No reports available for this script yet.'}
                  </p>
                ) : (
                  reportHistory.map((report) => (
                    <label key={report.id} className="flex items-start gap-2 text-sm text-text-main rounded border border-border bg-surface p-2">
                      <input
                        type="checkbox"
                        checked={rejectDecisionReportIds.includes(report.id)}
                        onChange={() => toggleRejectDecisionReportId(report.id)}
                      />
                      <span>
                        {(lang === 'ar' ? 'تقرير' : 'Report')} #{report.id.slice(0, 8)}
                        {' • '}
                        {new Date(report.createdAt).toLocaleString()}
                        {' • '}
                        {(lang === 'ar' ? 'الحالة' : 'Status')}: {report.reviewStatus}
                        {' • '}
                        {(lang === 'ar' ? 'المخالفات' : 'Findings')}: {report.findingsCount}
                      </span>
                    </label>
                  ))
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="danger"
              isLoading={rejectDecisionSubmitting}
              onClick={submitRejectDecision}
            >
              {lang === 'ar' ? 'تأكيد الرفض' : 'Confirm Rejection'}
            </Button>
            <Button
              variant="outline"
              onClick={closeRejectDecisionModal}
              disabled={rejectDecisionSubmitting}
            >
              {lang === 'ar' ? 'إلغاء' : 'Cancel'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Analysis Progress Modal */}
      <Modal
        isOpen={analysisModalOpen}
        onClose={() => setAnalysisModalOpen(false)}
        title={lang === 'ar' ? 'تقدم التحليل' : 'Analysis Progress'}
        className="max-w-[72rem]"
      >
        <div className="space-y-5">
          <section className="rounded-3xl border border-border bg-surface p-5 space-y-5 shadow-sm">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="flex items-start gap-3">
                <div className="rounded-2xl border border-border bg-background/70 p-3">
                  {isSuccessfulJobStatus(analysisJob?.status) ? (
                    <CheckCircle2 className="w-8 h-8 text-success flex-shrink-0" />
                  ) : isQueuedJobStatus(analysisJob?.status) ? (
                    <Loader2 className="w-8 h-8 text-text-muted flex-shrink-0" />
                  ) : isCancelledJobStatus(analysisJob?.status) ? (
                    <XCircle className="w-8 h-8 text-warning flex-shrink-0" />
                  ) : isStoppingJobStatus(analysisJob?.status) ? (
                    <Loader2 className="w-8 h-8 text-warning flex-shrink-0 animate-spin" />
                  ) : isPausedJobStatus(analysisJob?.status) ? (
                    <Pause className="w-8 h-8 text-warning flex-shrink-0" />
                  ) : (analysisJob?.status ?? '').toLowerCase() === 'failed' ? (
                    <XCircle className="w-8 h-8 text-error flex-shrink-0" />
                  ) : (
                    <Loader2 className="w-8 h-8 text-primary animate-spin flex-shrink-0" />
                  )}
                </div>
                <div className="space-y-2">
                  <p className="text-lg font-semibold text-text-main">
                    {isSuccessfulJobStatus(analysisJob?.status)
                      ? (analysisJob?.isPartialReport
                          ? (lang === 'ar' ? 'اكتمل التقرير الجزئي' : 'Partial Report Ready')
                          : (lang === 'ar' ? 'اكتمل التحليل' : 'Analysis Complete'))
                      : isQueuedJobStatus(analysisJob?.status)
                        ? (lang === 'ar' ? 'بانتظار بدء التحليل' : 'Queued for Analysis')
                      : isCancelledJobStatus(analysisJob?.status)
                        ? (lang === 'ar' ? 'تم إلغاء التحليل' : 'Analysis Cancelled')
                      : isStoppingJobStatus(analysisJob?.status)
                        ? (lang === 'ar' ? 'جارٍ إنهاء التحليل وإنشاء تقرير جزئي' : 'Finalizing partial report')
                      : isPausedJobStatus(analysisJob?.status)
                        ? (lang === 'ar' ? 'التحليل متوقف مؤقتاً' : 'Analysis Paused')
                      : (analysisJob?.status ?? '').toLowerCase() === 'failed'
                        ? (lang === 'ar' ? 'فشل التحليل' : 'Analysis Failed')
                        : (lang === 'ar' ? 'جاري التحليل…' : 'Analyzing…')}
                  </p>
                  <p className={cn("text-sm leading-7", analysisStatusToneClass)}>
                    {analysisStatusCaption}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="text-[11px]">
                      {lang === 'ar'
                        ? `نمط التحليل: ${selectedAnalysisModeMeta.labelAr}`
                        : `Mode: ${selectedAnalysisModeMeta.labelEn}`}
                    </Badge>
                    <Badge variant="outline" className="text-[11px]">
                      {lang === 'ar'
                        ? `المسار: ${selectedPipelineMeta.labelAr}`
                        : `Pipeline: ${selectedPipelineMeta.labelEn}`}
                    </Badge>
                    {analysisJob?.id && (
                      <Badge variant="outline" className="text-[11px] font-mono max-w-full">
                        {lang === 'ar' ? `رقم المهمة: ${analysisJob.id}` : `Job ID: ${analysisJob.id}`}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              <div className="min-w-[220px] rounded-2xl border border-border bg-background/60 px-4 py-3">
                <p className="text-[11px] font-medium text-text-muted mb-1">
                  {lang === 'ar' ? 'التقدم الكلي' : 'Overall progress'}
                </p>
                <p className="text-2xl font-semibold text-text-main" dir="ltr">
                  {analysisJob?.progressPercent ?? 0}%
                </p>
                <p className="text-xs text-text-muted mt-1" dir="ltr">
                  {analysisJob ? progressDisplayPair : '—'}
                </p>
              </div>
            </div>

            <div className="w-full bg-background rounded-full h-3.5 overflow-hidden border border-border">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-300",
                  isSuccessfulJobStatus(analysisJob?.status) ? 'bg-success' :
                    isQueuedJobStatus(analysisJob?.status) ? 'bg-slate-300' :
                    isCancelledJobStatus(analysisJob?.status) ? 'bg-warning' :
                    isStoppingJobStatus(analysisJob?.status) ? 'bg-warning' :
                    isPausedJobStatus(analysisJob?.status) ? 'bg-warning' :
                    (analysisJob?.status ?? '').toLowerCase() === 'failed' ? 'bg-error' : 'bg-primary'
                )}
                style={{ width: `${Math.min(100, analysisJob?.progressPercent ?? 0)}%` }}
              />
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-border bg-background/60 p-4">
                <p className="text-[11px] text-text-muted mb-1">{lang === 'ar' ? 'نمط التحليل' : 'Analysis mode'}</p>
                <p className="text-base font-semibold text-text-main">
                  {lang === 'ar' ? selectedAnalysisModeMeta.labelAr : selectedAnalysisModeMeta.labelEn}
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-background/60 p-4">
                <p className="text-[11px] text-text-muted mb-1">{lang === 'ar' ? 'المدة' : 'Elapsed'}</p>
                <p className="text-base font-semibold text-text-main">
                  {analysisElapsedLabel ? analysisElapsedLabel.replace(/^المدة:\s*/, '').replace(/^Elapsed:\s*/, '') : '—'}
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-background/60 p-4">
                <p className="text-[11px] text-text-muted mb-1">{lang === 'ar' ? 'تقدم الأجزاء' : 'Chunk progress'}</p>
                <p className="text-base font-semibold text-text-main" dir="ltr">
                  {analysisJob ? progressDisplayPair : '—'}
                </p>
                {previewContextLabel && (
                  <p className="mt-1 text-xs text-text-muted">{previewContextLabel}</p>
                )}
              </div>
              <div className="rounded-2xl border border-border bg-background/60 p-4">
                <p className="text-[11px] text-text-muted mb-1">{lang === 'ar' ? 'زمن الجزء الحالي' : 'Current chunk timer'}</p>
                <p className={cn("text-base font-semibold", activeChunkIsStalled ? "text-warning" : "text-text-main")}>
                  {activeChunkTimerValue}
                </p>
                {activePhaseLabel && (
                  <p className="mt-1 text-xs text-text-muted">{activePhaseLabel}</p>
                )}
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]">
              <div className="rounded-2xl border border-border bg-background/50 p-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="text-sm font-semibold text-text-main">
                      {lang === 'ar' ? 'متابعة الجزء الحالي' : 'Current chunk follow-up'}
                    </p>
                    <p className="text-xs text-text-muted">
                      {activeChunkNumber != null && totalChunksTracked > 0
                        ? (lang === 'ar'
                          ? `الجزء ${activeChunkNumber} من ${totalChunksTracked}`
                          : `Chunk ${activeChunkNumber} of ${totalChunksTracked}`)
                        : (lang === 'ar' ? 'بانتظار بدء التنفيذ الفعلي' : 'Waiting for active execution')}
                    </p>
                  </div>
                  {passProgressLine && (
                    <Badge variant="outline" className="text-[11px] max-w-full whitespace-normal text-center">
                      {passProgressLine}
                    </Badge>
                  )}
                </div>
                <div className="mt-3 grid gap-2 text-sm text-text-main">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-text-muted">{lang === 'ar' ? 'الجزء الحالي' : 'Current chunk'}</span>
                    <span className="text-end">
                      {activeChunkLabel
                        ? activeChunkLabel
                        : latestCompletedChunk
                          ? previewContextLabel
                          : (lang === 'ar' ? 'غير متاح بعد' : 'Not available yet')}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-text-muted">{lang === 'ar' ? 'المرحلة الحالية' : 'Current stage'}</span>
                    <span className="text-end">
                      {activePhaseLabel ?? (lang === 'ar' ? 'قيد الانتظار' : 'Waiting')}
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-background/50 p-4 space-y-3">
                <p className="text-sm font-semibold text-text-main">
                  {lang === 'ar' ? 'ملاحظات سريعة' : 'Quick notes'}
                </p>
                <p className="text-xs leading-6 text-text-muted">
                  {lang === 'ar'
                    ? 'أزلنا العرض الحي للنص الحالي لتبسيط النافذة على فريق العميل. ستظهر هنا المؤشرات الأهم فقط: النمط، التقدم، المدة، والأجزاء المنجزة.'
                    : 'The live text preview was removed to keep this dialog simpler for client-facing teams. Only the most useful indicators stay visible here: mode, progress, timing, and completed chunks.'}
                </p>
                {(analysisJob?.manualReviewContextCount ?? 0) > 0 && (
                  <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-[11px] text-primary">
                    {lang === 'ar'
                      ? `تمت الاستفادة من ${(analysisJob?.manualReviewContextCount ?? 0)} ملاحظات يدوية محفوظة من جولات سابقة أثناء تجهيز هذا التحليل.`
                      : `${analysisJob?.manualReviewContextCount ?? 0} saved manual review notes were carried into this analysis setup from earlier runs.`}
                  </div>
                )}
                {activeChunkIsStalled && (
                  <div className="rounded-xl border border-warning/30 bg-warning/5 p-3 text-[11px] text-warning">
                    {lang === 'ar'
                      ? 'لم يتغير الجزء الجاري منذ أكثر من 10 دقائق. قد يكون العامل بانتظار مهلة طويلة أو يحتاج إلى متابعة من الفريق التقني.'
                      : 'The active chunk has not moved for more than 10 minutes. The worker may be waiting on a long timeout or may need technical follow-up.'}
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="space-y-4">
            {analysisJob?.errorMessage && (
              <div className="p-3 bg-error/5 border border-error/20 rounded-md text-sm text-error">
                {getPublicAnalysisErrorMessage(analysisJob.errorMessage)}
              </div>
            )}

            <div className="rounded-2xl border border-border bg-background/40 p-4 space-y-4">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                <div className="text-sm text-text-main">
                  {lang === 'ar'
                    ? 'يمكنك التحكم في سير التحليل من هنا، وسيظهر التقرير فور اكتمال الجولة أو إنهائها جزئياً.'
                    : 'You can control the analysis from here, and the report will be available as soon as the run finishes or is ended partially.'}
                </div>
                {isSuccessfulJobStatus(analysisJob?.status) && (
                  <Button size="sm" onClick={() => { setAnalysisModalOpen(false); const rid = reportIdWhenJobCompleted ?? analysisJobId; navigate(rid ? (reportIdWhenJobCompleted ? `/report/${rid}?by=id${reportQuickQuery}` : `/report/${rid}?by=job${reportQuickQuery}`) : '/reports'); }}>
                    <FileText className="w-4 h-4 mr-1" />
                    {lang === 'ar' ? 'عرض التقرير' : 'View Report'}
                  </Button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {analysisJob && !isSuccessfulJobStatus(analysisJob.status) && analysisJob.status !== 'failed' && analysisJob.status !== 'cancelled' && !isPausedJobStatus(analysisJob.status) && (
                  <Button size="sm" variant="outline" onClick={handlePauseAnalysis} disabled={analysisControlBusy != null} className="min-w-[12rem] justify-center">
                    <Pause className="w-4 h-4 mr-1" />
                    {analysisControlBusy === 'pause'
                      ? (lang === 'ar' ? 'جارٍ الإيقاف…' : 'Pausing…')
                      : (lang === 'ar' ? 'إيقاف مؤقت' : 'Pause')}
                  </Button>
                )}
                {analysisJob && isPausedJobStatus(analysisJob.status) && (
                  <Button size="sm" onClick={handleResumeAnalysis} disabled={analysisControlBusy != null} className="min-w-[12rem] justify-center">
                    <Play className="w-4 h-4 mr-1" />
                    {analysisControlBusy === 'resume'
                      ? (lang === 'ar' ? 'جارٍ الاستئناف…' : 'Resuming…')
                      : (lang === 'ar' ? 'استئناف' : 'Resume')}
                  </Button>
                )}
                {analysisJob && !isSuccessfulJobStatus(analysisJob.status) && analysisJob.status !== 'failed' && analysisJob.status !== 'cancelled' && !isStoppingJobStatus(analysisJob.status) && (
                  <Button size="sm" variant="outline" onClick={handleStopAnalysis} disabled={analysisControlBusy != null} className="min-w-[12rem] justify-center border-warning/30 text-warning hover:bg-warning/10">
                    <Square className="w-4 h-4 mr-1" />
                    {analysisControlBusy === 'stop'
                      ? (lang === 'ar' ? 'جارٍ الإنهاء…' : 'Finalizing…')
                      : (lang === 'ar' ? 'إنهاء مع تقرير جزئي' : 'End with Partial Report')}
                  </Button>
                )}
                {analysisJob && !isSuccessfulJobStatus(analysisJob.status) && analysisJob.status !== 'failed' && analysisJob.status !== 'cancelled' && (
                  <Button size="sm" variant="danger" onClick={handleCancelAnalysis} disabled={analysisControlBusy != null} className="min-w-[12rem] justify-center">
                    <Square className="w-4 h-4 mr-1" />
                    {analysisControlBusy === 'cancel'
                      ? (lang === 'ar' ? 'جارٍ الإيقاف الكامل…' : 'Cancelling…')
                      : (lang === 'ar' ? 'إيقاف كامل' : 'Cancel Completely')}
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => setAnalysisModalOpen(false)} className="min-w-[10rem] justify-center">
                  <XCircle className="w-4 h-4 mr-1" />
                  {lang === 'ar' ? 'إغلاق' : 'Close'}
                </Button>
                {analysisJob?.status === 'failed' && (
                  <Button size="sm" variant="outline" onClick={() => { setAnalysisModalOpen(false); handleStartAnalysis(); }} className="min-w-[10rem] justify-center">
                    {lang === 'ar' ? 'إعادة المحاولة' : 'Retry'}
                  </Button>
                )}
              </div>
            </div>
          </section>

          {/* Debug toggle (dev only) */}
          {IS_DEV && (
            <div className="border-t border-border pt-3 lg:col-span-2">
              <button
                className="flex items-center gap-2 text-xs text-text-muted hover:text-text-main transition-colors w-full"
                onClick={() => setDebugOpen(d => !d)}
              >
                {debugOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                Debug Info
              </button>
              {debugOpen && analysisJob && (
                <div className="mt-2 space-y-2 text-xs font-mono bg-background p-3 rounded-lg border border-border max-h-60 overflow-y-auto">
                  <div className="grid grid-cols-2 gap-1">
                    <span className="text-text-muted">jobId:</span>
                    <span className="text-text-main truncate">{analysisJob.id}</span>
                    <span className="text-text-muted">status:</span>
                    <span className="text-text-main">{analysisJob.status}</span>
                    <span className="text-text-muted">progress:</span>
                    <span className="text-text-main"><span dir="ltr">{progressDisplayDone}/{progressDisplayTotal}</span> ({analysisJob.progressPercent}%)</span>
                    <span className="text-text-muted">created:</span>
                    <span className="text-text-main">{formatOptionalTimeValue(analysisJob.createdAt)}</span>
                    <span className="text-text-muted">started:</span>
                    <span className="text-text-main">{formatOptionalTimeValue(analysisJob.startedAt)}</span>
                    <span className="text-text-muted">completed:</span>
                    <span className="text-text-main">{formatOptionalTimeValue(analysisJob.completedAt)}</span>
                  </div>
                  <div className="text-text-muted pt-1 border-t border-border/50">Chunks:</div>
                  {chunkStatuses.length > 0 ? (
                    <div className="space-y-0.5">
                      {chunkStatuses.map(c => (
                        <div key={c.chunkIndex} className="flex items-center gap-2 flex-wrap">
                          <span className="w-6 text-right text-text-muted">{c.chunkIndex}</span>
                          {(c.pageNumberMin != null || c.pageNumberMax != null) && (
                            <span className="text-[10px] text-text-muted">
                              P{c.pageNumberMin}{c.pageNumberMax != null && c.pageNumberMax !== c.pageNumberMin ? `–${c.pageNumberMax}` : ''}
                            </span>
                          )}
                          <span className={cn(
                            "px-1.5 py-0.5 rounded text-[10px]",
                            c.status === 'done' ? 'bg-success/10 text-success' :
                              c.status === 'failed' ? 'bg-error/10 text-error' :
                                c.status === 'judging' ? 'bg-warning/10 text-warning' :
                                  'bg-background text-text-muted'
                          )}>
                            {c.status}
                          </span>
                          {c.processingPhase && (
                            <span className="text-[10px] text-text-muted">{c.processingPhase}</span>
                          )}
                          {c.status === 'judging' && c.passesTotal != null && c.passesTotal > 0 && (
                            <span className="text-[10px] text-text-muted">
                              {c.passesCompleted ?? 0}/{c.passesTotal}
                            </span>
                          )}
                          {c.status === 'judging' && c.judgingStartedAt && (
                            <span className="text-[10px] text-text-muted">
                              {lang === 'ar' ? 'منذ' : 'since'} {formatOptionalTimeValue(c.judgingStartedAt)}
                            </span>
                          )}
                          {c.lastError && (
                            <span
                              className="text-error truncate"
                              title={getPublicAnalysisErrorMessage(c.lastError) ?? undefined}
                            >
                              {getPublicAnalysisErrorMessage(c.lastError)}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-text-muted text-[10px]">
                      <span dir="ltr">{progressDisplayDone}/{progressDisplayTotal}</span> done (chunk detail unavailable)
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>

      <Modal
        isOpen={!!reportFindingReviewModal}
        onClose={() => {
          setReportFindingReviewModal(null);
          setReportFindingReviewReason('');
        }}
        title={
          reportFindingReviewModal?.toStatus === 'approved'
            ? lang === 'ar'
              ? 'اعتماد كآمن'
              : 'Mark as safe'
            : lang === 'ar'
              ? 'إعادة كمخالفة'
              : 'Revert to violation'
        }
        className="max-w-md"
      >
        <div className="space-y-4" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
          <div className="p-3 bg-background rounded-md border border-border text-sm text-text-main font-medium" dir="rtl">
            {reportFindingReviewModal?.titleAr}
          </div>
          <Textarea
            label={lang === 'ar' ? 'السبب (مطلوب)' : 'Reason (required)'}
            value={reportFindingReviewReason}
            onChange={(e) => setReportFindingReviewReason(e.target.value)}
            placeholder={
              reportFindingReviewModal?.toStatus === 'approved'
                ? lang === 'ar'
                  ? 'اشرح لماذا هذه الملاحظة آمنة…'
                  : 'Explain why this finding is safe…'
                : lang === 'ar'
                  ? 'اشرح لماذا يجب إعادتها كمخالفة…'
                  : 'Explain why this should be a violation again…'
            }
          />
          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <Button
              variant="outline"
              onClick={() => {
                setReportFindingReviewModal(null);
                setReportFindingReviewReason('');
              }}
            >
              {lang === 'ar' ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button
              variant={reportFindingReviewModal?.toStatus === 'approved' ? 'primary' : 'danger'}
              onClick={() => void handleReportFindingReviewSubmit()}
              disabled={
                reportFindingReviewSaving ||
                (settings?.platform?.requireOverrideReason !== false && !reportFindingReviewReason.trim())
              }
            >
              {reportFindingReviewSaving
                ? lang === 'ar'
                  ? 'جاري الحفظ…'
                  : 'Saving…'
                : reportFindingReviewModal?.toStatus === 'approved'
                  ? lang === 'ar'
                    ? 'اعتماد'
                    : 'Approve'
                  : lang === 'ar'
                    ? 'إعادة كمخالفة'
                    : 'Revert'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={!!bulkReportFindingReviewModal}
        onClose={() => {
          setBulkReportFindingReviewModal(null);
          setBulkReportFindingReviewReason('');
        }}
        title={
          bulkReportFindingReviewModal?.toStatus === 'approved'
            ? lang === 'ar'
              ? 'اعتماد المحدد كآمن'
              : 'Mark selected as safe'
            : lang === 'ar'
              ? 'إعادة المحدد كمخالفة'
              : 'Revert selected to violations'
        }
        className="max-w-md"
      >
        <div className="space-y-4" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
          <div className="p-3 bg-background rounded-md border border-border text-sm text-text-main font-medium">
            {lang === 'ar'
              ? `سيُطبَّق هذا الإجراء على ${bulkReportFindingReviewModal?.findingIds.length ?? 0} ملاحظة.`
              : `This action will be applied to ${bulkReportFindingReviewModal?.findingIds.length ?? 0} findings.`}
          </div>
          <Textarea
            label={lang === 'ar' ? 'السبب (مطلوب)' : 'Reason (required)'}
            value={bulkReportFindingReviewReason}
            onChange={(e) => setBulkReportFindingReviewReason(e.target.value)}
            placeholder={
              bulkReportFindingReviewModal?.toStatus === 'approved'
                ? lang === 'ar'
                  ? 'اشرح لماذا هذه الملاحظات آمنة…'
                  : 'Explain why these findings are safe…'
                : lang === 'ar'
                  ? 'اشرح لماذا يجب اعتبار هذه الملاحظات مخالفات…'
                  : 'Explain why these findings should be violations…'
            }
          />
          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <Button
              variant="outline"
              onClick={() => {
                setBulkReportFindingReviewModal(null);
                setBulkReportFindingReviewReason('');
              }}
            >
              {lang === 'ar' ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button
              variant={bulkReportFindingReviewModal?.toStatus === 'approved' ? 'primary' : 'danger'}
              onClick={() => void handleBulkReportFindingReviewSubmit()}
              disabled={
                bulkReportFindingReviewSaving ||
                (settings?.platform?.requireOverrideReason !== false && !bulkReportFindingReviewReason.trim())
              }
            >
              {bulkReportFindingReviewSaving
                ? lang === 'ar'
                  ? 'جاري الحفظ…'
                  : 'Saving…'
                : bulkReportFindingReviewModal?.toStatus === 'approved'
                  ? lang === 'ar'
                    ? 'اعتماد المحدد'
                    : 'Approve selected'
                  : lang === 'ar'
                    ? 'إعادة المحدد'
                    : 'Revert selected'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={!!editReportFindingModal}
        onClose={() => setEditReportFindingModal(null)}
        title={lang === 'ar' ? 'تعديل الملاحظة' : 'Edit finding'}
        className="max-w-md"
      >
        <div className="space-y-4" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
          <div className="p-3 bg-background rounded-md border border-border text-sm text-text-main font-medium" dir="rtl">
            {editReportFindingModal?.evidenceSnippet || editReportFindingModal?.descriptionAr}
          </div>
          <Textarea
            label={lang === 'ar' ? 'النص المقتبس' : 'Snippet text'}
            value={editReportFindingForm.evidenceSnippet}
            onChange={(e) => {
              setEditReportFindingForm((prev) => ({ ...prev, evidenceSnippet: e.target.value }));
              setEditReportFindingSnippetValidation(null);
            }}
            placeholder={lang === 'ar' ? 'يجب أن يطابق كلمة أو جملة أو فقرة قصيرة موجودة في المستند.' : 'Must match an existing word, sentence, or short paragraph in the document.'}
          />
          <div className="flex items-center justify-between gap-3 rounded-md border border-border/70 bg-background/50 px-3 py-2 text-xs text-text-muted">
            <span>
              {lang === 'ar'
                ? 'لن يُحفظ النص إلا إذا تم العثور عليه وربطه بموضعه داخل المستند.'
                : 'The snippet will only save if it is found and rebound to the document.'}
            </span>
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1 shrink-0"
              onClick={() => void handleValidateEditedReportFindingSnippet()}
              disabled={editReportFindingValidatingSnippet || editReportFindingSaving}
            >
              {editReportFindingValidatingSnippet ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
              {lang === 'ar' ? 'تحقق من النص' : 'Check snippet'}
            </Button>
          </div>
          {editReportFindingSnippetValidation && (
            <div className="rounded-md border border-border bg-background/50 px-3 py-2 text-xs text-text-muted">
              {editReportFindingSnippetValidation}
            </div>
          )}

          <Textarea
            label={lang === 'ar' ? 'الملاحظة التفسيرية' : 'AI reason'}
            value={editReportFindingForm.rationaleAr}
            onChange={(e) => setEditReportFindingForm((prev) => ({ ...prev, rationaleAr: e.target.value }))}
            placeholder={lang === 'ar' ? 'عدّل التعليل الظاهر في البطاقة…' : 'Edit the explanation shown on the card…'}
          />

          <Select
            label={lang === 'ar' ? 'نوع المخالفة' : 'Violation type'}
            value={editReportFindingForm.violationTypeId}
            onChange={(e) => {
              const violationTypeId = e.target.value as ViolationTypeId;
              setEditReportFindingForm((prev) => ({
                ...prev,
                violationTypeId,
                articleId: String(getLegacyPolicyArticleIdForViolationTypeId(violationTypeId)),
                atomId: '',
              }));
            }}
            options={VIOLATION_TYPES_OPTIONS.map((item) => ({
              label: lang === 'ar' ? item.titleAr : item.titleEn,
              value: item.id,
            }))}
          />

          <Textarea
            label={lang === 'ar' ? 'ملاحظة المراجع (اختياري)' : 'Reviewer note (optional)'}
            value={editReportFindingForm.manualComment}
            onChange={(e) => setEditReportFindingForm((prev) => ({ ...prev, manualComment: e.target.value }))}
            placeholder={lang === 'ar' ? 'اكتب سبب إعادة التصنيف أو توضيحًا للمراجع…' : 'Add a note explaining the reclassification…'}
          />

          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <Button
              variant="outline"
              onClick={() => setEditReportFindingModal(null)}
            >
              {lang === 'ar' ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button
              onClick={() => void handleEditReportFindingSubmit()}
              disabled={editReportFindingSaving}
            >
              {editReportFindingSaving
                ? (lang === 'ar' ? 'جاري الحفظ…' : 'Saving…')
                : (lang === 'ar' ? 'حفظ التعديل' : 'Save changes')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Persistent Selection Overlay */}
      {persistentSelection && (
        <div className="fixed inset-0 pointer-events-none z-50">
          {persistentSelection.rects.map((rect, i) => (
            <div
              key={i}
              className="absolute bg-primary/20 border border-primary/40 rounded-[1px]"
              style={{
                left: rect.left, /* rects from getBoundingClientRect are viewport relative, fixed div handles scrolling if we use Viewport coords or we need to add scroll */
                top: rect.top,
                width: rect.width,
                height: rect.height,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
