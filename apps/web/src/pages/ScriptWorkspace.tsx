import { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useLangStore } from '@/store/langStore';
import { useDataStore, Finding } from '@/store/dataStore';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { Badge } from '@/components/ui/Badge';
import { ArrowLeft, Bot, ShieldAlert, Check, FileText, Upload, Loader2, CheckCircle2, XCircle, ChevronDown, ChevronUp, Trash2, Download } from 'lucide-react';
import { cn } from '@/utils/cn';
import { getPolicyArticles } from '@/data/policyMap';
import { DecisionBar } from '@/components/DecisionBar';



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
import type { EditorContentResponse, EditorSectionResponse } from '@/api';
import type { AnalysisJob, ChunkStatus, ReportListItem, ReviewStatus } from '@/api/models';
import { extractDocx, extractTextFromPdf } from '@/utils/documentExtract';
import { sanitizeFormattedHtml } from '@/utils/sanitizeHtml';
import {
  buildDomTextIndex,
  rangeFromNormalizedOffsets,
  selectionToNormalizedOffsets,
  unwrapFindingMarks,
  type DomTextIndex,
} from '@/utils/domTextIndex';

import toast from 'react-hot-toast';

/// <reference types="vite/client" />
const IS_DEV = (import.meta as any).env?.DEV ?? false;

export function ScriptWorkspace() {

  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { lang } = useLangStore();
  const { scripts, findings, updateFindingStatus, updateScript, fetchInitialData, isLoading, error: dataError } = useDataStore();
  const { user } = useAuthStore();

  const script = scripts.find(s => s.id === id);
  const scriptFindings = findings.filter(f => f.scriptId === id);

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; text: string; startOffsetGlobal?: number; endOffsetGlobal?: number } | null>(null);
  const [floatingAction, setFloatingAction] = useState<{ x: number; y: number; text: string; startOffsetGlobal?: number; endOffsetGlobal?: number } | null>(null);
  const [isViolationModalOpen, setIsViolationModalOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'extracting' | 'done' | 'failed'>('idle');
  const [extractedText, setExtractedText] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisJobId, setAnalysisJobId] = useState<string | null>(null);
  const [analysisModalOpen, setAnalysisModalOpen] = useState(false);
  const [analysisJob, setAnalysisJob] = useState<AnalysisJob | null>(null);
  const [debugOpen, setDebugOpen] = useState(false);
  const [chunkStatuses, setChunkStatuses] = useState<ChunkStatus[]>([]);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
        if (job.status === 'completed' || job.status === 'failed') {
          stopPolling();
          // Fetch the report id so "View Report" navigates correctly
          if (job.status === 'completed') {

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

  // Load debug chunk statuses when debug panel is open
  useEffect(() => {
    if (!debugOpen || !analysisJobId) return;
    let cancelled = false;
    const fetchChunks = async () => {
      try {
        const chunks = await tasksApi.getJobChunks(analysisJobId);
        if (!cancelled) setChunkStatuses(chunks);
      } catch (_) { /* ignore */ }
    };
    fetchChunks();
    const iv = setInterval(fetchChunks, 3000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [debugOpen, analysisJobId, analysisJob?.progressDone]); // re-fetch when progress changes

  // ── Report history ──
  const [sidebarTab, setSidebarTab] = useState<'findings' | 'reports'>('findings');
  const [reportHistory, setReportHistory] = useState<ReportListItem[]>([]);

  // ── Report findings (for editor highlights) ──
  const [selectedReportForHighlights, setSelectedReportForHighlights] = useState<ReportListItem | null>(null);
  const [selectedJobCanonicalHash, setSelectedJobCanonicalHash] = useState<string | null>(null);
  const [reportFindings, setReportFindings] = useState<AnalysisFinding[]>([]);
  // const [reportFindingsLoading, setReportFindingsLoading] = useState(false);
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null);
  const [tooltipFinding, setTooltipFinding] = useState<AnalysisFinding | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
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
    if (analysisJob?.status === 'completed') loadReportHistory();
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
    if (location.hash && editorRef.current) {
      setTimeout(() => {
        const hashId = location.hash.replace('#', '');
        const el = document.getElementById(hashId);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.classList.add('bg-primary/30', 'animate-pulse');
          setTimeout(() => el.classList.remove('bg-primary/30', 'animate-pulse'), 3000);
        }
      }, 500);
    }
  }, [location.hash, scriptFindings]);

  // Build DOM text index when HTML content changes (for DOCX formatted view)
  useEffect(() => {
    if (!editorData?.contentHtml) {
      if (domTextIndex) setDomTextIndex(null);
      return;
    }

    // Defer to ensure DOM has updated with new innerHTML
    const timer = setTimeout(() => {
      if (editorRef.current) {
        const idx = buildDomTextIndex(editorRef.current);
        setDomTextIndex(idx);
        if (IS_DEV && idx) console.log('[ScriptWorkspace] Built DOM text index, length:', idx.normalizedText.length);
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [editorData?.contentHtml]);

  // Set innerHTML manually ONCE when content changes to prevent dangerouslySetInnerHTML from wiping highlights
  useLayoutEffect(() => {
    if (!editorRef.current || !editorData?.contentHtml) return;
    const newHtml = sanitizeFormattedHtml(editorData.contentHtml);
    // Only update innerHTML if content actually changed
    if (editorRef.current.innerHTML !== newHtml) {
      editorRef.current.innerHTML = newHtml;
      if (IS_DEV) console.log('[ScriptWorkspace] innerHTML updated manually');
    }
  }, [editorData?.contentHtml]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null);
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, []);

  const showLoading = isLoading;
  const showError = !isLoading && !script;

  const handleRetryScript = async () => {
    await fetchInitialData();
  };

  const handleStartAnalysis = async () => {
    if (!script?.currentVersionId) {
      toast.error(lang === 'ar' ? 'ارفع ملف نص أولاً لتفعيل التحليل.' : 'Upload a script file first to run analysis.');
      return;
    }
    console.log('[ScriptWorkspace] Analyze clicked, versionId:', script.currentVersionId);
    setIsAnalyzing(true);
    try {
      const { jobId } = await scriptsApi.createTask(script.currentVersionId);
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



  const isAnalysisRunning = analysisJob != null && analysisJob.status !== 'completed' && analysisJob.status !== 'failed';

  const canImport = user?.role === 'Super Admin' || user?.role === 'Admin' || user?.role === 'Regulator' || script?.assigneeId === user?.id;
  const hasVersionForAnalysis = Boolean(script?.currentVersionId);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !script) return;

    setIsUploading(true);
    setUploadStatus('uploading');

    try {
      setUploadStatus('uploading');
      const { url, path } = await scriptsApi.getUploadUrl(file.name);
      await scriptsApi.uploadToSignedUrl(file, url);

      const storagePath = path ?? url;
      const ext = file.name.toLowerCase().split('.').pop() || '';
      const sourceFileType = file.type || (ext === 'txt' ? 'text/plain' : ext === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');

      const version = await scriptsApi.createVersion(script.id, {
        source_file_name: file.name,
        source_file_type: sourceFileType,
        source_file_size: file.size,
        source_file_path: storagePath,
        source_file_url: storagePath,
      });

      setUploadStatus('extracting');
      let textToShow = '';
      if (ext === 'txt') {
        const fileText = await file.text();
        const res = await scriptsApi.extractText(version.id, fileText, { enqueueAnalysis: false });
        textToShow = (res as { extracted_text?: string })?.extracted_text ?? fileText;
      } else if (ext === 'docx') {
        try {
          console.log('[ScriptWorkspace] Extracting DOCX...');
          const { plain, html } = await extractDocx(file);
          console.log('[ScriptWorkspace] DOCX Extracted:', { plainLength: plain?.length, htmlLength: html?.length });

          if (!plain || !plain.trim()) {
            console.warn('[ScriptWorkspace] No text found in DOCX');
            toast.error(lang === 'ar' ? 'لم يتم العثور على نص في الملف' : 'No text found in document');
            setUploadStatus('failed');
            return;
          }
          console.log('[ScriptWorkspace] Sending to extractText API...');
          const res = await scriptsApi.extractText(version.id, plain, {
            enqueueAnalysis: false,
            contentHtml: html && html.trim() ? html.trim() : null,
          });
          console.log('[ScriptWorkspace] extractText API response:', res);
          textToShow = (res as { extracted_text?: string })?.extracted_text ?? plain;
        } catch (docxErr: any) {
          console.error('[ScriptWorkspace] DOCX Error:', docxErr);
          toast.error(lang === 'ar' ? 'فشل استخراج DOCX' : docxErr?.message ?? 'Failed to extract DOCX');
          throw docxErr;
        }
      } else if (ext === 'pdf') {
        try {
          const extracted = await extractTextFromPdf(file);
          if (!extracted || !extracted.trim()) {
            toast.error(lang === 'ar' ? 'لم يتم العثور على نص (قد يكون الملف ممسوحاً ضوئياً).' : 'No text found (file may be scanned/image-only).');
            setUploadStatus('failed');
            return;
          }
          const res = await scriptsApi.extractText(version.id, extracted, { enqueueAnalysis: false });
          textToShow = (res as { extracted_text?: string })?.extracted_text ?? extracted;
        } catch (pdfErr: any) {
          toast.error(lang === 'ar' ? 'فشل استخراج PDF' : pdfErr?.message ?? 'Failed to extract PDF');
          throw pdfErr;
        }
      } else {
        toast.error(lang === 'ar' ? 'نوع الملف غير مدعوم' : 'Unsupported file type');
        setUploadStatus('failed');
        return;
      }
      setExtractedText(textToShow);
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

  // Inside ScriptWorkspace component:

  // const norm = (t: string) => normalizeText(t); // Use our new robust normalizer

  /** 
   * Locates the finding in the content using exact offsets first, then falling back to text search.
   * Returns the valid finding with potentially corrected offsets range for this render cycle.
   */
  const locateFindingInContent = useCallback((content: string, f: AnalysisFinding | Finding): { start: number; end: number; matched: boolean } | null => {
    if (!content) return null;

    // 1. Try Original Offsets
    // We treat existing offsets as "Primary" if they are valid text-wise.
    const s = f.startOffsetGlobal ?? -1;
    const e = f.endOffsetGlobal ?? -1;

    // Check if offsets are structurally valid
    if (s >= 0 && e > s && e <= content.length) {
      const slice = content.slice(s, e);
      const evidence = f.evidenceSnippet ?? '';
      // Strict check: if the text at offsets essentially matches the evidence
      if (normalizeText(slice) === normalizeText(evidence)) {
        return { start: s, end: e, matched: true };
      }
    }

    // 2. Fallback: Text Search
    // Try both evidenceSnippet and excerpt (if available on the object at runtime)
    const candidates = [
      f.evidenceSnippet,
      (f as any).excerpt // Cast because AnalysisFinding type might not have excerpt even if runtime does
    ].filter(t => t && typeof t === 'string' && t.trim().length > 0) as string[];

    if (candidates.length === 0) return null;

    // Sort candidates by length (longest first) to prefer full sentence over partial fragment
    candidates.sort((a, b) => b.length - a.length);

    for (const textToFind of candidates) {
      const matches = findTextOccurrences(content, textToFind);
      if (matches.length > 0) {
        // Use hint to pick best match
        const best = findBestMatch(matches, f.startOffsetGlobal ?? 0);
        if (best) {
          return { start: best.start, end: best.end, matched: true };
        }
      }
    }

    return null;
  }, []);


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

  // Apply finding highlights in formatted HTML by wrapping DOM ranges (no innerHTML replace).
  // Skip if job was run against different canonical text (hash mismatch) or different version.
  const versionMismatch =
    selectedReportForHighlights?.versionId != null &&
    script?.currentVersionId != null &&
    selectedReportForHighlights.versionId !== script.currentVersionId;
  const canonicalHashMismatch =
    versionMismatch ||
    (selectedJobCanonicalHash != null &&
      editorData?.contentHash != null &&
      selectedJobCanonicalHash !== editorData.contentHash);
  useEffect(() => {
    const container = editorRef.current;
    if (!container || !domTextIndex || !canonicalContentForHighlights) return;
    if (!editorData?.contentHtml) return;

    lastHighlightGuardLogFindingsRef.current = null;
    const canonical = domTextIndex ? domTextIndex.normalizedText : canonicalContentForHighlights;

    // Use LOCATOR to find valid ranges
    const validFindings = reportFindings.map(f => {
      const loc = locateFindingInContent(canonical, f);
      if (!loc && IS_DEV) console.log(`[ScriptWorkspace] Failed to locate finding ${f.id} ("${f.evidenceSnippet?.slice(0, 20)}...") in text of len ${canonical.length}`);
      return loc ? { ...f, startOffsetGlobal: loc.start, endOffsetGlobal: loc.end } : null;
    }).filter((f) => f !== null) as AnalysisFinding[];

    if (IS_DEV) console.log(`[ScriptWorkspace] Valid findings for highlights: ${validFindings.length}/${reportFindings.length}`);

    unwrapFindingMarks(container);

    // Group findings by section (not currently used but maybe useful later, or remove)
    // const grouped = reportFindings...


    const sorted = [...validFindings].sort((a, b) => {
      const sa = a.startOffsetGlobal ?? 0;
      const sb = b.startOffsetGlobal ?? 0;
      if (sa !== sb) return sa - sb;
      return (b.endOffsetGlobal ?? 0) - (a.endOffsetGlobal ?? 0);
    });

    let lastEnd = -1;
    let appliedCount = 0;
    // ... loop to apply ranges
    for (const f of sorted) {
      const start = f.startOffsetGlobal!;
      const end = f.endOffsetGlobal!;
      if (start < lastEnd) continue; // Skip overlaps for DOM highlights?

      lastEnd = Math.max(lastEnd, end);
      const range = rangeFromNormalizedOffsets(domTextIndex, start, end);
      if (!range) continue;

      const el = document.createElement('span');
      el.setAttribute('data-finding-id', f.id);
      el.className = 'ap-highlight cursor-pointer';
      // ... styles
      el.style.backgroundColor = 'rgba(255, 0, 0, 0.20)';
      el.style.outline = '2px solid rgba(255, 0, 0, 0.60)';
      el.style.borderRadius = '4px';

      try {
        const range = rangeFromNormalizedOffsets(domTextIndex, start, end);
        if (!range) {
          if (IS_DEV) console.warn(`[ScriptWorkspace] No range for highlight ${f.id} at ${start}-${end}`);
          continue;
        }

        const el = document.createElement('span');
        el.setAttribute('data-finding-id', f.id);
        el.className = 'ap-highlight cursor-pointer';
        // Make highlights very visible for debugging/verification
        el.style.backgroundColor = f.severity === 'critical' ? 'rgba(255, 0, 0, 0.4)' :
          f.severity === 'high' ? 'rgba(255, 0, 0, 0.3)' :
            'rgba(255, 165, 0, 0.3)'; // Increased opacity
        f.severity === 'high' ? 'rgba(255, 0, 0, 0.3)' :
          'rgba(255, 165, 0, 0.3)'; // Increased opacity
        el.style.borderBottom = f.severity === 'critical' ? '2px solid red' :
          f.severity === 'high' ? '2px solid rgba(255, 0, 0, 0.8)' :
            '2px solid orange';
        el.style.borderRadius = '2px';
        el.style.transition = 'background-color 0.2s';

        // Add hover effect
        el.onmouseenter = () => { el.style.backgroundColor = 'rgba(255, 255, 0, 0.5)'; };
        el.onmouseleave = () => {
          el.style.backgroundColor = f.severity === 'critical' ? 'rgba(255, 0, 0, 0.4)' :
            f.severity === 'high' ? 'rgba(255, 0, 0, 0.3)' :
              'rgba(255, 165, 0, 0.3)';
        };


        try {
          // Instead of surroundContents (fails on cross-element ranges), 
          // manually insert opening and closing tags
          const clonedRange = range.cloneRange();

          // Insert closing span at end
          clonedRange.collapse(false); // Move to end
          const closeTag = document.createElement('span');
          closeTag.style.display = 'none';
          clonedRange.insertNode(closeTag);

          // Insert opening span at start
          range.collapse(true); // Move to start
          range.insertNode(el);

          // Extend el to wrap content until closeTag
          const parentEl = el.parentNode;
          if (parentEl) {
            let node = el.nextSibling;
            while (node && node !== closeTag) {
              const next = node.nextSibling;
              el.appendChild(node);
              node = next;
            }
            if (closeTag && closeTag.parentNode) {
              closeTag.parentNode.removeChild(closeTag);
            }
          }

          appliedCount++;
        } catch (err) {
          if (IS_DEV) console.error(`[ScriptWorkspace] insertNode failed for ${f.id}:`, err);
        }
      } catch (err) {
        if (IS_DEV) console.error(`[ScriptWorkspace] Failed to apply highlight ${f.id}:`, err);
      }
    }
    if (IS_DEV) console.log(`[ScriptWorkspace] Applied ${appliedCount} DOM marks.`);

  }, [domTextIndex, canonicalContentForHighlights, reportFindings, canonicalHashMismatch, editorData?.contentHtml, locateFindingInContent]);

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
    // Scroll to finding in viewer
    setTimeout(() => {
      const el = editorRef.current?.querySelector(`[data-finding-id="${f.id}"]`);
      if (IS_DEV) console.log(`[ScriptWorkspace] Scroll target found?`, !!el);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('finding-flash');
        setTimeout(() => el.classList.remove('finding-flash'), 2000);
      } else if (IS_DEV) {
        console.warn(`[ScriptWorkspace] Target element [data-finding-id="${f.id}"] not found in editor.`);
      }
    }, 100);
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
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={!canImport || isUploading}
            title={!canImport ? (lang === 'ar' ? 'ليس لديك صلاحية' : 'You do not have permission') : ''}
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
            {!canImport && (
              <span className="absolute -top-10 left-1/2 -translate-x-1/2 bg-surface text-xs p-1 rounded border shadow opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                {lang === 'ar' ? 'ليس لديك صلاحية' : 'You do not have permission'}
              </span>
            )}
          </Button>
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
            onClick={() => navigate(analysisJobId ? `/report/${analysisJobId}?by=job` : `/report/${script.id}?by=script`)}
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
                {canonicalHashMismatch && selectedReportForHighlights && reportFindings.length > 0 && (
                  <div className="mb-3 px-4 py-3 rounded-lg bg-warning/15 border border-warning/40 text-sm text-text-main" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
                    {lang === 'ar'
                      ? 'تم تغيير نص السيناريو بعد هذا التحليل. أعد تشغيل التحليل الذكي لتمييز الملاحظات.'
                      : 'Script text changed since this analysis. Re-run Smart Analysis to highlight findings.'}
                  </div>
                )}
                {editorData?.contentHtml ? (
                  <div
                    key="editor-with-html"
                    ref={editorRef}
                    className="bg-surface border border-border rounded-xl shadow-sm p-6 lg:p-8 min-h-[600px] text-lg leading-relaxed text-text-main break-words text-right select-text [&_p]:mb-2 [&_*]:max-w-full [&_mark]:rounded-sm"
                    dir="rtl"
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
                ) : (
                  <div
                    key="editor-fallback"
                    ref={editorRef}
                    className="bg-surface border border-border rounded-xl shadow-sm p-6 lg:p-8 min-h-[600px] text-lg leading-relaxed text-text-main outline-none focus-visible:ring-2 focus-visible:ring-primary/20 break-words whitespace-pre-wrap text-right select-text"
                    dir="rtl"
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

          {/* Decision Bar - for regulators/admins */}
          {script && (
            <div className="border-b border-border">
              <DecisionBar
                scriptId={script.id}
                scriptTitle={script.title}
                currentStatus={script.status || 'draft'}
                relatedReportId={selectedReportForHighlights?.id}
                compact
                onDecisionMade={(newStatus) => {
                  /* Optional: local state update if needed, but page reload in DecisionBar handles it */
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
                        label: `${new Date(r.createdAt).toLocaleDateString()} - ${r.findingsCount} findings`,
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
                        <span className="text-[10px] font-mono text-text-muted">Art {formatAtomDisplay(f.articleId, f.atomId)}</span>
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
                        <span className="text-[10px] text-text-muted font-mono">{new Date(r.createdAt).toLocaleString()}</span>
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
                        <Button size="sm" variant="ghost" className="h-7 text-[11px] px-2" onClick={() => navigate(`/report/${(r as any).jobId ?? r.id}?by=job`)}>
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
              label: `${new Date(r.createdAt).toLocaleDateString()} — ${r.findingsCount ?? 0} findings`,
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
            {analysisJob?.status === 'completed' ? (
              <CheckCircle2 className="w-8 h-8 text-success flex-shrink-0" />
            ) : analysisJob?.status === 'failed' ? (
              <XCircle className="w-8 h-8 text-error flex-shrink-0" />
            ) : (
              <Loader2 className="w-8 h-8 text-primary animate-spin flex-shrink-0" />
            )}
            <div>
              <p className="font-semibold text-text-main">
                {analysisJob?.status === 'completed'
                  ? (lang === 'ar' ? 'اكتمل التحليل' : 'Analysis Complete')
                  : analysisJob?.status === 'failed'
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
                analysisJob?.status === 'completed' ? 'bg-success' :
                  analysisJob?.status === 'failed' ? 'bg-error' : 'bg-primary'
              )}
              style={{ width: `${Math.min(100, analysisJob?.progressPercent ?? 0)}%` }}
            />
          </div>

          {/* Error message */}
          {analysisJob?.errorMessage && (
            <div className="p-3 bg-error/5 border border-error/20 rounded-md text-sm text-error">
              {analysisJob.errorMessage}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center justify-between pt-2">
            {analysisJob?.status === 'completed' && (
              <Button size="sm" onClick={() => { setAnalysisModalOpen(false); navigate(`/report/${analysisJobId}?by=job`); }}>
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
                    <span className="text-text-main">{analysisJob.createdAt ? new Date(analysisJob.createdAt).toLocaleTimeString() : '-'}</span>
                    <span className="text-text-muted">started:</span>
                    <span className="text-text-main">{analysisJob.startedAt ? new Date(analysisJob.startedAt).toLocaleTimeString() : '-'}</span>
                    <span className="text-text-muted">completed:</span>
                    <span className="text-text-main">{analysisJob.completedAt ? new Date(analysisJob.completedAt).toLocaleTimeString() : '-'}</span>
                  </div>
                  <div className="text-text-muted pt-1 border-t border-border/50">Chunks:</div>
                  {chunkStatuses.length > 0 ? (
                    <div className="space-y-0.5">
                      {chunkStatuses.map(c => (
                        <div key={c.chunkIndex} className="flex items-center gap-2">
                          <span className="w-6 text-right text-text-muted">{c.chunkIndex}</span>
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
