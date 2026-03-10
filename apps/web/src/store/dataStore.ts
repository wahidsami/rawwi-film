import { create } from 'zustand';
import toast from 'react-hot-toast';

import { useLangStore } from '@/store/langStore';

import { Script, ScriptVersion, Finding, Task, User, Company, AnalysisJob, LexiconTerm, LexiconHistoryEntry, Report } from '@/api/models';
export type { Script, ScriptVersion, Finding, Task, User, Company, AnalysisJob, LexiconTerm, LexiconHistoryEntry, Report };

import { scriptsApi, findingsApi, reportsApi, tasksApi, companiesApi, lexiconApi } from '@/api';

interface DataState {
  companies: Company[];
  scripts: Script[];
  /** Analysis jobs from GET /tasks (for progress UI). */
  tasks: (AnalysisJob | Task)[];
  findings: Finding[];
  lexiconTerms: LexiconTerm[];
  lexiconHistory: LexiconHistoryEntry[];
  isLoading: boolean;
  error: string | null;
  fetchInitialData: () => Promise<void>;
  addCompany: (c: Company) => Promise<Company | undefined>;
  updateCompany: (id: string, updates: Partial<Company>) => Promise<void>;
  removeCompany: (id: string) => Promise<void>;
  addScript: (s: Script) => Promise<Script | undefined>;
  /** Add a script to the store without API (e.g. after Quick Analysis create so workspace finds it on navigate). */
  pushScript: (s: Script) => void;
  updateScript: (id: string, updates: Partial<Script>) => Promise<void>;
  addTask: (t: Task) => Promise<void>;
  addFinding: (f: Finding) => Promise<void>;
  updateFindingStatus: (id: string, status: Finding['status'], comment?: string, author?: string) => Promise<void>;
  updateFindingOverride: (id: string, override: Finding['override'] | undefined) => Promise<void>;
  addLexiconTerm: (term: LexiconTerm) => Promise<void>;
  updateLexiconTerm: (id: string, updates: Partial<LexiconTerm>, changedBy: string, reason?: string) => Promise<void>;
  deactivateLexiconTerm: (id: string, changedBy: string, reason?: string) => Promise<void>;
  importLexiconTerms: (terms: LexiconTerm[], changedBy: string) => Promise<void>;
}

// Initial lexicon terms removed; now fetched from API

export const useDataStore = create<DataState>((set) => ({
  companies: [],
  lexiconTerms: [],
  lexiconHistory: [],
  scripts: [],
  tasks: [],
  findings: [],
  isLoading: false,
  error: null,

  fetchInitialData: async () => {
    set({ isLoading: true, error: null });
    try {
      const [companies, scripts, tasks, findings, lexiconTerms] = await Promise.all([
        companiesApi.getCompanies(),
        scriptsApi.getScripts(),
        tasksApi.getTasks(),
        findingsApi.getFindings(),
        lexiconApi.getTerms()
      ]);
      set({ companies, scripts, tasks, findings, lexiconTerms, isLoading: false });
    } catch (err: unknown) {
      set({ error: err instanceof Error ? err.message : String(err), isLoading: false });
    }
  },

  addCompany: async (c) => {
    try {
      const saved = await companiesApi.addCompany(c);
      set((state) => ({ companies: [...state.companies, saved] }));
      toast.success(useLangStore.getState().t('companyCreated'));
      return saved;
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : useLangStore.getState().t('errorGeneric'));
      return undefined;
    }
  },

  updateCompany: async (id, updates) => {
    try {
      const saved = await companiesApi.updateCompany(id, updates);
      set((state) => ({ companies: state.companies.map(c => c.companyId === id ? saved : c) }));
      toast.success(useLangStore.getState().t('companyUpdated'));
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : useLangStore.getState().t('errorGeneric')); }
  },

  removeCompany: async (id) => {
    try {
      await companiesApi.deleteCompany(id);
      set((state) => ({
        companies: state.companies.filter(c => c.companyId !== id),
        scripts: state.scripts.filter(s => s.companyId !== id),
      }));
      toast.success(useLangStore.getState().t('clientDeleted'));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : useLangStore.getState().t('failedToDeleteClient'));
    }
  },

  addScript: async (s) => {
    try {
      const saved = await scriptsApi.addScript(s);
      set((state) => ({ scripts: [...state.scripts, saved] }));
      toast.success(useLangStore.getState().t('scriptCreated'));
      return saved;
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : useLangStore.getState().t('errorCreatingScript'));
      return undefined;
    }
  },

  pushScript: (s) => {
    set((state) => ({
      scripts: state.scripts.some((x) => x.id === s.id) ? state.scripts : [...state.scripts, s],
    }));
  },

  updateScript: async (id, updates) => {
    try {
      const saved = await scriptsApi.updateScript(id, updates);
      set((state) => ({ scripts: state.scripts.map(s => s.id === id ? { ...s, ...saved } : s) }));
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : useLangStore.getState().t('errorGeneric')); }
  },

  addTask: async (t) => {
    try {
      const saved = await tasksApi.addTask(t);
      set((state) => ({ tasks: [...state.tasks, saved] }));
      toast.success(useLangStore.getState().t('taskAssignedSuccess'));
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : useLangStore.getState().t('errorGeneric')); }
  },

  addFinding: async (f) => {
    try {
      const saved = await findingsApi.addFinding(f);
      set((state) => ({ findings: [...state.findings, saved] }));
      toast.success(useLangStore.getState().t('violationMarkedSuccess'));
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : useLangStore.getState().t('errorGeneric')); }
  },

  updateFindingStatus: async (id, status, comment, author) => {
    try {
      const saved = await findingsApi.updateFindingStatus(id, status, comment, author);
      set((state) => ({ findings: state.findings.map(f => f.id === id ? saved : f) }));
      toast.success(useLangStore.getState().t('statusUpdated'));
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : useLangStore.getState().t('errorGeneric')); }
  },

  updateFindingOverride: async (id, override) => {
    try {
      const saved = await findingsApi.updateFindingOverride(id, override);
      set((state) => ({ findings: state.findings.map(f => f.id === id ? saved : f) }));
      toast.success(override ? useLangStore.getState().t('overrideSaved') : useLangStore.getState().t('overrideReverted'));
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : useLangStore.getState().t('errorGeneric')); }
  },

  addLexiconTerm: async (term) => {
    try {
      const saved = await lexiconApi.addTerm(term);
      set((state) => ({ lexiconTerms: [...state.lexiconTerms, saved] }));
      toast.success(useLangStore.getState().t('termSavedSuccess'));
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : useLangStore.getState().t('errorGeneric')); }
  },

  updateLexiconTerm: async (id, updates, changedBy, reason) => {
    try {
      const saved = await lexiconApi.updateTerm(id, updates, changedBy, reason);
      set((state) => ({ lexiconTerms: state.lexiconTerms.map(t => t.id === id ? saved : t) }));
      toast.success(useLangStore.getState().t('termUpdatedSuccess'));
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : useLangStore.getState().t('errorGeneric')); }
  },

  deactivateLexiconTerm: async (id, changedBy, reason) => {
    try {
      const saved = await lexiconApi.deactivateTerm(id, changedBy, reason);
      set((state) => ({ lexiconTerms: state.lexiconTerms.map(t => t.id === id ? saved : t) }));
      toast.success(useLangStore.getState().t('termDeletedSuccess'));
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : useLangStore.getState().t('errorGeneric')); }
  },

  importLexiconTerms: async (terms) => {
    try {
      for (const term of terms) {
        await lexiconApi.addTerm(term);
      }
      const freshTerms = await lexiconApi.getTerms();
      set({ lexiconTerms: freshTerms });
      toast.success(useLangStore.getState().t('importCompleted'));
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : useLangStore.getState().t('errorGeneric')); }
  }
}));
