import { httpClient, USE_MOCK_API, API_BASE_URL } from './httpClient';
import { prepareUnicodeForExtractTransport } from '@/utils/extractUnicode';
import { Company, Script, ScriptVersion, Task, AnalysisJob, ChunkStatus, Finding, LexiconTerm, LexiconHistoryEntry, Report, ReportListItem, FindingReviewResponse, AnalysisModeProfile } from './models';
import { supabase } from '@/lib/supabaseClient';

/** Response from GET /me: current user with permissions from RBAC. */
export interface MeResponse {
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    permissions: string[];
    allowedSections?: string[]; // NEW: Section-based permissions
  };
}

export const authApi = {
  login: (email: string, password: string) => httpClient.post('/auth/login', { email, password }),
  /** Current user profile + permissions from RBAC tables. Requires auth. */
  getMe: (): Promise<MeResponse> => httpClient.get('/me'),
};

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body?: string;
  metadata: Record<string, unknown>;
  readAt?: string;
  createdAt: string;
}

export const notificationsApi = {
  getList: (): Promise<{ data: NotificationItem[]; unreadCount: number }> =>
    httpClient.get('/notifications'),
  getUnreadCount: (): Promise<{ unreadCount: number }> =>
    httpClient.get('/notifications/count'),
  markRead: (id: string): Promise<{ ok: boolean }> =>
    httpClient.patch(`/notifications/${encodeURIComponent(id)}/read`, {}),
  markAllRead: (): Promise<{ ok: boolean }> =>
    httpClient.post('/notifications/read-all', {}),
};

export const companiesApi = {
  getCompanies: (): Promise<Company[]> => httpClient.get('/companies'),
  addCompany: (company: Company): Promise<Company> => httpClient.post('/companies', company),
  updateCompany: (id: string, updates: Partial<Company>): Promise<Company> => httpClient.put(`/companies/${id}`, updates),
  deleteCompany: (id: string): Promise<{ ok: boolean }> => httpClient.delete(`/companies/${id}`),
  /** Upload logo for company (multipart). Returns updated company. */
  uploadCompanyLogo: async (companyId: string, file: File): Promise<Company> => {
    const form = new FormData();
    form.append('file', file);
    if (USE_MOCK_API) {
      return httpClient.request(`/companies/${companyId}/logo`, { method: 'POST', body: form });
    }
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) throw new Error('Unauthorized');
    const res = await fetch(`${API_BASE_URL}/companies/${companyId}/logo`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || res.statusText);
    }
    return res.json();
  },
  /** Remove company logo. Returns updated company. */
  removeCompanyLogo: (companyId: string): Promise<Company> => httpClient.delete(`/companies/${companyId}/logo`),
};

export type UploadUrlResponse = { url: string; path?: string };

export const scriptsApi = {
  getScripts: (): Promise<Script[]> => httpClient.get('/scripts'),
  getQuickScripts: (): Promise<Script[]> => httpClient.get('/scripts/quick'),
  createQuickScript: (body?: { title?: string; synopsis?: string; type?: 'Film' | 'Series' | 'film' | 'series'; status?: string }): Promise<Script> =>
    httpClient.post('/scripts/quick', body ?? {}),
  getScript: (id: string): Promise<Script> => httpClient.get(`/scripts/${encodeURIComponent(id)}`),
  addScript: (script: Script): Promise<Script> => httpClient.post('/scripts', script),
  updateScript: (id: string, updates: Partial<Script>): Promise<Script> => httpClient.patch(`/scripts/${encodeURIComponent(id)}`, updates), // NEW
  /** Check if current user can approve/reject this script (backend policy). Use to gate UI. */
  getDecisionCan: (id: string): Promise<{ canApprove: boolean; canReject: boolean; reason?: string }> =>
    httpClient.get(`/scripts/${encodeURIComponent(id)}/decision/can`),
  /** Make approval/rejection decision on a script */
  makeDecision: (id: string, decision: 'approve' | 'reject', reason: string, relatedReportId?: string): Promise<{ success: boolean; script: Script; message: string }> =>
    httpClient.post(`/scripts/${encodeURIComponent(id)}/decision`, { decision, reason, relatedReportId }),
  getScriptVersions: (scriptId: string, options?: { signal?: AbortSignal }): Promise<ScriptVersion[]> =>
    httpClient.get(`/scripts/${encodeURIComponent(scriptId)}/versions`, { signal: options?.signal }),
  createVersion: (scriptId: string, versionData: any, options?: { signal?: AbortSignal }): Promise<any> =>
    httpClient.post('/scripts/versions', { ...versionData, scriptId }, { signal: options?.signal }),
  /** Get signed upload URL; returns { url, path? }. */
  getUploadUrl: (fileName: string, options?: { signal?: AbortSignal }): Promise<UploadUrlResponse> =>
    httpClient.post('/upload', { fileName }, { signal: options?.signal }),
  /** Upload file bytes to the signed URL (no auth). */
  uploadToSignedUrl: async (file: File, signedUrl: string, options?: { signal?: AbortSignal }): Promise<void> => {
    const res = await fetch(signedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
      signal: options?.signal,
    });
    if (!res.ok) throw new Error(res.statusText || 'Upload failed');
  },
  /** Delete a script by id. */
  deleteScript: (id: string): Promise<{ ok: boolean }> => httpClient.delete(`/scripts/${encodeURIComponent(id)}`),
  uploadFile: (file: File): Promise<any> => httpClient.post('/upload', { fileName: file.name }),
  extractText: (
    versionId: string,
    text?: string,
    options?: {
      enqueueAnalysis?: boolean;
      contentHtml?: string | null;
      pages?: Array<{ pageNumber: number; text: string; html?: string | null; displayFontStack?: string }>;
      signal?: AbortSignal;
    }
  ): Promise<any> => {
    // Unicode: NFC + well-formed UTF-16 + C0 strip (see docs/UNICODE_EXTRACT_PIPELINE.md).
    // PDFs can also break JSON: backslash + u that isn't \uXXXX — escape backslashes last.
    const safe = (s: string) =>
      prepareUnicodeForExtractTransport(String(s)).replace(/\\/g, '\\u005C');
    const body: Record<string, unknown> = {
      versionId,
      ...(options?.enqueueAnalysis !== undefined && { enqueueAnalysis: options.enqueueAnalysis }),
    };
    if (text !== undefined && text !== null) body.text = safe(String(text));
    if (options?.contentHtml !== undefined && options?.contentHtml !== null) body.contentHtml = safe(String(options.contentHtml));
    if (options?.pages != null && options.pages.length > 0) {
      body.pages = options.pages.map((p) => ({
        pageNumber: p.pageNumber,
        text: safe(p.text),
        ...(p.html != null && p.html !== "" && { html: safe(p.html) }),
        ...(typeof p.displayFontStack === 'string' &&
          p.displayFontStack.trim() && {
            displayFontStack: p.displayFontStack.trim().slice(0, 480),
          }),
      }));
    }
    return httpClient.post('/extract', body, { signal: options?.signal });
  },
  cancelVersionExtraction: (versionId: string): Promise<ScriptVersion> =>
    httpClient.patch('/extract', { versionId, action: 'cancel' }),
  /** Queue analysis for a version (creates new analysis_jobs + chunks). POST /tasks */
  createTask: (
    versionId: string,
    options?: {
      forceFresh?: boolean;
      analysisProfile?: AnalysisModeProfile;
      analysisOptions?: { mergeStrategy?: 'same_location_only' | 'every_occurrence' };
    }
  ): Promise<{ jobId: string; manualReviewContextCount?: number }> =>
    httpClient.post('/tasks', {
      versionId,
      ...(options?.forceFresh ? { forceFresh: true } : {}),
      ...(options?.analysisProfile ? { analysisProfile: options.analysisProfile } : {}),
      ...(options?.analysisOptions ? { analysisOptions: options.analysisOptions } : {}),
    }),
  /** Get editor content and sections for a version. GET /scripts/editor?scriptId=...&versionId=... */
  getEditor: (scriptId: string, versionId: string): Promise<EditorContentResponse> =>
    httpClient.get(`/scripts/editor?scriptId=${encodeURIComponent(scriptId)}&versionId=${encodeURIComponent(versionId)}`),
  /** Check whether another version already has the exact same canonical content. */
  getDuplicateScripts: (versionId: string): Promise<DuplicateScriptCheckResponse> =>
    httpClient.get(`/scripts/duplicates?versionId=${encodeURIComponent(versionId)}`),
  /** Get saved highlight report (job) for script. Returns { jobId: string | null }. */
  getHighlightPreference: (scriptId: string): Promise<{ jobId: string | null }> =>
    httpClient.get(`/scripts/highlight-preference?scriptId=${encodeURIComponent(scriptId)}`),
  /** Save which report (job) to use for highlights for this script (persists across sessions). */
  setHighlightPreference: (scriptId: string, jobId: string): Promise<{ jobId: string }> =>
    httpClient.put('/scripts/highlight-preference', { scriptId, jobId }),
};

export interface EditorSectionResponse {
  id: string;
  index: number;
  title: string;
  startOffset: number;
  endOffset: number;
  meta: Record<string, unknown>;
}

export interface EditorPageResponse {
  pageNumber: number;
  content: string;
  contentHtml?: string | null;
  startOffsetGlobal: number;
  /** CSS font-family stack from PDF import (pdf.js fontName → web stack); null = Cairo default. */
  displayFontStack?: string | null;
  /** Extraction/display metadata for this page (OCR, quality flags, future editorial annotations). */
  meta?: Record<string, unknown>;
}

export interface EditorContentResponse {
  content: string;
  /** Hash of content (script_text.content_hash) for offset-canonical checks. */
  contentHash?: string | null;
  /** Optional HTML from DOCX for formatted view; offsets refer to content. */
  contentHtml?: string | null;
  sections: EditorSectionResponse[];
  /** When present, script is stored per-page; use for page-based workspace view. */
  pages?: EditorPageResponse[];
  /** Time-limited URL to original PDF (page N matches viewer page N). */
  sourcePdfSignedUrl?: string | null;
}

export interface DuplicateScriptMatch {
  scriptId: string;
  versionId: string;
  versionNumber: number;
  scriptTitle: string;
  scriptStatus: string;
  sourceFileName?: string | null;
  createdAt: string;
  companyName?: string | null;
  sameScript: boolean;
  isCurrentVersion: boolean;
  analyzedBefore: boolean;
  latestAnalysisAt?: string | null;
  latestReviewerName?: string | null;
}

export interface DuplicateScriptCheckResponse {
  exactMatch: boolean;
  contentHash?: string | null;
  duplicateCount: number;
  matches: DuplicateScriptMatch[];
}

export type GetTasksParams = { scriptId?: string; versionId?: string; limit?: number };

async function controlAnalysisJob(jobId: string, action: 'pause' | 'resume' | 'stop' | 'cancel'): Promise<AnalysisJob> {
  try {
    // Prefer POST for job control because Supabase Edge deployments have shown
    // more reliable request-body handling on POST than PATCH in production.
    return await httpClient.post('/tasks', { jobId, action });
  } catch (error) {
    const status = (error as Error & { status?: number } | null)?.status;
    if (status === 405 || status === 404) {
      return httpClient.patch('/tasks', { jobId, action });
    }
    throw error;
  }
}

export const tasksApi = {
  /** List analysis jobs (GET /tasks). Optional filters; limit default 20, max 100. */
  getTasks: (params?: GetTasksParams): Promise<AnalysisJob[]> => {
    const search = new URLSearchParams();
    if (params?.scriptId) search.set('scriptId', params.scriptId);
    if (params?.versionId) search.set('versionId', params.versionId);
    if (params?.limit != null) search.set('limit', String(params.limit));
    const qs = search.toString();
    return httpClient.get(qs ? `/tasks?${qs}` : '/tasks');
  },
  /** Get a single analysis job by ID. */
  getJob: (jobId: string): Promise<AnalysisJob> => httpClient.get(`/tasks?jobId=${encodeURIComponent(jobId)}`),
  /** Get per-chunk statuses for a job (debug). */
  getJobChunks: (jobId: string): Promise<ChunkStatus[]> => httpClient.get(`/tasks?jobId=${encodeURIComponent(jobId)}&chunks=true`),
  pauseJob: (jobId: string): Promise<AnalysisJob> => controlAnalysisJob(jobId, 'pause'),
  resumeJob: (jobId: string): Promise<AnalysisJob> => controlAnalysisJob(jobId, 'resume'),
  stopJob: (jobId: string): Promise<AnalysisJob> => controlAnalysisJob(jobId, 'stop'),
  cancelJob: (jobId: string): Promise<AnalysisJob> => controlAnalysisJob(jobId, 'cancel'),
  addTask: (task: Task): Promise<Task> => httpClient.post('/tasks', task),
};

/** Shape returned by GET /findings?jobId=... or ?reportId=... */
export interface AnalysisFinding {
  id: string;
  jobId: string;
  scriptId: string;
  versionId: string;
  source: string;
  articleId: number;
  atomId: string | null;
  severity: string;
  confidence: number;
  titleAr: string;
  descriptionAr: string;
  rationaleAr?: string | null;
  evidenceSnippet: string;
  startOffsetGlobal: number | null;
  endOffsetGlobal: number | null;
  startLineChunk: number | null;
  endLineChunk: number | null;
  pageNumber?: number | null;
  /** Offsets within script_pages.content for page_number (when set). */
  startOffsetPage?: number | null;
  endOffsetPage?: number | null;
  location: Record<string, unknown>;
  createdAt: string;
  reviewStatus: 'violation' | 'approved';
  reviewReason: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewedRole: string | null;
  createdBy?: string | null;
  manualComment?: string | null;
}

export interface CreateManualFindingBody {
  reportId: string;
  scriptId: string;
  versionId: string;
  startOffsetGlobal: number;
  endOffsetGlobal: number;
  articleId: number;
  atomId?: string | null;
  severity: string;
  manualComment?: string;
}

export interface ManualFindingResponse extends AnalysisFinding {
  atomMappingWarning?: string | null;
}

export interface ReclassifyFindingBody {
  findingId: string;
  articleId: number;
  atomId?: string | null;
  severity: string;
  manualComment?: string | null;
}

export interface ReclassifyFindingResponse {
  ok: true;
  finding?: AnalysisFinding;
  atomMappingWarning?: string | null;
  reportAggregates?: FindingReviewResponse['reportAggregates'];
}

export const findingsApi = {
  getFindings: (): Promise<Finding[]> => httpClient.get('/findings'),
  /** List findings for a specific job (with review status). */
  getByJob: (jobId: string): Promise<AnalysisFinding[]> => httpClient.get(`/findings?jobId=${encodeURIComponent(jobId)}`),
  /** List findings for a report (resolves report id to job). */
  getByReport: (reportId: string): Promise<AnalysisFinding[]> => httpClient.get(`/findings?reportId=${encodeURIComponent(reportId)}`),
  addFinding: (finding: Finding): Promise<Finding> => httpClient.post('/findings', finding),
  updateFindingStatus: (id: string, status: string, comment?: string, author?: string) =>
    httpClient.put(`/findings/${id}`, { status, comment, author }),
  updateFindingOverride: (id: string, override: any) =>
    httpClient.put(`/findings/${id}`, { override }),
  /** Approve (mark safe) or revert a finding. */
  reviewFinding: (findingId: string, toStatus: 'approved' | 'violation', reason: string): Promise<FindingReviewResponse> =>
    httpClient.post('/findings/review', { findingId, toStatus, reason }),
  reclassifyFinding: (body: ReclassifyFindingBody): Promise<ReclassifyFindingResponse> =>
    httpClient.post('/findings/reclassify', body),
  /** Create a manual finding (POST /findings/manual). */
  createManual: (body: CreateManualFindingBody): Promise<ManualFindingResponse> =>
    httpClient.post('/findings/manual', body),
};

export const lexiconApi = {
  getTerms: (): Promise<LexiconTerm[]> => httpClient.get('/lexicon/terms'),
  addTerm: (term: LexiconTerm): Promise<LexiconTerm> => httpClient.post('/lexicon/terms', term),
  updateTerm: (id: string, updates: Partial<LexiconTerm>, changedBy: string, reason?: string) =>
    httpClient.put(`/lexicon/terms/${id}`, { ...updates, changed_by: changedBy, change_reason: reason }),
  deactivateTerm: (id: string, changedBy: string, reason?: string) =>
    httpClient.put(`/lexicon/terms/${id}`, { is_active: false, changed_by: changedBy, change_reason: reason }),
  getHistory: (id: string): Promise<LexiconHistoryEntry[]> => httpClient.get(`/lexicon/history/${id}`),
  /** Generate Arabic conjugations/forms for a term (AI). Returns variants to store as term_variants. */
  generateConjugations: (term: string): Promise<{ variants: string[] }> =>
    httpClient.post('/lexicon/generate-conjugations', { term }),
};

export const reportsApi = {
  /** List ALL reports visible to current user (RLS-filtered: users see own reports, admins see all). */
  listAll: (): Promise<ReportListItem[]> => httpClient.get('/reports'),
  /** List reports for a script (newest first). */
  listByScript: (scriptId: string): Promise<ReportListItem[]> => httpClient.get(`/reports?scriptId=${encodeURIComponent(scriptId)}`),
  /** Get full report by report id. */
  getById: (id: string): Promise<Report> => httpClient.get(`/reports?id=${encodeURIComponent(id)}`),
  /** Get full report by job id. */
  getByJob: (jobId: string): Promise<Report> => httpClient.get(`/reports?jobId=${encodeURIComponent(jobId)}`),
  /** Update review status on a report. If updateScriptStatus is true, also updates parent script status. */
  review: (id: string, reviewStatus: string, reviewNotes?: string, updateScriptStatus?: boolean): Promise<{ ok: boolean }> =>
    httpClient.post('/reports', { id, review_status: reviewStatus, review_notes: reviewNotes ?? '', update_script_status: updateScriptStatus }),
  /** Delete a report by id. */
  deleteReport: (id: string): Promise<{ ok: boolean }> => httpClient.delete(`/reports?id=${encodeURIComponent(id)}`),
};

export interface UserListItem {
  id: string;
  email: string;
  name: string;
  roleKey: string | null;
  status: 'active' | 'disabled';
  allowedSections?: string[];
}

export interface CreateUserBody {
  name: string;
  email: string;
  roleKey: string;
  permissions?: string[];
  mode?: 'invite' | 'temp_password';
  tempPassword?: string;
  allowedSections?: string[];
}

export interface CreateUserResponse {
  userId: string;
  invited: boolean;
  existing?: boolean;
  /** Only in DEV when mode is temp_password; never in PROD. */
  tempPassword?: string;
}

export interface UpdateUserBody {
  userId: string;
  name?: string;
  roleKey?: string;
  status?: 'active' | 'disabled';
  allowedSections?: string[];
}

export interface DeleteUserBody {
  userId: string;
}

export const usersApi = {
  getUsers: (): Promise<UserListItem[]> => httpClient.get('/users'),
  createUser: (body: CreateUserBody): Promise<CreateUserResponse> => httpClient.post('/users', body),
  updateUser: (body: UpdateUserBody): Promise<{ userId: string; updated: boolean }> =>
    httpClient.patch('/users', body),
  deleteUser: (body: DeleteUserBody): Promise<{ userId: string; deleted: boolean }> =>
    httpClient.delete(`/users?userId=${encodeURIComponent(body.userId)}`, { body: { userId: body.userId } }),
};

export interface SendInviteBody {
  email: string;
  name?: string;
  role: string;
  permissions?: Record<string, boolean>; // LEGACY - will be deprecated
  allowedSections?: string[]; // NEW: Section-based permissions
}

export interface SendInviteResponse {
  ok: boolean;
  expiresAt: string;
  email: string;
}

export interface ConsumeInviteBody {
  token: string;
  password: string;
  name?: string;
}

export const invitesApi = {
  sendInvite: (body: SendInviteBody): Promise<SendInviteResponse> => httpClient.post('/invites', body),
  consumeInvite: (body: ConsumeInviteBody): Promise<{ ok: boolean }> => httpClient.post('/invites-consume', body),
};

export const overridesApi = {
  setOverride: (findingId: string, overrideData: any) => httpClient.post(`/findings/${findingId}/override`, overrideData),
  revertOverride: (findingId: string) => httpClient.delete(`/findings/${findingId}/override`),
};
