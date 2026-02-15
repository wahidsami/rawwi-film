import { create } from 'zustand';
import toast from 'react-hot-toast';

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
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },

  addCompany: async (c) => {
    try {
      const saved = await companiesApi.addCompany(c);
      set((state) => ({ companies: [...state.companies, saved] }));
      toast.success('Company created successfully');
      return saved;
    } catch (err: any) {
      toast.error(err.message || 'Error');
      return undefined;
    }
  },

  updateCompany: async (id, updates) => {
    try {
      const saved = await companiesApi.updateCompany(id, updates);
      set((state) => ({ companies: state.companies.map(c => c.companyId === id ? saved : c) }));
      toast.success('Company updated successfully');
    } catch (err: any) { toast.error(err.message || 'Error'); }
  },

  removeCompany: async (id) => {
    try {
      await companiesApi.deleteCompany(id);
      set((state) => ({
        companies: state.companies.filter(c => c.companyId !== id),
        scripts: state.scripts.filter(s => s.companyId !== id),
      }));
      toast.success('Client deleted');
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete client');
    }
  },

  addScript: async (s) => {
    try {
      const saved = await scriptsApi.addScript(s);
      set((state) => ({ scripts: [...state.scripts, saved] }));
      toast.success('Script created');
      return saved;
    } catch (err: any) {
      toast.error(err.message || 'Error creating script');
      return undefined;
    }
  },


  updateScript: async (id, updates) => {
    try {
      // In a real app we would call a scriptsApi.updateScript endpoint
      set((state) => ({ scripts: state.scripts.map(s => s.id === id ? { ...s, ...updates } : s) }));
    } catch (err: any) { toast.error(err.message || 'Error'); }
  },

  addTask: async (t) => {
    try {
      const saved = await tasksApi.addTask(t);
      set((state) => ({ tasks: [...state.tasks, saved] }));
      toast.success('Task assigned successfully');
    } catch (err: any) { toast.error(err.message || 'Error'); }
  },

  addFinding: async (f) => {
    try {
      const saved = await findingsApi.addFinding(f);
      set((state) => ({ findings: [...state.findings, saved] }));
      toast.success('Violation marked successfully');
    } catch (err: any) { toast.error(err.message || 'Error'); }
  },

  updateFindingStatus: async (id, status, comment, author) => {
    try {
      const saved = await findingsApi.updateFindingStatus(id, status, comment, author);
      set((state) => ({ findings: state.findings.map(f => f.id === id ? saved : f) }));
      toast.success('Status updated');
    } catch (err: any) { toast.error(err.message || 'Error'); }
  },

  updateFindingOverride: async (id, override) => {
    try {
      const saved = await findingsApi.updateFindingOverride(id, override);
      set((state) => ({ findings: state.findings.map(f => f.id === id ? saved : f) }));
      toast.success(override ? 'Override saved' : 'Override reverted');
    } catch (err: any) { toast.error(err.message || 'Error'); }
  },

  addLexiconTerm: async (term) => {
    try {
      const saved = await lexiconApi.addTerm(term);
      set((state) => ({ lexiconTerms: [...state.lexiconTerms, saved] }));
      toast.success('Term saved successfully');
    } catch (err: any) { toast.error(err.message || 'Error'); }
  },

  updateLexiconTerm: async (id, updates, changedBy, reason) => {
    try {
      const saved = await lexiconApi.updateTerm(id, updates, changedBy, reason);
      set((state) => ({ lexiconTerms: state.lexiconTerms.map(t => t.id === id ? saved : t) }));
      toast.success('Term updated successfully');
    } catch (err: any) { toast.error(err.message || 'Error'); }
  },

  deactivateLexiconTerm: async (id, changedBy, reason) => {
    try {
      const saved = await lexiconApi.deactivateTerm(id, changedBy, reason);
      set((state) => ({ lexiconTerms: state.lexiconTerms.map(t => t.id === id ? saved : t) }));
      toast.success('Term deleted successfully');
    } catch (err: any) { toast.error(err.message || 'Error'); }
  },

  importLexiconTerms: async (terms) => {
    try {
      for (const term of terms) {
        await lexiconApi.addTerm(term);
      }
      const freshTerms = await lexiconApi.getTerms();
      set({ lexiconTerms: freshTerms });
      toast.success('Import completed');
    } catch (err: any) { toast.error(err.message || 'Error'); }
  }
}));
