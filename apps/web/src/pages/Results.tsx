import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';

import { useLangStore } from '@/store/langStore';
import { useAuthStore } from '@/store/authStore';
import { useSettingsStore } from '@/store/settingsStore';
import { formatDate, formatDateLong, formatDateTime } from '@/utils/dateFormat';
import { type AnalysisReport } from '@/services/reportService';
import { reportsApi, findingsApi, scriptsApi, type AnalysisFinding, type AnalysisReviewFinding } from '@/api';
import type { ReviewStatus, Script } from '@/api/models';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { Switch } from '@/components/ui/Switch';
import { Textarea } from '@/components/ui/Textarea';
import { cn } from '@/utils/cn';
import { escapeHtmlSafe } from '@/utils/escapeHtml';
import toast from 'react-hot-toast';
import { downloadAnalysisPdf } from '@/components/reports/analysis/download';
import { downloadAnalysisWord } from '@/components/reports/analysis/downloadWord';
import { downloadQuickAnalysisPdf } from '@/components/reports/quick-analysis/download';
import { resolveStorageUrl } from '@/utils/storage';
import {
  ArrowLeft, CheckCircle, ShieldAlert,
  AlertTriangle, XCircle, ChevronDown, ChevronUp, Loader2,
  CheckCircle2, Shield, FileDown, Info, Search,
} from 'lucide-react';

import {
  getActionablePolicyArticles,
  getPolicyArticles,
  normalizeAtomId,
  atomIdNumeric,
} from '@/data/policyMap';
import {
  getPrimarySemanticCategory,
  getSemanticCategoriesForChecklist,
  type SemanticCategoryId,
} from '@/data/semanticCategories';
import { displayPageForFinding } from '@/utils/viewerPageFromOffset';
import { formatResolvedSceneLabel, resolveSceneLabelFromOffset } from '@/utils/sceneLabelFromOffset';

const policyArticles = getPolicyArticles().map((a) => ({
  id: a.articleId,
  titleAr: a.title_ar,
  titleEn: `Article ${a.articleId}`,
}));

const policyArticlesForForm = getActionablePolicyArticles();
const DEFAULT_ACTIONABLE_ARTICLE_ID = policyArticlesForForm[0]?.articleId ?? 4;
const RESULTS_ARTICLES_CHECKLIST = policyArticlesForForm.map((a) => ({
  id: String(a.articleId),
  label: `Art ${a.articleId} - ${a.title_ar}`,
  value: String(a.articleId),
}));

const RESULTS_ARTICLE_ATOMS: Record<string, { value: string; label: string }[]> = {};
for (const art of policyArticlesForForm) {
  const id = String(art.articleId);
  RESULTS_ARTICLE_ATOMS[id] = [
    { value: '', label: '—' },
    ...(art.atoms ?? []).map((atom) => ({ value: atom.atomId, label: `${atom.atomId} ${atom.title_ar}` })),
  ];
}

function getResultsArticleAtomOptions(articleId: string): { value: string; label: string }[] {
  const fallbackKey = String(DEFAULT_ACTIONABLE_ARTICLE_ID);
  return RESULTS_ARTICLE_ATOMS[articleId] ?? RESULTS_ARTICLE_ATOMS[fallbackKey] ?? [{ value: '', label: '—' }];
}

function sanitizeResultsAtomSelection(articleId: string, atomId: string | null | undefined): string | null {
  const raw = atomId?.trim() ?? '';
  if (!raw) return null;
  return getResultsArticleAtomOptions(articleId).some((option) => option.value === raw) ? raw : null;
}

function formatAtomDisplayR(articleId: number, atomId: string | null): string {
  if (!atomId?.trim()) return String(articleId);
  const a = atomId.trim();
  if (/^\d+-\d+$/.test(a)) return a;
  return a.includes('.') ? a : `${articleId}.${a}`;
}

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
  "دون أي إيحاء",
  "لا إيحاءات جنسية",
  "لا يتضمن أي إيحاء",
  "سياق درامي فقط",
  "جزء من السياق الدرامي",
  "في إطار درامي",
  "ليس تحريضاً",
  "لا يروج للعنف",
  "لا يروّج للعنف",
  "يخدم السياق الدرامي",
  "يخدم السرد",
  "قد لا يعد مخالفة",
  "قد لا يعتبر مخالفة",
];

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

type CanonicalSummaryFinding = {
  canonical_finding_id: string;
  title_ar: string;
  evidence_snippet: string;
  severity: string;
  confidence: number;
  final_ruling?: string | null;
  rationale?: string | null;
  pillar_id?: string | null;
  primary_article_id?: number | null;
  primary_policy_atom_id?: string | null;
  related_article_ids?: number[];
  policy_links?: Array<{ article_id: number; atom_concept_id?: string | null; role?: string | null }>;
  start_line_chunk?: number | null;
  end_line_chunk?: number | null;
  /** lexicon_mandatory only for true DB glossary rows; omit/ai otherwise */
  source?: 'ai' | 'lexicon_mandatory' | 'manual';
};

type FindingKindFilter = 'all' | 'ai' | 'manual' | 'glossary' | 'special' | 'approved';

function findingKindFromSource(source: string | null | undefined): Exclude<FindingKindFilter, 'all' | 'special'> {
  if (source === 'manual') return 'manual';
  if (source === 'lexicon_mandatory') return 'glossary';
  return 'ai';
}

function countFindingKinds<T extends { source?: string | null }>(list: T[]) {
  const counts = { ai: 0, manual: 0, glossary: 0 };
  for (const finding of list) {
    counts[findingKindFromSource(finding.source)]++;
  }
  return counts;
}

function findingSourcePriority(source: string | null | undefined): number {
  return findingKindFromSource(source) === 'manual'
    ? 3
    : findingKindFromSource(source) === 'glossary'
      ? 2
      : 1;
}

function findingKindFromReviewSource(sourceKind: AnalysisReviewFinding['sourceKind'] | null | undefined): Exclude<FindingKindFilter, 'all' | 'special'> {
  if (sourceKind === 'manual') return 'manual';
  if (sourceKind === 'glossary') return 'glossary';
  return 'ai';
}

function compactWhitespace(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function countReviewFindingKinds(list: AnalysisReviewFinding[]) {
  const counts = { ai: 0, manual: 0, glossary: 0 };
  for (const finding of list) {
    counts[findingKindFromReviewSource(finding.sourceKind)]++;
  }
  return counts;
}

/** One card per logical violation (same canonical_finding_id → strongest severity/confidence). */
function dedupeRealFindings(list: AnalysisFinding[]): AnalysisFinding[] {
  const byCanonical = new Map<string, AnalysisFinding>();
  for (const f of list) {
    const v3 = ((f.location as Record<string, unknown> | undefined)?.v3 as Record<string, unknown> | undefined) ?? {};
    const canonicalId =
      (v3.canonical_finding_id as string | undefined) ?? f.id ?? `${f.articleId}-${f.evidenceSnippet?.slice(0, 80) ?? ''}`;
    const primaryArticleId = Number(v3.primary_article_id);
    const normalized: AnalysisFinding = {
      ...f,
      articleId: Number.isFinite(primaryArticleId) ? primaryArticleId : f.articleId,
    };
    const existing = byCanonical.get(canonicalId);
    if (!existing) {
      byCanonical.set(canonicalId, normalized);
    } else {
      const currentRank = findingSourcePriority(existing.source);
      const nextRank = findingSourcePriority(normalized.source);
      if (nextRank > currentRank || (nextRank === currentRank && (normalized.confidence ?? 0) > (existing.confidence ?? 0))) {
        byCanonical.set(canonicalId, normalized);
      }
    }
  }
  return [...byCanonical.values()];
}

export function Results() {
  const { id: paramId } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { lang, t } = useLangStore();
  const { user } = useAuthStore();
  const { settings } = useSettingsStore();
  const dateFormat = settings?.platform?.dateFormat;
  const isAr = lang === 'ar';
  const quickFromQuery = searchParams.get('quick') === '1';
  
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [findings, setFindings] = useState<AnalysisFinding[]>([]);
  const [reviewFindings, setReviewFindings] = useState<AnalysisReviewFinding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedArticles, setExpandedArticles] = useState<Record<string, boolean>>({});
  const [reviewing, setReviewing] = useState(false);
  const [updateScriptStatus, setUpdateScriptStatus] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [isDownloadingWord, setIsDownloadingWord] = useState(false);
  const [isQuickAnalysisReport, setIsQuickAnalysisReport] = useState(quickFromQuery);
  const [reportScriptMeta, setReportScriptMeta] = useState<Script | null>(null);
  const [groupFindingsByAtom, setGroupFindingsByAtom] = useState(false);
  /** false = deduped list (default); true = every DB row (duplicates visible). */
  const [showAllFindingRows, setShowAllFindingRows] = useState(false);
  const [findingFilter, setFindingFilter] = useState<FindingKindFilter>('all');
  /** script_pages slices for viewer-accurate page labels (same model as workspace). */
  const [reportViewerPages, setReportViewerPages] = useState<Array<{ pageNumber: number; content: string }> | null>(null);

  // Finding review modal
  const [reviewModal, setReviewModal] = useState<{ findingId: string; toStatus: 'approved' | 'violation'; titleAr: string } | null>(null);
  const [reviewReason, setReviewReason] = useState('');
  const [bulkReviewModal, setBulkReviewModal] = useState<{ findingIds: string[]; toStatus: 'approved' | 'violation' } | null>(null);
  const [bulkReviewReason, setBulkReviewReason] = useState('');
  const [bulkReviewSaving, setBulkReviewSaving] = useState(false);
  const [reportReviewModalOpen, setReportReviewModalOpen] = useState(false);
  const [reportReviewReason, setReportReviewReason] = useState('');
  const [selectedFindingIds, setSelectedFindingIds] = useState<string[]>([]);
  const [editFindingModal, setEditFindingModal] = useState<AnalysisFinding | null>(null);
  const [editFindingSaving, setEditFindingSaving] = useState(false);
  const [editFindingValidatingSnippet, setEditFindingValidatingSnippet] = useState(false);
  const [editFindingSnippetValidation, setEditFindingSnippetValidation] = useState<string | null>(null);
  const [reportVisibilitySavingId, setReportVisibilitySavingId] = useState<string | null>(null);
  const [editFindingForm, setEditFindingForm] = useState({
    articleId: String(DEFAULT_ACTIONABLE_ARTICLE_ID),
    atomId: '',
    severity: 'medium',
    evidenceSnippet: '',
    rationaleAr: '',
    manualComment: '',
  });

  useEffect(() => {
    if (!editFindingModal) return;
    setEditFindingForm({
      articleId: String(editFindingModal.articleId || DEFAULT_ACTIONABLE_ARTICLE_ID),
      atomId: editFindingModal.atomId ?? '',
      severity: (editFindingModal.severity || 'medium').toLowerCase(),
      evidenceSnippet: editFindingModal.evidenceSnippet ?? '',
      rationaleAr: editFindingModal.rationaleAr ?? '',
      manualComment: editFindingModal.manualComment ?? '',
    });
    setEditFindingSnippetValidation(null);
  }, [editFindingModal]);

  // Report-level review
  const handleReportReview = async (status: ReviewStatus, explicitReviewNotes?: string) => {
    if (!report?.id) return;
    let reviewNotes = explicitReviewNotes?.trim() ?? '';
    if (status === 'under_review') {
      if (!reviewNotes) {
        toast.error(lang === 'ar' ? 'سبب إعادة المراجعة مطلوب' : 'A re-review reason is required');
        return;
      }
    }
    setReviewing(true);
    try {
      await reportsApi.review(report.id, status, reviewNotes, updateScriptStatus);
      setReport({
        ...report,
        reviewStatus: status,
        reviewNotes: reviewNotes || report.reviewNotes,
        reviewedAt: new Date().toISOString(),
        reviewedBy: user?.id ?? null,
      });
      toast.success(
        status === 'approved' ? (lang === 'ar' ? 'تم قبول التقرير' : 'Report approved') :
          status === 'rejected' ? (lang === 'ar' ? 'تم رفض التقرير' : 'Report rejected') :
            (lang === 'ar' ? 'تمت إعادة التقرير للمراجعة' : 'Report sent back for review')
      );
      if (status === 'under_review') {
        setReportReviewModalOpen(false);
        setReportReviewReason('');
      }
      if (updateScriptStatus) {
        toast.success(lang === 'ar' ? 'تم تحديث حالة النص' : 'Script status updated');
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    }
    setReviewing(false);
  };

  const openReportReReviewModal = useCallback(() => {
    setReportReviewReason(report?.reviewNotes ?? '');
    setReportReviewModalOpen(true);
  }, [report?.reviewNotes]);

  const handleSubmitReportReReview = useCallback(() => {
    const reason = reportReviewReason.trim();
    if (!reason) {
      toast.error(lang === 'ar' ? 'سبب إعادة المراجعة مطلوب' : 'A re-review reason is required');
      return;
    }
    void handleReportReview('under_review', reason);
  }, [handleReportReview, lang, reportReviewReason]);

  // Load report + findings
  const loadFindings = useCallback(async (jobId: string) => {
    try {
      const f = await findingsApi.getByJob(jobId);
      setFindings(f);
    } catch { /* findings endpoint may not exist yet, rely on summary */ }
  }, []);

  const loadReviewFindings = useCallback(async (reportId: string) => {
    try {
      const rows = await findingsApi.getReviewByReport(reportId);
      setReviewFindings(rows);
    } catch {
      setReviewFindings([]);
    }
  }, []);

  useEffect(() => {
    if (!paramId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    const by = searchParams.get('by') ?? 'job';

    (async () => {
      try {
        let r: AnalysisReport;
        if (by === 'id') {
          r = await reportsApi.getById(paramId);
        } else if (by === 'script') {
          const list = await reportsApi.listByScript(paramId);
          if (list.length === 0) throw new Error('No reports found for this script');
          r = await reportsApi.getById(list[0].id);
        } else {
          r = await reportsApi.getByJob(paramId);
        }
        if (!cancelled) {
          setReport(r);
          setReportScriptMeta(null);
          setReportViewerPages(null);
          setReviewFindings([]);
          if (r.scriptId && r.versionId) {
            scriptsApi
              .getEditor(r.scriptId, r.versionId)
              .then((ed) => {
                if (cancelled) return;
                if (ed.pages && ed.pages.length > 0) {
                  setReportViewerPages(
                    ed.pages.map((p) => ({ pageNumber: p.pageNumber, content: p.content ?? '' }))
                  );
                }
              })
              .catch(() => {
                if (!cancelled) setReportViewerPages(null);
              });
          }
          if (quickFromQuery) {
            setIsQuickAnalysisReport(true);
          } else if (r.scriptId) {
            try {
              const script = await scriptsApi.getScript(r.scriptId);
              if (!cancelled) {
                setReportScriptMeta(script ?? null);
                setIsQuickAnalysisReport(Boolean(script?.isQuickAnalysis));
              }
            } catch {
              if (!cancelled) {
                setReportScriptMeta(null);
                setIsQuickAnalysisReport(false);
              }
            }
          } else {
            setReportScriptMeta(null);
            setIsQuickAnalysisReport(false);
          }
          setLoading(false);
          if (r.jobId) loadFindings(r.jobId);
          if (r.id) loadReviewFindings(r.id);
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : (lang === 'ar' ? 'لم يتم العثور على التقرير' : 'Report not found'));
          setLoading(false);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [paramId, searchParams, quickFromQuery, loadFindings, loadReviewFindings]); // eslint-disable-line react-hooks/exhaustive-deps

  // Finding-level review
  const handleFindingReview = async () => {
    if (!reviewModal) return;
    const reason = reviewReason.trim();
    const requireReason = settings?.platform?.requireOverrideReason !== false;
    if (requireReason && (!reason || reason.length < 2)) {
      toast.error(lang === 'ar' ? 'يرجى إدخال سبب' : 'Please enter a reason');
      return;
    }
    try {
      const res = await findingsApi.reviewFinding(reviewModal.findingId, reviewModal.toStatus, reason || '');
      // Update local findings state
      setFindings(prev => prev.map(f => f.id === reviewModal.findingId ? {
        ...f,
        reviewStatus: reviewModal.toStatus,
        reviewReason: reason,
        reviewedBy: user?.id ?? null,
        reviewedAt: new Date().toISOString(),
        reviewedRole: 'user',
      } : f));
      setReviewFindings(prev => prev.map(f => {
        const matched = matchRawFindingForReview(f);
        if (!matched || matched.id !== reviewModal.findingId) return f;
        return {
          ...f,
          reviewStatus: reviewModal.toStatus,
          approvedReason: reason,
          reviewedBy: user?.id ?? null,
          reviewedAt: new Date().toISOString(),
        };
      }));
      // Update local report state with persisted aggregates from backend
      if (res.reportAggregates && report) {
        const agg = res.reportAggregates;
        setReport({
          ...report,
          findingsCount: agg.findingsCount,
          severityCounts: agg.severityCounts,
          typeCounts: agg.typeCounts,
          approvedCount: agg.approvedCount,
          lastReviewedAt: new Date().toISOString(),
          lastReviewedBy: user?.id ?? null,
          lastReviewedRole: 'user',
        });
      }
      toast.success(
        reviewModal.toStatus === 'approved'
          ? (lang === 'ar' ? 'تم اعتماد الملاحظة كآمنة' : 'Finding marked as safe')
          : (lang === 'ar' ? 'تم إعادة الملاحظة كمخالفة' : 'Finding reverted to violation')
      );
      setReviewModal(null);
      setReviewReason('');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    }
  };

  const handleBulkFindingReview = async () => {
    if (!bulkReviewModal) return;
    const reason = bulkReviewReason.trim();
    const requireReason = settings?.platform?.requireOverrideReason !== false;
    if (requireReason && (!reason || reason.length < 2)) {
      toast.error(lang === 'ar' ? 'يرجى إدخال سبب' : 'Please enter a reason');
      return;
    }
    setBulkReviewSaving(true);
    try {
      await Promise.all(
        bulkReviewModal.findingIds.map((findingId) =>
          findingsApi.reviewFinding(findingId, bulkReviewModal.toStatus, reason || '')
        )
      );
      const selectedIds = new Set(bulkReviewModal.findingIds);
      const reviewedAt = new Date().toISOString();
      setFindings((prev) =>
        prev.map((f) =>
          selectedIds.has(f.id)
            ? {
                ...f,
                reviewStatus: bulkReviewModal.toStatus,
                reviewReason: reason,
                reviewedBy: user?.id ?? null,
                reviewedAt,
                reviewedRole: 'user',
              }
            : f
        )
      );
      setReviewFindings((prev) =>
        prev.map((f) => {
          const matched = matchRawFindingForReview(f);
          if (!matched || !selectedIds.has(matched.id)) return f;
          return {
            ...f,
            reviewStatus: bulkReviewModal.toStatus,
            approvedReason: reason,
            reviewedBy: user?.id ?? null,
            reviewedAt,
          };
        })
      );
      if (report?.id) {
        try {
          const rows = await findingsApi.getReviewByReport(report.id);
          setReviewFindings(rows);
          const approvedCount = rows.filter((row) => row.reviewStatus === 'approved' && row.sourceKind !== 'special').length;
          setReport((prev) =>
            prev
              ? {
                  ...prev,
                  approvedCount,
                  lastReviewedAt: reviewedAt,
                  lastReviewedBy: user?.id ?? prev.lastReviewedBy ?? null,
                  lastReviewedRole: 'user',
                }
              : prev
          );
        } catch {
          setReport((prev) =>
            prev
              ? {
                  ...prev,
                  lastReviewedAt: reviewedAt,
                  lastReviewedBy: user?.id ?? prev.lastReviewedBy ?? null,
                  lastReviewedRole: 'user',
                }
              : prev
          );
        }
      }
      setSelectedFindingIds([]);
      toast.success(
        bulkReviewModal.toStatus === 'approved'
          ? (lang === 'ar'
              ? `تم اعتماد ${bulkReviewModal.findingIds.length} ملاحظة كآمنة`
              : `${bulkReviewModal.findingIds.length} findings marked safe`)
          : (lang === 'ar'
              ? `تمت إعادة ${bulkReviewModal.findingIds.length} ملاحظة كمخالفات`
              : `${bulkReviewModal.findingIds.length} findings reverted to violations`)
      );
      setBulkReviewModal(null);
      setBulkReviewReason('');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : (lang === 'ar' ? 'فشلت المراجعة الجماعية' : 'Bulk review failed'));
    } finally {
      setBulkReviewSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-16 text-center flex flex-col items-center gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-text-muted">{lang === 'ar' ? 'جاري تحميل التقرير…' : 'Loading report…'}</p>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="p-16 text-center space-y-4">
        <XCircle className="w-12 h-12 text-error mx-auto" />
        <p className="text-text-main font-semibold">{lang === 'ar' ? 'فشل تحميل التقرير' : 'Failed to load report'}</p>
        <p className="text-text-muted text-sm">{error}</p>
        <Button variant="outline" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-4 h-4 mr-1 rtl:rotate-180" />
          {lang === 'ar' ? 'رجوع' : 'Go back'}
        </Button>
      </div>
    );
  }

  const summary = report.summaryJson;
  const partialReportMeta = summary.partial_report;
  const manualReviewContextMeta = summary.manual_review_context;
  const canonicalSummaryFindings: CanonicalSummaryFinding[] = (summary.canonical_findings || []).filter(Boolean);
  const reportHints: CanonicalSummaryFinding[] = (summary.report_hints || []).filter(Boolean);
  const canonicalHintIds = new Set(reportHints.map((f) => f.canonical_finding_id).filter(Boolean));
  const visibleReviewFindings = reviewFindings.filter((f) => !f.isHidden);
  const hasReviewFindings = visibleReviewFindings.length > 0;
  const reviewViolations = hasReviewFindings
    ? visibleReviewFindings.filter((f) => f.reviewStatus !== 'approved' && f.sourceKind !== 'special')
    : [];
  const reviewApproved = hasReviewFindings
    ? visibleReviewFindings.filter((f) => f.reviewStatus === 'approved' && f.sourceKind !== 'special')
    : [];
  const reviewSpecialNotes = hasReviewFindings
    ? visibleReviewFindings.filter((f) => f.sourceKind === 'special')
    : [];

  // Split real findings into violations vs approved for card rendering
  const hasRealFindings = findings.length > 0;
  const violations = hasRealFindings
    ? findings.filter((f) => f.reviewStatus !== 'approved' && !shouldTreatFindingAsSpecialNote(f, canonicalHintIds))
    : [];
  const approvedFindings = hasRealFindings ? findings.filter(f => f.reviewStatus === 'approved') : [];
  const violationsDeduped = hasRealFindings ? dedupeRealFindings(violations) : [];
  const approvedFindingsDeduped = hasRealFindings ? dedupeRealFindings(approvedFindings) : [];

  const semanticCategoriesOrdered = getSemanticCategoriesForChecklist();
  const categoryViolationCounts = (() => {
    const m = new Map<SemanticCategoryId, number>();
    const add = (id: SemanticCategoryId) => {
      m.set(id, (m.get(id) ?? 0) + 1);
    };
    if (hasReviewFindings) {
      for (const f of reviewViolations) {
        add(getPrimarySemanticCategory(f.primaryArticleId, f.primaryAtomId ?? null, f.primaryAtomId ?? undefined));
      }
      return m;
    }
    if (hasRealFindings) {
      const rows = showAllFindingRows ? violations : violationsDeduped;
      for (const f of rows) {
        const v3 = ((f.location as Record<string, unknown> | undefined)?.v3 as Record<string, unknown> | undefined) ?? {};
        add(
          getPrimarySemanticCategory(
            f.articleId,
            f.atomId,
            v3.primary_policy_atom_id as string | undefined
          )
        );
      }
      return m;
    }
    for (const cf of canonicalSummaryFindings) {
      const aid = Number.isFinite(cf.primary_article_id) ? (cf.primary_article_id as number) : 0;
      add(getPrimarySemanticCategory(aid, null, cf.primary_policy_atom_id));
    }
    return m;
  })();

  const violationsUniqueCount = violationsDeduped.length;
  const preferCanonicalFindingsUi =
    !hasReviewFindings &&
    canonicalSummaryFindings.length > 0 &&
    (violationsDeduped.length === 0 ||
      violationsDeduped.length < Math.max(2, Math.ceil(canonicalSummaryFindings.length * 0.6)));
  const useReviewFindingsUi = hasReviewFindings;
  const useRealFindingsUi = !useReviewFindingsUi && hasRealFindings && !preferCanonicalFindingsUi;
  const displayViolations = hasRealFindings ? (showAllFindingRows ? violations : violationsDeduped) : [];
  const displayApprovedFindings = hasRealFindings
    ? showAllFindingRows
      ? approvedFindings
      : approvedFindingsDeduped
    : [];
  const rawViolationRowsCount = hasRealFindings ? violations.length : 0;
  const fallbackSummaryCount = canonicalSummaryFindings.length > 0
    ? canonicalSummaryFindings.length
    : summary.findings_by_article.reduce((acc, a) => acc + (a.top_findings?.length ?? 0), 0);
  const displayViolationsCount = hasRealFindings
    ? displayViolations.length
    : canonicalSummaryFindings.length > 0
      ? canonicalSummaryFindings.length
      : fallbackSummaryCount;

  const displayTotal = useReviewFindingsUi
    ? reviewViolations.length
    : canonicalSummaryFindings.length;
  const displayTypeCounts = useReviewFindingsUi
    ? countReviewFindingKinds(reviewViolations)
    : useRealFindingsUi
    ? countFindingKinds(displayViolations)
    : countFindingKinds(canonicalSummaryFindings);
  const displayApproved = useReviewFindingsUi ? reviewApproved.length : (report.approvedCount ?? 0);
  const displaySpecialNotes = useReviewFindingsUi ? reviewSpecialNotes.length : reportHints.length;
  const editFindingAtomOptions = getResultsArticleAtomOptions(editFindingForm.articleId);
  const matchesFindingFilter = (finding: Pick<AnalysisFinding, 'source'> | Pick<CanonicalSummaryFinding, 'source'>) => {
    if (findingFilter === 'all') return true;
    if (findingFilter === 'special') return false;
    if (findingFilter === 'approved') return false;
    return findingKindFromSource(finding.source) === findingFilter;
  };
  const matchesReviewFindingFilter = (finding: AnalysisReviewFinding) => {
    if (findingFilter === 'all') return true;
    if (findingFilter === 'special') return finding.sourceKind === 'special';
    if (findingFilter === 'approved') return finding.reviewStatus === 'approved' && finding.sourceKind !== 'special';
    return findingKindFromReviewSource(finding.sourceKind) === findingFilter;
  };
  const filteredReviewViolations = useReviewFindingsUi
    ? reviewViolations.filter((f) => matchesReviewFindingFilter(f))
    : [];
  const filteredReviewApproved = useReviewFindingsUi
    ? reviewApproved.filter((f) => matchesReviewFindingFilter(f))
    : [];
  const filteredReviewSpecialNotes = useReviewFindingsUi
    ? reviewSpecialNotes.filter((f) => matchesReviewFindingFilter(f))
    : [];
  const filteredDisplayViolations = hasRealFindings
    ? displayViolations.filter((f) => matchesFindingFilter(f))
    : [];
  const filteredDisplayApproved = hasRealFindings
    ? displayApprovedFindings.filter(() => findingFilter === 'approved' || findingFilter === 'all')
    : [];
  const filteredCanonicalSummaryFindings = canonicalSummaryFindings.filter((f) => matchesFindingFilter(f));
  const selectableReviewRawIds = filteredReviewViolations
    .map((f) => matchRawFindingForReview(f)?.id ?? null)
    .filter((id): id is string => Boolean(id));
  const selectableRawFindingIds = filteredDisplayViolations.map((f) => f.id);
  const actionableVisibleFindingIds = useReviewFindingsUi ? selectableReviewRawIds : selectableRawFindingIds;
  const selectedVisibleFindingCount = selectedFindingIds.filter((id) => actionableVisibleFindingIds.includes(id)).length;
  const showOnlySpecialNotes = findingFilter === 'special';
  const showOnlyApproved = findingFilter === 'approved';
  const filteredViolationsCount = useReviewFindingsUi
    ? (showOnlySpecialNotes ? filteredReviewSpecialNotes.length : showOnlyApproved ? filteredReviewApproved.length : filteredReviewViolations.length)
    : hasRealFindings
    ? showOnlyApproved ? filteredDisplayApproved.length : filteredDisplayViolations.length
    : filteredCanonicalSummaryFindings.length;
  const showEmptyFindingsState = useReviewFindingsUi
    ? (showOnlySpecialNotes ? filteredReviewSpecialNotes.length === 0 : showOnlyApproved ? filteredReviewApproved.length === 0 : filteredReviewViolations.length === 0)
    : showOnlySpecialNotes
      ? reportHints.length === 0
      : showOnlyApproved
        ? filteredDisplayApproved.length === 0
      : useRealFindingsUi
        ? filteredDisplayViolations.length === 0
        : filteredCanonicalSummaryFindings.length === 0;

  const decision: 'PASS' | 'REJECT' | 'REVIEW_REQUIRED' =
    (useReviewFindingsUi ? reviewViolations.length : displayViolationsCount) > 0 ? 'REVIEW_REQUIRED' : 'PASS';

  const decisionConfig = {
    PASS: { label: lang === 'ar' ? 'مقبول' : 'PASS', bg: 'bg-success/5', text: 'text-success', border: 'border-success/30', icon: CheckCircle },
    REJECT: { label: lang === 'ar' ? 'مرفوض' : 'REJECT', bg: 'bg-error/5', text: 'text-error', border: 'border-error/30', icon: XCircle },
    REVIEW_REQUIRED: { label: lang === 'ar' ? 'يتطلب مراجعة' : 'REVIEW REQUIRED', bg: 'bg-warning/5', text: 'text-warning', border: 'border-warning/30', icon: AlertTriangle },
  };
  const DecisionIcon = decisionConfig[decision].icon;

  const toggleArticle = (key: string) => setExpandedArticles(prev => ({ ...prev, [key]: !prev[key] }));

  /** Map summary canonical row → DB finding for review actions. */
  function matchFindingForCanonical(cf: CanonicalSummaryFinding): AnalysisFinding | undefined {
    const cid = cf.canonical_finding_id;
    for (const f of findings) {
      const v3 = ((f.location as Record<string, unknown> | undefined)?.v3 as Record<string, unknown> | undefined) ?? {};
      if (String(v3.canonical_finding_id ?? '') === cid) return f;
    }
    const art = cf.primary_article_id ?? 0;
    const sn = (cf.evidence_snippet ?? '').replace(/\s+/g, ' ').trim();
    if (sn.length < 6) return undefined;
    const prefix = sn.slice(0, Math.min(80, sn.length));
    for (const f of findings) {
      const v3 = ((f.location as Record<string, unknown> | undefined)?.v3 as Record<string, unknown> | undefined) ?? {};
      const pa = Number.isFinite(Number(v3.primary_article_id)) ? Number(v3.primary_article_id) : f.articleId;
      if (pa !== art) continue;
      const es = (f.evidenceSnippet ?? '').replace(/\s+/g, ' ').trim();
      if (es.includes(prefix) || (es.length >= 6 && sn.includes(es.slice(0, Math.min(80, es.length))))) return f;
    }
    return undefined;
  }

  function matchRawFindingForReview(rf: AnalysisReviewFinding): AnalysisFinding | undefined {
    if (rf.canonicalFindingId) {
      for (const f of findings) {
        const v3 = ((f.location as Record<string, unknown> | undefined)?.v3 as Record<string, unknown> | undefined) ?? {};
        if (String(v3.canonical_finding_id ?? '') === rf.canonicalFindingId) return f;
      }
    }
    const evidence = compactWhitespace(rf.evidenceSnippet);
    if (evidence.length < 4) return undefined;
    return findings.find((f) => {
      const snippet = compactWhitespace(f.evidenceSnippet);
      if (!snippet) return false;
      const articleMatches = (f.articleId ?? 0) === (rf.primaryArticleId ?? 0);
      return articleMatches && (snippet.includes(evidence) || evidence.includes(snippet));
    });
  }

  function reviewFindingSourceLabel(sourceKind: AnalysisReviewFinding['sourceKind']): string {
    if (sourceKind === 'manual') return t('findingSourceManual');
    if (sourceKind === 'glossary') return t('findingSourceGlossary');
    if (sourceKind === 'special') return lang === 'ar' ? 'ملاحظة خاصة' : 'Special note';
    return t('findingSourceAi');
  }



  // Prepare findings for PDF: use real findings if available, otherwise fallback to summary

  const generateHtmlPrint = async () => {
    try {
      // 1. Fetch template
      const templateUrl = '/templates/report-template.html';
      const maxRetries = 3;
      let template = '';
      for (let i = 0; i < maxRetries; i++) {
        try {
          const res = await fetch(templateUrl);
          if (res.ok) {
            template = await res.text();
            console.log('[print] Template URL:', templateUrl, 'fetch: ok');
            break;
          }
          console.warn('[print] Template fetch attempt', i + 1, 'status:', res.status, templateUrl);
        } catch (e) {
          console.error('Failed to load template attempt', i, e);
        }
        await new Promise(r => setTimeout(r, 500));
      }

      if (!template) {
        console.error('[print] Template fetch failed after retries:', templateUrl);
        throw new Error('Could not load report template');
      }

      // 2. Prepare Data
      const isAr = lang === 'ar';
      const baseUrl = window.location.origin;
      const brandingLogoRaw = settings?.branding?.logoUrl?.trim() || '';
      const resolvedBrandLogo = brandingLogoRaw
        ? (brandingLogoRaw.startsWith('/') ? `${baseUrl}${brandingLogoRaw}` : resolveStorageUrl(brandingLogoRaw))
        : `${baseUrl}/dashboardlogo.png`;

      // Images (using absolute paths for print window)
      const loginLogo = resolvedBrandLogo;
      const footerImg = `${baseUrl}/footer.png`;
      const dashLogo = resolvedBrandLogo;

      // Metadata from summary (backend may attach client_name/script_title at top level or under metadata)
      const sum = summary as typeof summary & { client_name?: string; script_title?: string; scriptTitle?: string; metadata?: { client_name?: string } };
      const clientNameRaw = report.clientName || sum.client_name || sum.metadata?.client_name || (isAr ? 'عميل' : 'Client');
      const scriptTitleRaw = report.scriptTitle || sum.script_title || sum.scriptTitle || (isAr ? 'تحليل النص' : 'Script Analysis');
      const clientName = escapeHtmlSafe(clientNameRaw);
      const scriptTitle = escapeHtmlSafe(scriptTitleRaw);

      const canonicalForPrint = (canonicalSummaryFindings || []).map((cf, i) =>
        ({
          id: cf.canonical_finding_id ?? `c-${i}`,
          articleId: Number.isFinite(cf.primary_article_id) ? (cf.primary_article_id as number) : 0,
          atomId: cf.primary_policy_atom_id ?? undefined,
          titleAr: cf.title_ar,
          severity: cf.severity,
          confidence: cf.confidence ?? 0,
          evidenceSnippet: cf.evidence_snippet ?? '',
          source: 'ai',
          reviewStatus: undefined,
        }) as unknown as AnalysisFinding
      );

      const rawVio = findings.filter((f) => f.reviewStatus !== 'approved');
      const findingList: AnalysisFinding[] = hasRealFindings
        ? showAllFindingRows
          ? rawVio
          : dedupeRealFindings(rawVio)
        : canonicalForPrint.length > 0
          ? canonicalForPrint
          : summary.findings_by_article.flatMap((art) =>
              (art.top_findings ?? []).map((f, i) => ({
                id: `sum-${i}`,
                articleId: art.article_id,
                titleAr: f.title_ar,
                severity: f.severity,
                confidence: f.confidence,
                evidenceSnippet: f.evidence_snippet,
                source: 'ai',
                reviewStatus: undefined,
              } as unknown as AnalysisFinding))
            );

      const groupsByCat = new Map<SemanticCategoryId, AnalysisFinding[]>();
      for (const f of findingList) {
        const v3 = ((f.location as Record<string, unknown> | undefined)?.v3 as Record<string, unknown> | undefined) ?? {};
        const cat = getPrimarySemanticCategory(
          f.articleId,
          f.atomId,
          v3.primary_policy_atom_id as string | undefined
        );
        if (!groupsByCat.has(cat)) groupsByCat.set(cat, []);
        groupsByCat.get(cat)!.push(f);
      }

      const groupedFindingsHtml = semanticCategoriesOrdered
        .map((cat) => {
          const list = groupsByCat.get(cat.id);
          if (!list?.length) return null;
          return {
            articleTitle: isAr ? cat.titleAr : cat.titleEn,
            count: list.length,
            findings: list.map((f) => ({
              severity:
                findingKindFromSource(f.source ?? 'ai') === 'ai'
                  ? 'critical'
                  : findingKindFromSource(f.source ?? 'ai') === 'glossary'
                    ? 'high'
                    : 'medium',
              severityLabel: findingSourceLabel(f.source ?? 'ai'),
              title: isAr ? f.titleAr : f.titleAr,
              confidence: Math.round((f.confidence ?? 0) * 100),
              source: findingSourceLabel(f.source ?? 'ai'),
              lines: f.startLineChunk ? `${f.startLineChunk}${f.endLineChunk ? `-${f.endLineChunk}` : ''}` : '',
              pageNum: f.pageNumber != null && f.pageNumber > 0 ? f.pageNumber : null,
              evidence: f.evidenceSnippet,
              reviewStatus: f.reviewStatus,
              reviewStatusLabel: f.reviewStatus === 'approved' ? (isAr ? 'تم الاعتماد (آمن)' : 'Approved (Safe)') : (isAr ? 'مخالفة' : 'Violation'),
              isSafe: f.reviewStatus === 'approved',
              reviewedAt: f.reviewedAt ? formatDate(new Date(f.reviewedAt), { lang: isAr ? 'ar' : 'en', format: dateFormat }) : '',
            })),
          };
        })
        .filter((g): g is NonNullable<typeof g> => g != null);

      // 3. Replacements
      let html = template;

      // Simple handlebar-like replacement for top-level vars
      const replacements: Record<string, string> = {
        '{{lang}}': isAr ? 'ar' : 'en',
        '{{dir}}': isAr ? 'rtl' : 'ltr',
        '{{scriptTitle}}': scriptTitle,
        '{{clientName}}': clientName,
        '{{formattedDate}}': formatDate(new Date(), { lang: isAr ? 'ar' : 'en', format: dateFormat }),
        '{{generationTimestamp}}': formatDateTime(new Date(), { lang: isAr ? 'ar' : 'en' }),
        '{{loginLogoBase64}}': loginLogo,
        '{{footerImageBase64}}': footerImg,
        '{{dashboardLogoBase64}}': dashLogo,
        '{{orgNameAr}}': escapeHtmlSafe(settings?.branding?.orgNameAr ?? 'راوي فيلم'),
        '{{orgNameEn}}': escapeHtmlSafe(settings?.branding?.orgNameEn ?? 'Raawi Film'),
        '{{footerNoteAr}}': escapeHtmlSafe(settings?.branding?.footerNoteAr ?? ''),
        '{{footerNoteEn}}': escapeHtmlSafe(settings?.branding?.footerNoteEn ?? ''),

        // Stats
        '{{stats.critical}}': String(displayTypeCounts.ai),
        '{{stats.high}}': String(displayTypeCounts.glossary),
        '{{stats.medium}}': String(displayTypeCounts.manual),
        '{{stats.low}}': String(displaySpecialNotes),

        // Labels
        '{{labels.reportTitle}}': isAr ? 'تقرير التحليل' : 'Analysis Report',
        '{{labels.client}}': isAr ? 'العميل' : 'Client',
        '{{labels.date}}': isAr ? 'التاريخ' : 'Date',
        '{{labels.executiveSummary}}': isAr ? 'ملخص التقرير' : 'Executive Summary',
        '{{labels.critical}}': isAr ? 'ملاحظات آلية' : 'AI findings',
        '{{labels.high}}': isAr ? 'مطابقات القاموس' : 'Glossary findings',
        '{{labels.medium}}': isAr ? 'ملاحظات يدوية' : 'Manual findings',
        '{{labels.low}}': isAr ? 'ملاحظات خاصة' : 'Special notes',
        '{{labels.findingsDetails}}': isAr ? 'تفاصيل القضايا' : 'Findings Details',
        '{{labels.issues}}': isAr ? 'قضايا' : 'Issues',
        '{{labels.confidence}}': isAr ? 'ثقة' : 'Conf',
        '{{labels.source}}': isAr ? 'المصدر' : 'Source',
        '{{labels.lines}}': isAr ? 'الأسطر' : 'Lines',
        '{{labels.page}}': isAr ? 'الصفحة' : 'Page',
        '{{labels.status}}': isAr ? 'الحالة' : 'Status',
      };

      Object.entries(replacements).forEach(([key, val]) => {
        html = html.split(key).join(val);
      });

      // 4. render loops (Manual rudimentary implementation or use a lib if allowed. 
      // Since we don't have handlebars lib, we'll manual construct the findings HTML string and inject it)
      // Actually, to avoid complexity, let's just construct the 'groupedFindings' HTML section manually:

      const zeroFindingsMessage = isAr
        ? 'لم يتم رصد أي مخالفات في هذا النص وفق قواعد التحليل الحالية.'
        : 'No violations were detected in this script under the current analysis policy.';

      const findingsHtmlStr = groupedFindingsHtml.length === 0
        ? `
        <div class="finding-card" style="background:#F0FDF4;border-color:#BBF7D0;">
            <div class="card-header" style="justify-content:flex-start;">
                <span class="severity-badge" style="background:#DCFCE7;color:#166534;border:1px solid #86EFAC;">
                    ${escapeHtmlSafe(isAr ? 'سليم' : 'Compliant')}
                </span>
                <span class="finding-title">${escapeHtmlSafe(isAr ? 'نتيجة التحليل' : 'Analysis Result')}</span>
            </div>
            <div class="evidence-box" style="border-color:#86EFAC;background:#F0FDF4;font-style:normal;">
                ${escapeHtmlSafe(zeroFindingsMessage)}
            </div>
        </div>
      `
        : groupedFindingsHtml.map(g => `
        <div class="article-group">
            <div class="article-header">
                <span class="article-title">${escapeHtmlSafe(g.articleTitle)}</span>
                <span class="meta-chip">${g.count} ${replacements['{{labels.issues}}']}</span>
            </div>
            ${g.findings.map(f => `
            <div class="finding-card">
                <div class="card-header">
                    <span class="severity-badge sev-${escapeHtmlSafe(f.severity)}">${escapeHtmlSafe(f.severityLabel)}</span>
                    <span class="finding-title">${escapeHtmlSafe(f.title)}</span>
                </div>
                <div class="card-meta">
                    <span class="meta-chip">${replacements['{{labels.confidence}}']}: ${f.confidence}%</span>
                    <span class="meta-chip">${replacements['{{labels.source}}']}: ${escapeHtmlSafe(f.source)}</span>
                    ${f.lines ? `<span class="meta-chip">${replacements['{{labels.lines}}']}: ${escapeHtmlSafe(f.lines)}</span>` : ''}
                    ${f.pageNum != null ? `<span class="meta-chip">${replacements['{{labels.page}}']}: ${f.pageNum}</span>` : ''}
                </div>
                <div class="evidence-box">"${escapeHtmlSafe(f.evidence)}"</div>
                ${f.reviewStatus ? `
                <div class="review-status">
                    ${replacements['{{labels.status}}']}: 
                    <span class="${f.isSafe ? 'status-safe' : 'status-violation'}">${escapeHtmlSafe(f.reviewStatusLabel)}</span>
                    ${f.reviewedAt ? `<span style="margin-inline-start: 10px;">(${escapeHtmlSafe(f.reviewedAt)})</span>` : ''}
                </div>` : ''}
            </div>`).join('')}
        </div>
      `).join('');

      // Replace the {{#each}} block in template with our generated string
      // Note: The template has {{#each groupedFindings}} ... {{/each}}
      // We'll replace the entire block.

      // Let's rely on the template structure we just created.
      // Better approach: Re-read the template and ensure there is a unique placeholder. 
      // I will assume for now I can just replace the block.
      // actually, regex replacement of the block:
      const loopRegex = /{{#each groupedFindings}}([\s\S]*?){{\/each}}/m;
      html = html.replace(loopRegex, findingsHtmlStr);

      // 5. Open
      const win = window.open('', '_blank');
      if (!win) {
        toast.error(isAr ? 'تم حظر النافذة المنبثقة' : 'Popup blocked');
        return;
      }
      setTimeout(() => {
        // Wait for images to load
        // Better: check if images are loaded, but simple timeout usually works for local assets
        win.document.write(html);
        win.document.close();

        // Give browser a moment to render images before printing
        setTimeout(() => {
          win.print();
        }, 500);
      }, 100);

    } catch (e) {
      console.error(e);
      toast.error(lang === 'ar' ? 'فشل إنشاء التقرير' : 'Failed to generate report');
    }
  };

  const handleDownloadPdf = async () => {
    if (!report) return;
    setIsDownloadingPdf(true);
    try {
      let latestReviewFindings = reviewFindings;
      if (report.id) {
        try {
          latestReviewFindings = await findingsApi.getReviewByReport(report.id);
          setReviewFindings(latestReviewFindings);
        } catch {
          // Keep current in-memory review findings as fallback.
        }
      }
      const basePayload = {
        scriptTitle: report.scriptTitle || (isAr ? 'تحليل النص' : 'Script Analysis'),
        clientName: report.clientName || (isAr ? 'عميل' : 'Client'),
        createdAt: report.createdAt,
        logoUrl: settings?.branding?.logoUrl,
        findings: (findings || []).filter((f): f is AnalysisFinding => Boolean(f)),
        reviewFindings: latestReviewFindings,
        findingsByArticle: summary?.findings_by_article,
        canonicalFindings: summary?.canonical_findings,
        reportHints: summary?.report_hints ?? undefined,
        scriptSummary: summary?.script_summary ?? undefined,
        lang: isAr ? ('ar' as const) : ('en' as const),
        dateFormat,
      };
      if (isQuickAnalysisReport) {
        await downloadQuickAnalysisPdf({
          ...basePayload,
          clientName: undefined,
          // Use same ملاحظات خاصة data as UI so quick-analysis PDF always includes the section when visible
          reportHints: reportHints.length > 0 ? reportHints : (summary?.report_hints ?? undefined),
        });
      } else {
        await downloadAnalysisPdf(basePayload);
      }
      toast.success(isAr ? 'تم تنزيل PDF' : 'PDF downloaded');
    } catch (err: unknown) {
      console.error('[Results] Direct PDF download failed', err);
      const msg = err instanceof Error && err.message.length < 200 ? err.message : null;
      toast.error(
        msg || (isAr ? 'تعذر تنزيل PDF مباشرة. حاول مرة أخرى.' : 'Direct PDF download failed. Please try again.')
      );
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const handleEditFindingSubmit = async () => {
    if (!editFindingModal || !report) return;
    if (!editFindingForm.evidenceSnippet.trim()) {
      toast.error(lang === 'ar' ? 'النص المقتبس مطلوب' : 'Snippet text is required');
      return;
    }
    setEditFindingSaving(true);
    try {
      const normalizedAtomId = sanitizeResultsAtomSelection(editFindingForm.articleId, editFindingForm.atomId);
      const res = await findingsApi.reclassifyFinding({
        findingId: editFindingModal.id,
        articleId: parseInt(editFindingForm.articleId, 10) || DEFAULT_ACTIONABLE_ARTICLE_ID,
        atomId: normalizedAtomId,
        severity: editFindingForm.severity,
        evidenceSnippet: editFindingForm.evidenceSnippet?.trim() || null,
        rationaleAr: editFindingForm.rationaleAr?.trim() || null,
        manualComment: editFindingForm.manualComment?.trim() || null,
      });

      if (res.finding) {
        setFindings((prev) => prev.map((f) => (f.id === res.finding!.id ? res.finding! : f)));
        await loadReviewFindings(report.id);
      }

      if (res.reportAggregates) {
        const agg = res.reportAggregates;
        setReport((prev) => prev ? {
          ...prev,
          findingsCount: agg.findingsCount,
          severityCounts: agg.severityCounts,
          typeCounts: agg.typeCounts,
          approvedCount: agg.approvedCount,
          lastReviewedAt: new Date().toISOString(),
          lastReviewedBy: user?.id ?? prev.lastReviewedBy ?? null,
          lastReviewedRole: 'user',
        } : prev);
      }

      if ((editFindingForm.atomId?.trim() ?? '') && !normalizedAtomId) {
        toast(
          lang === 'ar'
            ? 'تمت إعادة ضبط البند الفرعي لأنه لا ينتمي إلى المادة المختارة.'
            : 'The atom was reset because it does not belong to the selected article.',
        );
      }

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

      setEditFindingSnippetValidation(null);
      setEditFindingModal(null);
    } catch (err: any) {
      toast.error(err?.message ?? (lang === 'ar' ? 'تعذر تحديث التصنيف' : 'Failed to update finding'));
    } finally {
      setEditFindingSaving(false);
    }
  };

  const handleValidateEditedFindingSnippet = async () => {
    if (!editFindingModal) return;
    const snippet = editFindingForm.evidenceSnippet.trim();
    if (!snippet) {
      toast.error(lang === 'ar' ? 'أدخل النص أولاً للتحقق منه' : 'Enter snippet text first');
      return;
    }
    setEditFindingValidatingSnippet(true);
    try {
      const res = await findingsApi.validateFindingSnippet({
        findingId: editFindingModal.id,
        snippet,
      });
      if (!res.found) {
        setEditFindingSnippetValidation(lang === 'ar' ? 'النص غير موجود في المستند.' : 'Snippet not found in the document.');
        toast.error(lang === 'ar' ? 'النص غير موجود في المستند' : 'Snippet not found in the document');
        return;
      }
      if (res.snippet) {
        setEditFindingForm((prev) => ({ ...prev, evidenceSnippet: res.snippet ?? prev.evidenceSnippet }));
      }
      const locationLabel = res.pageNumber != null
        ? (lang === 'ar' ? `تم العثور على النص في الصفحة ${res.pageNumber}.` : `Snippet found on page ${res.pageNumber}.`)
        : (lang === 'ar' ? 'تم العثور على النص في المستند.' : 'Snippet found in the document.');
      const duplicateLabel = (res.matchCount ?? 0) > 1
        ? (lang === 'ar' ? ' سيتم ربط أقرب تطابق إلى الموقع الحالي.' : ' The nearest match to the current location will be used.')
        : '';
      const message = `${locationLabel}${duplicateLabel}`;
      setEditFindingSnippetValidation(message);
      toast.success(message);
    } catch (err: any) {
      const message = err?.message ?? (lang === 'ar' ? 'تعذر التحقق من النص' : 'Could not validate snippet');
      setEditFindingSnippetValidation(message);
      toast.error(message);
    } finally {
      setEditFindingValidatingSnippet(false);
    }
  };

  const handleToggleReviewFindingReportVisibility = async (reviewFinding: AnalysisReviewFinding) => {
    const nextIncludeInReport = reviewFinding.includeInReport === false;
    setReportVisibilitySavingId(reviewFinding.id);
    try {
      const res = await findingsApi.setReviewFindingReportVisibility({
        reviewFindingId: reviewFinding.id,
        includeInReport: nextIncludeInReport,
      });
      setReviewFindings((prev) =>
        prev.map((item) => (item.id === reviewFinding.id ? res.reviewFinding : item))
      );
      toast.success(
        nextIncludeInReport
          ? (lang === 'ar' ? 'سيتم تضمين هذه الملاحظة في التقارير المصدّرة' : 'This finding will be included in exported reports')
          : (lang === 'ar' ? 'تم استبعاد هذه الملاحظة من التقارير المصدّرة' : 'This finding was excluded from exported reports')
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : null;
      toast.error(message || (lang === 'ar' ? 'تعذر تحديث حالة التضمين في التقرير' : 'Failed to update report inclusion'));
    } finally {
      setReportVisibilitySavingId(null);
    }
  };

  const handleDownloadWord = async () => {
    if (!report) return;
    setIsDownloadingWord(true);
    try {
      let latestReviewFindings = reviewFindings;
      if (report.id) {
        try {
          latestReviewFindings = await findingsApi.getReviewByReport(report.id);
          setReviewFindings(latestReviewFindings);
        } catch {
          // Keep current in-memory review findings as fallback.
        }
      }
      const basePayload = {
        scriptTitle: report.scriptTitle || (isAr ? 'تحليل النص' : 'Script Analysis'),
        clientName: report.clientName || (isAr ? 'عميل' : 'Client'),
        createdAt: report.createdAt,
        logoUrl: '/fclogo.png',
        scriptType: reportScriptMeta?.type ?? null,
        workClassification: reportScriptMeta?.workClassification ?? null,
        pageCount: reportViewerPages?.length ?? null,
        episodeCount: reportScriptMeta?.episodeCount ?? null,
        receivedAt: reportScriptMeta?.receivedAt ?? null,
        deliveredAt: report.createdAt,
        viewerPages: reportViewerPages,
        findings,
        reviewFindings: latestReviewFindings,
        findingsByArticle: summary.findings_by_article,
        canonicalFindings: canonicalSummaryFindings,
        reportHints: summary.report_hints ?? undefined,
        scriptSummary: summary.script_summary ?? undefined,
        lang: isAr ? 'ar' : 'en' as const,
      };
      await downloadAnalysisWord(basePayload);
      toast.success(isAr ? 'تم تنزيل ملف Word' : 'Word document downloaded');
    } catch (err: unknown) {
      console.error('[Results] Word download failed', err);
      toast.error(isAr ? 'تعذر تنزيل ملف Word' : 'Word download failed');
    } finally {
      setIsDownloadingWord(false);
    }
  };

  const articleLabel = (articleId: number) => {
    if (!Number.isFinite(articleId) || articleId <= 0) {
      return lang === 'ar' ? 'مادة غير محددة' : 'Unresolved article';
    }
    const meta = policyArticles.find((a) => a.id === articleId);
    return lang === 'ar'
      ? `مادة ${articleId}${meta?.titleAr ? `: ${meta.titleAr}` : ''}`
      : `Article ${articleId}${meta?.titleEn ? `: ${meta.titleEn}` : ''}`;
  };

  // Render a finding card
  function findingSourceLabel(source: string): string {
    if (source === 'manual') return t('findingSourceManual');
    if (source === 'lexicon_mandatory') return t('findingSourceGlossary');
    return t('findingSourceAi');
  }

  function displayFindingTitle(params: {
    title: string | null | undefined;
    source?: string | null;
    evidenceSnippet?: string | null;
    articleId: number;
  }): string {
    const title = (params.title ?? '').trim();
    const source = params.source ?? 'ai';
    const evidenceSnippet = (params.evidenceSnippet ?? '').trim();

    if (source === 'lexicon_mandatory') {
      const term = evidenceSnippet || title.replace(/^.*?:\s*/, '').trim();
      return term
        ? `${lang === 'ar' ? 'مطابقة من قاموس المصطلحات' : 'Glossary match'}: ${term}`
        : (lang === 'ar' ? 'مطابقة من قاموس المصطلحات' : 'Glossary match');
    }

    if (/^(مخالفة\s+معجمية|مطابقة\s+من\s+قاموس\s+المصطلحات)\s*:/u.test(title)) {
      return lang === 'ar'
        ? `مخالفة المحتوى الإعلامي — المادة ${params.articleId}`
        : `Content finding — Article ${params.articleId}`;
    }

    return title || (lang === 'ar' ? 'ملاحظة' : 'Finding');
  }

  function renderFindingCard(f: AnalysisFinding) {
    const isApproved = f.reviewStatus === 'approved';
    const v3 = ((f.location as Record<string, unknown> | undefined)?.v3 as Record<string, unknown> | undefined) ?? {};
    const primaryArticleId = Number(v3.primary_article_id);
    const primaryArticle = Number.isFinite(primaryArticleId) ? primaryArticleId : f.articleId;
    const relatedArticles = ((v3.related_article_ids as number[] | undefined) ?? []).filter((id) => id !== primaryArticle);
    const rationale = pickFindingRationale(f);
    const showRationale = !!rationale && !isWeakRationaleText(rationale) && rationale !== (f.evidenceSnippet ?? '').trim();
    const manualComment = (f.manualComment ?? '').trim();
    const isEdited = Boolean(f.editedAt || f.editedBy);
    const showManualComment = !!manualComment && manualComment !== rationale;
    const manualCommentLabel = isEdited
      ? (lang === 'ar' ? 'ملاحظة المراجع:' : 'Reviewer note:')
      : (f.source === 'manual' ? (lang === 'ar' ? 'تعليق يدوي:' : 'Manual comment:') : (lang === 'ar' ? 'ملاحظة المراجع:' : 'Reviewer note:'));
    const pillarId = (v3.pillar_id as string | undefined) ?? null;
    const displayPage = displayPageForFinding(f.startOffsetGlobal, reportViewerPages, f.pageNumber ?? null);
    const sceneLabel = formatResolvedSceneLabel(
      resolveSceneLabelFromOffset(f.startOffsetGlobal ?? null, reportViewerPages),
      lang
    );
    const displayTitle = displayFindingTitle({
      title: f.titleAr,
      source: f.source ?? 'ai',
      evidenceSnippet: f.evidenceSnippet,
      articleId: primaryArticle,
    });
    return (
      <div key={f.id} className={cn("border rounded-lg p-4", isApproved ? "bg-success/5 border-success/20" : "bg-surface border-border")}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 min-w-0">
            {!isApproved && (
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                checked={selectedFindingIds.includes(f.id)}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setSelectedFindingIds((prev) =>
                    checked ? [...prev, f.id] : prev.filter((id) => id !== f.id)
                  );
                }}
                aria-label={lang === 'ar' ? 'تحديد الملاحظة' : 'Select finding'}
              />
            )}
            <span className="font-semibold text-text-main text-sm">{displayTitle}</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] text-text-muted border-border/60">{findingSourceLabel(f.source ?? 'ai')}</Badge>
            {isEdited && (
              <Badge variant="outline" className="text-[10px] bg-info/10 text-info border-info/30">
                {lang === 'ar' ? 'معدّل' : 'Edited'}
              </Badge>
            )}
            {isApproved && (
              <Badge className="text-[10px] bg-success/10 text-success border-success/20 border">{lang === 'ar' ? 'آمن' : 'Safe'}</Badge>
            )}
            <span className="text-[10px] text-text-muted">{lang === 'ar' ? 'ثقة' : 'conf'} {Math.round((f.confidence ?? 0) * 100)}%</span>
          </div>
        </div>
        {displayPage != null && displayPage > 0 && (
          <div className="text-[10px] text-primary font-medium mb-1">
            {lang === 'ar' ? `صفحة ${displayPage}` : `Page ${displayPage}`}
          </div>
        )}
        {sceneLabel && (
          <div className="text-[10px] text-text-muted font-medium mb-1">
            {sceneLabel}
          </div>
        )}
        <div className={cn("p-3 rounded-md border text-sm font-medium text-text-main italic", isApproved ? "bg-success/5 border-success/10" : "bg-background/50 border-border/50")} dir="rtl">
          "{f.evidenceSnippet}"
        </div>
        <div className="mt-2 text-xs text-text-muted space-y-1">
          <div>{lang === 'ar' ? 'المادة الأساسية:' : 'Primary article:'} <span className="text-text-main">{articleLabel(primaryArticle)}</span></div>
          {relatedArticles.length > 0 && (
            <div>
              {lang === 'ar' ? 'مواد مرتبطة:' : 'Related articles:'}{" "}
              <span className="text-text-main">{relatedArticles.map(articleLabel).join(lang === 'ar' ? '، ' : ', ')}</span>
            </div>
          )}
          {pillarId && <div>{lang === 'ar' ? 'المحور:' : 'Pillar:'} <span className="text-text-main">{pillarId}</span></div>}
          {showRationale && (
            <div>{lang === 'ar' ? 'ملاحظة تفسيرية:' : 'Reviewer note:'} <span className="text-text-main">{rationale}</span></div>
          )}
          {showManualComment && (
            <div>{manualCommentLabel} <span className="text-text-main">{manualComment}</span></div>
          )}
        </div>
        {f.startLineChunk != null && (
          <div className="text-[10px] text-text-muted mt-1 text-end">
            {lang === 'ar' ? `سطر ${f.startLineChunk}` : `Line ${f.startLineChunk}`}
            {f.endLineChunk != null && f.endLineChunk !== f.startLineChunk ? `–${f.endLineChunk}` : ''}
          </div>
        )}
        {/* Approved info */}
        {isApproved && f.reviewReason && (
          <div className="mt-2 p-2 bg-success/5 border border-success/10 rounded text-xs text-success">
            <span className="font-semibold">{lang === 'ar' ? 'السبب:' : 'Reason:'}</span> {f.reviewReason}
            {f.reviewedAt && <span className="text-text-muted ms-2">({formatDate(new Date(f.reviewedAt), { lang, format: dateFormat })})</span>}
          </div>
        )}
        {/* Action buttons */}
        <div className="flex items-center gap-2 mt-2 print:hidden">
          {!isApproved && (
            <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1 text-success border-success/30 hover:bg-success/10"
              onClick={() => { setReviewModal({ findingId: f.id, toStatus: 'approved', titleAr: f.titleAr }); setReviewReason(''); }}>
              <CheckCircle2 className="w-3 h-3" />
              {lang === 'ar' ? 'اعتماد كآمن' : 'Mark Safe'}
            </Button>
          )}
          {isApproved && (
            <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1 text-error border-error/30 hover:bg-error/10"
              onClick={() => { setReviewModal({ findingId: f.id, toStatus: 'violation', titleAr: f.titleAr }); setReviewReason(''); }}>
              <ShieldAlert className="w-3 h-3" />
              {lang === 'ar' ? 'إعادة كمخالفة' : 'Revert to Violation'}
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[11px] gap-1"
            onClick={() => setEditFindingModal(f)}
          >
            {lang === 'ar' ? 'تعديل' : 'Edit'}
          </Button>
        </div>
      </div>
    );
  }

  function renderReviewFindingCard(f: AnalysisReviewFinding) {
    const matchedRaw = matchRawFindingForReview(f);
    const isApproved = f.reviewStatus === 'approved';
    const displayPage = displayPageForFinding(f.startOffsetGlobal ?? null, reportViewerPages, f.pageNumber ?? null);
    const sceneLabel = formatResolvedSceneLabel(
      resolveSceneLabelFromOffset(f.startOffsetGlobal ?? null, reportViewerPages),
      lang
    );
    const displayTitle = displayFindingTitle({
      title: f.titleAr,
      source: f.sourceKind === 'glossary' ? 'lexicon_mandatory' : f.sourceKind === 'manual' ? 'manual' : 'ai',
      evidenceSnippet: f.evidenceSnippet,
      articleId: f.primaryArticleId,
    });
    const rationale = !isWeakRationaleText(f.rationaleAr) ? f.rationaleAr?.trim() : null;
    const confidence = matchedRaw ? Math.round((matchedRaw.confidence ?? 0) * 100) : null;
    const manualComment = (f.manualComment ?? '').trim();
    const isEdited = Boolean(f.editedAt || f.editedBy);
    const showManualComment = !!manualComment && manualComment !== rationale;
    const manualCommentLabel = isEdited
      ? (lang === 'ar' ? 'ملاحظة المراجع:' : 'Reviewer note:')
      : (f.sourceKind === 'manual' ? (lang === 'ar' ? 'تعليق يدوي:' : 'Manual comment:') : (lang === 'ar' ? 'ملاحظة المراجع:' : 'Reviewer note:'));
    const isExcludedFromReport = f.includeInReport === false;
    const isReportVisibilitySaving = reportVisibilitySavingId === f.id;

    return (
      <div key={f.id} className={cn("border rounded-lg p-4", isApproved ? "bg-success/5 border-success/20" : "bg-surface border-border")}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 min-w-0">
            {!isApproved && matchedRaw && (
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                checked={selectedFindingIds.includes(matchedRaw.id)}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setSelectedFindingIds((prev) =>
                    checked ? [...prev, matchedRaw.id] : prev.filter((id) => id !== matchedRaw.id)
                  );
                }}
                aria-label={lang === 'ar' ? 'تحديد الملاحظة' : 'Select finding'}
              />
            )}
            <span className="font-semibold text-text-main text-sm">{displayTitle}</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] text-text-muted border-border/60">{reviewFindingSourceLabel(f.sourceKind)}</Badge>
            {isEdited && (
              <Badge variant="outline" className="text-[10px] bg-info/10 text-info border-info/30">
                {lang === 'ar' ? 'معدّل' : 'Edited'}
              </Badge>
            )}
            {isApproved && (
              <Badge className="text-[10px] bg-success/10 text-success border-success/20 border">{lang === 'ar' ? 'آمن' : 'Safe'}</Badge>
            )}
            {confidence != null && (
              <span className="text-[10px] text-text-muted">{lang === 'ar' ? 'ثقة' : 'conf'} {confidence}%</span>
            )}
          </div>
        </div>
        {displayPage != null && displayPage > 0 && (
          <div className="text-[10px] text-primary font-medium mb-1">
            {lang === 'ar' ? `صفحة ${displayPage}` : `Page ${displayPage}`}
          </div>
        )}
        {sceneLabel && (
          <div className="text-[10px] text-text-muted font-medium mb-1">
            {sceneLabel}
          </div>
        )}
        <div className={cn("p-3 rounded-md border text-sm font-medium text-text-main italic", isApproved ? "bg-success/5 border-success/10" : "bg-background/50 border-border/50")} dir="rtl">
          "{f.evidenceSnippet}"
        </div>
        <div className="mt-2 text-xs text-text-muted space-y-1">
          <div>{lang === 'ar' ? 'المادة الأساسية:' : 'Primary article:'} <span className="text-text-main">{articleLabel(f.primaryArticleId)}</span></div>
          {f.primaryAtomId && (
            <div>{lang === 'ar' ? 'البند:' : 'Atom:'} <span className="text-text-main">{f.primaryAtomId}</span></div>
          )}
          {rationale && (
            <div>{lang === 'ar' ? 'ملاحظة تفسيرية:' : 'Reviewer note:'} <span className="text-text-main">{rationale}</span></div>
          )}
          {showManualComment && (
            <div>{manualCommentLabel} <span className="text-text-main">{manualComment}</span></div>
          )}
          {f.anchorStatus === 'unresolved' && (
            <div className="text-warning">{lang === 'ar' ? 'التموضع البصري يحتاج تحققًا يدويًا.' : 'Visual placement still needs manual verification.'}</div>
          )}
        </div>
        {isApproved && f.approvedReason && (
          <div className="mt-2 p-2 bg-success/5 border border-success/10 rounded text-xs text-success">
            <span className="font-semibold">{lang === 'ar' ? 'السبب:' : 'Reason:'}</span> {f.approvedReason}
            {f.reviewedAt && <span className="text-text-muted ms-2">({formatDate(new Date(f.reviewedAt), { lang, format: dateFormat })})</span>}
          </div>
        )}
        {matchedRaw ? (
          <div className="flex items-center gap-2 mt-2 print:hidden">
            <Button
              size="sm"
              variant="outline"
              className={cn(
                "h-7 text-[11px] gap-1 border text-white",
                isExcludedFromReport
                  ? "bg-error border-error hover:bg-error/90"
                  : "bg-success border-success hover:bg-success/90"
              )}
              onClick={() => handleToggleReviewFindingReportVisibility(f)}
              disabled={isReportVisibilitySaving}
            >
              {isReportVisibilitySaving ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : null}
              {isExcludedFromReport
                ? (lang === 'ar' ? 'مستبعد' : 'Excluded')
                : (lang === 'ar' ? 'ضمن التقرير' : 'In Report')}
            </Button>
            {!isApproved && (
              <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1 text-success border-success/30 hover:bg-success/10"
                onClick={() => { setReviewModal({ findingId: matchedRaw.id, toStatus: 'approved', titleAr: f.titleAr }); setReviewReason(''); }}>
                <CheckCircle2 className="w-3 h-3" />
                {lang === 'ar' ? 'اعتماد كآمن' : 'Mark Safe'}
              </Button>
            )}
            {isApproved && (
              <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1 text-error border-error/30 hover:bg-error/10"
                onClick={() => { setReviewModal({ findingId: matchedRaw.id, toStatus: 'violation', titleAr: f.titleAr }); setReviewReason(''); }}>
                <ShieldAlert className="w-3 h-3" />
                {lang === 'ar' ? 'إعادة كمخالفة' : 'Revert to Violation'}
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[11px] gap-1"
              onClick={() => setEditFindingModal(matchedRaw)}
            >
              {lang === 'ar' ? 'تعديل' : 'Edit'}
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2 mt-2 print:hidden">
            <Button
              size="sm"
              variant="outline"
              className={cn(
                "h-7 text-[11px] gap-1 border text-white",
                isExcludedFromReport
                  ? "bg-error border-error hover:bg-error/90"
                  : "bg-success border-success hover:bg-success/90"
              )}
              onClick={() => handleToggleReviewFindingReportVisibility(f)}
              disabled={isReportVisibilitySaving}
            >
              {isReportVisibilitySaving ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : null}
              {isExcludedFromReport
                ? (lang === 'ar' ? 'مستبعد' : 'Excluded')
                : (lang === 'ar' ? 'ضمن التقرير' : 'In Report')}
            </Button>
            <p className="text-[10px] text-text-muted">
              {lang === 'ar'
                ? 'ستظهر إجراءات الاعتماد والتعديل عندما يتوفر ربط مباشر مع سجل الملاحظة الخام.'
                : 'Review actions will appear once this card is linked to a raw finding row.'}
            </p>
          </div>
        )}
      </div>
    );
  }

  // Render a findings section (either from real findings or from summary)
  function renderFindingsFromSummary(listInput: CanonicalSummaryFinding[] = canonicalSummaryFindings) {
    type Art = (typeof summary.findings_by_article)[number];
    type F = NonNullable<Art["top_findings"]>[number];
    const rows: { art: Art; f: F; idx: number }[] = [];
    const allowedEvidence = new Set(listInput.map((f) => (f.evidence_snippet ?? '').trim()).filter(Boolean));
    for (const art of summary.findings_by_article) {
      (art.top_findings ?? []).forEach((f, idx) => {
        const evidence = (f.evidence_snippet ?? '').trim();
        if (allowedEvidence.size > 0 && !allowedEvidence.has(evidence)) return;
        rows.push({ art, f, idx });
      });
    }
    const byCat = new Map<SemanticCategoryId, typeof rows>();
    for (const row of rows) {
      const cat = getPrimarySemanticCategory(row.art.article_id, null, null);
      if (!byCat.has(cat)) byCat.set(cat, []);
      byCat.get(cat)!.push(row);
    }
    return semanticCategoriesOrdered.map((cat) => {
      const list = byCat.get(cat.id);
      if (!list?.length) return null;
      const key = `sc-sum-${cat.id}`;
      const isExpanded = expandedArticles[key] ?? true;
      return (
        <div key={cat.id} className="mb-8">
          <div className="border border-border rounded-xl bg-surface/50 overflow-hidden">
            <button
              type="button"
              onClick={() => toggleArticle(key)}
              className="w-full flex items-center justify-between p-4 bg-surface hover:bg-background transition-colors border-b border-border"
            >
              <div className="flex items-center gap-3">
                <span className="bg-primary/10 text-primary w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold shrink-0">
                  {semanticCategoriesOrdered.findIndex((c) => c.id === cat.id) + 1}
                </span>
                <span className="font-bold text-text-main text-start">{lang === "ar" ? cat.titleAr : cat.titleEn}</span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <Badge variant="outline">{list.length}</Badge>
                {isExpanded ? <ChevronUp className="w-4 h-4 text-text-muted" /> : <ChevronDown className="w-4 h-4 text-text-muted" />}
              </div>
            </button>
            {isExpanded && (
              <div className="p-4 space-y-3">
                {list.map(({ art, f, idx }) => (
                  (() => {
                    const sceneLabel = formatResolvedSceneLabel(
                      resolveSceneLabelFromOffset(f.start_offset_global ?? null, reportViewerPages),
                      lang
                    );
                    return (
                      <div key={`${art.article_id}-${idx}`} className="bg-surface border border-border rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-semibold text-text-main text-sm">
                            {displayFindingTitle({
                              title: f.title_ar,
                              source: f.source ?? 'ai',
                              evidenceSnippet: f.evidence_snippet,
                              articleId: art.article_id,
                            })}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-text-muted">
                              {lang === "ar" ? "ثقة" : "conf"} {Math.round((f.confidence ?? 0) * 100)}%
                            </span>
                          </div>
                        </div>
                        {sceneLabel && (
                          <div className="text-[10px] text-text-muted font-medium mb-1">
                            {sceneLabel}
                          </div>
                        )}
                        <div className="bg-background/50 p-3 rounded-md border border-border/50 text-sm text-text-main italic" dir="rtl">
                          &quot;{f.evidence_snippet}&quot;
                        </div>
                        <div className="mt-2 text-xs text-text-muted">
                          {lang === "ar" ? "المادة (مرجع قانوني): " : "Article (legal ref): "}
                          <span className="text-text-main">{articleLabel(art.article_id)}</span>
                        </div>
                      </div>
                    );
                  })()
                ))}
              </div>
            )}
          </div>
        </div>
      );
    });
  }

  function renderFindingsFromCanonicalSummary(listInput: CanonicalSummaryFinding[] = canonicalSummaryFindings) {
    const byCat = new Map<SemanticCategoryId, CanonicalSummaryFinding[]>();
    for (const f of listInput) {
      const articleId = Number.isFinite(f.primary_article_id) ? (f.primary_article_id as number) : 0;
      const cat = getPrimarySemanticCategory(articleId, null, f.primary_policy_atom_id);
      if (!byCat.has(cat)) byCat.set(cat, []);
      byCat.get(cat)!.push(f);
    }
    return semanticCategoriesOrdered.map((cat) => {
      const artFindings = byCat.get(cat.id);
      if (!artFindings?.length) return null;
      const key = `sc-canon-${cat.id}`;
      const isExpanded = expandedArticles[key] ?? true;
      return (
        <div key={cat.id} className="mb-8">
          <div className="border border-border rounded-xl bg-surface/50 overflow-hidden">
            <button
              type="button"
              onClick={() => toggleArticle(key)}
              className="w-full flex items-center justify-between p-4 bg-surface hover:bg-background transition-colors border-b border-border"
            >
              <div className="flex items-center gap-3">
                <span className="bg-primary/10 text-primary w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold shrink-0">
                  {semanticCategoriesOrdered.findIndex((c) => c.id === cat.id) + 1}
                </span>
                <span className="font-bold text-text-main text-start">{lang === "ar" ? cat.titleAr : cat.titleEn}</span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <Badge variant="outline">{artFindings.length}</Badge>
                {isExpanded ? <ChevronUp className="w-4 h-4 text-text-muted" /> : <ChevronDown className="w-4 h-4 text-text-muted" />}
              </div>
            </button>
            {isExpanded && (
              <div className="p-4 space-y-3">
                {artFindings.map((f, idx) => {
                  const articleId = Number.isFinite(f.primary_article_id) ? (f.primary_article_id as number) : 0;
                  const cardRationale = isWeakRationaleText(f.rationale) ? null : f.rationale;
                  const sceneLabel = formatResolvedSceneLabel(
                    resolveSceneLabelFromOffset(f.start_offset_global ?? null, reportViewerPages),
                    lang
                  );
                  return (
                        <div key={`${f.canonical_finding_id}-${idx}`} className="bg-surface border border-border rounded-lg p-4">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-semibold text-text-main text-sm">
                              {displayFindingTitle({
                                title: f.title_ar,
                                source: f.source ?? 'ai',
                                evidenceSnippet: f.evidence_snippet,
                                articleId,
                              })}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-text-muted">{lang === 'ar' ? 'ثقة' : 'conf'} {Math.round((f.confidence ?? 0) * 100)}%</span>
                            </div>
                          </div>
                          {sceneLabel && (
                            <div className="text-[10px] text-text-muted font-medium mb-1">
                              {sceneLabel}
                            </div>
                          )}
                          <div className="bg-background/50 p-3 rounded-md border border-border/50 text-sm text-text-main italic" dir="rtl">"{f.evidence_snippet}"</div>
                          <div className="mt-2 text-xs text-text-muted space-y-1">
                            <div>
                              {lang === 'ar' ? 'النوع:' : 'Type:'}{' '}
                              <span className="text-text-main">
                                {findingSourceLabel(f.source ?? 'ai')}
                              </span>
                            </div>
                            <div>{lang === 'ar' ? 'المادة الأساسية:' : 'Primary article:'} <span className="text-text-main">{articleLabel(articleId)}</span></div>
                            {((f.related_article_ids ?? []).filter((id) => id !== articleId).length > 0) && (
                              <div>
                                {lang === 'ar' ? 'مواد مرتبطة:' : 'Related articles:'}{" "}
                                <span className="text-text-main">
                                  {(f.related_article_ids ?? []).filter((id) => id !== articleId).map(articleLabel).join(lang === 'ar' ? '، ' : ', ')}
                                </span>
                              </div>
                            )}
                            {f.pillar_id && <div>{lang === 'ar' ? 'المحور:' : 'Pillar:'} <span className="text-text-main">{f.pillar_id}</span></div>}
                            {cardRationale && (
                              <div>{lang === 'ar' ? 'ملاحظة تفسيرية:' : 'Reviewer note:'} <span className="text-text-main">{cardRationale}</span></div>
                            )}
                          </div>
                          {(() => {
                            const mf = matchFindingForCanonical(f);
                            if (!mf) {
                              return (
                                <p className="text-[10px] text-text-muted mt-2 print:hidden">
                                  {lang === 'ar'
                                    ? 'إذا لم يظهر زر الاعتماد، حدّث الصفحة بعد اكتمال التحليل.'
                                    : 'If no action appears, refresh the page after analysis finishes.'}
                                </p>
                              );
                            }
                            const isApproved = mf.reviewStatus === 'approved';
                            return (
                              <div className="mt-2 space-y-2 print:hidden">
                                {isApproved && mf.reviewReason && (
                                  <div className="p-2 bg-success/5 border border-success/10 rounded text-xs text-success">
                                    <span className="font-semibold">{lang === 'ar' ? 'السبب:' : 'Reason:'}</span> {mf.reviewReason}
                                  </div>
                                )}
                                <div className="flex items-center gap-2">
                                  {!isApproved && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 text-[11px] gap-1 text-success border-success/30 hover:bg-success/10"
                                      onClick={() => {
                                        setReviewModal({ findingId: mf.id, toStatus: 'approved', titleAr: f.title_ar });
                                        setReviewReason('');
                                      }}
                                    >
                                      <CheckCircle2 className="w-3 h-3" />
                                      {lang === 'ar' ? 'اعتماد كآمن' : 'Mark Safe'}
                                    </Button>
                                  )}
                                  {isApproved && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 text-[11px] gap-1 text-error border-error/30 hover:bg-error/10"
                                      onClick={() => {
                                        setReviewModal({ findingId: mf.id, toStatus: 'violation', titleAr: f.title_ar });
                                        setReviewReason('');
                                      }}
                                    >
                                      <ShieldAlert className="w-3 h-3" />
                                      {lang === 'ar' ? 'إعادة كمخالفة' : 'Revert to Violation'}
                                    </Button>
                                  )}
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      );
    });
  }

  function renderFindingsFromReal(list: AnalysisFinding[]) {
    const byCat = new Map<SemanticCategoryId, AnalysisFinding[]>();
    for (const f of list) {
      const v3 = ((f.location as Record<string, unknown> | undefined)?.v3 as Record<string, unknown> | undefined) ?? {};
      const cat = getPrimarySemanticCategory(
        f.articleId,
        f.atomId,
        v3.primary_policy_atom_id as string | undefined
      );
      if (!byCat.has(cat)) byCat.set(cat, []);
      byCat.get(cat)!.push(f);
    }

    return semanticCategoriesOrdered.map((cat) => {
      const artFindings = byCat.get(cat.id);
      if (!artFindings?.length) return null;
      const key = `sc-real-${cat.id}`;
      const isExpanded = expandedArticles[key] ?? true;
      return (
        <div key={cat.id} className="mb-8">
          <div className="border border-border rounded-xl bg-surface/50 overflow-hidden">
            <button
              type="button"
              onClick={() => toggleArticle(key)}
              className="w-full flex items-center justify-between p-4 bg-surface hover:bg-background transition-colors border-b border-border"
            >
              <div className="flex items-center gap-3">
                <span className="bg-primary/10 text-primary w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold shrink-0">
                  {semanticCategoriesOrdered.findIndex((c) => c.id === cat.id) + 1}
                </span>
                <span className="font-bold text-text-main text-start">{lang === "ar" ? cat.titleAr : cat.titleEn}</span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <Badge variant="outline">{artFindings.length}</Badge>
                {isExpanded ? <ChevronUp className="w-4 h-4 text-text-muted" /> : <ChevronDown className="w-4 h-4 text-text-muted" />}
              </div>
            </button>
            {isExpanded && (
              <div className="p-4 space-y-3">
                {groupFindingsByAtom ? (
                  (() => {
                    const byAtom = new Map<string, AnalysisFinding[]>();
                    for (const f of artFindings) {
                      const k = normalizeAtomId(f.atomId, f.articleId) || `a${f.articleId}`;
                      if (!byAtom.has(k)) byAtom.set(k, []);
                      byAtom.get(k)!.push(f);
                    }
                    const entries = Array.from(byAtom.entries()).sort(
                      ([a], [b]) => atomIdNumeric(a) - atomIdNumeric(b)
                    );
                    return entries.map(([atomKey, fl]) => {
                      const aid = fl[0]?.articleId ?? 0;
                      return (
                        <div key={atomKey} className="border border-border/60 rounded-lg p-3 bg-background/30">
                          <div className="text-xs font-semibold text-text-muted mb-2">
                            {lang === "ar" ? "مرجع السياسة: " : "Policy ref: "}
                            {formatAtomDisplayR(aid, atomKey.startsWith("a") ? null : atomKey)}
                          </div>
                          <div className="space-y-3">{fl.map((f) => renderFindingCard(f))}</div>
                        </div>
                      );
                    });
                  })()
                ) : (
                  artFindings.map((f) => renderFindingCard(f))
                )}
              </div>
            )}
          </div>
        </div>
      );
    });
  }

  function renderFindingsFromReview(list: AnalysisReviewFinding[]) {
    const byCat = new Map<SemanticCategoryId, AnalysisReviewFinding[]>();
    for (const f of list) {
      const cat = getPrimarySemanticCategory(f.primaryArticleId, f.primaryAtomId ?? null, f.primaryAtomId ?? undefined);
      if (!byCat.has(cat)) byCat.set(cat, []);
      byCat.get(cat)!.push(f);
    }

    return semanticCategoriesOrdered.map((cat) => {
      const artFindings = byCat.get(cat.id);
      if (!artFindings?.length) return null;
      const key = `sc-review-${cat.id}`;
      const isExpanded = expandedArticles[key] ?? true;
      return (
        <div key={cat.id} className="mb-8">
          <div className="border border-border rounded-xl bg-surface/50 overflow-hidden">
            <button
              type="button"
              onClick={() => toggleArticle(key)}
              className="w-full flex items-center justify-between p-4 bg-surface hover:bg-background transition-colors border-b border-border"
            >
              <div className="flex items-center gap-3">
                <span className="bg-primary/10 text-primary w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold shrink-0">
                  {semanticCategoriesOrdered.findIndex((c) => c.id === cat.id) + 1}
                </span>
                <span className="font-bold text-text-main text-start">{lang === "ar" ? cat.titleAr : cat.titleEn}</span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <Badge variant="outline">{artFindings.length}</Badge>
                {isExpanded ? <ChevronUp className="w-4 h-4 text-text-muted" /> : <ChevronDown className="w-4 h-4 text-text-muted" />}
              </div>
            </button>
            {isExpanded && (
              <div className="p-4 space-y-3">
                {artFindings.map((f) => renderReviewFindingCard(f))}
              </div>
            )}
          </div>
        </div>
      );
    });
  }

  return (
    <div className="flex flex-col min-h-full w-full pb-20">
      {/* Header */}
      <div className="flex items-center justify-between mb-8 print:mb-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" className="px-2 print:hidden" onClick={() => navigate(-1)} aria-label="Go back">
            <ArrowLeft className="w-5 h-5 rtl:rotate-180" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-text-main">{lang === 'ar' ? 'تقرير التحليل' : 'Analysis Report'}</h1>
            <p className="text-text-muted mt-1 text-sm">
              {formatDateLong(new Date(report.createdAt), { lang })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 print:hidden flex-wrap">
          {useRealFindingsUi && violations.length > 0 && (
            <div className="flex flex-col gap-0.5 items-end sm:items-center sm:flex-row sm:gap-2 border border-border/60 rounded-lg px-3 py-2 bg-surface/50">
              <div
                className="flex items-center gap-2 cursor-pointer select-none"
                onClick={() => setShowAllFindingRows((v) => !v)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setShowAllFindingRows((v) => !v);
                  }
                }}
              >
                <span onClick={(e) => e.stopPropagation()}>
                  <Switch
                    checked={showAllFindingRows}
                    onCheckedChange={setShowAllFindingRows}
                    aria-label={lang === 'ar' ? 'كل السجلات بما فيها التكرار' : 'All rows including duplicates'}
                  />
                </span>
                <span className="text-sm text-text-main whitespace-nowrap">
                  {lang === 'ar' ? 'كل السجلات (بما فيها التكرار)' : 'All rows (incl. duplicates)'}
                </span>
              </div>
              <span className="text-[10px] text-text-muted max-w-[18rem] sm:max-w-none text-end sm:text-start">
                {lang === 'ar'
                  ? `${displayTotal} نهائية${displaySpecialNotes > 0 ? ` + ${displaySpecialNotes} ملاحظات خاصة` : ''}`
                  : `${displayTotal} final${displaySpecialNotes > 0 ? ` + ${displaySpecialNotes} special notes` : ''}`}
              </span>
              {rawViolationRowsCount !== violationsUniqueCount && (
                <span className="text-[10px] text-text-muted max-w-[14rem] sm:max-w-none text-end sm:text-start">
                  {lang === 'ar'
                    ? `${violationsUniqueCount} فريدة من ${rawViolationRowsCount} سجل خام`
                    : `${violationsUniqueCount} unique · ${rawViolationRowsCount} raw rows`}
                </span>
              )}
            </div>
          )}
          {useRealFindingsUi && (
            <label className="flex items-center gap-2 text-sm text-text-muted cursor-pointer">
              <input
                type="checkbox"
                checked={groupFindingsByAtom}
                onChange={(e) => setGroupFindingsByAtom(e.target.checked)}
                className="rounded border-border"
              />
              {lang === 'ar' ? 'تجميع حسب الذرة' : 'Group by atom'}
            </label>
          )}
          <Button variant="outline" onClick={handleDownloadPdf} className="h-10 px-4 flex gap-2" disabled={isDownloadingPdf}>
            {isDownloadingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
            {isDownloadingPdf ? (lang === 'ar' ? 'جاري تجهيز PDF...' : 'Preparing PDF...') : (lang === 'ar' ? 'تنزيل PDF' : 'Download PDF')}
          </Button>
          <Button variant="outline" onClick={handleDownloadWord} className="h-10 px-4 flex gap-2" disabled={isDownloadingWord}>
            {isDownloadingWord ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
            {isDownloadingWord ? (lang === 'ar' ? 'جاري تجهيز Word...' : 'Preparing Word...') : (lang === 'ar' ? 'تنزيل Word' : 'Download Word')}
          </Button>
          <Button
            variant="outline"
            className="h-10 px-4"
            disabled={actionableVisibleFindingIds.length === 0}
            onClick={() => setSelectedFindingIds(actionableVisibleFindingIds)}
          >
            {lang === 'ar' ? 'تحديد الكل' : 'Select all'}
          </Button>
          <Button
            variant="ghost"
            className="h-10 px-4"
            disabled={selectedFindingIds.length === 0}
            onClick={() => setSelectedFindingIds([])}
          >
            {lang === 'ar' ? 'إلغاء التحديد' : 'Clear selection'}
          </Button>
          <Button
            variant="outline"
            className="h-10 px-4 flex gap-2 text-success border-success/30 hover:bg-success/10"
            disabled={selectedVisibleFindingCount === 0}
            onClick={() => {
              const findingIds = selectedFindingIds.filter((id) => actionableVisibleFindingIds.includes(id));
              setBulkReviewModal({ findingIds, toStatus: 'approved' });
              setBulkReviewReason('');
            }}
          >
            <CheckCircle2 className="w-4 h-4" />
            {lang === 'ar' ? 'اعتماد المحدد كآمن' : 'Mark selected safe'}
          </Button>
          <Button
            variant="outline"
            className="h-10 px-4 flex gap-2 text-error border-error/30 hover:bg-error/10"
            disabled={selectedVisibleFindingCount === 0}
            onClick={() => {
              const findingIds = selectedFindingIds.filter((id) => actionableVisibleFindingIds.includes(id));
              setBulkReviewModal({ findingIds, toStatus: 'violation' });
              setBulkReviewReason('');
            }}
          >
            <ShieldAlert className="w-4 h-4" />
            {lang === 'ar' ? 'إعادة المحدد كمخالفة' : 'Revert selected'}
          </Button>
        </div>
      </div>

      {/* AI script summary */}
      {summary.script_summary && (
        <div className="rounded-2xl border border-border bg-surface/50 p-6 mb-8" dir="rtl">
          <h2 className="text-lg font-bold text-text-main mb-3">
            {lang === "ar" ? "فهم النص (ملخص الذكاء الاصطناعي)" : "Script understanding (AI summary)"}
          </h2>
          <p className="text-text-main text-sm leading-relaxed mb-3">{summary.script_summary.synopsis_ar}</p>
          {summary.script_summary.key_risky_events_ar && (
            <p className="text-text-muted text-sm mb-2">
              <span className="font-semibold text-text-main">{lang === "ar" ? "أهم المشاهد الحساسة: " : "Key risky events: "}</span>
              {summary.script_summary.key_risky_events_ar}
            </p>
          )}
          {summary.script_summary.narrative_stance_ar && (
            <p className="text-text-muted text-sm mb-2">
              <span className="font-semibold text-text-main">{lang === "ar" ? "موقف السرد: " : "Narrative stance: "}</span>
              {summary.script_summary.narrative_stance_ar}
            </p>
          )}
          {summary.script_summary.compliance_posture_ar && (
            <p className="text-text-muted text-sm mb-2">
              <span className="font-semibold text-text-main">{lang === "ar" ? "انطباع الامتثال: " : "Compliance posture: "}</span>
              {summary.script_summary.compliance_posture_ar}
            </p>
          )}
          <p className="text-[11px] text-text-muted">
            {lang === "ar" ? "ثقة الملخص: " : "Summary confidence: "}
            {Math.round((summary.script_summary.confidence ?? 0) * 100)}%
          </p>
        </div>
      )}

      {partialReportMeta?.is_partial && (
        <div className="rounded-xl border border-warning/20 bg-warning/5 p-4 mb-6">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-text-main">
                {lang === 'ar' ? 'تقرير جزئي' : 'Partial report'}
              </p>
              <p className="text-sm text-text-muted">
                {lang === 'ar'
                  ? `تم إنشاء هذا التقرير بعد إيقاف التحليل مبكراً. تم فحص ${partialReportMeta.processed_chunks} من ${partialReportMeta.total_chunks} جزءاً، لذلك قد تزيد النتائج عند تشغيل التحليل كاملاً.`
                  : `This report was generated after analysis was stopped early. ${partialReportMeta.processed_chunks} of ${partialReportMeta.total_chunks} chunks were processed, so findings may increase in a full run.`}
              </p>
            </div>
          </div>
        </div>
      )}

      {(manualReviewContextMeta?.carried_forward_count ?? 0) > 0 && (
        <div className="rounded-xl border border-primary/15 bg-primary/5 p-4 mb-6">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-text-main">
                {lang === 'ar' ? 'ملاحظات يدوية محفوظة' : 'Preserved manual review notes'}
              </p>
              <p className="text-sm text-text-muted">
                {lang === 'ar'
                  ? `تم حمل ${manualReviewContextMeta.carried_forward_count} ملاحظات يدوية من مراجعات سابقة إلى هذه الجولة حتى لا تضيع أثناء إعادة التحليل.`
                  : `${manualReviewContextMeta.carried_forward_count} manual review notes were carried from earlier reviews into this run so they remain visible during re-analysis.`}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Report-level review bar */}
      {report.reviewStatus && (
        <div className={cn(
          "rounded-xl border p-4 mb-6 flex items-center justify-between print:hidden",
          report.reviewStatus === 'approved' ? 'bg-success/5 border-success/20' :
            report.reviewStatus === 'rejected' ? 'bg-error/5 border-error/20' :
              'bg-warning/5 border-warning/20'
        )}>
          <div className="flex items-center gap-3">
            {report.reviewStatus === 'approved' ? <CheckCircle2 className="w-5 h-5 text-success" /> :
              report.reviewStatus === 'rejected' ? <XCircle className="w-5 h-5 text-error" /> :
                <AlertTriangle className="w-5 h-5 text-warning" />}
            <div>
              <span className="font-semibold text-sm text-text-main">
                {report.reviewStatus === 'approved' ? (lang === 'ar' ? 'مقبول' : 'Approved') :
                  report.reviewStatus === 'rejected' ? (lang === 'ar' ? 'مرفوض' : 'Rejected') :
                    (lang === 'ar' ? 'قيد المراجعة' : 'Under Review')}
              </span>
              {report.reviewedAt && <span className="text-xs text-text-muted ms-2">{formatDate(new Date(report.reviewedAt), { lang, format: dateFormat })}</span>}
            </div>
          </div>

          <div className="flex items-center gap-2 mb-3 p-3 bg-surface rounded-lg border border-border">
            <input
              type="checkbox"
              id="update-script-status"
              checked={updateScriptStatus}
              onChange={(e) => setUpdateScriptStatus(e.target.checked)}
              className="w-4 h-4 rounded border-border"
            />
            <label htmlFor="update-script-status" className="text-sm text-text-primary cursor-pointer">
              {lang === 'ar' ? 'تحديث حالة النص تلقائياً' : 'Also update script status'}
            </label>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs gap-1 text-success border-success/30 hover:bg-success/10"
              onClick={() => handleReportReview('approved')}
              disabled={reviewing || report.reviewStatus === 'approved'}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />{lang === 'ar' ? 'قبول' : 'Approve'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs gap-1 text-error border-error/30 hover:bg-error/10"
              onClick={() => handleReportReview('rejected')}
              disabled={reviewing || report.reviewStatus === 'approved' || report.reviewStatus === 'rejected'}
            >
              <XCircle className="w-3.5 h-3.5" />{lang === 'ar' ? 'رفض' : 'Reject'}
            </Button>
            {report.reviewStatus !== 'under_review' && (
              <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={openReportReReviewModal} disabled={reviewing}>
                {lang === 'ar' ? 'إعادة للمراجعة' : 'Re-review'}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Summary card */}
      <div className={cn(
        "rounded-2xl border p-6 mb-10 flex flex-col md:flex-row items-start justify-between gap-6 shadow-sm",
        decisionConfig[decision].bg, decisionConfig[decision].border
      )}>
        <div className="flex-1 w-full">
          <div className="text-sm text-text-muted mb-1 font-mono">Job: {report.jobId?.slice(0, 8)}...</div>
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-4 w-full mt-4">
            <button
              type="button"
              onClick={() => setFindingFilter('all')}
              className={cn(
                "bg-surface/50 border border-border p-3 rounded-xl text-start transition-colors",
                findingFilter === 'all' ? 'ring-2 ring-primary border-primary' : 'hover:border-primary/40'
              )}
            >
              <div className="text-xs text-text-muted mb-1">{lang === 'ar' ? 'مخالفات نهائية' : 'Final violations'}</div>
              <div className="font-bold text-lg">{displayTotal}</div>
            </button>
            <button
              type="button"
              onClick={() => setFindingFilter((v) => (v === 'ai' ? 'all' : 'ai'))}
              className={cn(
                "bg-primary/5 border border-primary/20 p-3 rounded-xl text-primary text-start transition-colors",
                findingFilter === 'ai' ? 'ring-2 ring-primary border-primary' : 'hover:border-primary/50'
              )}
            >
              <div className="text-xs mb-1 font-semibold">{lang === 'ar' ? 'ملاحظات آلية' : 'AI findings'}</div>
              <div className="font-bold text-lg">{displayTypeCounts.ai}</div>
            </button>
            <button
              type="button"
              onClick={() => setFindingFilter((v) => (v === 'glossary' ? 'all' : 'glossary'))}
              className={cn(
                "bg-warning/5 border border-warning/20 p-3 rounded-xl text-warning text-start transition-colors",
                findingFilter === 'glossary' ? 'ring-2 ring-warning border-warning' : 'hover:border-warning/40'
              )}
            >
              <div className="text-xs mb-1 font-semibold">{lang === 'ar' ? 'مطابقات القاموس' : 'Glossary findings'}</div>
              <div className="font-bold text-lg">{displayTypeCounts.glossary}</div>
            </button>
            <button
              type="button"
              onClick={() => setFindingFilter((v) => (v === 'manual' ? 'all' : 'manual'))}
              className={cn(
                "bg-surface/50 border border-border p-3 rounded-xl text-primary text-start transition-colors",
                findingFilter === 'manual' ? 'ring-2 ring-primary border-primary' : 'hover:border-primary/40'
              )}
            >
              <div className="text-xs mb-1 font-semibold">{lang === 'ar' ? 'ملاحظات يدوية' : 'Manual findings'}</div>
              <div className="font-bold text-lg">{displayTypeCounts.manual}</div>
            </button>
            {displayApproved > 0 && (
              <button
                type="button"
                onClick={() => setFindingFilter((v) => (v === 'approved' ? 'all' : 'approved'))}
                className={cn(
                  "bg-success/5 border border-success/20 p-3 rounded-xl text-success text-start transition-colors",
                  findingFilter === 'approved' ? 'ring-2 ring-success border-success' : 'hover:border-success/40'
                )}
              >
                <div className="text-xs mb-1 font-semibold">{lang === 'ar' ? 'معتمد كآمن' : 'Marked safe'}</div>
                <div className="font-bold text-lg">{displayApproved}</div>
              </button>
            )}
            {displaySpecialNotes > 0 && (
              <button
                type="button"
                onClick={() => setFindingFilter((v) => (v === 'special' ? 'all' : 'special'))}
                className={cn(
                  "bg-info/5 border border-info/20 p-3 rounded-xl text-info text-start transition-colors",
                  findingFilter === 'special' ? 'ring-2 ring-info border-info' : 'hover:border-info/40'
                )}
              >
                <div className="text-xs mb-1 font-semibold">{lang === 'ar' ? 'ملاحظات خاصة' : 'Special notes'}</div>
                <div className="font-bold text-lg">{displaySpecialNotes}</div>
              </button>
            )}
          </div>
        </div>
        <div className={cn(
          "flex items-center gap-3 px-6 py-3 rounded-xl border bg-background/50 backdrop-blur-sm shrink-0",
          decisionConfig[decision].text, decisionConfig[decision].border
        )}>
          <DecisionIcon className="w-8 h-8" />
          <span className="text-2xl font-bold">{decisionConfig[decision].label}</span>
        </div>
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Checklist: semantic categories (aligned with findings grouping) */}
        <div className="lg:col-span-4 space-y-4">
          <div className="border-b border-border pb-2">
            <h3 className="font-bold text-lg text-text-main">
              {lang === 'ar' ? 'قائمة التحقق (المجالات الدلالية)' : 'Compliance checklist (semantic areas)'}
            </h3>
            <p className="text-xs text-text-muted mt-1">
              {lang === 'ar'
                ? 'عدد المخالفات لكل مجال دلالي؛ المرجع القانوني (مادة/بند) يظهر في بطاقة كل مخالفة.'
                : 'Violation count per semantic area; legal atom/article appears on each finding card.'}
            </p>
          </div>
          <div className="space-y-2 max-h-[min(75vh,32rem)] overflow-y-auto pe-1">
            {semanticCategoriesOrdered.map((cat) => {
              const n = categoryViolationCounts.get(cat.id) ?? 0;
              if (cat.id === 'other' && n === 0) return null;
              return (
                <div
                  key={cat.id}
                  className="flex justify-between items-start gap-2 py-2.5 px-3 rounded-xl bg-surface border border-border shadow-sm"
                >
                  <div className="flex items-start gap-2 min-w-0">
                    {n > 0 ? (
                      <XCircle className="w-4 h-4 text-error shrink-0 mt-0.5" />
                    ) : (
                      <CheckCircle className="w-4 h-4 text-success/70 shrink-0 mt-0.5" />
                    )}
                    <span className="text-text-main text-sm leading-snug text-start" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
                      {lang === 'ar' ? cat.titleAr : cat.titleEn}
                    </span>
                  </div>
                  {n > 0 ? (
                    <Badge variant="error" className="h-6 px-2 shrink-0 text-xs">
                      {n}
                    </Badge>
                  ) : (
                    <CheckCircle className="w-4 h-4 text-success/50 shrink-0" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Detailed findings */}
        <div className="lg:col-span-8 space-y-8">
          {/* Violations section */}
          <h3 className="font-bold text-xl text-text-main border-b border-border pb-2 flex items-center gap-2">
            {showOnlySpecialNotes ? (
              <Info className="w-5 h-5 text-info" />
            ) : showOnlyApproved ? (
              <Shield className="w-5 h-5 text-success" />
            ) : (
              <ShieldAlert className="w-5 h-5 text-primary" />
            )}
            {showOnlySpecialNotes
              ? (lang === 'ar' ? 'ملاحظات خاصة' : 'Special notes')
              : showOnlyApproved
                ? (lang === 'ar' ? 'معتمد كآمن' : 'Marked safe')
              : (lang === 'ar' ? 'المخالفات' : 'Violations')}
            <Badge variant="outline" className="ms-2">
              {findingFilter === 'all'
                ? displayTotal
                : findingFilter === 'special'
                  ? displaySpecialNotes
                : findingFilter === 'approved'
                  ? `${filteredViolationsCount} / ${displayApproved}`
                : findingFilter === 'manual'
                  ? `${filteredViolationsCount} / ${displayTypeCounts.manual}`
                  : `${filteredViolationsCount} / ${displayTotal}`}
            </Badge>
            {findingFilter !== 'all' && (
              <button
                type="button"
                onClick={() => setFindingFilter('all')}
                className="text-xs text-primary hover:underline"
              >
                {lang === 'ar' ? 'إلغاء التصفية' : 'Clear filter'}
              </button>
            )}
          </h3>

          {showEmptyFindingsState ? (
            <div className="text-center py-16 bg-surface border-2 border-dashed border-border rounded-2xl">
              <CheckCircle className="w-12 h-12 text-success mx-auto mb-4 opacity-50" />
              <h4 className="text-lg font-bold text-text-main">
                {findingFilter === 'all'
                  ? (lang === 'ar' ? 'النص سليم' : 'Script Is Compliant')
                  : findingFilter === 'special'
                    ? (lang === 'ar' ? 'لا توجد ملاحظات خاصة' : 'No special notes')
                  : findingFilter === 'approved'
                    ? (lang === 'ar' ? 'لا توجد ملاحظات معتمدة كآمنة' : 'No marked-safe findings')
                  : findingFilter === 'manual'
                    ? (lang === 'ar' ? 'لا توجد ملاحظات يدوية' : 'No manual findings')
                    : findingFilter === 'glossary'
                      ? (lang === 'ar' ? 'لا توجد مطابقات قاموس' : 'No glossary findings')
                      : (lang === 'ar' ? 'لا توجد ملاحظات آلية' : 'No AI findings')}
              </h4>
              <p className="text-text-muted mt-2">
                {findingFilter === 'all'
                  ? (lang === 'ar'
                    ? 'لم يتم رصد أي مخالفات في هذا النص وفق قواعد التحليل الحالية.'
                    : 'No violations were detected in this script under the current analysis policy.')
                  : findingFilter === 'special'
                    ? (lang === 'ar'
                      ? 'لا توجد ملاحظات خاصة في هذا التقرير.'
                      : 'There are no special notes in this report.')
                  : findingFilter === 'approved'
                    ? (lang === 'ar'
                      ? 'لا توجد ملاحظات تم اعتمادها كآمنة في هذا التقرير بعد.'
                      : 'There are no marked-safe findings in this report yet.')
                  : findingFilter === 'manual'
                    ? (lang === 'ar'
                      ? 'لا توجد ملاحظات يدوية في هذا التقرير، أو أنها غير ضمن النتائج المعروضة حالياً.'
                      : 'There are no manual findings in this report, or none match the current result set.')
                  : findingFilter === 'glossary'
                    ? (lang === 'ar'
                      ? 'لا توجد مطابقات من قاموس المصطلحات في النتائج الحالية.'
                      : 'There are no glossary findings in the current result set.')
                    : (lang === 'ar'
                      ? 'لا توجد ملاحظات آلية ضمن النتائج الحالية.'
                      : 'There are no AI findings in the current result set.')}
              </p>
            </div>
          ) : showOnlySpecialNotes
            ? null
            : showOnlyApproved
              ? useReviewFindingsUi
                ? renderFindingsFromReview(filteredReviewApproved)
                : renderFindingsFromReal(filteredDisplayApproved)
            : useReviewFindingsUi && filteredReviewViolations.length > 0
            ? renderFindingsFromReview(filteredReviewViolations)
            : useRealFindingsUi && filteredDisplayViolations.length > 0
            ? renderFindingsFromReal(filteredDisplayViolations)
            : filteredCanonicalSummaryFindings.length > 0
              ? renderFindingsFromCanonicalSummary(filteredCanonicalSummaryFindings)
              : useRealFindingsUi
                ? renderFindingsFromReal(filteredDisplayViolations)
                : renderFindingsFromSummary(filteredCanonicalSummaryFindings)}

          {/* Report hints: not violations but notes for director (e.g. Islamic rules when filming) */}
          {!showOnlyApproved && (((useReviewFindingsUi && filteredReviewSpecialNotes.length > 0) || (!useReviewFindingsUi && reportHints.length > 0))) && (
            <>
              <h3 className={cn(
                "font-bold text-xl text-text-main border-b border-info/40 pb-2 flex items-center gap-2",
                showOnlySpecialNotes ? '' : 'mt-12'
              )}>
                <Info className="w-5 h-5 text-info" />
                {lang === 'ar' ? 'ملاحظات خاصة' : 'Special notes'}
                <Badge variant="outline" className="ms-2 bg-info/10 text-info border-info/30">{useReviewFindingsUi ? filteredReviewSpecialNotes.length : reportHints.length}</Badge>
              </h3>
              <p className="text-text-muted text-sm mt-1 mb-4">
                {lang === 'ar'
                  ? 'هذه النقاط ليست مخالفات؛ يُنصح بمراعاتها عند التصوير (مثلاً ضوابط المظهر العام والقيم الإسلامية).'
                  : 'These are not violations; consider them when filming (e.g. modesty and Islamic guidelines).'}
              </p>
              <div className="space-y-4">
                {useReviewFindingsUi ? (
                  filteredReviewSpecialNotes.map((f) => (
                    <div key={`hint-review-${f.id}`} className="bg-info/5 border border-info/30 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold text-text-main text-sm">{lang === 'ar' ? 'ملاحظة' : 'Note'}</span>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px] bg-info/10 text-info border-info/30">{lang === 'ar' ? 'ملاحظة' : 'Note'}</Badge>
                        </div>
                      </div>
                      <div className="bg-background/50 p-3 rounded-md border border-info/20 text-sm text-text-main italic" dir="rtl">"{f.evidenceSnippet}"</div>
                      <div className="mt-2 text-xs text-text-muted space-y-1">
                        <div>{lang === 'ar' ? 'المادة:' : 'Article:'} <span className="text-text-main">{articleLabel(f.primaryArticleId)}</span></div>
                        <div>{lang === 'ar' ? 'لماذا ليست مخالفة:' : 'Why not a violation:'} <span className="text-text-main">{f.rationaleAr ?? '—'}</span></div>
                      </div>
                    </div>
                  ))
                ) : (
                  reportHints.map((f, idx) => (
                    <div key={`hint-${f.canonical_finding_id}-${idx}`} className="bg-info/5 border border-info/30 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold text-text-main text-sm">{lang === 'ar' ? 'ملاحظة' : 'Note'}</span>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px] bg-info/10 text-info border-info/30">{lang === 'ar' ? 'ملاحظة' : 'Note'}</Badge>
                          <span className="text-[10px] text-text-muted">{lang === 'ar' ? 'ثقة' : 'conf'} {Math.round((f.confidence ?? 0) * 100)}%</span>
                        </div>
                      </div>
                      <div className="bg-background/50 p-3 rounded-md border border-info/20 text-sm text-text-main italic" dir="rtl">"{f.evidence_snippet}"</div>
                      <div className="mt-2 text-xs text-text-muted space-y-1">
                        {f.primary_article_id && (
                          <div>{lang === 'ar' ? 'المادة:' : 'Article:'} <span className="text-text-main">{articleLabel(f.primary_article_id)}</span></div>
                        )}
                        <div>{lang === 'ar' ? 'لماذا ليست مخالفة:' : 'Why not a violation:'} <span className="text-text-main">{f.rationale ?? '—'}</span></div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}

          {/* Approved section */}
          {!showOnlySpecialNotes && !showOnlyApproved && useReviewFindingsUi && reviewApproved.length > 0 && (
            <>
              <h3 className="font-bold text-xl text-text-main border-b border-success/30 pb-2 flex items-center gap-2 mt-12">
                <Shield className="w-5 h-5 text-success" />
                {lang === 'ar' ? 'معتمد كآمن' : 'Approved as Safe'}
                <Badge className="ms-2 text-[10px] bg-success/10 text-success border-success/20 border">{reviewApproved.length}</Badge>
              </h3>
              {renderFindingsFromReview(reviewApproved)}
            </>
          )}
          {!showOnlySpecialNotes && !showOnlyApproved && !useReviewFindingsUi && useRealFindingsUi && displayApprovedFindings.length > 0 && (
            <>
              <h3 className="font-bold text-xl text-text-main border-b border-success/30 pb-2 flex items-center gap-2 mt-12">
                <Shield className="w-5 h-5 text-success" />
                {lang === 'ar' ? 'معتمد كآمن' : 'Approved as Safe'}
                <Badge className="ms-2 text-[10px] bg-success/10 text-success border-success/20 border">{displayApprovedFindings.length}</Badge>
              </h3>
              {renderFindingsFromReal(displayApprovedFindings)}
            </>
          )}
        </div>
      </div>

      <Modal
        isOpen={reportReviewModalOpen}
        onClose={() => {
          if (reviewing) return;
          setReportReviewModalOpen(false);
          setReportReviewReason('');
        }}
        title={lang === 'ar' ? 'إعادة التقرير للمراجعة' : 'Send Report Back for Review'}
      >
        <div className="space-y-4">
          <div className="p-3 bg-background rounded-md border border-border text-sm text-text-main" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
            {lang === 'ar'
              ? 'اذكر سبب إعادة التقرير للمراجعة. سيتم حفظ السبب مع حالة التقرير.'
              : 'Enter the reason for sending this report back for review. The reason will be saved with the report status.'}
          </div>
          <Textarea
            label={lang === 'ar' ? 'سبب إعادة المراجعة' : 'Re-review reason'}
            value={reportReviewReason}
            onChange={(e) => setReportReviewReason(e.target.value)}
            placeholder={lang === 'ar' ? 'اكتب سبب إعادة التقرير للمراجعة…' : 'Write the reason for re-review…'}
          />
          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <Button
              variant="outline"
              onClick={() => {
                setReportReviewModalOpen(false);
                setReportReviewReason('');
              }}
              disabled={reviewing}
            >
              {lang === 'ar' ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button
              variant="primary"
              onClick={handleSubmitReportReReview}
              disabled={reviewing || !reportReviewReason.trim()}
            >
              {reviewing ? (lang === 'ar' ? 'جاري الحفظ…' : 'Saving…') : (lang === 'ar' ? 'إعادة للمراجعة' : 'Send to review')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Finding review modal */}
      <Modal 
        isOpen={!!reviewModal}
        onClose={() => { setReviewModal(null); setReviewReason(''); }}
        title={reviewModal?.toStatus === 'approved'
          ? (lang === 'ar' ? 'اعتماد كآمن' : 'Mark as Safe')
          : (lang === 'ar' ? 'إعادة كمخالفة' : 'Revert to Violation')}
      >
        <div className="space-y-4">
          <div className="p-3 bg-background rounded-md border border-border text-sm text-text-main font-medium" dir="rtl">
            {reviewModal?.titleAr}
          </div>
          <Textarea 
            label={lang === 'ar' ? 'السبب (مطلوب)' : 'Reason (required)'}
            value={reviewReason}
            onChange={e => setReviewReason(e.target.value)}
            placeholder={reviewModal?.toStatus === 'approved'
              ? (lang === 'ar' ? 'اشرح لماذا هذه الملاحظة آمنة…' : 'Explain why this finding is safe…')
              : (lang === 'ar' ? 'اشرح لماذا يجب إعادتها كمخالفة…' : 'Explain why this should be reverted…')}
          />
          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <Button variant="outline" onClick={() => { setReviewModal(null); setReviewReason(''); }}>
              {lang === 'ar' ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button
              variant={reviewModal?.toStatus === 'approved' ? 'primary' : 'danger'}
              onClick={handleFindingReview}
              disabled={settings?.platform?.requireOverrideReason !== false && !reviewReason.trim()}
            >
              {reviewModal?.toStatus === 'approved'
                ? (lang === 'ar' ? 'اعتماد' : 'Approve')
                : (lang === 'ar' ? 'إعادة كمخالفة' : 'Revert')}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={!!bulkReviewModal}
        onClose={() => { setBulkReviewModal(null); setBulkReviewReason(''); }}
        title={bulkReviewModal?.toStatus === 'approved'
          ? (lang === 'ar' ? 'اعتماد المحدد كآمن' : 'Mark selected as safe')
          : (lang === 'ar' ? 'إعادة المحدد كمخالفة' : 'Revert selected to violations')}
      >
        <div className="space-y-4">
          <div className="p-3 bg-background rounded-md border border-border text-sm text-text-main font-medium" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
            {lang === 'ar'
              ? `سيُطبَّق هذا الإجراء على ${bulkReviewModal?.findingIds.length ?? 0} ملاحظة.`
              : `This action will be applied to ${bulkReviewModal?.findingIds.length ?? 0} findings.`}
          </div>
          <Textarea
            label={lang === 'ar' ? 'السبب (مطلوب)' : 'Reason (required)'}
            value={bulkReviewReason}
            onChange={(e) => setBulkReviewReason(e.target.value)}
            placeholder={bulkReviewModal?.toStatus === 'approved'
              ? (lang === 'ar' ? 'اشرح لماذا هذه الملاحظات آمنة…' : 'Explain why these findings are safe…')
              : (lang === 'ar' ? 'اشرح لماذا يجب اعتبار هذه الملاحظات مخالفات…' : 'Explain why these findings should be violations…')}
          />
          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <Button variant="outline" onClick={() => { setBulkReviewModal(null); setBulkReviewReason(''); }}>
              {lang === 'ar' ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button
              variant={bulkReviewModal?.toStatus === 'approved' ? 'primary' : 'danger'}
              onClick={handleBulkFindingReview}
              disabled={bulkReviewSaving || (settings?.platform?.requireOverrideReason !== false && !bulkReviewReason.trim())}
            >
              {bulkReviewSaving
                ? (lang === 'ar' ? 'جاري الحفظ…' : 'Saving…')
                : bulkReviewModal?.toStatus === 'approved'
                  ? (lang === 'ar' ? 'اعتماد المحدد' : 'Approve selected')
                  : (lang === 'ar' ? 'إعادة المحدد' : 'Revert selected')}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={!!editFindingModal}
        onClose={() => setEditFindingModal(null)}
        title={lang === 'ar' ? 'تعديل الملاحظة' : 'Edit finding'}
      >
        <div className="space-y-4">
          <div className="p-3 bg-background rounded-md border border-border text-sm text-text-main font-medium" dir="rtl">
            {editFindingModal?.titleAr}
          </div>
          <Textarea
            label={lang === 'ar' ? 'النص المقتبس' : 'Snippet text'}
            value={editFindingForm.evidenceSnippet}
            onChange={(e) => {
              setEditFindingForm((prev) => ({ ...prev, evidenceSnippet: e.target.value }));
              setEditFindingSnippetValidation(null);
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
              onClick={() => void handleValidateEditedFindingSnippet()}
              disabled={editFindingValidatingSnippet || editFindingSaving}
            >
              {editFindingValidatingSnippet ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
              {lang === 'ar' ? 'تحقق من النص' : 'Check snippet'}
            </Button>
          </div>
          {editFindingSnippetValidation && (
            <div className="rounded-md border border-border bg-background/50 px-3 py-2 text-xs text-text-muted">
              {editFindingSnippetValidation}
            </div>
          )}
          <Textarea
            label={lang === 'ar' ? 'الملاحظة التفسيرية' : 'AI reason'}
            value={editFindingForm.rationaleAr}
            onChange={(e) => setEditFindingForm((prev) => ({ ...prev, rationaleAr: e.target.value }))}
            placeholder={lang === 'ar' ? 'عدّل التعليل الظاهر في البطاقة…' : 'Edit the explanation shown on the card…'}
          />
          <Select
            label={lang === 'ar' ? 'المادة' : 'Article'}
            value={editFindingForm.articleId}
            onChange={(e) => setEditFindingForm((prev) => ({ ...prev, articleId: e.target.value, atomId: '' }))}
            options={RESULTS_ARTICLES_CHECKLIST}
          />
          <Select
            label={lang === 'ar' ? 'البند الفرعي' : 'Atom'}
            value={editFindingForm.atomId}
            onChange={(e) => setEditFindingForm((prev) => ({ ...prev, atomId: e.target.value }))}
            options={editFindingAtomOptions}
          />
          <Textarea
            label={lang === 'ar' ? 'ملاحظة المراجع' : 'Reviewer note'}
            value={editFindingForm.manualComment}
            onChange={(e) => setEditFindingForm((prev) => ({ ...prev, manualComment: e.target.value }))}
            placeholder={lang === 'ar' ? 'أضف ملاحظة توضيحية اختيارية…' : 'Add an optional reviewer note…'}
          />
          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <Button variant="outline" onClick={() => setEditFindingModal(null)}>
              {lang === 'ar' ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button onClick={handleEditFindingSubmit} disabled={editFindingSaving}>
              {editFindingSaving
                ? (lang === 'ar' ? 'جارٍ الحفظ…' : 'Saving…')
                : (lang === 'ar' ? 'حفظ التعديل' : 'Save changes')}
            </Button>
          </div>
        </div>
      </Modal>
    </div >
  );
}
