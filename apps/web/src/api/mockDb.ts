import { Company, Script, Task, Finding, LexiconTerm, LexiconHistoryEntry } from './models';

// Initialize mock data directly here to replace dataStore.ts
export const mockDb = {
  users: [
    { id: 'usr_super', name: 'Super Admin', email: 'super@raawi.film', role: 'Super Admin', permissions: ['manage_companies', 'manage_users', 'upload_scripts', 'assign_tasks', 'run_analysis', 'override_findings', 'generate_reports', 'view_reports', 'manage_glossary'] },
    { id: 'usr_reg', name: 'Regulator One', email: 'regulator@raawi.film', role: 'Regulator', permissions: ['view_reports', 'manage_glossary'] }
  ],
  companies: [
    {
      companyId: 'COMP-001',
      nameAr: 'شركة التقنية الحديثة',
      nameEn: 'Modern Tech Co.',
      representativeName: 'Ahmed Khaled (CEO)',
      email: 'ahmed@moderntech.com',
      phone: '+966 50 123 4567',
      createdAt: '2023-01-15',
      scriptsCount: 1,
      avatarUrl: 'https://ui-avatars.com/api/?name=MT&background=1d4ed8&color=fff',
    }
  ] as Company[],
  scripts: [
    {
      id: 'SCR-001',
      companyId: 'COMP-001',
      title: 'The Desert Journey',
      type: 'Film',
      status: 'In Review',
      createdAt: '2023-10-01',
      assigneeId: 'usr_super',
    }
  ] as Script[],
  tasks: [
    {
      id: 'TSK-001',
      scriptId: 'SCR-001',
      companyName: 'Modern Tech Co.',
      scriptTitle: 'The Desert Journey',
      status: 'In Review',
      assignedBy: 'System',
      assignedTo: 'usr_super',
      assignedAt: '2023-10-02',
    }
  ] as Task[],
  findings: [
    {
      id: 'FND-001',
      scriptId: 'SCR-001',
      source: 'ai',
      excerpt: 'They crossed the forbidden border.',
      evidenceSnippet: 'They crossed the forbidden border.',
      articleId: '4',
      subAtomId: '4.17',
      domainId: 'A',
      titleAr: 'تجاوز الحدود السيادية',
      titleEn: 'Crossing Sovereign Borders',
      descriptionAr: 'ذكر صريح لتجاوز الحدود بطريقة غير مصرح بها.',
      severity: 'High',
      status: 'open',
      confidence: 0.85,
      location: { page: 1, scene: 2, lineChunk: 'Line 15-18' },
      comments: [],
    },
    {
      id: 'FND-LEX-01',
      scriptId: 'SCR-001',
      source: 'lexicon_mandatory',
      excerpt: 'تم ضبط حبوب مخدرة في السيارة',
      evidenceSnippet: 'تم ضبط حبوب مخدرة في السيارة',
      articleId: '17',
      domainId: 'D',
      titleAr: 'الترويج للمخدرات (مخالفة قاموس إلزامية)',
      titleEn: 'Drug Promotion (Mandatory Lexicon Match)',
      descriptionAr: 'تم العثور على مصطلح إلزامي مقيد ضمن قاموس المصطلحات (مخدرات).',
      severity: 'High',
      status: 'open',
      confidence: 1.0,
      location: { page: 5, scene: 8 },
      comments: [],
    },
    {
      id: 'FND-002',
      scriptId: 'SCR-001',
      source: 'ai',
      excerpt: 'A minor disagreement turned into a fistfight.',
      evidenceSnippet: 'A minor disagreement turned into a fistfight.',
      articleId: '6',
      domainId: 'D',
      titleAr: 'عنف غير مبرر',
      titleEn: 'Unjustified Violence',
      descriptionAr: 'مشهد عراك بالأيدي دون سياق مبرر.',
      severity: 'Medium',
      status: 'open',
      confidence: 0.92,
      location: { page: 3, scene: 4 },
      override: {
        eventType: 'not_violation',
        reason: 'السياق الدرامي يتطلب ذلك ولا يخالف القواعد.',
        createdAt: '2023-10-02T10:00:00Z',
        byUser: 'Super Admin'
      },
      comments: [],
    }
  ] as Finding[],
  lexiconTerms: [
    {
      id: 'LEX-001',
      term: 'مخدرات',
      normalized_term: 'مخدرات',
      term_type: 'word',
      category: 'drugs',
      severity_floor: 'High',
      enforcement_mode: 'mandatory_finding',
      gcam_article_id: 8,
      gcam_article_title_ar: 'الترويج للمخدرات',
      created_by: 'System',
      created_at: '2023-10-01T10:00:00Z',
      updated_at: '2023-10-01T10:00:00Z',
      is_active: true,
    },
    {
      id: 'LEX-002',
      term: 'يا حمار',
      normalized_term: 'يا حمار',
      term_type: 'phrase',
      category: 'humiliation',
      severity_floor: 'Low',
      enforcement_mode: 'soft_signal',
      gcam_article_id: 12,
      gcam_article_title_ar: 'التلفظ بألفاظ نابية',
      created_by: 'System',
      created_at: '2023-10-02T10:00:00Z',
      updated_at: '2023-10-02T10:00:00Z',
      is_active: true,
    }
  ] as LexiconTerm[],
  lexiconHistory: [] as LexiconHistoryEntry[],
  scriptVersions: [] as any[],
};