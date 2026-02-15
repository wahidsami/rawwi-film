import { mockDb } from './mockDb';
import { Company } from './models';
import { supabase } from '@/lib/supabaseClient';
import { API_BASE_URL } from '@/lib/env';

export const USE_MOCK_API = import.meta.env.VITE_USE_MOCK_API === 'true';
export { API_BASE_URL };

async function delay(ms = 500) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// In-app mock router
async function mockFetch(url: string, options: RequestInit = {}): Promise<any> {
  await delay();
  const path = url.replace(API_BASE_URL, '');
  const method = options.method || 'GET';
  let body: any = null;
  if (options.body) {
    if (options.body instanceof FormData) body = null;
    else try { body = JSON.parse(options.body as string); } catch { body = null; }
  }

  console.log(`[MOCK API] ${method} ${path}`, body || '');

  if (path === '/dashboard/stats' && method === 'GET') {
    return {
      pendingTasks: mockDb.tasks.filter(t => t.status !== 'completed').length,
      scriptsInReview: mockDb.scripts.filter(s => ['Draft', 'In Review', 'assigned', 'analysis_running'].includes(s.status)).length,
      reportsThisMonth: 5, // Mocked
      highCriticalFindings: mockDb.findings.filter(f => ['Critical', 'High'].includes(f.severity) && f.override?.eventType !== 'not_violation').length,
      scriptsByStatus: {
        draft: mockDb.scripts.filter(s => s.status === 'draft').length,
        assigned: mockDb.scripts.filter(s => s.status === 'assigned').length,
        analysis_running: mockDb.scripts.filter(s => s.status === 'analysis_running').length,
        review_required: mockDb.scripts.filter(s => s.status === 'review_required').length,
        completed: mockDb.scripts.filter(s => s.status === 'completed').length,
      },
      findingsBySeverity: {
        critical: mockDb.findings.filter(f => f.severity === 'critical' && f.override?.eventType !== 'not_violation').length,
        high: mockDb.findings.filter(f => f.severity === 'high' && f.override?.eventType !== 'not_violation').length,
        medium: mockDb.findings.filter(f => f.severity === 'medium' && f.override?.eventType !== 'not_violation').length,
        low: mockDb.findings.filter(f => f.severity === 'low' && f.override?.eventType !== 'not_violation').length,
      }
    };
  }

  if (path === '/activity/recent' && method === 'GET') {
    return [
      { id: '1', action: 'تمت إضافة شركة: مسامير', actor: 'أحمد', time: 'منذ ساعتين', target: '/clients' },
      { id: '2', action: 'تم رفع نص: الحلقة 1', actor: 'سارة', time: 'منذ ٣ ساعات', target: '/clients' },
      { id: '3', action: 'تم إسناد مهمة إلى: محمد', actor: 'فهد', time: 'منذ ٥ ساعات', target: '/tasks' },
      { id: '4', action: 'بدأ التحليل للنص: فيلم 1', actor: 'محمد', time: 'منذ ٦ ساعات', target: '/tasks' },
      { id: '5', action: 'تم إنشاء تقرير: الحلقة 1', actor: 'نورة', time: 'منذ يوم', target: '/reports' }
    ];
  }

  if (path.startsWith('/audit') && method === 'GET') {
    if (path.includes('/export')) {
      return 'id,event_type,actor_name,actor_role,occurred_at,target_type,target_id,target_label,result_status,result_message\nmock-1,CLIENT_CREATED,Admin,,2025-02-09T12:00:00Z,client,comp-1,Test Client,success,';
    }
    let page = 1;
    let pageSize = 20;
    try {
      const u = new URL(url);
      page = parseInt(u.searchParams.get('page') ?? '1', 10);
      pageSize = parseInt(u.searchParams.get('pageSize') ?? '20', 10);
    } catch (_) { /* use defaults */ }
    return {
      data: [
        { id: 'mock-1', eventType: 'CLIENT_CREATED', actorUserId: null, actorName: 'Admin', actorRole: 'admin', occurredAt: new Date().toISOString(), targetType: 'client', targetId: 'comp-1', targetLabel: 'Test Client', resultStatus: 'success', resultMessage: null, metadata: null, requestId: null, correlationId: null, createdAt: new Date().toISOString() },
      ],
      total: 1,
      page,
      pageSize,
    };
  }

  if (path === '/auth/login' && method === 'POST') {
    if (body.password !== 'password') throw new Error('Invalid credentials');
    const user = mockDb.users.find(u => u.email === body.email) || mockDb.users[0];
    return { token: 'mock-jwt-token', user };
  }

  if (path === '/me' && method === 'GET') {
    const fullPermissions = ['manage_companies', 'manage_users', 'upload_scripts', 'assign_tasks', 'run_analysis', 'override_findings', 'generate_reports', 'view_reports', 'manage_glossary', 'view_audit'];
    return {
      user: {
        id: 'usr_super',
        email: 'super@raawi.film',
        name: 'Super Admin',
        role: 'Super Admin',
        permissions: fullPermissions,
      },
    };
  }

  if (path.startsWith('/users')) {
    if (method === 'GET') {
      return [
        { id: 'usr_super', email: 'super@raawi.film', name: 'Super Admin', roleKey: 'super_admin', status: 'active' },
        { id: 'usr_reg', email: 'regulator@raawi.film', name: 'Regulator One', roleKey: 'regulator', status: 'active' },
      ];
    }
    if (method === 'POST') {
      const email = body?.email || 'new@example.com';
      return {
        userId: 'mock-' + Math.random().toString(36).slice(2, 11),
        invited: false,
        tempPassword: 'MockTempPass-' + Math.random().toString(36).slice(2, 10),
      };
    }
    if (method === 'PATCH' && body?.userId) {
      return { userId: body.userId, updated: true };
    }
    if (method === 'DELETE' && body?.userId) {
      return { userId: body.userId, deleted: true };
    }
  }

  if (path === '/invites' && method === 'POST') {
    const email = (body?.email ?? '').toString().trim().toLowerCase() || 'invited@example.com';
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    return { ok: true, expiresAt, email };
  }

  if (path === '/invites-consume' && method === 'POST') {
    return { ok: true };
  }

  if (path.startsWith('/companies')) {
    if (method === 'GET') return mockDb.companies;
    if (method === 'POST') {
      if (path.match(/^\/companies\/[^/]+\/logo$/)) {
        const id = path.split('/')[2];
        const company = mockDb.companies.find((c: Company) => c.companyId === id);
        if (company) {
          (company as Company).logoUrl = 'blob:mock-logo-' + id;
          return { ...company };
        }
        throw new Error('Client not found');
      }
      if (!body.companyId) body.companyId = 'COMP-' + Date.now();
      mockDb.companies.push(body);
      return body;
    }
    if (method === 'DELETE' && path.match(/^\/companies\/[^/]+\/logo$/)) {
      const id = path.split('/')[2];
      const company = mockDb.companies.find((c: Company) => c.companyId === id);
      if (company) {
        (company as Company).logoUrl = null;
        return { ...company };
      }
      throw new Error('Client not found');
    }
    if (method === 'PUT') {
      const id = path.split('/').filter(Boolean).pop();
      const index = mockDb.companies.findIndex((c: Company) => c.companyId === id);
      if (index > -1) {
        mockDb.companies[index] = { ...mockDb.companies[index], ...body };
        return mockDb.companies[index];
      }
    }
  }

  if (path.startsWith('/scripts')) {
    if (method === 'GET') {
      if (path.includes('editor')) {
        const q = path.indexOf('?');
        const params = q >= 0 ? new URLSearchParams(path.slice(q)) : new URLSearchParams();
        const scriptId = params.get('scriptId');
        const versionId = params.get('versionId');
        return { content: scriptId && versionId ? 'Mock extracted script content for editor.' : '', sections: [{ id: 'mock-1', index: 0, title: 'Full Script', startOffset: 0, endOffset: 42, meta: {} }] };
      }
      return mockDb.scripts;
    }
    if (method === 'POST') {
      if (path.includes('/versions')) {
        const versionId = 'VER-' + Math.floor(Math.random() * 10000);
        const version = { ...body, id: versionId, versionNumber: 1, createdAt: new Date().toISOString() };
        mockDb.scriptVersions = mockDb.scriptVersions || [];
        mockDb.scriptVersions.push(version);
        return version;
      } else {
        mockDb.scripts.push(body);
        const company = mockDb.companies.find(c => c.companyId === body.companyId);
        if (company) company.scriptsCount++;
        return body;
      }
    }
    if (method === 'PUT') {
      if (path.includes('/versions')) {
        const id = path.split('/').pop();
        mockDb.scriptVersions = mockDb.scriptVersions || [];
        const index = mockDb.scriptVersions.findIndex(v => v.id === id);
        if (index > -1) {
          mockDb.scriptVersions[index] = { ...mockDb.scriptVersions[index], ...body };
          return mockDb.scriptVersions[index];
        }
      }
    }
  }

  if (path.startsWith('/upload')) {
    // Mock upload
    return { url: 'blob:mock-url' };
  }

  if (path.startsWith('/extract')) {
    const versionId = body.versionId;
    mockDb.scriptVersions = mockDb.scriptVersions || [];
    const version = mockDb.scriptVersions.find(v => v.id === versionId);
    if (version) {
      version.extracted_text = body.text || '(Extracted content preview)...\nThis text was generated during mock extraction.';
      version.extraction_status = 'done';
      return version;
    }
  }

  if (path.startsWith('/tasks')) {
    if (method === 'GET') return []; // Real GET /tasks returns analysis jobs; mock returns [] for compatibility.
    if (method === 'POST') {
      const jobId = 'mock-job-' + (body?.versionId ?? Math.random().toString(36).slice(2));
      return { jobId };
    }
  }

  if (path.startsWith('/findings')) {
    if (method === 'GET') return mockDb.findings;
    if (method === 'POST') {
      if (path.includes('/manual')) {
        const id = 'manual-' + Math.random().toString(36).slice(2, 11);
        const jobId = body.jobId ?? body.reportId ?? 'mock-job';
        const mockManual = {
          id,
          jobId,
          scriptId: body.scriptId,
          versionId: body.versionId,
          source: 'manual',
          articleId: body.articleId ?? 1,
          atomId: body.atomId ?? null,
          severity: (body.severity ?? 'medium').toLowerCase(),
          confidence: 1,
          titleAr: 'ملاحظة يدوية',
          descriptionAr: body.manualComment ?? '',
          evidenceSnippet: body.evidenceSnippet ?? body.manualComment ?? '',
          startOffsetGlobal: body.startOffsetGlobal,
          endOffsetGlobal: body.endOffsetGlobal,
          startLineChunk: null,
          endLineChunk: null,
          location: {},
          createdAt: new Date().toISOString(),
          reviewStatus: 'violation',
          reviewReason: null,
          reviewedBy: null,
          reviewedAt: null,
          reviewedRole: null,
          createdBy: null,
          manualComment: body.manualComment ?? null,
        };
        mockDb.findings.push(mockManual);
        return mockManual;
      }
      mockDb.findings.push(body);
      return body;
    }
    if (method === 'PUT') {
      const id = path.split('/').pop();
      const index = mockDb.findings.findIndex(f => f.id === id);
      if (index > -1) {
        mockDb.findings[index] = { ...mockDb.findings[index], ...body };
        return mockDb.findings[index];
      }
    }
  }

  if (path.startsWith('/lexicon')) {
    if (method === 'GET') {
      if (path.includes('/history')) {
        const id = path.split('/')[2];
        return mockDb.lexiconHistory.filter(h => h.lexicon_id === id);
      }
      return mockDb.lexiconTerms;
    }
    if (method === 'POST') {
      mockDb.lexiconTerms.push(body);
      return body;
    }
    if (method === 'PUT') {
      const id = path.split('/').pop();
      const index = mockDb.lexiconTerms.findIndex(t => t.id === id);
      if (index > -1) {
        mockDb.lexiconTerms[index] = { ...mockDb.lexiconTerms[index], ...body };
        return mockDb.lexiconTerms[index];
      }
    }
  }

  if (path.startsWith('/reports')) {
    if (method === 'GET' && path.includes('scriptId=')) {
      const q = path.indexOf('?');
      const scriptId = (q >= 0 ? new URLSearchParams(path.slice(q)) : new URLSearchParams()).get('scriptId') || 'mock-script';
      const mockList = [
        {
          id: 'mock-report-1',
          jobId: 'mock-job-1',
          scriptId,
          versionId: null,
          findingsCount: mockDb.findings.length,
          severityCounts: { low: 0, medium: 1, high: 0, critical: 0 },
          approvedCount: 0,
          createdAt: new Date(Date.now() - 86400000).toISOString(),
          createdBy: null,
          reviewStatus: 'under_review',
          reviewedBy: null,
          reviewedAt: null,
          lastReviewedAt: null,
          lastReviewedBy: null,
          lastReviewedRole: null,
        },
        {
          id: 'mock-report-2',
          jobId: 'mock-job-2',
          scriptId,
          versionId: null,
          findingsCount: 0,
          severityCounts: { low: 0, medium: 0, high: 0, critical: 0 },
          approvedCount: 0,
          createdAt: new Date().toISOString(),
          createdBy: 'usr_super',
          reviewStatus: 'approved',
          reviewedBy: null,
          reviewedAt: null,
          lastReviewedAt: null,
          lastReviewedBy: null,
          lastReviewedRole: null,
        },
      ];
      return mockList;
    }
    return {
      scriptId: body?.scriptId || 'SCR-001',
      createdAt: new Date().toISOString(),
      summaryJson: {
        decision: 'REVIEW_REQUIRED',
        severityCounts: { critical: 0, high: 1, medium: 1, low: 0 },
        checklistArticles: [
          { articleId: '4', titleAr: 'السيادة والأسس الوطنية', titleEn: 'Sovereignty', domainId: 'A', status: 'fail', severityCounts: { critical: 0, high: 1, medium: 0, low: 0 } }
        ],
        lexiconSignals: []
      },
      reportHtml: '<html dir="rtl"><body><h1>Mock Report</h1></body></html>'
    };
  }

  throw new Error(`404 Not Found: ${method} ${path}`);
}

export const httpClient = {
  async request(url: string, options: RequestInit = {}) {
    try {
      if (USE_MOCK_API) {
        return await mockFetch(`${API_BASE_URL}${url}`, options);
      }

      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? null;
      const isFormData = options.body instanceof FormData;
      const headers: Record<string, string> = {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers as Record<string, string>),
      };
      if (!isFormData) headers['Content-Type'] = 'application/json';

      const res = await fetch(`${API_BASE_URL}${url}`, { ...options, headers });
      if (!res.ok) {
        if (res.status === 401 && token) {
          await supabase.auth.signOut();
          window.location.href = '/login';
          throw new Error('Session expired');
        }
        const err = await res.json().catch(() => ({ message: res.statusText }));
        const msg = err.message || err.error || 'API Error';
        if (res.status >= 500) {
          console.error(`API Error ${res.status}:`, msg, url);
        }
        throw new Error(msg);
      }
      return await res.json();
    } catch (error) {
      // Only log network errors (not re-thrown API errors which are already logged above)
      if (error instanceof TypeError) {
        console.error('Network Error:', error);
      }
      throw error;
    }
  },

  get(url: string) { return this.request(url); },
  post(url: string, body: any) { return this.request(url, { method: 'POST', body: JSON.stringify(body) }); },
  put(url: string, body: any) { return this.request(url, { method: 'PUT', body: JSON.stringify(body) }); },
  patch(url: string, body: any) { return this.request(url, { method: 'PATCH', body: JSON.stringify(body) }); },
  delete(url: string, opts?: { body?: any }) {
    return this.request(url, { method: 'DELETE', ...(opts?.body != null && { body: JSON.stringify(opts.body) }) });
  },
};