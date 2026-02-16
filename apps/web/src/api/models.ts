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
  created_by: string;
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
