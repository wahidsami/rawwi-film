export enum Role {
  SuperAdmin = 'Super Admin',
  Admin = 'Admin',
  Regulator = 'Regulator'
}

export enum ScriptStatus {
  Draft = 'Draft',
  InReview = 'In Review',
  Approved = 'Approved',
  Rejected = 'Rejected'
}

export enum FindingSeverity {
  Low = 'Low',
  Medium = 'Medium',
  High = 'High',
  Critical = 'Critical'
}

export enum OverrideEventType {
  NotViolation = 'not_violation',
  HiddenFromOwner = 'hidden_from_owner'
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role | string;
  permissions: string[];
}

export interface Company {
  companyId: string;
  nameAr: string;
  nameEn: string;
  representativeName: string;
  representativeTitle?: string | null;
  email: string;
  phone?: string;
  /** Backend returns mobile; normalized to phone in some flows. */
  mobile?: string;
  createdAt: string;
  scriptsCount: number;
  /** Optional logo URL from storage. Prefer over avatarUrl. */
  logoUrl?: string | null;
  /** @deprecated Prefer logoUrl. Optional so no placeholder URL is required. */
  avatarUrl?: string | null;
  /** NEW: User ID who created this client (for ownership tracking) */
  created_by?: string | null;
}

export interface ScriptVersion {
  id: string;
  scriptId: string;
  versionNumber: number;
  source_file_name?: string;
  source_file_type?: string;
  source_file_size?: number;
  source_file_url?: string;
  extracted_text?: string;
  extraction_status: 'pending' | 'extracting' | 'done' | 'failed';
  createdAt: string;
}

export interface Script {
  id: string;
  companyId: string;
  title: string;
  type: 'Film' | 'Series';
  synopsis?: string;
  fileUrl?: string;
  status: ScriptStatus | string;
  createdAt: string;
  assigneeId?: string;
  /** Assignee display name (from profiles), when available */
  assigneeName?: string;
  created_by?: string;
  currentVersionId?: string;
  isQuickAnalysis?: boolean;
}

/** Assignment task (script assigned to user for review) — used by addTask / legacy UI. */
export interface Task {
  id: string;
  scriptId: string;
  companyName: string;
  scriptTitle: string;
  status: string;
  assignedBy: string;
  assignedTo: string;
  assignedAt: string;
}

/** Analysis job from GET /tasks — for progress UI and canonical hash check. */
export interface AnalysisJob {
  id: string;
  scriptId: string;
  versionId: string;
  status: string;
  progressTotal: number;
  progressDone: number;
  progressPercent: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  pausedAt?: string | null;
  partialFinalizeRequestedAt?: string | null;
  isPartialReport?: boolean;
  errorMessage: string | null;
  /** Hash of canonical text used for this job; must match editor content to highlight. */
  scriptContentHash?: string | null;
  canonicalLength?: number | null;
}

/** Per-chunk status from GET /tasks?jobId=...&chunks=true — for debug view. */
export interface ChunkStatus {
  chunkIndex: number;
  status: string;
  lastError: string | null;
  pageNumberMin?: number | null;
  pageNumberMax?: number | null;
  /** Coarse worker stage: router, multipass, hybrid, aggregating, cached */
  processingPhase?: string | null;
  passesCompleted?: number | null;
  passesTotal?: number | null;
  /** Short excerpt; prefer when status is judging */
  textPreview?: string | null;
}

export interface Finding {
  id: string;
  scriptId: string;
  source: 'manual' | 'ai' | 'lexicon_mandatory';
  excerpt: string;
  evidenceSnippet?: string;
  startOffsetGlobal?: number;
  endOffsetGlobal?: number;
  anchorHash?: string;
  location?: { page?: number; scene?: number; lineChunk?: string };
  /** Script page (1-based) when script_pages exist */
  pageNumber?: number | null;
  articleId: string;
  subAtomId?: string;
  domainId?: 'A' | 'B' | 'C' | 'D' | 'E';
  titleAr?: string;
  titleEn?: string;
  descriptionAr?: string;
  descriptionEn?: string;
  confidence?: number;
  severity: FindingSeverity | string;
  status: 'open' | 'accepted' | 'confirmed';
  override?: {
    eventType: OverrideEventType | string;
    reason: string;
    createdAt: string;
    byUser: string;
  };
  comments: { author: string; text: string; timestamp: string }[];
}

export interface LexiconTerm {
  id: string;
  term: string;
  normalized_term: string;
  term_type: 'word' | 'phrase' | 'regex';
  category: 'profanity' | 'sexual' | 'violence' | 'drugs' | 'gambling' | 'blasphemy' | 'discrimination' | 'misogyny' | 'humiliation' | 'threat' | 'other';
  severity_floor: FindingSeverity | string;
  suggested_severity?: FindingSeverity | string;
  enforcement_mode: 'soft_signal' | 'mandatory_finding';
  gcam_article_id: number;
  gcam_atom_id?: string;
  gcam_article_title_ar?: string;
  description?: string;
  example_usage?: string;
  /** Conjugations/forms (e.g. يضرب، تضرب for ضرب). All matched during analysis. */
  term_variants?: string[];
  created_by: string;
  /** Display name of user who added the term (from API). */
  created_by_name?: string | null;
  created_at: string;
  updated_at: string;
  is_active: boolean;
}

export interface LexiconHistoryEntry {
  id: string;
  lexicon_id: string;
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  old_data?: any;
  new_data?: any;
  changed_by: string;
  changed_at: string;
  change_reason?: string;
}

export type ReviewStatus = 'under_review' | 'approved' | 'rejected';

/** Response from POST /findings/review (finding-level review). */
export interface FindingReviewResponse {
  ok: boolean;
  reportAggregates?: {
    findingsCount: number;
    severityCounts: { low: number; medium: number; high: number; critical: number };
    approvedCount: number;
    rejectedCount?: number;
  };
}

/** Light item returned by GET /reports?scriptId=... (list). */
export interface ReportListItem {
  id: string;
  jobId: string;
  scriptId: string;
  versionId: string | null;
  findingsCount: number;
  severityCounts: { low: number; medium: number; high: number; critical: number };
  approvedCount: number;
  rejectedCount?: number;
  totalFindings?: number;
  createdAt: string;
  createdBy: string | null;
  reviewStatus: ReviewStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNotes?: string | null;
  lastReviewedAt: string | null;
  lastReviewedBy: string | null;
  lastReviewedRole: string | null;
  scriptTitle?: string;
  clientName?: string;
  companyId?: string;
  companyNameAr?: string;
  companyNameEn?: string;
  scriptOwnerId?: string; //For approval permissions
  reportCreatorId?: string; // For admin filtering
  reportCreatorName?: string; // For admin filtering
}

/** Full report returned by GET /reports?jobId=... or GET /reports?id=... */
export interface Report {
  id: string;
  jobId: string;
  scriptId: string;
  versionId: string | null;
  summaryJson: {
    job_id: string;
    script_id: string;
    generated_at: string;
    totals: {
      findings_count: number;
      severity_counts: { low: number; medium: number; high: number; critical: number };
    };
    checklist_articles: Array<{
      article_id: number;
      title_ar: string;
      status: 'ok' | 'not_scanned' | 'warning' | 'fail';
      counts: Record<string, number>;
      triggered_atoms: string[];
    }>;
    findings_by_article: Array<{
      article_id: number;
      title_ar: string;
      counts: Record<string, number>;
      triggered_atoms: string[];
      top_findings: Array<{
        atom_id: string | null;
        title_ar: string;
        severity: string;
        confidence: number;
        evidence_snippet: string;
        location: Record<string, unknown>;
        start_offset_global?: number | null;
        end_offset_global?: number | null;
        start_line_chunk?: number | null;
        end_line_chunk?: number | null;
        is_interpretive?: boolean;
      }>;
    }>;
    canonical_findings?: Array<{
      canonical_finding_id: string;
      title_ar: string;
      evidence_snippet: string;
      severity: string;
      confidence: number;
      final_ruling?: string | null;
      rationale?: string | null;
      pillar_id?: string | null;
      primary_article_id?: number | null;
      related_article_ids?: number[];
      policy_links?: Array<{ article_id: number; atom_concept_id?: string | null; role?: string | null }>;
      start_offset_global?: number | null;
      end_offset_global?: number | null;
      start_line_chunk?: number | null;
      end_line_chunk?: number | null;
      /** PolicyMap key e.g. 4-1 when primary DB finding had atom_id. */
      primary_policy_atom_id?: string | null;
      /** Finding source for badge: lexicon_mandatory = glossary DB row */
      source?: 'ai' | 'lexicon_mandatory' | 'manual';
    }>;
    context_metrics?: {
      context_ok_count: number;
      needs_review_count: number;
      violation_count: number;
    };
    script_summary?: {
      synopsis_ar: string;
      key_risky_events_ar?: string;
      narrative_stance_ar?: string;
      compliance_posture_ar?: string;
      confidence: number;
    };
    /** Findings where rationale says "not a violation" — show as تنبيهات/ملاحظات للمخرج. */
    report_hints?: Array<{
      canonical_finding_id: string;
      title_ar: string;
      evidence_snippet: string;
      severity: string;
      confidence: number;
      final_ruling?: string | null;
      rationale?: string | null;
      pillar_id?: string | null;
      primary_article_id?: number | null;
      related_article_ids?: number[];
      start_offset_global?: number | null;
      end_offset_global?: number | null;
      start_line_chunk?: number | null;
      end_line_chunk?: number | null;
    }>;
    /** Words/phrases from glossary that appeared in script — for "كلمات/عبارات للمراجعة" only. */
    words_to_revisit?: Array<{
      term: string;
      snippet: string;
      start_offset: number;
      end_offset: number;
    }>;
    partial_report?: {
      is_partial: boolean;
      processed_chunks: number;
      total_chunks: number;
      pending_chunks: number;
      failed_chunks: number;
      stopped_at?: string | null;
    };
  };
  reportHtml: string;
  findingsCount: number;
  severityCounts: { low: number; medium: number; high: number; critical: number };
  approvedCount: number;
  createdAt: string;
  reviewStatus: ReviewStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  lastReviewedAt: string | null;
  lastReviewedBy: string | null;
  lastReviewedRole: string | null;
  scriptTitle?: string;
  clientName?: string;
}
