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
  Award,
  Bell,
  Wand2,
  PanelLeftClose,
  PanelLeftOpen
} from 'lucide-react';
import { cn } from '@/utils/cn';
import { formatDateTime } from '@/utils/dateFormat';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useDataStore } from '@/store/dataStore';
import { useSettingsStore } from '@/store/settingsStore';
import { notificationsApi, NotificationItem } from '@/api';
import { ENABLE_QUICK_ANALYSIS } from '@/lib/env';

export function AppLayout() {
  const { t, lang, toggleLang } = useLangStore();
  const { user, logout, hasPermission, hasSection } = useAuthStore();
  const { settings } = useSettingsStore();
  const navigate = useNavigate();
  const { fetchInitialData } = useDataStore();
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('dashboard-sidebar-collapsed') === '1';
  });

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('dashboard-sidebar-collapsed', isSidebarCollapsed ? '1' : '0');
  }, [isSidebarCollapsed]);

  const handleLogout = useCallback(() => {
    logout();
    navigate('/login', { replace: true, state: {} });
  }, [logout, navigate]);

  // Session idle timeout: logout after N minutes of no activity (BUG-08: enforce minimum 60 min)
  useEffect(() => {
    const raw = settings?.security?.sessionTimeoutMinutes ?? 60;
    const minutes = Math.max(60, raw);
    if (minutes <= 0) return;

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
    ...(ENABLE_QUICK_ANALYSIS
      ? [{ to: '/quick-analysis', icon: Wand2, label: lang === 'ar' ? 'تحليل سريع' : 'Quick Analysis', section: null as string | null, permission: null as string | null }]
      : []),
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
    // No section/permission required → always show (Overview, Settings, Certificates)
    if (!link.section && !link.permission) return true;

    // Section-based: single source of truth — show only if user has this section
    if (link.section) return hasSection(link.section);

    // Legacy: link has permission but no section
    return link.permission ? hasPermission(link.permission) : false;
  });

  const [notifUnreadCount, setNotifUnreadCount] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifList, setNotifList] = useState<NotificationItem[]>([]);
  const notifRef = useRef<HTMLDivElement>(null);
  const [notifPanelStyle, setNotifPanelStyle] = useState<{ top: number; left: number; width: number } | null>(null);

  const updateNotifPanelPosition = useCallback(() => {
    if (!notifRef.current || typeof window === 'undefined') return;
    const rect = notifRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const width = Math.min(320, Math.max(220, viewportWidth - 16));
    const preferredLeft = lang === 'ar' ? rect.left : rect.right - width;
    const left = Math.max(8, Math.min(preferredLeft, viewportWidth - width - 8));
    const top = rect.bottom + 8;
    setNotifPanelStyle({ top, left, width });
  }, [lang]);

  useEffect(() => {
    notificationsApi.getUnreadCount().then(r => setNotifUnreadCount(r.unreadCount)).catch(() => {});
  }, []);

  const openNotifPanel = useCallback(() => {
    const nextOpen = !notifOpen;
    if (!notifOpen) {
      notificationsApi.getList().then(r => {
        setNotifList(r.data);
        setNotifUnreadCount(r.unreadCount);
      }).catch(() => {});
    }
    setNotifOpen(nextOpen);
    if (nextOpen) {
      requestAnimationFrame(() => updateNotifPanelPosition());
    }
  }, [notifOpen, updateNotifPanelPosition]);

  useEffect(() => {
    if (!notifOpen) return;
    updateNotifPanelPosition();
    const onViewportChange = () => updateNotifPanelPosition();
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('scroll', onViewportChange, true);
    return () => {
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('scroll', onViewportChange, true);
    };
  }, [notifOpen, lang, updateNotifPanelPosition]);

  useEffect(() => {
    const onOutside = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
    };
    if (notifOpen) document.addEventListener('click', onOutside);
    return () => document.removeEventListener('click', onOutside);
  }, [notifOpen]);

  const handleNotifClick = useCallback((n: NotificationItem) => {
    if (!n.readAt) {
      notificationsApi.markRead(n.id).then(() => {
        setNotifUnreadCount(c => Math.max(0, c - 1));
        setNotifList(list => list.map(item => item.id === n.id ? { ...item, readAt: new Date().toISOString() } : item));
      }).catch(() => {});
    }
    const scriptId = n.metadata?.script_id as string | undefined;
    setNotifOpen(false);
    if (scriptId) navigate(`/workspace/${scriptId}`);
  }, [navigate]);

  const handleMarkAllRead = useCallback(() => {
    notificationsApi.markAllRead().then(() => {
      setNotifUnreadCount(0);
      setNotifList(list => list.map(item => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })));
    }).catch(() => {});
  }, []);

  return (
    <div className="flex h-screen bg-background text-text-main overflow-hidden">
      {/* Sidebar */}
      <aside
        className={cn(
          "hidden md:flex flex-shrink-0 border-e border-border bg-surface shadow-[0_0_15px_rgba(0,0,0,0.02)] flex-col z-10 transition-all duration-300",
          isSidebarCollapsed ? "w-20" : "w-64"
        )}
      >
        <div className={cn("h-16 flex items-center border-b border-border", isSidebarCollapsed ? "px-3 justify-center" : "px-6")}>
          <div className="flex items-center justify-center w-full">
            <img
              src="/dashboardlogo.png"
              alt="Raawi Film"
              className={cn("object-contain transition-all duration-300", isSidebarCollapsed ? "h-8" : "h-10")}
            />
          </div>
        </div>

        <nav className={cn("flex-1 py-4 space-y-1 overflow-y-auto", isSidebarCollapsed ? "px-2" : "px-3")}>
          {navLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              title={isSidebarCollapsed ? link.label : undefined}
              className={({ isActive }) => cn(
                "flex items-center rounded-md transition-colors text-sm font-medium",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-text-muted hover:bg-background hover:text-text-main",
                isSidebarCollapsed ? "justify-center px-2 py-3" : "gap-3 px-3 py-2.5",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
              )}
            >
              <link.icon className="w-5 h-5 flex-shrink-0" />
              {!isSidebarCollapsed && <span>{link.label}</span>}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Main Column */}
      <div className="flex-1 flex flex-col min-w-0">
        <Toaster position="top-center" />
        {/* Topbar */}
        <header className="relative h-16 bg-surface border-b border-border flex items-center justify-between px-4 md:px-6 z-[140]">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsSidebarCollapsed((value) => !value)}
              aria-label={isSidebarCollapsed
                ? (lang === 'ar' ? 'توسيع الشريط الجانبي' : 'Expand sidebar')
                : (lang === 'ar' ? 'طي الشريط الجانبي' : 'Collapse sidebar')}
              title={isSidebarCollapsed
                ? (lang === 'ar' ? 'توسيع الشريط الجانبي' : 'Expand sidebar')
                : (lang === 'ar' ? 'طي الشريط الجانبي' : 'Collapse sidebar')}
              className="hidden md:flex items-center justify-center w-9 h-9 rounded-md text-text-muted hover:text-text-main hover:bg-background transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              {isSidebarCollapsed ? <PanelLeftOpen className="w-5 h-5" /> : <PanelLeftClose className="w-5 h-5" />}
            </button>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative z-[150]" ref={notifRef}>
              <button
                onClick={openNotifPanel}
                aria-label={lang === 'ar' ? 'الإشعارات' : 'Notifications'}
                className="relative flex items-center justify-center w-9 h-9 rounded-md text-text-muted hover:text-text-main hover:bg-background transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <Bell className="w-5 h-5" />
                {notifUnreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] font-semibold text-white bg-error rounded-full">
                    {notifUnreadCount > 99 ? '99+' : notifUnreadCount}
                  </span>
                )}
              </button>
              {notifOpen && (
                <div
                  className="fixed max-h-[min(24rem,70vh)] overflow-hidden rounded-lg border border-border bg-surface shadow-lg z-[200] flex flex-col"
                  style={notifPanelStyle ? { top: notifPanelStyle.top, left: notifPanelStyle.left, width: notifPanelStyle.width } : undefined}
                >
                  <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                    <span className="text-sm font-semibold text-text-main">{lang === 'ar' ? 'الإشعارات' : 'Notifications'}</span>
                    {notifUnreadCount > 0 && (
                      <button
                        onClick={handleMarkAllRead}
                        className="text-xs text-primary hover:underline"
                      >
                        {lang === 'ar' ? 'تعليم الكل كمقروء' : 'Mark all read'}
                      </button>
                    )}
                  </div>
                  <div className="overflow-y-auto flex-1">
                    {notifList.length === 0 ? (
                      <p className="px-4 py-6 text-sm text-text-muted text-center">{lang === 'ar' ? 'لا توجد إشعارات' : 'No notifications'}</p>
                    ) : (
                      notifList.map((n) => (
                        <button
                          key={n.id}
                          onClick={() => handleNotifClick(n)}
                          className={cn(
                            'w-full text-left px-4 py-3 border-b border-border last:border-b-0 hover:bg-background transition-colors',
                            !n.readAt && 'bg-primary/5'
                          )}
                        >
                          <p className="text-sm font-medium text-text-main">{n.title}</p>
                          {n.body && <p className="text-xs text-text-muted mt-0.5 line-clamp-2">{n.body}</p>}
                          <p className="text-xs text-text-muted mt-1">{formatDateTime(new Date(n.createdAt), { lang })}</p>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
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
