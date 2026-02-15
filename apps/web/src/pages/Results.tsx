import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';

import { useLangStore } from '@/store/langStore';
import { useAuthStore } from '@/store/authStore';
import { type AnalysisReport } from '@/services/reportService';
import { reportsApi, findingsApi, type AnalysisFinding } from '@/api';
import type { ReviewStatus } from '@/api/models';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Textarea } from '@/components/ui/Textarea';
import { cn } from '@/utils/cn';
import toast from 'react-hot-toast';
import {
  ArrowLeft, RefreshCw, CheckCircle, ShieldAlert,
  AlertTriangle, XCircle, ChevronDown, ChevronUp, Loader2,
  CheckCircle2, Shield, FileDown,
} from 'lucide-react';

import { getPolicyArticles, getArticleDomainId, normalizeAtomId, atomIdNumeric } from '@/data/policyMap';

const policyArticles = getPolicyArticles().map((a) => ({
  id: a.articleId,
  domainId: getArticleDomainId(a.articleId),
  titleAr: a.title_ar,
  titleEn: `Article ${a.articleId}`,
}));

const domains = [
  { id: 'A', titleAr: 'المحور أ: العقيدة والسيادة', titleEn: 'Domain A: Faith & Sovereignty' },
  { id: 'B', titleAr: 'المحور ب: الحقوق والكرامة', titleEn: 'Domain B: Rights & Dignity' },
  { id: 'C', titleAr: 'المحور ج: القيم والأخلاق', titleEn: 'Domain C: Values & Ethics' },
  { id: 'D', titleAr: 'المحور د: المحظورات', titleEn: 'Domain D: Prohibitions' },
  { id: 'E', titleAr: 'المحور هـ: متنوعات', titleEn: 'Domain E: Miscellaneous' },
];

function articleDomain(articleId: number): string {
  return getArticleDomainId(articleId);
}

export function Results() {
  const { id: paramId } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { lang, t } = useLangStore();
  const { user } = useAuthStore();

  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [findings, setFindings] = useState<AnalysisFinding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedDomains, setExpandedDomains] = useState<Record<string, boolean>>({ A: true });
  const [expandedArticles, setExpandedArticles] = useState<Record<string, boolean>>({});
  const [reviewing, setReviewing] = useState(false);
  const [updateScriptStatus, setUpdateScriptStatus] = useState(false);

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
    } catch (err: any) { toast.error(err?.message ?? 'Failed'); }
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
          setLoading(false);
          if (r.jobId) loadFindings(r.jobId);
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message ?? (lang === 'ar' ? 'لم يتم العثور على التقرير' : 'Report not found'));
          setLoading(false);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [paramId, searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  // Finding-level review
  const handleFindingReview = async () => {
    if (!reviewModal) return;
    const reason = reviewReason.trim();
    if (!reason || reason.length < 2) {
      toast.error(lang === 'ar' ? 'يرجى إدخال سبب' : 'Please enter a reason');
      return;
    }
    try {
      const res = await findingsApi.reviewFinding(reviewModal.findingId, reviewModal.toStatus, reason) as any;
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
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed');
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
  const checklistMap = new Map(summary.checklist_articles.map(c => [c.article_id, c]));

  // Split real findings into violations vs approved for card rendering
  const hasRealFindings = findings.length > 0;
  const violations = hasRealFindings ? findings.filter(f => f.reviewStatus !== 'approved') : [];
  const approvedFindings = hasRealFindings ? findings.filter(f => f.reviewStatus === 'approved') : [];

  // Read persisted totals from report payload (updated by backend after each review).
  // These already exclude approved findings.
  const displayTotal = report.findingsCount ?? summary.totals.findings_count;
  const displaySc = report.severityCounts ?? summary.totals.severity_counts;
  const displayApproved = report.approvedCount ?? 0;

  const decision: 'PASS' | 'REJECT' | 'REVIEW_REQUIRED' =
    (displaySc.critical > 0 || displaySc.high > 0) ? 'REJECT' :
      displaySc.medium > 0 ? 'REVIEW_REQUIRED' : 'PASS';

  const decisionConfig = {
    PASS: { label: lang === 'ar' ? 'مقبول' : 'PASS', bg: 'bg-success/5', text: 'text-success', border: 'border-success/30', icon: CheckCircle },
    REJECT: { label: lang === 'ar' ? 'مرفوض' : 'REJECT', bg: 'bg-error/5', text: 'text-error', border: 'border-error/30', icon: XCircle },
    REVIEW_REQUIRED: { label: lang === 'ar' ? 'يتطلب مراجعة' : 'REVIEW REQUIRED', bg: 'bg-warning/5', text: 'text-warning', border: 'border-warning/30', icon: AlertTriangle },
  };
  const DecisionIcon = decisionConfig[decision].icon;

  const toggleDomain = (d: string) => setExpandedDomains(prev => ({ ...prev, [d]: !prev[d] }));
  const toggleArticle = (key: string) => setExpandedArticles(prev => ({ ...prev, [key]: !prev[key] }));



  // Prepare findings for PDF: use real findings if available, otherwise fallback to summary
  // PDF export now handled client-side with PDFDownloadLink (see render below)

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

      // Metadata from summary
      const sum = summary as any;
      const clientName = report.clientName || sum.client_name || sum.metadata?.client_name || (isAr ? 'عميل' : 'Client');
      const scriptTitle = report.scriptTitle || sum.script_title || sum.scriptTitle || (isAr ? 'تحليل النص' : 'Script Analysis');

      // Findings Grouping

      // Findings Grouping
      const findingList = hasRealFindings ? findings : (
        summary.findings_by_article.flatMap(art =>
          art.top_findings.map((f, i) => ({
            id: `sum-${i}`,
            articleId: art.article_id,
            titleAr: f.title_ar,
            severity: f.severity,
            confidence: f.confidence,
            evidenceSnippet: f.evidence_snippet,
            source: 'ai',
            reviewStatus: undefined,
          } as unknown as AnalysisFinding))
        )
      );

      // Group by Article
      const groups: Record<number, AnalysisFinding[]> = {};
      findingList.forEach(f => {
        if (!groups[f.articleId]) groups[f.articleId] = [];
        groups[f.articleId].push(f);
      });

      // HTML Group Data
      const groupedFindingsHtml = Object.entries(groups).map(([artId, list]) => {
        const artNum = Number(artId);
        const artMeta = policyArticles.find(a => a.id === artNum);

        return {
          articleTitle: isAr ? ` المادة ${artNum}: ${artMeta?.titleAr ?? ''}` : `Article ${artNum}`,
          count: list.length,
          findings: list.map(f => ({
            severity: f.severity.toLowerCase(),
            severityLabel: f.severity,
            title: isAr ? f.titleAr : f.titleAr, // Title is usually Ar only in data
            confidence: Math.round((f.confidence ?? 0) * 100),
            source: findingSourceLabel(f.source ?? 'ai'),
            lines: f.startLineChunk ? `${f.startLineChunk}${f.endLineChunk ? `-${f.endLineChunk}` : ''}` : '',
            evidence: f.evidenceSnippet,
            reviewStatus: f.reviewStatus,
            reviewStatusLabel: f.reviewStatus === 'approved' ? (isAr ? 'تم الاعتماد (آمن)' : 'Approved (Safe)') : (isAr ? 'مخالفة' : 'Violation'),
            isSafe: f.reviewStatus === 'approved',
            reviewedAt: f.reviewedAt ? new Date(f.reviewedAt).toLocaleDateString(isAr ? 'ar-SA' : 'en-GB') : ''
          }))
        };
      });

      // 3. Replacements
      let html = template;

      // Simple handlebar-like replacement for top-level vars
      const replacements: Record<string, string> = {
        '{{lang}}': isAr ? 'ar' : 'en',
        '{{dir}}': isAr ? 'rtl' : 'ltr',
        '{{scriptTitle}}': scriptTitle,
        '{{clientName}}': clientName,
        '{{formattedDate}}': new Date().toLocaleDateString(isAr ? 'ar-SA' : 'en-GB'),
        '{{generationTimestamp}}': new Date().toLocaleString(),
        '{{loginLogoBase64}}': loginLogo,
        '{{footerImageBase64}}': footerImg,
        '{{dashboardLogoBase64}}': dashLogo,

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
        '{{labels.status}}': isAr ? 'الحالة' : 'Status',
      };

      Object.entries(replacements).forEach(([key, val]) => {
        html = html.split(key).join(val);
      });

      // 4. render loops (Manual rudimentary implementation or use a lib if allowed. 
      // Since we don't have handlebars lib, we'll manual construct the findings HTML string and inject it)
      // Actually, to avoid complexity, let's just construct the 'groupedFindings' HTML section manually:

      const findingsHtmlStr = groupedFindingsHtml.map(g => `
        <div class="article-group">
            <div class="article-header">
                <span class="article-title">${g.articleTitle}</span>
                <span class="meta-chip">${g.count} ${replacements['{{labels.issues}}']}</span>
            </div>
            ${g.findings.map(f => `
            <div class="finding-card">
                <div class="card-header">
                    <span class="severity-badge sev-${f.severity}">${f.severityLabel}</span>
                    <span class="finding-title">${f.title}</span>
                </div>
                <div class="card-meta">
                    <span class="meta-chip">${replacements['{{labels.confidence}}']}: ${f.confidence}%</span>
                    <span class="meta-chip">${replacements['{{labels.source}}']}: ${f.source}</span>
                    ${f.lines ? `<span class="meta-chip">${replacements['{{labels.lines}}']}: ${f.lines}</span>` : ''}
                </div>
                <div class="evidence-box">"${f.evidence}"</div>
                ${f.reviewStatus ? `
                <div class="review-status">
                    ${replacements['{{labels.status}}']}: 
                    <span class="${f.isSafe ? 'status-safe' : 'status-violation'}">${f.reviewStatusLabel}</span>
                    ${f.reviewedAt ? `<span style="margin-inline-start: 10px;">(${f.reviewedAt})</span>` : ''}
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

  // const pdfFindings = ... (unused)

  // PDF export now handled client-side with PDFDownloadLink (see render below)

  const sevColor = (s: string) =>
    s === 'critical' ? 'bg-error/10 text-error border-error/20' :
      s === 'high' ? 'bg-error/5 text-error border-error/10' :
        s === 'medium' ? 'bg-warning/10 text-warning border-warning/20' :
          'bg-info/10 text-info border-info/20';

  // Group findings by article for rendering
  function groupByArticle(list: AnalysisFinding[]) {
    const map = new Map<number, AnalysisFinding[]>();
    for (const f of list) {
      if (!map.has(f.articleId)) map.set(f.articleId, []);
      map.get(f.articleId)!.push(f);
    }
    for (const arr of map.values()) {
      arr.sort(
        (a, b) =>
          atomIdNumeric(normalizeAtomId(a.atomId, a.articleId)) - atomIdNumeric(normalizeAtomId(b.atomId, b.articleId)) ||
          (a.startOffsetGlobal ?? 0) - (b.startOffsetGlobal ?? 0)
      );
    }
    return map;
  }

  // Render a finding card
  function findingSourceLabel(source: string): string {
    if (source === 'manual') return t('findingSourceManual');
    if (source === 'lexicon_mandatory') return t('findingSourceGlossary');
    return t('findingSourceAi');
  }

  function renderFindingCard(f: AnalysisFinding) {
    const isApproved = f.reviewStatus === 'approved';
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
        <div className={cn("p-3 rounded-md border text-sm text-text-main italic", isApproved ? "bg-success/5 border-success/10" : "bg-background/50 border-border/50")} dir="rtl">
          "{f.evidenceSnippet}"
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
            {f.reviewedAt && <span className="text-text-muted ms-2">({new Date(f.reviewedAt).toLocaleString()})</span>}
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
    const findingsByDomain = new Map<string, typeof summary.findings_by_article>();
    for (const art of summary.findings_by_article) {
      const dom = articleDomain(art.article_id);
      if (!findingsByDomain.has(dom)) findingsByDomain.set(dom, []);
      findingsByDomain.get(dom)!.push(art);
    }

    return domains.map(domain => {
      const domainArts = findingsByDomain.get(domain.id);
      if (!domainArts || domainArts.length === 0) return null;
      return (
        <div key={domain.id} className="mb-8">
          <h4 className="text-lg font-bold text-text-main mb-4 flex items-center gap-2">
            <span className="bg-primary/10 text-primary w-8 h-8 rounded-lg flex items-center justify-center">{domain.id}</span>
            {lang === 'ar' ? domain.titleAr : domain.titleEn}
          </h4>
          <div className="space-y-4 ps-4 lg:ps-10">
            {domainArts.map(art => {
              const artMeta = policyArticles.find(a => a.id === art.article_id);
              const key = `${domain.id}-${art.article_id}`;
              const isExpanded = expandedArticles[key] ?? true;
              return (
                <div key={art.article_id} className="border border-border rounded-xl bg-surface/50 overflow-hidden">
                  <button onClick={() => toggleArticle(key)} className="w-full flex items-center justify-between p-4 bg-surface hover:bg-background transition-colors border-b border-border">
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-text-main">{lang === 'ar' ? `مادة ${art.article_id}` : `Article ${art.article_id}`}</span>
                      <span className="text-text-muted text-sm truncate max-w-xs">{lang === 'ar' ? (artMeta?.titleAr ?? art.title_ar) : (artMeta?.titleEn ?? art.title_ar)}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant="outline">{art.top_findings.length}</Badge>
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-text-muted" /> : <ChevronDown className="w-4 h-4 text-text-muted" />}
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="p-4 space-y-3">
                      {art.top_findings.map((f, idx) => (
                        <div key={idx} className="bg-surface border border-border rounded-lg p-4">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-semibold text-text-main text-sm">{f.title_ar}</span>
                            <div className="flex items-center gap-2">
                              <Badge className={cn("text-[10px] border", sevColor(f.severity))}>{f.severity}</Badge>
                              <span className="text-[10px] text-text-muted">{lang === 'ar' ? 'ثقة' : 'conf'} {Math.round(f.confidence * 100)}%</span>
                            </div>
                          </div>
                          <div className="bg-background/50 p-3 rounded-md border border-border/50 text-sm text-text-main italic" dir="rtl">"{f.evidence_snippet}"</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      );
    });
  }

  function renderFindingsFromReal(list: AnalysisFinding[]) {
    const byArticle = groupByArticle(list);
    const policyOrder = policyArticles.map((a) => a.id);
    const byDomain = new Map<string, { articleId: number; findings: AnalysisFinding[] }[]>();
    for (const artId of policyOrder) {
      const artFindings = byArticle.get(artId);
      if (!artFindings?.length) continue;
      const dom = articleDomain(artId);
      if (!byDomain.has(dom)) byDomain.set(dom, []);
      byDomain.get(dom)!.push({ articleId: artId, findings: artFindings });
    }

    return domains.map(domain => {
      const domainArts = byDomain.get(domain.id);
      if (!domainArts || domainArts.length === 0) return null;
      return (
        <div key={domain.id} className="mb-8">
          <h4 className="text-lg font-bold text-text-main mb-4 flex items-center gap-2">
            <span className="bg-primary/10 text-primary w-8 h-8 rounded-lg flex items-center justify-center">{domain.id}</span>
            {lang === 'ar' ? domain.titleAr : domain.titleEn}
          </h4>
          <div className="space-y-4 ps-4 lg:ps-10">
            {domainArts.map(({ articleId, findings: artFindings }) => {
              const artMeta = policyArticles.find(a => a.id === articleId);
              const key = `${domain.id}-${articleId}`;
              const isExpanded = expandedArticles[key] ?? true;
              return (
                <div key={articleId} className="border border-border rounded-xl bg-surface/50 overflow-hidden">
                  <button onClick={() => toggleArticle(key)} className="w-full flex items-center justify-between p-4 bg-surface hover:bg-background transition-colors border-b border-border">
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-text-main">{lang === 'ar' ? `مادة ${articleId}` : `Article ${articleId}`}</span>
                      <span className="text-text-muted text-sm truncate max-w-xs">{lang === 'ar' ? artMeta?.titleAr : artMeta?.titleEn}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant="outline">{artFindings.length}</Badge>
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-text-muted" /> : <ChevronDown className="w-4 h-4 text-text-muted" />}
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="p-4 space-y-3">
                      {artFindings.map(f => renderFindingCard(f))}
                    </div>
                  )}
                </div>
              );
            })}
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
              {new Date(report.createdAt).toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 print:hidden">
          <Button variant="outline" onClick={() => { if (report.jobId) loadFindings(report.jobId); }} className="h-10 px-3">
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button onClick={generateHtmlPrint} variant="outline" className="h-10 px-4 flex gap-2">
            <FileDown className="w-4 h-4" />
            {lang === 'ar' ? 'تصدير PDF' : 'Export PDF'}
          </Button>
        </div>
      </div>

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
              {report.reviewedAt && <span className="text-xs text-text-muted ms-2">{new Date(report.reviewedAt).toLocaleString()}</span>}
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
              <div className="text-xs text-text-muted mb-1">{lang === 'ar' ? 'مخالفات' : 'Violations'}</div>
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
        {/* Checklist */}
        <div className="lg:col-span-4 space-y-4">
          <h3 className="font-bold text-lg text-text-main border-b border-border pb-2">
            {lang === 'ar' ? 'قائمة التحقق' : 'Compliance Checklist'}
          </h3>
          <div className="space-y-3">
            {domains.map(domain => {
              const domainArticles = policyArticles.filter(a => a.domainId === domain.id);
              const domainFindingsCount = domainArticles.reduce((sum, a) => {
                const cl = checklistMap.get(a.id);
                return sum + (cl ? (cl.counts.low ?? 0) + (cl.counts.medium ?? 0) + (cl.counts.high ?? 0) + (cl.counts.critical ?? 0) : 0);
              }, 0);
              const isExpanded = expandedDomains[domain.id];
              return (
                <div key={domain.id} className="bg-surface border border-border rounded-xl overflow-hidden shadow-sm">
                  <button onClick={() => toggleDomain(domain.id)} className="w-full flex items-center justify-between p-4 hover:bg-background transition-colors text-start">
                    <div className="flex items-center gap-3">
                      {domainFindingsCount > 0 ? <XCircle className="w-5 h-5 text-error" /> : <CheckCircle className="w-5 h-5 text-success" />}
                      <span className="font-semibold text-text-main text-sm">{lang === 'ar' ? domain.titleAr : domain.titleEn}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {domainFindingsCount > 0 && <Badge variant="error" className="text-xs">{domainFindingsCount}</Badge>}
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-text-muted" /> : <ChevronDown className="w-4 h-4 text-text-muted" />}
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="bg-background border-t border-border p-3 space-y-1">
                      {domainArticles.map(article => {
                        const cl = checklistMap.get(article.id);
                        const total = cl ? (cl.counts.low ?? 0) + (cl.counts.medium ?? 0) + (cl.counts.high ?? 0) + (cl.counts.critical ?? 0) : 0;
                        return (
                          <div key={article.id} className="flex justify-between items-center py-2 px-3 rounded-md hover:bg-surface text-sm">
                            <span className="text-text-main font-medium">
                              {lang === 'ar' ? `مادة ${article.id}: ${article.titleAr}` : `Art ${article.id}: ${article.titleEn}`}
                            </span>
                            {cl?.status === 'not_scanned' ? (
                              <Badge variant="outline" className="text-[10px] text-text-muted bg-background min-w-[70px] justify-center">{lang === 'ar' ? 'غير مفحوصة' : 'Not Scanned'}</Badge>
                            ) : total > 0 ? (
                              <Badge variant="error" className="h-5 px-1.5 min-w-[24px] justify-center">{total}</Badge>
                            ) : (
                              <CheckCircle className="w-4 h-4 text-success/60" />
                            )}
                          </div>
                        );
                      })}
                    </div>
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

          {(hasRealFindings ? violations.length === 0 : summary.findings_by_article.length === 0) ? (
            <div className="text-center py-16 bg-surface border-2 border-dashed border-border rounded-2xl">
              <CheckCircle className="w-12 h-12 text-success mx-auto mb-4 opacity-50" />
              <h4 className="text-lg font-bold text-text-main">{lang === 'ar' ? 'سجل نظيف' : 'Clean Log'}</h4>
              <p className="text-text-muted mt-2">{lang === 'ar' ? 'لا توجد مخالفات نشطة.' : 'No active violations.'}</p>
            </div>
          ) : hasRealFindings ? renderFindingsFromReal(violations) : renderFindingsFromSummary()}

          {/* Approved section */}
          {hasRealFindings && approvedFindings.length > 0 && (
            <>
              <h3 className="font-bold text-xl text-text-main border-b border-success/30 pb-2 flex items-center gap-2 mt-12">
                <Shield className="w-5 h-5 text-success" />
                {lang === 'ar' ? 'معتمد كآمن' : 'Approved as Safe'}
                <Badge className="ms-2 text-[10px] bg-success/10 text-success border-success/20 border">{approvedFindings.length}</Badge>
              </h3>
              {renderFindingsFromReal(approvedFindings)}
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
              disabled={!reviewReason.trim()}
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
