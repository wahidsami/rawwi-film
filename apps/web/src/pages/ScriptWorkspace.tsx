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
import { ArrowLeft, Bot, ShieldAlert, Check, FileText, Upload, Loader2, CheckCircle2, XCircle, ChevronDown, ChevronUp, Trash2, Download, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react';
import { cn } from '@/utils/cn';
import { getPolicyArticles } from '@/data/policyMap';
import { DecisionBar } from '@/components/DecisionBar';
import { getScriptDecisionCapabilities } from '@/utils/scriptDecisionCapabilities';



const policyArticlesForForm = getPolicyArticles().filter((a) => a.articleId !== 26);
const ARTICLES_CHECKLIST = policyArticlesForForm.map((a) => ({
  id: String(a.articleId),
  label: `Art ${a.articleId} - ${a.title_ar}`,
  value: String(a.articleId),
}));

/** Atom options per article from PolicyMap (e.g. 4-1..4-8, 16-1..16-5). */
const ARTICLE_ATOMS: Record<string, { value: string; label: string }[]> = {};
for (const art of policyArticlesForForm) {
  const id = String(art.articleId);
  ARTICLE_ATOMS[id] = [
    { value: '', label: '—' },
    ...(art.atoms ?? []).map((atom) => ({ value: atom.atomId, label: `${atom.atomId} ${atom.title_ar}` })),
  ];
}

/**
 * Display atom code for UI: PolicyMap style "X-Y" or legacy "X.Y".
 */
function formatAtomDisplay(articleId: number, atomId: string | null): string {
  if (!atomId || !atomId.trim()) return String(articleId);
  const a = atomId.trim();
  if (/^\d+-\d+$/.test(a)) return a;
  return a.includes('.') ? a : `${articleId}.${a}`;
}

import { scriptsApi, tasksApi, reportsApi, findingsApi } from '@/api';
import type { AnalysisFinding } from '@/api';
import { findTextOccurrences, findBestMatch, normalizeText } from '@/utils/textMatching';
import { normalizeText as canonicalNormalize } from '@/utils/canonicalText';
import type { EditorContentResponse, EditorSectionResponse } from '@/api';
import type { AnalysisJob, ChunkStatus, ReportListItem, ReviewStatus } from '@/api/models';
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

export function ScriptWorkspace() {

  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { lang } = useLangStore();
  const { settings } = useSettingsStore();
  const { scripts, findings, updateFindingStatus, updateScript, fetchInitialData, isLoading, error: dataError } = useDataStore();
  const { user, hasPermission } = useAuthStore();
  const dateFormat = settings?.platform?.dateFormat;

  const scriptFromList = scripts.find(s => s.id === id);
  const [scriptFetched, setScriptFetched] = useState<Script | null>(null);
  const [scriptByIdLoading, setScriptByIdLoading] = useState(true);
  const script = scriptFromList ?? scriptFetched ?? undefined;
  const scriptFindings = findings.filter(f => f.scriptId === id);
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
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'extracting' | 'done' | 'failed'>('idle');
  const [extractedText, setExtractedText] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisJobId, setAnalysisJobId] = useState<string | null>(null);
  const [analysisModalOpen, setAnalysisModalOpen] = useState(false);
  /** When job completes, we fetch the report id so "View Report" can use by=id. */
  const [reportIdWhenJobCompleted, setReportIdWhenJobCompleted] = useState<string | null>(null);
  const [analysisJob, setAnalysisJob] = useState<AnalysisJob | null>(null);
  const [debugOpen, setDebugOpen] = useState(false);
  const [chunkStatuses, setChunkStatuses] = useState<ChunkStatus[]>([]);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [decisionCan, setDecisionCan] = useState<{ canApprove: boolean; canReject: boolean; reason?: string } | null>(null);
  const analysisPasses = useMemo(
    () =>
      lang === 'ar'
        ? [
            'المعجم',
            'الإهانات',
            'العنف',
            'المحتوى الجنسي',
            'المخدرات والكحول',
            'التمييز والتحريض',
            'الأمن الوطني',
            'التطرف والجماعات المحظورة',
            'التضليل والمصداقية',
            'العلاقات الدولية',
          ]
        : [
            'Glossary',
            'Insults',
            'Violence',
            'Sexual Content',
            'Drugs & Alcohol',
            'Discrimination & Incitement',
            'National Security',
            'Extremism & Banned Groups',
            'Misinformation & Credibility',
            'International Relations',
          ],
    [lang]
  );

  // Polling for analysis job progress
  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const startPolling = useCallback((jobId: string) => {
    stopPolling();
    const poll = async () => {
      try {
        const job = await tasksApi.getJob(jobId);
        setAnalysisJob(job);
        if (isTerminalJobStatus(job.status)) {
          stopPolling();
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
    if (!script?.id || script.status === 'approved' || script.status === 'rejected') {
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
  }, [script?.id, script?.status]);
  const showDecisionBar = decisionCan !== null && decisionCanScriptId === script?.id && script?.status !== 'approved' && script?.status !== 'rejected';

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

          // If we have text and editor is empty, auto-load it
          if (latest.extraction_status === 'done' && latest.extracted_text && !extractedText) {
            // Only auto-load if text is reasonable size (< 500KB) to prevent widespread lag
            if (latest.extracted_text.length < 500000) {
              setExtractedText(latest.extracted_text);
              setUploadStatus('done');
              if (user?.id === script.assigneeId && user?.id !== script.created_by) {
                toast.success(lang === 'ar' ? 'تم تحميل المستند تلقائياً' : 'Document loaded automatically', { id: 'auto-load' });
              }
            } else {
              // Large file warning
              toast(lang === 'ar' ? 'المستند كبير. انقر لاستيراده.' : 'Large document found. Click to import.', {
                icon: '📁',
              });
            }
          } else if (latest.extraction_status === 'extracting') {
            setUploadStatus('extracting');
            // We could start polling here if we want real-time updates for assignments
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
          setAnalysisJobId(analysisJobs[0].id);
          setAnalysisJob(analysisJobs[0]);
          // Also try to get report id
        }
      })
      .catch(() => { /* ignore — no jobs yet */ });
  }, [script?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep chunk statuses updated while analysis is running (used by modal + debug panel).
  useEffect(() => {
    const isRunning = analysisJob != null && !isTerminalJobStatus(analysisJob.status);
    if (!analysisJobId || !isRunning) return;
    let cancelled = false;
    const fetchChunks = async () => {
      try {
        const chunks = await tasksApi.getJobChunks(analysisJobId);
        if (!cancelled) setChunkStatuses(chunks);
      } catch (_) { /* ignore */ }
    };
    fetchChunks();
    const iv = setInterval(fetchChunks, 2000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [analysisJobId, analysisJob?.status]);

  // ── Report history ──
  const [sidebarTab, setSidebarTab] = useState<'findings' | 'reports'>('findings');
  const [reportHistory, setReportHistory] = useState<ReportListItem[]>([]);

  // ── Report findings (for editor highlights) ──
  const [selectedReportForHighlights, setSelectedReportForHighlights] = useState<ReportListItem | null>(null);
  const [selectedJobCanonicalHash, setSelectedJobCanonicalHash] = useState<string | null>(null);
  const [reportFindings, setReportFindings] = useState<AnalysisFinding[]>([]);
  const [highlightExpectedCount, setHighlightExpectedCount] = useState(0);
  const [highlightLocatableCount, setHighlightLocatableCount] = useState(0);
  const [highlightRenderedCount, setHighlightRenderedCount] = useState(0);
  const [highlightRetryTick, setHighlightRetryTick] = useState(0);
  // const [reportFindingsLoading, setReportFindingsLoading] = useState(false);
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null);
  const [tooltipFinding, setTooltipFinding] = useState<AnalysisFinding | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [reportFindingReviewModal, setReportFindingReviewModal] = useState<{
    findingId: string;
    toStatus: 'approved' | 'violation';
    titleAr: string;
  } | null>(null);
  const [reportFindingReviewReason, setReportFindingReviewReason] = useState('');
  const [reportFindingReviewSaving, setReportFindingReviewSaving] = useState(false);
  const findingCardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  /** So we only restore saved highlight once per script (not on every reportHistory change). */
  const restoredHighlightRef = useRef(false);

  useEffect(() => {

  }, [reportFindings]);

  const [formData, setFormData] = useState({
    reportId: '',
    articleId: '1',
    atomId: '' as string,
    severity: 'medium' as string,
    comment: '',
    excerpt: '',
  });
  const [manualSaving, setManualSaving] = useState(false);
  const [manualOffsets, setManualOffsets] = useState<{ startOffsetGlobal: number; endOffsetGlobal: number } | null>(null);
  const [persistentSelection, setPersistentSelection] = useState<{ rects: DOMRect[] } | null>(null);

  const loadReportHistory = useCallback(async () => {
    if (!id) return;
    // setReportHistoryLoading(true);
    try {
      const list = await reportsApi.listByScript(id);
      setReportHistory(list);
    } catch (_) { /* ignore */ }
    // setReportHistoryLoading(false);
  }, [id]);

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

  const handleReview = async (reportId: string, status: ReviewStatus, notes?: string) => {
    try {
      await reportsApi.review(reportId, status, notes);
      toast.success(lang === 'ar' ? 'تم تحديث حالة المراجعة' : 'Review status updated');
      loadReportHistory();
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
        setSelectedJobCanonicalHash(null);
        setReportFindings([]);
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
    // setReportFindingsLoading(true);
    setSelectedFindingId(null);
    setHighlightExpectedCount(0);
    setHighlightLocatableCount(0);
    setHighlightRenderedCount(0);
    try {
      if (jobId) {
        const [job, list] = await Promise.all([
          tasksApi.getJob(jobId),
          findingsApi.getByJob(jobId),
        ]);
        setSelectedJobCanonicalHash((job as { scriptContentHash?: string | null }).scriptContentHash ?? null);
        setReportFindings(list);
        if (IS_DEV) console.log('[ScriptWorkspace] Findings loaded for highlights:', list.length);
        if (id) {
          scriptsApi.setHighlightPreference(id, jobId).catch(() => { });
        }
      } else {
        setSelectedJobCanonicalHash(null);
        const list = await findingsApi.getByReport(reportId!);
        setReportFindings(list);
        if (IS_DEV) console.log('[ScriptWorkspace] Findings loaded for highlights:', list.length);
      }
    } catch (_) {
      setReportFindings([]);
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
  }, [reportFindingReviewModal, reportFindingReviewReason, settings?.platform?.requireOverrideReason, lang, user?.id]);

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

  // Page-based view (when editorData.pages exists)
  const [currentPage, setCurrentPage] = useState(1);
  const [zoomLevel, setZoomLevel] = useState(1);
  /** Original PDF canvas vs extracted HTML (PDF imports only). */
  const [workspaceViewMode, setWorkspaceViewMode] = useState<'text' | 'pdf'>('text');
  const totalPages = editorData?.pages?.length ?? 0;
  const isPageMode = totalPages > 0;
  const safeCurrentPage = Math.max(1, Math.min(currentPage, totalPages || 1));
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    const p = searchParams.get('page');
    if (!isPageMode || !p || !totalPages) return;
    const n = parseInt(p, 10);
    if (Number.isFinite(n) && n >= 1 && n <= totalPages) setCurrentPage(n);
  }, [searchParams, isPageMode, totalPages]);

  useEffect(() => {
    if (!editorData?.sourcePdfSignedUrl) setWorkspaceViewMode('text');
  }, [editorData?.sourcePdfSignedUrl]);

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
      if (pageData?.contentHtml?.trim()) {
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

    if (!editorData?.contentHtml) {
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
  }, [editorData?.contentHtml, editorData?.pages, safeCurrentPage]);

  // Inject full-document HTML only in scroll mode (page mode uses React per-page content).
  useLayoutEffect(() => {
    if ((editorData?.pages?.length ?? 0) > 0) return;
    if (!editorRef.current || !editorData?.contentHtml) return;
    const newHtml = sanitizeFormattedHtml(editorData.contentHtml);
    if (editorRef.current.innerHTML !== newHtml) {
      editorRef.current.innerHTML = newHtml;
      if (IS_DEV) console.log('[ScriptWorkspace] innerHTML updated (scroll mode)');
    }
  }, [editorData?.contentHtml, editorData?.pages?.length]);

  /**
   * Page mode + formatted HTML: set innerHTML on the viewer div imperatively.
   * A child with dangerouslySetInnerHTML is re-applied on every React re-render (sidebar,
   * highlight counts, selection), wiping highlight spans from applyHighlightMarks.
   */
  const pageHtmlForLayout = editorData?.pages?.[safeCurrentPage - 1]?.contentHtml;
  useLayoutEffect(() => {
    if ((editorData?.pages?.length ?? 0) === 0) return;
    const el = editorRef.current;
    if (!pageHtmlForLayout?.trim() || !el) return;
    const html = sanitizeFormattedHtml(pageHtmlForLayout);
    if (el.innerHTML !== html) {
      el.innerHTML = html;
      const idx = buildDomTextIndex(el);
      setDomTextIndex(idx ?? null);
    }
  }, [editorData?.pages?.length, safeCurrentPage, pageHtmlForLayout]);

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
      const { jobId } = await scriptsApi.createTask(script.currentVersionId, {
        forceFresh: true,
        analysisOptions: { mergeStrategy: 'same_location_only' },
      });
      setAnalysisJobId(jobId);
      setAnalysisJob(null);
      setChunkStatuses([]);
      setDebugOpen(false);
      setAnalysisModalOpen(true);
      startPolling(jobId);
      toast.success(lang === 'ar' ? 'تم بدء التحليل.' : 'Analysis started.');
    } catch (err: any) {
      console.error('[ScriptWorkspace] Analysis trigger failed:', err);
      toast.error(err?.message ?? (lang === 'ar' ? 'فشل تفعيل التحليل' : 'Failed to start analysis'));
    } finally {
      setIsAnalyzing(false);
    }
  };



  const isAnalysisRunning = analysisJob != null && !isTerminalJobStatus(analysisJob.status);
  const chunkCountFromJob = Math.max(0, (analysisJob?.progressTotal ?? 0) - 1);
  const totalChunksTracked = chunkStatuses.length > 0 ? chunkStatuses.length : chunkCountFromJob;
  const doneChunks = chunkStatuses.filter((c) => c.status === 'done').length;
  const activeChunk = chunkStatuses.find((c) => c.status === 'judging') ?? null;
  const activeChunkNumber = activeChunk ? activeChunk.chunkIndex + 1 : null;
  const activeChunkPageLabel =
    activeChunk != null &&
    (activeChunk.pageNumberMin != null || activeChunk.pageNumberMax != null)
      ? activeChunk.pageNumberMin === activeChunk.pageNumberMax ||
          activeChunk.pageNumberMax == null
        ? lang === 'ar'
          ? `صفحة ${activeChunk.pageNumberMin ?? activeChunk.pageNumberMax}`
          : `Page ${activeChunk.pageNumberMin ?? activeChunk.pageNumberMax}`
        : lang === 'ar'
          ? `صفحات ${activeChunk.pageNumberMin}–${activeChunk.pageNumberMax}`
          : `Pages ${activeChunk.pageNumberMin}–${activeChunk.pageNumberMax}`
      : null;

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

    setIsUploading(true);
    setUploadStatus('uploading');

    try {
      setUploadStatus('uploading');
      const uploadName = safeUploadFileName(file.name);
      const { url, path } = await scriptsApi.getUploadUrl(uploadName);
      await scriptsApi.uploadToSignedUrl(file, url);

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
      });
      
      setUploadStatus('extracting');
      let textToShow = '';
      if (ext === 'txt') {
        const fileText = await file.text();
        const res = await scriptsApi.extractText(version.id, fileText, { enqueueAnalysis: false });
        textToShow = (res as { extracted_text?: string })?.extracted_text ?? fileText;
      } else if (ext === 'docx' || ext === 'pdf') {
        try {
          const res = await scriptsApi.extractText(version.id, undefined, { enqueueAnalysis: false });
          const err = (res as { error?: string })?.error;
          if (err) throw new Error(err);
          textToShow = (res as { extracted_text?: string })?.extracted_text ?? '';
          if (!textToShow.trim()) {
            toast.error(
              lang === 'ar' ? 'لم يتم العثور على نص في الملف' : 'No text found in document'
            );
            setUploadStatus('failed');
            return;
          }
        } catch (docPdfErr: unknown) {
          const msg = docPdfErr instanceof Error ? docPdfErr.message : String(docPdfErr);
          toast.error(lang === 'ar' ? 'فشل استخراج الملف' : msg || 'Extraction failed');
          throw docPdfErr;
        }
      } else {
        toast.error(lang === 'ar' ? 'نوع الملف غير مدعوم' : 'Unsupported file type');
        setUploadStatus('failed');
        return;
      }
      setExtractedText(textToShow);
      // The file/context was replaced: clear stale highlight/report state immediately in UI.
      setReportFindings([]);
      setSelectedReportForHighlights(null);
      setSelectedJobCanonicalHash(null);
      setSelectedFindingId(null);
      loadReportHistory();
      setUploadStatus('done');
      toast.success(lang === 'ar' ? 'تم استخراج النص بنجاح' : 'Text extracted successfully');
      await updateScript(script.id, { currentVersionId: version.id });
      try {
        const data = await scriptsApi.getEditor(script.id, version.id);
        setEditorData(data);
      } catch (_) {
        setEditorData(null);
      }
    } catch (err: any) {
      setUploadStatus('failed');
      toast.error(err.message || 'Upload failed');
    } finally {
      setIsUploading(false);
      setTimeout(() => setUploadStatus('idle'), 3000);
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
      setContextMenu({
        x: e.pageX,
        y: e.pageY,
        text,
        startOffsetGlobal: offsets ? (offsets as { start: number; end: number }).start : undefined,
        endOffsetGlobal: offsets ? (offsets as { start: number; end: number }).end : undefined,
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
    const floatingPayload =
      hasSelection && rect
        ? {
          x: rect.left + rect.width / 2,
          y: rect.bottom + window.scrollY + 10,
          text,
          startOffsetGlobal: offsets && 'start' in offsets ? offsets.start : (offsets as { start: number; end: number } | null)?.start,
          endOffsetGlobal: offsets && 'end' in offsets ? offsets.end : (offsets as { start: number; end: number } | null)?.end,
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
      articleId: '1',
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
        articleId: parseInt(formData.articleId, 10) || 1,
        atomId: formData.atomId?.trim() ? formData.atomId.trim() : null,
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


  const buildFindingSegments = useCallback((content: string, findings: AnalysisFinding[]): Segment[] => {
    if (!content || findings.length === 0) return [{ start: 0, end: content.length, finding: null }];

    // Map findings to their actual locations in CURRENT content
    // This fixes the issue where offsets from server don't match current DOM/content state
    const locatedFindings = findings.map(f => {
      const loc = locateFindingInContent(content, f);
      return loc ? { ...f, startOffsetGlobal: loc.start, endOffsetGlobal: loc.end } : null;
    }).filter(Boolean) as AnalysisFinding[];

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
  }, [locateFindingInContent]);

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
  const findingSegments = useMemo(
    () =>
      reportFindings.length > 0 && canonicalContentForHighlights
        ? buildFindingSegments(canonicalContentForHighlights, reportFindings)
        : null,
    [canonicalContentForHighlights, reportFindings, buildFindingSegments]
  );

  // Page-mode: current page data and findings scoped to this page (for toolbar + page view)
  const currentPageData = isPageMode && editorData?.pages?.[safeCurrentPage - 1] ? editorData.pages[safeCurrentPage - 1] : null;
  const pageStart = currentPageData?.startOffsetGlobal ?? 0;
  const pageEnd = currentPageData ? pageStart + (currentPageData.content?.length ?? 0) : 0;
  const pagesSortedForViewer = useMemo(
    () => [...(editorData?.pages ?? [])].sort((a, b) => a.pageNumber - b.pageNumber),
    [editorData?.pages]
  );

  const findingsOnPageWithLocalOffsets = useMemo(() => {
    if (!currentPageData || !reportFindings.length) return [];
    const pageLen = currentPageData.content?.length ?? 0;
    const list = reportFindings.filter((f) => {
      const vpn = viewerPageNumberFromStartOffset(
        pagesSortedForViewer.map((p) => ({ pageNumber: p.pageNumber, content: p.content ?? '' })),
        f.startOffsetGlobal
      );
      if (vpn != null) return vpn === safeCurrentPage;
      if (f.pageNumber != null && f.pageNumber === safeCurrentPage) return true;
      return (
        f.startOffsetGlobal != null &&
        f.endOffsetGlobal != null &&
        f.endOffsetGlobal > pageStart &&
        f.startOffsetGlobal < pageEnd
      );
    });
    return list
      .map((f) => {
        if (f.startOffsetGlobal != null && f.endOffsetGlobal != null && f.endOffsetGlobal > pageStart && f.startOffsetGlobal < pageEnd) {
          return {
            ...f,
            startOffsetGlobal: Math.max(0, f.startOffsetGlobal - pageStart),
            endOffsetGlobal: Math.min(pageLen, f.endOffsetGlobal - pageStart),
          } as AnalysisFinding;
        }
        const loc = locateFindingInContent(currentPageData.content ?? '', f, {
          pageSlice: true,
          sliceGlobalStart: pageStart,
        });
        if (!loc) return null;
        return { ...f, startOffsetGlobal: loc.start, endOffsetGlobal: loc.end } as AnalysisFinding;
      })
      .filter(Boolean) as AnalysisFinding[];
  }, [currentPageData, pageStart, pageEnd, reportFindings, safeCurrentPage, locateFindingInContent, pagesSortedForViewer]);
  const pageFindingSegments = useMemo(
    () =>
      isPageMode && currentPageData?.content && findingsOnPageWithLocalOffsets.length > 0
        ? buildFindingSegments(currentPageData.content, findingsOnPageWithLocalOffsets)
        : currentPageData?.content
          ? buildFindingSegments(currentPageData.content, [])
          : null,
    [isPageMode, currentPageData?.content, findingsOnPageWithLocalOffsets, buildFindingSegments]
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
        let loc: { start: number; end: number } | null =
          locateSpanByEvidenceSearch(domRaw, f, locateOpts) ??
          (currentPageData?.content
            ? locateSpanByEvidenceSearch(currentPageData.content, f, locateOpts)
            : null);
        if (!loc) {
          loc = locateOpts
            ? locateFindingInContent(domRaw, f, locateOpts)
            : locateFindingInContent(domRaw, f);
          if (!loc && currentPageData?.content) {
            loc = locateOpts
              ? locateFindingInContent(currentPageData.content, f, locateOpts)
              : locateFindingInContent(currentPageData.content, f);
          }
        }
        let rawStart: number;
        let rawEnd: number;
        if (loc) {
          rawStart = loc.start;
          rawEnd = loc.end;
        } else {
          rawStart = f.startOffsetGlobal ?? -1;
          rawEnd = f.endOffsetGlobal ?? -1;
          if (rawStart < 0 || rawEnd <= rawStart) continue;
        }
        const evSnip = normalizeEvidenceForSearch(f.evidenceSnippet ?? '');
        if (evSnip.length >= 4 && rawEnd > rawStart) {
          const t = tightenHighlightRangeToEvidence(domRaw, rawStart, rawEnd, evSnip);
          rawStart = t.start;
          rawEnd = t.end;
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
        el.style.backgroundColor =
          f.severity === 'critical'
            ? 'rgba(255, 0, 0, 0.35)'
            : f.severity === 'high'
              ? 'rgba(255, 0, 0, 0.28)'
              : 'rgba(255, 165, 0, 0.28)';
        el.style.borderBottom =
          f.severity === 'critical'
            ? '2px solid red'
            : f.severity === 'high'
              ? '2px solid rgba(255, 0, 0, 0.8)'
              : '2px solid orange';
        el.style.borderRadius = '2px';
        el.style.transition = 'background-color 0.2s';
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
    [locateFindingInContent, currentPageData?.content]
  );

  useEffect(() => {
    if (blockHighlightsCompletely) {
      setHighlightExpectedCount(reportFindings.length);
      setHighlightLocatableCount(0);
      setHighlightRenderedCount(0);
      return;
    }
    if (workspaceViewMode === 'pdf') {
      setHighlightExpectedCount(0);
      setHighlightLocatableCount(0);
      setHighlightRenderedCount(0);
      return;
    }
    const container = editorRef.current;
    const inPageMode = (editorData?.pages?.length ?? 0) > 0;
    const pagePlain = currentPageData?.content ?? '';

    if (!container || !domTextIndex || !canonicalContentForHighlights) {
      setHighlightExpectedCount(reportFindings.length);
      setHighlightLocatableCount(0);
      setHighlightRenderedCount(0);
      return;
    }

    lastHighlightGuardLogFindingsRef.current = null;

    if (inPageMode && currentPageData?.contentHtml) {
      const domRaw = domTextIndex.segments.map((s) => s.text).join('');
      const pagesSorted = [...(editorData.pages ?? [])].sort((a, b) => a.pageNumber - b.pageNumber);
      const pageIdxSorted = pagesSorted.findIndex((p) => p.pageNumber === safeCurrentPage);
      const sliceStartRaw =
        pageIdxSorted >= 0 ? globalStartOfViewerPage(pagesSorted, pageIdxSorted) : (currentPageData.startOffsetGlobal ?? 0);
      const pageSliceOpts = {
        pageSlice: true as const,
        sliceGlobalStart: sliceStartRaw,
      };
      const canonical = editorData?.content?.trim() ? editorData.content : '';
      let onPage: AnalysisFinding[];
      let resolved: AnalysisFinding[];

      if (scriptHashMismatch) {
        /** Offsets/page slices are unreliable — try every finding against this page's text only. */
        onPage = reportFindings;
        setHighlightExpectedCount(reportFindings.length);
        resolved = reportFindings
          .map((f) => {
            const span =
              locateSpanByEvidenceSearch(pagePlain, f, pageSliceOpts) ??
              locateSpanByEvidenceSearch(domRaw, f, pageSliceOpts);
            if (span) return { ...f, startOffsetGlobal: span.start, endOffsetGlobal: span.end };
            const loc =
              locateFindingInContent(pagePlain, f, pageSliceOpts) ??
              locateFindingInContent(domRaw, f, pageSliceOpts);
            if (!loc) return null;
            const t = tightenHighlightRangeToEvidence(pagePlain, loc.start, loc.end, f.evidenceSnippet ?? '');
            return { ...f, startOffsetGlobal: t.start, endOffsetGlobal: t.end };
          })
          .filter(Boolean) as AnalysisFinding[];
      } else {
        onPage = reportFindings.filter((f) => {
          const vpn = viewerPageNumberFromStartOffset(pagesSorted, f.startOffsetGlobal);
          if (vpn != null) return vpn === safeCurrentPage;
          if (f.pageNumber != null && f.pageNumber === safeCurrentPage) return true;
          return (
            !!locateSpanByEvidenceSearch(pagePlain, f, pageSliceOpts) ||
            !!locateSpanByEvidenceSearch(domRaw, f, pageSliceOpts)
          );
        });
        setHighlightExpectedCount(onPage.length);
        resolved = onPage
          .map((f) => {
            const vpnF = viewerPageNumberFromStartOffset(pagesSorted, f.startOffsetGlobal);
            const sp = f.startOffsetPage ?? null;
            const ep = f.endOffsetPage ?? null;
            if (
              vpnF === safeCurrentPage &&
              sp != null &&
              ep != null &&
              ep > sp &&
              sp >= 0 &&
              ep <= pagePlain.length + 2
            ) {
              const t = tightenHighlightRangeToEvidence(pagePlain, sp, Math.min(ep, pagePlain.length), f.evidenceSnippet ?? '');
              return { ...f, startOffsetGlobal: t.start, endOffsetGlobal: t.end };
            }
            const span =
              (canonical.length > 0 && pagePlain.length > 0 && pagesSorted.length > 0
                ? locateHighlightOnCurrentPage(
                    canonical,
                    pagePlain,
                    pagesSorted,
                    safeCurrentPage,
                    f,
                    pageSliceOpts
                  )
                : null) ??
              locateSpanByEvidenceSearch(pagePlain, f, pageSliceOpts) ??
              locateSpanByEvidenceSearch(domRaw, f, pageSliceOpts);
            if (span) return { ...f, startOffsetGlobal: span.start, endOffsetGlobal: span.end };
            const loc =
              locateFindingInContent(domRaw, f, pageSliceOpts) ??
              locateFindingInContent(pagePlain, f, pageSliceOpts);
            if (!loc) return null;
            const t = tightenHighlightRangeToEvidence(pagePlain, loc.start, loc.end, f.evidenceSnippet ?? '');
            return { ...f, startOffsetGlobal: t.start, endOffsetGlobal: t.end };
          })
          .filter(Boolean) as AnalysisFinding[];
      }
      setHighlightLocatableCount(resolved.length);
      if (IS_DEV) {
        console.log(
          `[ScriptWorkspace] Page ${safeCurrentPage} highlights: ${resolved.length}/${onPage.length} locatable`
        );
      }
      const applied = applyHighlightMarks(container, domTextIndex, resolved, {
        pageSlice: true,
        sliceGlobalStart: 0,
      });
      setHighlightRenderedCount(applied);
      return;
    }

    if (inPageMode && !currentPageData?.contentHtml) {
      const n = findingsOnPageWithLocalOffsets.length;
      setHighlightExpectedCount(n);
      setHighlightLocatableCount(n);
      setHighlightRenderedCount(0);
      return;
    }

    if (!inPageMode && !editorData?.contentHtml) {
      setHighlightExpectedCount(reportFindings.length);
      setHighlightLocatableCount(0);
      setHighlightRenderedCount(0);
      return;
    }

    const domRaw = domTextIndex.segments.map((s) => s.text).join('');
    setHighlightExpectedCount(reportFindings.length);
    const validFindings = reportFindings
      .map((f) => {
        const span = locateSpanByEvidenceSearch(domRaw, f);
        if (span) return { ...f, startOffsetGlobal: span.start, endOffsetGlobal: span.end };
        const loc = locateFindingInContent(domRaw, f);
        if (!loc) return null;
        const t = tightenHighlightRangeToEvidence(domRaw, loc.start, loc.end, f.evidenceSnippet ?? '');
        return { ...f, startOffsetGlobal: t.start, endOffsetGlobal: t.end };
      })
      .filter(Boolean) as AnalysisFinding[];
    setHighlightLocatableCount(validFindings.length);
    if (IS_DEV) {
      console.log(`[ScriptWorkspace] Full-doc highlights: ${validFindings.length}/${reportFindings.length}`);
    }
    const applied = applyHighlightMarks(container, domTextIndex, validFindings);
    setHighlightRenderedCount(applied);
  }, [
    domTextIndex,
    canonicalContentForHighlights,
    reportFindings,
    blockHighlightsCompletely,
    scriptHashMismatch,
    editorData?.content,
    editorData?.contentHtml,
    editorData?.pages,
    currentPageData?.contentHtml,
    currentPageData?.content,
    currentPageData?.startOffsetGlobal,
    safeCurrentPage,
    locateFindingInContent,
    highlightRetryTick,
    applyHighlightMarks,
    findingsOnPageWithLocalOffsets.length,
    workspaceViewMode,
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
    setSelectedFindingId(f.id);
    const pagesForVpn = (editorData?.pages ?? []).map((p) => ({
      pageNumber: p.pageNumber,
      content: p.content ?? '',
    }));
    const vpn =
      pagesForVpn.length > 0
        ? viewerPageNumberFromStartOffset([...pagesForVpn].sort((a, b) => a.pageNumber - b.pageNumber), f.startOffsetGlobal)
        : null;
    const targetPage = vpn ?? f.pageNumber ?? null;
    if (isPageMode && targetPage != null && targetPage >= 1 && targetPage <= totalPages) {
      setCurrentPage(targetPage);
    }
    if (targetPage != null && targetPage >= 1) {
      setSearchParams(
        (prev) => {
          const n = new URLSearchParams(prev);
          n.set('page', String(targetPage));
          return n;
        },
        { replace: true }
      );
    } else if (
      isPageMode &&
      f.startOffsetGlobal != null &&
      f.endOffsetGlobal != null &&
      (editorData?.pages?.length ?? 0) > 0
    ) {
      const pages = editorData!.pages!;
      const start = f.startOffsetGlobal;
      for (let i = 0; i < pages.length; i++) {
        const ps = pages[i].startOffsetGlobal ?? 0;
        const pe = ps + (pages[i].content?.length ?? 0);
        if (start >= ps && start < pe) {
          setCurrentPage(i + 1);
          setSearchParams(
            (prev) => {
              const n = new URLSearchParams(prev);
              n.set('page', String(i + 1));
              return n;
            },
            { replace: true }
          );
          break;
        }
      }
    }
  };

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
              disabled={isUploading}
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
          <div className="relative hidden sm:block">
            <Button
              variant="outline"
              size="sm"
              className="flex gap-2"
              onClick={isAnalysisRunning ? () => setAnalysisModalOpen(true) : handleStartAnalysis}
              disabled={!hasVersionForAnalysis || isAnalyzing}
              title={!hasVersionForAnalysis ? (lang === 'ar' ? 'ارفع ملف نص أولاً' : 'Upload a script file first') : isAnalysisRunning ? (lang === 'ar' ? 'عرض التقدم' : 'View progress') : (lang === 'ar' ? 'تشغيل التحليل الذكي' : 'Queue analysis')}
            >
              {isAnalysisRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />}
              {isAnalyzing ? (lang === 'ar' ? 'جاري الطابور…' : 'Queuing…') : isAnalysisRunning ? `${analysisJob?.progressPercent ?? 0}%` : (lang === 'ar' ? 'تحليل ذكي' : 'Start Smart Analysis')}
          </Button>
            {isAnalysisRunning && (
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-warning rounded-full animate-pulse border-2 border-surface" />
            )}
          </div>
          <Button 
            size="sm" 
            className="flex gap-2"
            onClick={() => navigate(analysisJobId ? `/report/${analysisJobId}?by=job${reportQuickQuery}` : `/report/${script.id}?by=script${reportQuickQuery}`)}
          >
            <FileText className="w-4 h-4" />
            {lang === 'ar' ? 'توليد التقرير' : 'Generate Report'}
          </Button>
        </div>
      </div>

      <div className="flex-1 flex min-h-0 relative">

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
                  <div className="mb-3 flex flex-wrap items-center gap-3 py-2 px-4 bg-surface border border-border rounded-xl">
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
                  </div>
                )}
                {isPageMode && currentPageData ? (
                  <div className="workspace-a4-stage flex justify-center py-6 px-2 overflow-x-auto">
                    {workspaceViewMode === 'pdf' && editorData?.sourcePdfSignedUrl ? (
                      <div className="w-full max-w-4xl">
                        <p className="text-[11px] text-text-muted mb-2 text-center" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
                          {lang === 'ar'
                            ? 'عرض بصري يطابق الملف الأصلي. التمييز والتحليل يعملان على النص المستخرج.'
                            : 'Visual match to source file. Highlights and analysis use extracted text.'}
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
                          ref={editorRef}
                          className={cn(
                            'script-import-body text-text-main outline-none focus-visible:ring-2 focus-visible:ring-primary/20 break-words text-right select-text',
                            currentPageData.contentHtml ? '[&_p]:mb-2 [&_*]:max-w-full [&_mark]:rounded-sm' : 'whitespace-pre-wrap'
                          )}
                          style={{ fontFamily: "'Cairo', sans-serif" }}
                          dir="rtl"
                          lang={lang === 'ar' ? 'ar' : undefined}
                          onMouseDown={handleMouseDown}
                          onContextMenu={handleContextMenu}
                          onMouseUp={handleMouseUp}
                          onTouchEnd={() => handleMouseUp()}
                          onClick={(e) => {
                            if (!currentPageData.contentHtml) return;
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
                          {currentPageData.contentHtml ? null : pageFindingSegments ? (
                            pageFindingSegments.map((seg) => {
                              const key = `page-seg-${seg.start}-${seg.end}-${seg.finding?.id ?? 'none'}`;
                              const text = (currentPageData.content ?? '').slice(seg.start, seg.end);
                              return (
                                <span key={key}>
                                  {seg.finding ? (
                                    <span
                                      data-finding-id={seg.finding.id}
                                      className={cn(
                                        'cursor-pointer border-b-2 transition-colors',
                                        seg.finding.reviewStatus === 'approved'
                                          ? 'bg-success/20 border-success/50 hover:bg-success/30'
                                          : 'bg-error/20 border-error/50 hover:bg-error/30'
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
                ) : editorData?.contentHtml ? (
                  <div className="workspace-a4-stage workspace-a4-stage--fluid">
                    <div className="workspace-a4-sheet workspace-a4-sheet--scroll">
                  <div
                    key="editor-with-html"
              ref={editorRef}
                    className="script-import-body min-h-[480px] text-text-main break-words text-right select-text [&_p]:mb-2 [&_*]:max-w-full [&_mark]:rounded-sm"
                    style={{ fontFamily: "'Cairo', sans-serif" }}
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
                        const finding = reportFindings.find((f) => f.id === id);
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
                    style={{ fontFamily: "'Cairo', sans-serif" }}
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
                      {lang === 'ar' ? 'مادة' : 'Art'} {formatAtomDisplay(tooltipFinding.articleId, tooltipFinding.atomId)} · {tooltipFinding.severity}
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

          {/* Decision Bar - only show when permission state is loaded for this script (avoids flicker) */}
          {script && (
            <div className="border-b border-border">
              <DecisionBar
                scriptId={script.id}
                scriptTitle={script.title}
                currentStatus={script.status || 'draft'}
                relatedReportId={selectedReportForHighlights?.id}
                compact
                capabilities={showDecisionBar && decisionCan != null
                  ? { canApprove: decisionCan.canApprove, canReject: decisionCan.canReject, reasonIfDisabled: decisionCan.reason ?? null }
                  : (user ? getScriptDecisionCapabilities(script, user, hasPermission) : null)}
                onDecisionMade={(newStatus) => {
                  updateScript(script.id, { status: newStatus });
                  if (scriptFetched && scriptFetched.id === script.id) setScriptFetched((s) => s ? { ...s, status: newStatus } : null);
                  // Avoid full-store refetch here: it toggles global loading and briefly clears
                  // workspace content. Dashboard can refresh via lightweight invalidation event.
                  window.dispatchEvent(new CustomEvent('dashboard-invalidate'));
                }}
              />
            </div>
          )}

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
                (Number.isFinite(scriptFindings.length) ? scriptFindings.length : 0) +
                (Number.isFinite(reportFindings.length) ? reportFindings.length : 0)
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
          
          {/* ── Findings tab ── */}
          {sidebarTab === 'findings' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-background/30">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-border/50">
                <span className="text-xs font-medium text-text-muted">
                  {selectedReportForHighlights
                    ? (lang === 'ar' ? 'تمييز التقرير نشط' : 'Report highlights active')
                    : (lang === 'ar' ? 'لا يوجد تمييز نشط' : 'No active highlights')}
                </span>
                {selectedReportForHighlights && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-[10px] px-2 text-error hover:text-error hover:bg-error/10"
                    onClick={() => {
                      setSelectedReportForHighlights(null);
                      setReportFindings([]);
                      setSelectedFindingId(null);
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
                        label: `${formatDate(new Date(r.createdAt), { lang, format: dateFormat })} - ${r.findingsCount} findings`,
                        value: r.id
                      }))
                    ]}
                  />
                </div>
              )}

              {IS_DEV && (
                <Button
                  size="sm"
                  variant="outline"
                  className="text-[11px] mb-2 w-full"
                  onClick={() => {
                    const marks = editorRef.current?.querySelectorAll('[data-finding-id]')?.length ?? 0;
                    console.log('[Highlights] DOM marks count:', marks);
                  }}
                >
                  Count highlights ({editorRef.current?.querySelectorAll('[data-finding-id]')?.length ?? 0})
                </Button>
              )}
              {reportFindings.length > 0 && (
                <div className="space-y-2 mb-4">
                  {!blockHighlightsCompletely && highlightRenderedCount < highlightExpectedCount && (
                    <div className="rounded-md border border-warning/40 bg-warning/10 p-2.5 text-[11px] text-text-main">
                      <p>
                        {lang === 'ar'
                          ? `تنبيه تمييز: تم عرض ${highlightRenderedCount} من أصل ${highlightExpectedCount} ملاحظة في النص (${highlightLocatableCount} قابلة للتحديد).`
                          : `Highlight check: ${highlightRenderedCount}/${highlightExpectedCount} findings are currently marked in text (${highlightLocatableCount} locatable).`}
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
                  {reportFindings.map((f) => (
                    <div
                      key={f.id}
                      ref={(el) => { findingCardRefs.current[f.id] = el; }}
                      className={cn(
                        'bg-surface border rounded-xl p-3 shadow-sm cursor-pointer transition-all hover:border-primary/50',
                        selectedFindingId === f.id ? 'ring-2 ring-primary border-primary' : 'border-border',
                        f.reviewStatus === 'approved' ? 'border-success/30' : 'border-error/30'
                      )}
                      onClick={() => handleFindingCardClick(f)}
                    >
                      <div className="flex items-center justify-between mb-1 flex-wrap gap-1">
                        <span className="text-[10px] font-mono text-text-muted">
                          Art {formatAtomDisplay(f.articleId, f.atomId)}
                          {(() => {
                            const dp = displayPageForFinding(
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
                        <div className="flex items-center gap-1">
                          {f.source === 'manual' ? (
                            <Badge variant="outline" className="text-[10px]">{lang === 'ar' ? 'يدوي' : 'Manual'}</Badge>
                          ) : (f.source === 'ai' || f.source === 'lexicon_mandatory') ? (
                            <Badge variant="warning" className="text-[10px]">{f.source === 'lexicon_mandatory' ? (lang === 'ar' ? 'قاموس' : 'Lexicon') : 'AI'}</Badge>
                          ) : null}
                          <Badge variant={f.reviewStatus === 'approved' ? 'success' : 'error'} className="text-[10px]">{f.severity}</Badge>
                        </div>
                      </div>
                      <p className="text-sm text-text-main line-clamp-2 mb-1" dir="rtl">{f.descriptionAr}</p>
                      {f.evidenceSnippet && (
                        <p className="text-xs text-text-muted italic line-clamp-2 bg-surface-hover/50 p-1.5 rounded" dir="rtl">
                          "{f.evidenceSnippet}"
                        </p>
                      )}
                      {f.source !== 'manual' && (
                        <div className="flex flex-wrap gap-1.5 mt-2" onClick={(e) => e.stopPropagation()}>
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
                    </div>
                  ))}
                </div>
              )}
              {scriptFindings.length > 0 && (
                <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                  {lang === 'ar' ? 'ملاحظات يدوية' : 'Manual findings'}
                </h3>
              )}
            {scriptFindings.map(f => (
              <div 
                key={f.id} 
                className={cn(
                  "bg-surface border rounded-xl p-4 shadow-sm transition-all cursor-pointer group hover:border-primary/50",
                    (f.source === 'ai' || f.source === 'lexicon_mandatory') ? 'border-warning/30' : 'border-error/30'
                )}
              >
                <div className="flex items-center justify-between mb-2">
                    <Badge variant={(f.source === 'ai' || f.source === 'lexicon_mandatory') ? 'warning' : 'error'} className="text-[10px]">
                      {f.source === 'manual' ? (lang === 'ar' ? 'يدوي' : 'Manual') : f.source === 'lexicon_mandatory' ? (lang === 'ar' ? 'قاموس' : 'Lexicon') : 'AI Agent'}
                  </Badge>
                  <span className={cn(
                    "text-xs font-semibold px-2 py-0.5 rounded-md",
                    f.severity === 'Critical' ? 'bg-error/10 text-error' : 
                    f.severity === 'High' ? 'bg-warning/20 text-warning-700' : 'bg-background text-text-muted'
                  )}>
                    {f.severity}
                  </span>
                </div>
                <p className="text-sm font-medium text-text-main leading-snug mb-2 line-clamp-3 bg-background/50 p-2 rounded-md border border-border/50" dir="rtl">
                  "{f.excerpt}"
                </p>
                <div className="flex items-center justify-between mt-3 text-xs text-text-muted">
                  <span className="font-medium">{f.articleId}</span>
                    {f.status === 'open' && (f.source === 'ai' || f.source === 'lexicon_mandatory') && (
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
              {scriptFindings.length === 0 && reportFindings.length === 0 && (
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
                  const sc = r.severityCounts ?? { low: 0, medium: 0, high: 0, critical: 0 };
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
                        <span className="text-[10px] text-text-muted font-mono">{formatDate(new Date(r.createdAt), { lang, format: dateFormat })}</span>
                        <Badge variant={reviewColor as any} className="text-[10px]">{reviewLabel}</Badge>
                      </div>
                      {/* created_by (audit) */}
                      <div className="text-[10px] text-text-muted">
                        {lang === 'ar' ? 'بواسطة: ' : 'By: '}{createdByLabel}
                      </div>
                      {/* Counts */}
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-semibold text-text-main">{total} {lang === 'ar' ? 'ملاحظة' : 'findings'}</span>
                        <span className="text-text-muted">—</span>
                        {sc.critical > 0 && <span className="text-error font-bold">{sc.critical}C</span>}
                        {sc.high > 0 && <span className="text-error">{sc.high}H</span>}
                        {sc.medium > 0 && <span className="text-warning">{sc.medium}M</span>}
                        {sc.low > 0 && <span className="text-info">{sc.low}L</span>}
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
                          <Button size="sm" variant="ghost" className="h-7 text-[11px] px-2 text-success hover:text-success" onClick={() => handleReview(r.id, 'approved')}>
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
                            {lang === 'ar' ? 'إعادة' : 'Reset'}
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
            {lang === 'ar' ? 'إضافة إلى الملاحظات' : 'Add to findings'}
          </button>
          <button
            className="w-full text-start px-4 py-2 text-sm text-text-muted hover:bg-background hover:text-text-main flex items-center gap-2 transition-colors"
            onClick={(e) => { e.stopPropagation(); handleMarkViolation(); }}
          >
            <FileText className="w-4 h-4" />
            {lang === 'ar' ? 'إضافة ملاحظة' : 'Add Note'}
          </button>
        </div>
      )}

      {/* Add Manual Finding / Add to findings Modal */}
      <Modal isOpen={isViolationModalOpen} onClose={() => setIsViolationModalOpen(false)} title={lang === 'ar' ? 'إضافة إلى الملاحظات' : 'Add to findings'}>
        <div className="space-y-4">
          <div className="p-3 bg-error/5 border border-error/20 rounded-md text-sm text-text-main italic font-medium" dir="rtl">
            &quot;{formData.excerpt}&quot;
          </div>

          <Select
            label={lang === 'ar' ? 'التقرير' : 'Report'}
            value={formData.reportId}
            onChange={(e) => setFormData({ ...formData, reportId: e.target.value })}
            options={reportHistory.map((r) => ({
              label: `${formatDate(new Date(r.createdAt), { lang, format: dateFormat })} — ${r.findingsCount ?? 0} findings`,
              value: r.id,
            }))}
          />
          {reportHistory.length === 0 && (
            <p className="text-xs text-text-muted">{lang === 'ar' ? 'قم بتشغيل التحليل أولاً لإنشاء تقرير.' : 'Run analysis first to create a report.'}</p>
          )}
          
          <Select 
            label={lang === 'ar' ? 'المادة (البند)' : 'Article'}
            value={formData.articleId}
            onChange={(e) => setFormData({ ...formData, articleId: e.target.value, atomId: '' })}
            options={ARTICLES_CHECKLIST.map((a) => ({ label: a.label, value: a.id }))}
          />

          <Select
            label={lang === 'ar' ? 'البند الفرعي (اختياري)' : 'Atom (optional)'}
            value={formData.atomId}
            onChange={(e) => setFormData({ ...formData, atomId: e.target.value })}
            options={ARTICLE_ATOMS[formData.articleId] ?? ARTICLE_ATOMS['1']}
          />
          
          <Select 
            label={lang === 'ar' ? 'درجة الخطورة' : 'Severity'}
            value={formData.severity}
            onChange={(e) => setFormData({ ...formData, severity: e.target.value })}
            options={[
              { label: 'Low', value: 'low' },
              { label: 'Medium', value: 'medium' },
              { label: 'High', value: 'high' },
              { label: 'Critical', value: 'critical' },
            ]}
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

      {/* Analysis Progress Modal */}
      <Modal
        isOpen={analysisModalOpen}
        onClose={() => setAnalysisModalOpen(false)}
        title={lang === 'ar' ? 'تقدم التحليل' : 'Analysis Progress'}
        className="max-w-md"
      >
        <div className="space-y-5">
          {/* Status header */}
          <div className="flex items-center gap-3">
            {isSuccessfulJobStatus(analysisJob?.status) ? (
              <CheckCircle2 className="w-8 h-8 text-success flex-shrink-0" />
            ) : (analysisJob?.status ?? '').toLowerCase() === 'failed' ? (
              <XCircle className="w-8 h-8 text-error flex-shrink-0" />
            ) : (
              <Loader2 className="w-8 h-8 text-primary animate-spin flex-shrink-0" />
            )}
            <div>
              <p className="font-semibold text-text-main">
                {isSuccessfulJobStatus(analysisJob?.status)
                  ? (lang === 'ar' ? 'اكتمل التحليل' : 'Analysis Complete')
                  : (analysisJob?.status ?? '').toLowerCase() === 'failed'
                    ? (lang === 'ar' ? 'فشل التحليل' : 'Analysis Failed')
                    : (lang === 'ar' ? 'جاري التحليل…' : 'Analyzing…')}
              </p>
              <p className="text-xs text-text-muted">
                {analysisJob ? `${analysisJob.progressDone} / ${analysisJob.progressTotal}` : '…'}
              </p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-background rounded-full h-3 overflow-hidden border border-border">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-300",
                isSuccessfulJobStatus(analysisJob?.status) ? 'bg-success' :
                  (analysisJob?.status ?? '').toLowerCase() === 'failed' ? 'bg-error' : 'bg-primary'
              )}
              style={{ width: `${Math.min(100, analysisJob?.progressPercent ?? 0)}%` }}
            />
          </div>

          {isAnalysisRunning && (
            <div className="space-y-3 rounded-md border border-border bg-background/40 p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-text-muted">
                  {lang === 'ar' ? 'المرحلة الجارية (من الخادم)' : 'Current backend stage'}
                </p>
                <div className="flex items-center gap-2 text-xs font-medium text-primary">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>
                    {activeChunkNumber != null && totalChunksTracked > 0
                      ? (lang === 'ar'
                        ? `${activeChunkPageLabel ? `${activeChunkPageLabel} · ` : ''}جاري فحص الجزء ${activeChunkNumber} من ${totalChunksTracked}`
                        : `${activeChunkPageLabel ? `${activeChunkPageLabel} · ` : ''}Processing chunk ${activeChunkNumber} of ${totalChunksTracked}`)
                      : (lang === 'ar' ? 'جاري الفحص' : 'Processing')}
                  </span>
                </div>
              </div>
              <div className="text-[11px] text-text-muted">
                {lang === 'ar'
                  ? `الأجزاء المكتملة: ${doneChunks} من ${Math.max(totalChunksTracked, doneChunks)}`
                  : `Completed chunks: ${doneChunks} of ${Math.max(totalChunksTracked, doneChunks)}`}
              </div>
              <p className="text-[11px] text-text-muted">
                {lang === 'ar'
                  ? `الماسحات المتخصصة تعمل بالتوازي لكل جزء: ${analysisPasses.join('، ')}`
                  : `Specialized scanners run in parallel for each chunk: ${analysisPasses.join(', ')}`}
              </p>
            </div>
          )}

          {/* Error message */}
          {analysisJob?.errorMessage && (
            <div className="p-3 bg-error/5 border border-error/20 rounded-md text-sm text-error">
              {analysisJob.errorMessage}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center justify-between pt-2">
            {isSuccessfulJobStatus(analysisJob?.status) && (
              <Button size="sm" onClick={() => { setAnalysisModalOpen(false); const rid = reportIdWhenJobCompleted ?? analysisJobId; navigate(rid ? (reportIdWhenJobCompleted ? `/report/${rid}?by=id${reportQuickQuery}` : `/report/${rid}?by=job${reportQuickQuery}`) : '/reports'); }}>
                <FileText className="w-4 h-4 mr-1" />
                {lang === 'ar' ? 'عرض التقرير' : 'View Report'}
              </Button>
            )}
            {analysisJob?.status === 'failed' && (
              <Button size="sm" variant="outline" onClick={() => { setAnalysisModalOpen(false); handleStartAnalysis(); }}>
                {lang === 'ar' ? 'إعادة المحاولة' : 'Retry'}
              </Button>
            )}
            <div className="flex-1" />
            <Button variant="ghost" size="sm" onClick={() => setAnalysisModalOpen(false)}>
              {lang === 'ar' ? 'إغلاق' : 'Close'}
            </Button>
          </div>

          {/* Debug toggle (dev only) */}
          {IS_DEV && (
            <div className="border-t border-border pt-3">
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
                    <span className="text-text-main">{analysisJob.progressDone}/{analysisJob.progressTotal} ({analysisJob.progressPercent}%)</span>
                    <span className="text-text-muted">created:</span>
                    <span className="text-text-main">{analysisJob.createdAt ? formatTime(new Date(analysisJob.createdAt), { lang }) : '-'}</span>
                    <span className="text-text-muted">started:</span>
                    <span className="text-text-main">{analysisJob.startedAt ? formatTime(new Date(analysisJob.startedAt), { lang }) : '-'}</span>
                    <span className="text-text-muted">completed:</span>
                    <span className="text-text-main">{analysisJob.completedAt ? formatTime(new Date(analysisJob.completedAt), { lang }) : '-'}</span>
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
                          {c.lastError && <span className="text-error truncate" title={c.lastError}>{c.lastError}</span>}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-text-muted text-[10px]">
                      {analysisJob.progressDone}/{analysisJob.progressTotal} done (chunk detail unavailable)
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
