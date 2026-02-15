import { create } from 'zustand';
import { supabase } from '@/lib/supabaseClient';
import { authApi } from '@/api';
import type { User as SupabaseUser, Session } from '@supabase/supabase-js';

export type Role = 'Super Admin' | 'Admin' | 'Regulator';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  permissions: string[]; // Legacy - will be deprecated
  allowedSections?: string[]; // NEW: Section-based permissions
}

function mapSupabaseUserToAppUser(sbUser: SupabaseUser): User {
  const meta = sbUser.user_metadata ?? {};
  const name = (meta.name as string) || sbUser.email?.split('@')[0] || 'User';
  const role = (meta.role as Role) || 'Admin';
  const permissions = (meta.permissions as string[] | undefined) ?? getDefaultPermissionsForRole(role);

  // NEW: Support allowedSections if present, otherwise derive from permissions
  // validation: if array is empty, fall back to defaults (prevents lockouts from bad migration)
  let allowedSections = meta.allowedSections as string[] | undefined;
  if (!allowedSections || allowedSections.length === 0) {
    allowedSections = getDefaultSectionsForRole(role);
  }

  return {
    id: sbUser.id,
    name,
    email: sbUser.email ?? '',
    role,
    permissions,
    allowedSections,
  };
}

// NEW: Map sections to default access by role
function getDefaultSectionsForRole(role: Role): string[] {
  switch (role) {
    case 'Super Admin':
      return ['clients', 'tasks', 'glossary', 'reports', 'access_control', 'audit'];
    case 'Admin':
      return ['clients', 'tasks', 'glossary', 'reports', 'audit'];
    case 'Regulator':
      return ['clients', 'reports', 'glossary'];
    default:
      return ['clients', 'reports'];
  }
}

// Legacy permission mapping - kept for backward compatibility
function getDefaultPermissionsForRole(role: Role): string[] {
  switch (role) {
    case 'Super Admin':
      // Super Admin gets ALL permissions to ensure system stability
      return [
        'view_clients', 'manage_companies',
        'view_scripts', 'upload_scripts',
        'view_tasks', 'assign_tasks',
        'run_analysis', 'view_findings', 'override_findings', 'add_manual_findings',
        'view_reports', 'generate_reports',
        'manage_glossary', 'manage_users', 'view_audit'
      ];
    case 'Regulator':
      // Regulator: View-only access plus glossary management
      return ['view_clients', 'view_scripts', 'view_findings', 'view_reports', 'view_tasks', 'manage_glossary'];
    default:
      // Admin (default): Full management except user administration
      return [
        'view_clients', 'manage_companies',
        'view_scripts', 'upload_scripts',
        'view_tasks', 'assign_tasks',
        'run_analysis', 'view_findings', 'override_findings',
        'view_reports', 'generate_reports',
        'manage_glossary', 'view_audit'
      ];
  }
}

function setAuthFromSession(session: Session | null, set: (state: Partial<AuthState>) => void) {
  if (!session?.user) {
    set({ user: null, isAuthenticated: false });
    return;
  }
  set({
    user: mapSupabaseUserToAppUser(session.user),
    isAuthenticated: true,
  });
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  /** False until first getSession() has completed (so we don't redirect to login on refresh). */
  authReady: boolean;
  login: (email: string, pass: string) => Promise<void>;
  logout: () => void;
  hasPermission: (permission: string) => boolean; // Legacy - maps to sections
  hasSection: (sectionId: string) => boolean; // NEW: Check section access
  isAdmin: () => boolean; // NEW: Helper to check if user is admin
  initializeAuth: () => () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  authReady: false,

  login: async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    if (data.session?.user) {
      set({ user: mapSupabaseUserToAppUser(data.session.user), isAuthenticated: true });
      try {
        const res = await authApi.getMe();
        if (res?.user) {
          set({
            user: {
              id: res.user.id,
              email: res.user.email,
              name: res.user.name,
              role: (res.user.role as Role) || 'Admin',
              permissions: res.user.permissions ?? [],
              allowedSections: (!res.user.allowedSections || res.user.allowedSections.length === 0)
                ? getDefaultSectionsForRole((res.user.role as Role) || 'Admin')
                : res.user.allowedSections,
            },
          });
        }
      } catch (_) {
        /* keep metadata-based user */
      }
    }
  },

  logout: () => {
    supabase.auth.signOut();
    set({ user: null, isAuthenticated: false });
  },

  hasPermission: (permission) => {
    const user = get().user;
    if (!user) return false;

    // NEW: If using sections, map permission to section
    if (user.allowedSections) {
      const permissionToSectionMap: Record<string, string> = {
        'view_clients': 'clients',
        'manage_companies': 'clients',
        'view_scripts': 'clients',
        'upload_scripts': 'clients',
        'view_tasks': 'tasks',
        'assign_tasks': 'tasks',
        'manage_glossary': 'glossary',
        'view_reports': 'reports',
        'generate_reports': 'reports',
        'manage_users': 'access_control',
        'view_audit': 'audit',
      };
      const section = permissionToSectionMap[permission];
      if (section) {
        return get().hasSection(section);
      }
    }

    // Legacy: Check permissions array
    return user.permissions.includes(permission);
  },

  // NEW: Check if user has access to a section
  hasSection: (sectionId) => {
    const user = get().user;
    if (!user) return false;

    // Super Admin always has access to all sections
    if (user.role === 'Super Admin') return true;

    // Overview is always accessible
    if (sectionId === 'overview') return true;

    // Check allowedSections array
    return user.allowedSections?.includes(sectionId) ?? false;
  },

  // NEW: Check if user is admin (helpful for UI logic)
  isAdmin: () => {
    const user = get().user;
    return user?.role === 'Super Admin' || user?.role === 'Admin';
  },

  initializeAuth: () => {
    const applySession = (session: Session | null) => {
      setAuthFromSession(session, set);
      if (!session?.user) {
        set({ authReady: true });
        return;
      }
      authApi.getMe()
        .then((res) => {
          if (res?.user) {
            set({
              user: {
                id: res.user.id,
                email: res.user.email,
                name: res.user.name,
                role: (res.user.role as Role) || 'Admin',
                permissions: res.user.permissions ?? [],
                allowedSections: res.user.allowedSections,
              },
            });
          }
        })
        .catch(() => { /* keep user from setAuthFromSession (metadata) */ })
        .finally(() => set({ authReady: true }));
    };

    supabase.auth.getSession()
      .then(({ data: { session } }) => applySession(session))
      .catch(() => set({ authReady: true }));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session);
    });
    return () => subscription.unsubscribe();
  },
}));
