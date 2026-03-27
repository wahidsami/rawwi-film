import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';

import { useLangStore } from '@/store/langStore';
import { useAuthStore } from '@/store/authStore';
import { useSettingsStore } from '@/store/settingsStore';
import { formatDate, formatDateLong, formatDateTime } from '@/utils/dateFormat';
import { type AnalysisReport } from '@/services/reportService';
import { reportsApi, findingsApi, scriptsApi, type AnalysisFinding } from '@/api';
import type { ReviewStatus } from '@/api/models';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Switch } from '@/components/ui/Switch';
import { Textarea } from '@/components/ui/Textarea';
import { cn } from '@/utils/cn';
import { escapeHtmlSafe } from '@/utils/escapeHtml';
import toast from 'react-hot-toast';
import { downloadAnalysisPdf } from '@/components/reports/analysis/download';
import { downloadQuickAnalysisPdf } from '@/components/reports/quick-analysis/download';
import {
  ArrowLeft, CheckCircle, ShieldAlert,
  AlertTriangle, XCircle, ChevronDown, ChevronUp, Loader2,
  CheckCircle2, Shield, FileDown, Info, FileSearch,
} from 'lucide-react';

import {
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

const policyArticles = getPolicyArticles().map((a) => ({
  id: a.articleId,
  titleAr: a.title_ar,
  titleEn: `Article ${a.articleId}`,
}));

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
      const currentRank = existing.severity === 'critical' ? 4 : existing.severity === 'high' ? 3 : existing.severity === 'medium' ? 2 : 1;
      const nextRank = normalized.severity === 'critical' ? 4 : normalized.severity === 'high' ? 3 : normalized.severity === 'medium' ? 2 : 1;
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedArticles, setExpandedArticles] = useState<Record<string, boolean>>({});
  const [reviewing, setReviewing] = useState(false);
  const [updateScriptStatus, setUpdateScriptStatus] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [isQuickAnalysisReport, setIsQuickAnalysisReport] = useState(quickFromQuery);
  const [groupFindingsByAtom, setGroupFindingsByAtom] = useState(false);
  /** false = deduped list (default); true = every DB row (duplicates visible). */
  const [showAllFindingRows, setShowAllFindingRows] = useState(false);
  /** script_pages slices for viewer-accurate page labels (same model as workspace). */
  const [reportViewerPages, setReportViewerPages] = useState<Array<{ pageNumber: number; content: string }> | null>(null);

  // Finding review modal
  const [reviewModal, setReviewModal] = useState<{ findingId: string; toStatus: 'approved' | 'violation'; titleAr: string } | null>(null);
  const [reviewReason, setReviewReason] = useState('');

  // Report-level review
  const handleReportReview = async (status: ReviewStatus) => {
    if (!report?.id) return;
    setReviewing(true);
    try {
      await reportsApi.review(report.id, status, undefined, updateScriptStatus);
      setReport({ ...report, reviewStatus: status, reviewedAt: new Date().toISOString(), reviewedBy: user?.id ?? null });
      toast.success(
        status === 'approved' ? (lang === 'ar' ? 'تم قبول التقرير' : 'Report approved') :
          status === 'rejected' ? (lang === 'ar' ? 'تم رفض التقرير' : 'Report rejected') :
            (lang === 'ar' ? 'تم إعادة التقرير للمراجعة' : 'Report reset to under review')
      );
      if (updateScriptStatus) {
        toast.success(lang === 'ar' ? 'تم تحديث حالة النص' : 'Script status updated');
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    }
    setReviewing(false);
  };

  // Load report + findings
  const loadFindings = useCallback(async (jobId: string) => {
    try {
      const f = await findingsApi.getByJob(jobId);
      setFindings(f);
    } catch { /* findings endpoint may not exist yet, rely on summary */ }
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
          setReportViewerPages(null);
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
              if (!cancelled) setIsQuickAnalysisReport(Boolean(script?.isQuickAnalysis));
            } catch {
              if (!cancelled) setIsQuickAnalysisReport(false);
            }
          } else {
            setIsQuickAnalysisReport(false);
          }
          setLoading(false);
          if (r.jobId) loadFindings(r.jobId);
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : (lang === 'ar' ? 'لم يتم العثور على التقرير' : 'Report not found'));
          setLoading(false);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [paramId, searchParams, quickFromQuery]); // eslint-disable-line react-hooks/exhaustive-deps

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
      // Update local report state with persisted aggregates from backend
      if (res.reportAggregates && report) {
        const agg = res.reportAggregates;
        setReport({
          ...report,
          findingsCount: agg.findingsCount,
          severityCounts: agg.severityCounts,
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
  const canonicalSummaryFindings: CanonicalSummaryFinding[] = (summary.canonical_findings || []).filter(Boolean);
  const reportHints: CanonicalSummaryFinding[] = (summary.report_hints || []).filter(Boolean);
  const wordsToRevisit = (summary.words_to_revisit || []).filter(Boolean);
  const canonicalHintIds = new Set(reportHints.map((f) => f.canonical_finding_id).filter(Boolean));

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

  // Stats must match the violations list we render. Derive from canonical_findings so cards and list are always in sync.
  const displayTotal = canonicalSummaryFindings.length;
  const displaySc = (() => {
    const base = { low: 0, medium: 0, high: 0, critical: 0 };
    for (const f of canonicalSummaryFindings) {
      const s = (f.severity ?? "").toLowerCase();
      if (s in base) (base as Record<string, number>)[s]++;
    }
    return base;
  })();
  const displayApproved = report.approvedCount ?? 0;
  const displaySpecialNotes = reportHints.length;

  const decision: 'PASS' | 'REJECT' | 'REVIEW_REQUIRED' =
    (displaySc.critical > 0 || displaySc.high > 0) ? 'REJECT' :
      displaySc.medium > 0 ? 'REVIEW_REQUIRED' : 'PASS';

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

      // Images (using absolute paths for print window)
      const loginLogo = `${baseUrl}/loginlogo.png`;
      const footerImg = `${baseUrl}/footer.png`;
      const dashLogo = `${baseUrl}/loginlogo.png`;

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
              severity: (f.severity ?? 'info').toLowerCase(),
              severityLabel: f.severity,
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
        '{{stats.critical}}': String(displaySc.critical),
        '{{stats.high}}': String(displaySc.high),
        '{{stats.medium}}': String(displaySc.medium),
        '{{stats.low}}': String(displaySc.low),

        // Labels
        '{{labels.reportTitle}}': isAr ? 'تقرير التحليل' : 'Analysis Report',
        '{{labels.client}}': isAr ? 'العميل' : 'Client',
        '{{labels.date}}': isAr ? 'التاريخ' : 'Date',
        '{{labels.executiveSummary}}': isAr ? 'ملخص التقرير' : 'Executive Summary',
        '{{labels.critical}}': isAr ? 'حرجة' : 'Critical',
        '{{labels.high}}': isAr ? 'عالية' : 'High',
        '{{labels.medium}}': isAr ? 'متوسطة' : 'Medium',
        '{{labels.low}}': isAr ? 'منخفضة' : 'Low',
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
      const basePayload = {
        scriptTitle: report.scriptTitle || (isAr ? 'تحليل النص' : 'Script Analysis'),
        clientName: report.clientName || (isAr ? 'عميل' : 'Client'),
        createdAt: report.createdAt,
        findings: (findings || []).filter((f): f is AnalysisFinding => Boolean(f)),
        findingsByArticle: summary?.findings_by_article,
        canonicalFindings: summary?.canonical_findings,
        reportHints: summary?.report_hints ?? undefined,
        wordsToRevisit: summary?.words_to_revisit ?? undefined,
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

  const sevColor = (s: string) =>
    s === 'critical' ? 'bg-error/10 text-error border-error/20' :
      s === 'high' ? 'bg-error/5 text-error border-error/10' :
        s === 'medium' ? 'bg-warning/10 text-warning border-warning/20' :
          'bg-info/10 text-info border-info/20';

  const articleLabel = (articleId: number) => {
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

  function renderFindingCard(f: AnalysisFinding) {
    const isApproved = f.reviewStatus === 'approved';
    const v3 = ((f.location as Record<string, unknown> | undefined)?.v3 as Record<string, unknown> | undefined) ?? {};
    const primaryArticleId = Number(v3.primary_article_id);
    const primaryArticle = Number.isFinite(primaryArticleId) ? primaryArticleId : f.articleId;
    const relatedArticles = ((v3.related_article_ids as number[] | undefined) ?? []).filter((id) => id !== primaryArticle);
    const rationale = pickFindingRationale(f);
    const pillarId = (v3.pillar_id as string | undefined) ?? null;
    const displayPage = displayPageForFinding(f.startOffsetGlobal, reportViewerPages, f.pageNumber ?? null);
    return (
      <div key={f.id} className={cn("border rounded-lg p-4", isApproved ? "bg-success/5 border-success/20" : "bg-surface border-border")}>
        <div className="flex items-center justify-between mb-2">
          <span className="font-semibold text-text-main text-sm">{f.titleAr}</span>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] text-text-muted border-border/60">{findingSourceLabel(f.source ?? 'ai')}</Badge>
            {isApproved && (
              <Badge className="text-[10px] bg-success/10 text-success border-success/20 border">{lang === 'ar' ? 'آمن' : 'Safe'}</Badge>
            )}
            <Badge className={cn("text-[10px] border", sevColor(f.severity))}>{f.severity}</Badge>
            <span className="text-[10px] text-text-muted">{lang === 'ar' ? 'ثقة' : 'conf'} {Math.round((f.confidence ?? 0) * 100)}%</span>
          </div>
        </div>
        {displayPage != null && displayPage > 0 && (
          <div className="text-[10px] text-primary font-medium mb-1">
            {lang === 'ar' ? `صفحة ${displayPage}` : `Page ${displayPage}`}
          </div>
        )}
        <div className={cn("p-3 rounded-md border text-sm text-text-main italic", isApproved ? "bg-success/5 border-success/10" : "bg-background/50 border-border/50")} dir="rtl">
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
          <div>{lang === 'ar' ? 'لماذا اعتُبرت مخالفة:' : 'Why considered a violation:'} <span className="text-text-main">{rationale ?? '—'}</span></div>
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
        </div>
      </div>
    );
  }

  // Render a findings section (either from real findings or from summary)
  function renderFindingsFromSummary() {
    type Art = (typeof summary.findings_by_article)[number];
    type F = NonNullable<Art["top_findings"]>[number];
    const rows: { art: Art; f: F; idx: number }[] = [];
    for (const art of summary.findings_by_article) {
      (art.top_findings ?? []).forEach((f, idx) => rows.push({ art, f, idx }));
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
                  <div key={`${art.article_id}-${idx}`} className="bg-surface border border-border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-text-main text-sm">{f.title_ar}</span>
                      <div className="flex items-center gap-2">
                        <Badge className={cn("text-[10px] border", sevColor(f.severity ?? ""))}>{f.severity}</Badge>
                        <span className="text-[10px] text-text-muted">
                          {lang === "ar" ? "ثقة" : "conf"} {Math.round((f.confidence ?? 0) * 100)}%
                        </span>
                      </div>
                    </div>
                    <div className="bg-background/50 p-3 rounded-md border border-border/50 text-sm text-text-main italic" dir="rtl">
                      &quot;{f.evidence_snippet}&quot;
                    </div>
                    <div className="mt-2 text-xs text-text-muted">
                      {lang === "ar" ? "المادة (مرجع قانوني): " : "Article (legal ref): "}
                      <span className="text-text-main">{articleLabel(art.article_id)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      );
    });
  }

  function renderFindingsFromCanonicalSummary() {
    const byCat = new Map<SemanticCategoryId, CanonicalSummaryFinding[]>();
    for (const f of canonicalSummaryFindings) {
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
                  return (
                        <div key={`${f.canonical_finding_id}-${idx}`} className="bg-surface border border-border rounded-lg p-4">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-semibold text-text-main text-sm">{f.title_ar}</span>
                            <div className="flex items-center gap-2">
                              <Badge className={cn("text-[10px] border", sevColor(f.severity))}>{f.severity}</Badge>
                              <span className="text-[10px] text-text-muted">{lang === 'ar' ? 'ثقة' : 'conf'} {Math.round((f.confidence ?? 0) * 100)}%</span>
                            </div>
                          </div>
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
                            <div>{lang === 'ar' ? 'لماذا اعتُبرت مخالفة:' : 'Why considered a violation:'} <span className="text-text-main">{f.rationale ?? '—'}</span></div>
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
          {hasRealFindings && violations.length > 0 && (
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
          {hasRealFindings && (
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
            {report.reviewStatus !== 'approved' && (
              <Button size="sm" variant="outline" className="h-8 text-xs gap-1 text-success border-success/30 hover:bg-success/10" onClick={() => handleReportReview('approved')} disabled={reviewing}>
                <CheckCircle2 className="w-3.5 h-3.5" />{lang === 'ar' ? 'قبول' : 'Approve'}
              </Button>
            )}
            {report.reviewStatus !== 'rejected' && (
              <Button size="sm" variant="outline" className="h-8 text-xs gap-1 text-error border-error/30 hover:bg-error/10" onClick={() => handleReportReview('rejected')} disabled={reviewing}>
                <XCircle className="w-3.5 h-3.5" />{lang === 'ar' ? 'رفض' : 'Reject'}
              </Button>
            )}
            {report.reviewStatus !== 'under_review' && (
              <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => handleReportReview('under_review')} disabled={reviewing}>
                {lang === 'ar' ? 'إعادة للمراجعة' : 'Reset'}
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
            <div className="bg-surface/50 border border-border p-3 rounded-xl">
              <div className="text-xs text-text-muted mb-1">{lang === 'ar' ? 'مخالفات نهائية' : 'Final violations'}</div>
              <div className="font-bold text-lg">{displayTotal}</div>
            </div>
            <div className="bg-error/5 border border-error/20 p-3 rounded-xl text-error">
              <div className="text-xs mb-1 font-semibold">{lang === 'ar' ? 'حرجة' : 'Critical'}</div>
              <div className="font-bold text-lg">{displaySc.critical}</div>
            </div>
            <div className="bg-error/5 border border-error/10 p-3 rounded-xl text-error">
              <div className="text-xs mb-1 font-semibold">{lang === 'ar' ? 'عالية' : 'High'}</div>
              <div className="font-bold text-lg">{displaySc.high}</div>
            </div>
            <div className="bg-warning/5 border border-warning/20 p-3 rounded-xl text-warning">
              <div className="text-xs mb-1 font-semibold">{lang === 'ar' ? 'متوسطة' : 'Medium'}</div>
              <div className="font-bold text-lg">{displaySc.medium}</div>
            </div>
            <div className="bg-info/5 border border-info/20 p-3 rounded-xl text-info">
              <div className="text-xs mb-1 font-semibold">{lang === 'ar' ? 'منخفضة' : 'Low'}</div>
              <div className="font-bold text-lg">{displaySc.low}</div>
            </div>
            {displayApproved > 0 && (
              <div className="bg-success/5 border border-success/20 p-3 rounded-xl text-success">
                <div className="text-xs mb-1 font-semibold">{lang === 'ar' ? 'معتمد آمن' : 'Approved'}</div>
                <div className="font-bold text-lg">{displayApproved}</div>
              </div>
            )}
            {displaySpecialNotes > 0 && (
              <div className="bg-info/5 border border-info/20 p-3 rounded-xl text-info">
                <div className="text-xs mb-1 font-semibold">{lang === 'ar' ? 'ملاحظات خاصة' : 'Special notes'}</div>
                <div className="font-bold text-lg">{displaySpecialNotes}</div>
              </div>
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
            <ShieldAlert className="w-5 h-5 text-primary" />
            {lang === 'ar' ? 'المخالفات' : 'Violations'}
            <Badge variant="outline" className="ms-2">{displayTotal}</Badge>
          </h3>

          {(hasRealFindings ? displayViolations.length === 0 : displayViolationsCount === 0) ? (
            <div className="text-center py-16 bg-surface border-2 border-dashed border-border rounded-2xl">
              <CheckCircle className="w-12 h-12 text-success mx-auto mb-4 opacity-50" />
              <h4 className="text-lg font-bold text-text-main">{lang === 'ar' ? 'النص سليم' : 'Script Is Compliant'}</h4>
              <p className="text-text-muted mt-2">
                {lang === 'ar'
                  ? 'لم يتم رصد أي مخالفات في هذا النص وفق قواعد التحليل الحالية.'
                  : 'No violations were detected in this script under the current analysis policy.'}
              </p>
            </div>
          ) : hasRealFindings && displayViolations.length > 0
            ? renderFindingsFromReal(displayViolations)
            : canonicalSummaryFindings.length > 0
              ? renderFindingsFromCanonicalSummary()
              : hasRealFindings
                ? renderFindingsFromReal(displayViolations)
                : renderFindingsFromSummary()}

          {/* Report hints: not violations but notes for director (e.g. Islamic rules when filming) */}
          {reportHints.length > 0 && (
            <>
              <h3 className="font-bold text-xl text-text-main border-b border-info/40 pb-2 flex items-center gap-2 mt-12">
                <Info className="w-5 h-5 text-info" />
                {lang === 'ar' ? 'ملاحظات خاصة' : 'Special notes'}
                <Badge variant="outline" className="ms-2 bg-info/10 text-info border-info/30">{reportHints.length}</Badge>
              </h3>
              <p className="text-text-muted text-sm mt-1 mb-4">
                {lang === 'ar'
                  ? 'هذه النقاط ليست مخالفات؛ يُنصح بمراعاتها عند التصوير (مثلاً ضوابط المظهر العام والقيم الإسلامية).'
                  : 'These are not violations; consider them when filming (e.g. modesty and Islamic guidelines).'}
              </p>
              <div className="space-y-4">
                {reportHints.map((f, idx) => (
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
                ))}
              </div>
            </>
          )}

          {/* Words/sentences to revisit (separate light pass — glossary terms that appeared; not violations) */}
          {wordsToRevisit.length > 0 && (
            <>
              <h3 className="font-bold text-xl text-text-main border-b border-border pb-2 flex items-center gap-2 mt-12">
                <FileSearch className="w-5 h-5 text-muted-foreground" />
                {lang === 'ar' ? 'كلمات / عبارات للمراجعة' : 'Words / phrases to revisit'}
                <Badge variant="outline" className="ms-2">{wordsToRevisit.length}</Badge>
              </h3>
              <p className="text-text-muted text-sm mt-1 mb-4">
                {lang === 'ar'
                  ? 'ظهور الكلمات أو العبارات التالية في النص (للمراجعة عند التصوير — لا تُحسب مخالفات).'
                  : 'The following words or phrases appear in the script (for review when filming — not counted as violations).'}
              </p>
              <div className="space-y-3">
                {wordsToRevisit.map((m, idx) => (
                  <div key={`revisit-${idx}-${m.term}-${m.start_offset}`} className="bg-muted/30 border border-border rounded-lg p-3">
                    <span className="font-medium text-text-main">{m.term}</span>
                    <p className="text-sm text-text-muted mt-1 italic" dir="rtl">"{m.snippet}"</p>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Approved section */}
          {hasRealFindings && displayApprovedFindings.length > 0 && (
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
    </div >
  );
}
