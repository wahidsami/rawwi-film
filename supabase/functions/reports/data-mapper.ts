/**
 * Data Mapper Service
 * 
 * Transforms database report data into template-ready format
 */

import type { TemplateData } from "./pdf-renderer.ts";

interface Report {
  summary_json: any;
  severity_counts: any;
  created_at: string;
}

interface Finding {
  id: string;
  article_id: number;
  title_ar: string;
  severity: string;
  confidence: number;
  evidence_snippet: string;
  source?: string;
  start_line_chunk?: number;
  end_line_chunk?: number;
  review_status?: string;
  reviewed_at?: string;
}

/**
 * Helper to get finding source label
 */
function getFindingSourceLabel(source: string | undefined, lang: 'en' | 'ar'): string {
  const labels: Record<string, { en: string; ar: string }> = {
    ai: { en: 'AI', ar: 'الذكاء الاصطناعي' },
    manual: { en: 'Manual', ar: 'يدوي' },
    lexicon: { en: 'Lexicon', ar: 'المعجم' },
  };
  const key = source?.toLowerCase() ?? 'ai';
  return labels[key]?.[lang] ?? (lang === 'ar' ? 'آخر' : 'Other');
}

/**
 * Prepares report data for PDF template injection
 * 
 * @param report - Report record from database
 * @param findings - Array of findings for this report
 * @param lang - Language code ('en' or 'ar')
 * @returns Template-ready data object
 */
export async function prepareReportData(
  report: Report,
  findings: Finding[],
  lang: 'en' | 'ar'
): Promise<TemplateData> {
  const isAr = lang === 'ar';
  
  // Extract script title from summary JSON
  const scriptTitle = report.summary_json?.scriptTitle ?? 
                     report.summary_json?.script_title ?? 
                     (isAr ? 'تحليل النص' : 'Script Analysis');
  
  // Format date
  const formattedDate = new Date(report.created_at).toLocaleDateString(
    isAr ? 'ar-SA' : 'en-GB',
    { year: 'numeric', month: 'long', day: 'numeric' }
  );
  
  // Group findings by article ID
  const grouped = findings.reduce((acc, f) => {
    if (!acc[f.article_id]) acc[f.article_id] = [];
    acc[f.article_id].push(f);
    return acc;
  }, {} as Record<number, Finding[]>);
  
  // Generate findings HTML
  const findingsHtml = Object.entries(grouped)
    .sort(([a], [b]) => Number(a) - Number(b)) // Sort by article ID
    .map(([artId, list]) => {
      const articleTitle = isAr ? `المادة ${artId}` : `Article ${artId}`;
      const issuesLabel = isAr ? 'قضايا' : 'Issues';
      
      return `
        <div class="article-group">
          <div class="article-header">
            <span class="article-title">${articleTitle}</span>
            <span class="meta-chip">${list.length} ${issuesLabel}</span>
          </div>
          ${list.map(f => {
            const confidence = Math.round((f.confidence ?? 0) * 100);
            const sourceLabel = getFindingSourceLabel(f.source, lang);
            const linesLabel = isAr ? 'الأسطر' : 'Lines';
            const confLabel = isAr ? 'ثقة' : 'Conf';
            const statusLabel = isAr ? 'الحالة' : 'Status';
            
            const lines = f.start_line_chunk 
              ? `${f.start_line_chunk}${f.end_line_chunk ? `-${f.end_line_chunk}` : ''}`
              : '';
            
            const reviewStatusHtml = f.review_status ? `
              <div class="review-status">
                ${statusLabel}: 
                <span class="${f.review_status === 'approved' ? 'status-safe' : 'status-violation'}">
                  ${f.review_status === 'approved' 
                    ? (isAr ? 'تم الاعتماد (آمن)' : 'Approved (Safe)') 
                    : (isAr ? 'مخالفة' : 'Violation')}
                </span>
                ${f.reviewed_at ? `<span style="margin-inline-start: 10px;">(${new Date(f.reviewed_at).toLocaleDateString(isAr ? 'ar-SA' : 'en-GB')})</span>` : ''}
              </div>
            ` : '';
            
            return `
              <div class="finding-card">
                <div class="card-header">
                  <span class="severity-badge sev-${f.severity.toLowerCase()}">${f.severity}</span>
                  <span class="finding-title">${f.title_ar}</span>
                </div>
                <div class="card-meta">
                  <span class="meta-chip">${confLabel}: ${confidence}%</span>
                  <span class="meta-chip">${sourceLabel}</span>
                  ${lines ? `<span class="meta-chip">${linesLabel}: ${lines}</span>` : ''}
                </div>
                <div class="evidence-box">"${f.evidence_snippet}"</div>
                ${reviewStatusHtml}
              </div>
            `;
          }).join('')}
        </div>
      `;
    }).join('');
  
  // Prepare labels
  const labels = {
    reportTitle: isAr ? 'تقرير التحليل' : 'Analysis Report',
    client: isAr ? 'العميل' : 'Client',
    date: isAr ? 'التاريخ' : 'Date',
    executiveSummary: isAr ? 'ملخص التقرير' : 'Executive Summary',
    critical: isAr ? 'حرجة' : 'Critical',
    high: isAr ? 'عالية' : 'High',
    medium: isAr ? 'متوسطة' : 'Medium',
    low: isAr ? 'منخفضة' : 'Low',
    findingsDetails: isAr ? 'تفاصيل القضايا' : 'Findings Details',
    issues: isAr ? 'قضايا' : 'Issues',
    confidence: isAr ? 'ثقة' : 'Conf',
    source: isAr ? 'المصدر' : 'Source',
    lines: isAr ? 'الأسطر' : 'Lines',
    status: isAr ? 'الحالة' : 'Status',
  };
  
  return {
    scriptTitle,
    clientName: 'Client Name', // TODO: Fetch from scripts table or clients table
    formattedDate,
    stats: {
      critical: report.severity_counts?.critical ?? 0,
      high: report.severity_counts?.high ?? 0,
      medium: report.severity_counts?.medium ?? 0,
      low: report.severity_counts?.low ?? 0,
    },
    labels,
    lang,
    dir: isAr ? 'rtl' : 'ltr',
    findingsHtml,
  };
}
