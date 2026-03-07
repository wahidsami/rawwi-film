import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useLangStore } from '@/store/langStore';
import { useAuthStore } from '@/store/authStore';
import {
  LayoutDashboard,
  BookOpen,
  Users,
  ShieldCheck,
  FileText,
  Settings,
  LogOut,
  Globe,
  History,
  Award
} from 'lucide-react';
import { cn } from '@/utils/cn';

import { useEffect, useRef, useCallback } from 'react';
import { useDataStore } from '@/store/dataStore';
import { useSettingsStore } from '@/store/settingsStore';

export function AppLayout() {
  const { t, lang, toggleLang } = useLangStore();
  const { user, logout, hasPermission, hasSection } = useAuthStore();
  const { settings } = useSettingsStore();
  const navigate = useNavigate();
  const { fetchInitialData } = useDataStore();
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  const handleLogout = useCallback(() => {
    logout();
    navigate('/login');
  }, [logout, navigate]);

  // Session idle timeout: logout after N minutes of no activity
  useEffect(() => {
    const minutes = settings?.security?.sessionTimeoutMinutes;
    if (!minutes || minutes <= 0) return;

    const scheduleLogout = () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => {
        handleLogout();
      }, minutes * 60 * 1000);
    };

    scheduleLogout();
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    const onActivity = () => scheduleLogout();
    events.forEach((ev) => document.addEventListener(ev, onActivity));
    return () => {
      events.forEach((ev) => document.removeEventListener(ev, onActivity));
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [settings?.security?.sessionTimeoutMinutes, handleLogout]);

  const baseNavLinks = [
    // Always visible to all authenticated users
    { to: '/', icon: LayoutDashboard, label: t('overview'), section: null as string | null, permission: null as string | null },

    // Conditional sections - supports BOTH section-based and permission-based access
    { to: '/clients', icon: Users, label: t('clients'), section: 'clients', permission: 'view_clients' },
    { to: '/scripts', icon: FileText, label: lang === 'ar' ? 'النصوص' : 'Scripts', section: 'clients', permission: 'view_scripts' },
    { to: '/glossary', icon: BookOpen, label: t('glossary'), section: 'glossary', permission: 'manage_glossary' },
    { to: '/tasks', icon: FileText, label: lang === 'ar' ? 'المهام' : 'Tasks', section: 'tasks', permission: 'view_tasks' },
    { to: '/reports', icon: FileText, label: t('reports'), section: 'reports', permission: 'view_reports' },
    ...(settings?.features?.enableCertificates ? [{ to: '/certificates', icon: Award, label: t('certificates'), section: null as string | null, permission: null as string | null }] : []),
    { to: '/access-control', icon: ShieldCheck, label: t('accessControl'), section: 'access_control', permission: 'manage_users' },
    { to: '/audit', icon: History, label: t('auditLog'), section: 'audit', permission: 'view_audit' },

    // Always visible
    { to: '/settings', icon: Settings, label: t('settings'), section: null as string | null, permission: null as string | null },
  ];

  const navLinks = baseNavLinks.filter(link => {
    // If no section/permission required, always show
    if (!link.section && !link.permission) return true;

    // NEW: Check section access first (preferred method)
    if (link.section && hasSection(link.section)) return true;

    // LEGACY: Fall back to permission check
    if (link.permission && hasPermission(link.permission)) return true;

    return false;
  });

  return (
    <div className="flex h-screen bg-background text-text-main overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 border-e border-border bg-surface shadow-[0_0_15px_rgba(0,0,0,0.02)] flex flex-col z-10 transition-all">
        <div className="h-16 flex items-center px-6 border-b border-border">
          <div className="flex items-center justify-center w-full">
            <img src="/dashboardlogo.png" alt="Raawi Film" className="h-10 object-contain" />
          </div>
        </div>

        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          {navLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) => cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors text-sm font-medium",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-text-muted hover:bg-background hover:text-text-main",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
              )}
            >
              <link.icon className="w-5 h-5 flex-shrink-0" />
              <span>{link.label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Main Column */}
      <div className="flex-1 flex flex-col min-w-0">
        <Toaster position="top-center" />
        {/* Topbar */}
        <header className="h-16 bg-surface border-b border-border flex items-center justify-between px-6 z-10">
          <div></div>

          <div className="flex items-center gap-4">
            <button
              onClick={toggleLang}
              aria-label="Toggle language"
              className="flex items-center gap-2 text-sm font-medium text-text-muted hover:text-text-main transition-colors px-2 py-1 rounded-md hover:bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <Globe className="w-4 h-4" />
              <span>{lang === 'ar' ? 'EN' : 'عربي'}</span>
            </button>

            <div className="h-6 w-px bg-border" />

            <div className="flex items-center gap-3">
              <div className="text-end">
                <p className="text-sm font-semibold text-text-main">{user?.name}</p>
                <p className="text-xs text-text-muted capitalize">{t(user?.role.toLowerCase().replace(' ', '') as any) || user?.role}</p>
              </div>
              <button
                onClick={handleLogout}
                title={t('logout')}
                aria-label={t('logout')}
                className="w-8 h-8 rounded-full bg-background flex items-center justify-center text-text-muted hover:bg-error/10 hover:text-error transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <LogOut className="w-4 h-4 rtl:rotate-180" />
              </button>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto p-6 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
