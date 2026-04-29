import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useLangStore } from '@/store/langStore';
import { useAuthStore } from '@/store/authStore';
import {
  LayoutDashboard,
  BookOpen,
  Users,
  UserPlus,
  ShieldCheck,
  FileText,
  Settings,
  LogOut,
  Globe,
  History,
  Award,
  BadgeCheck,
  Receipt,
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
    { to: '/app', icon: LayoutDashboard, label: t('overview'), section: null as string | null, permission: null as string | null },

    // Conditional sections - supports BOTH section-based and permission-based access
    { to: '/app/clients', icon: Users, label: t('clients'), section: 'clients', permission: 'view_clients' },
    { to: '/app/scripts', icon: FileText, label: lang === 'ar' ? 'النصوص' : 'Scripts', section: 'clients', permission: 'view_scripts' },
    // Intentionally hidden for now (kept route/page in codebase).
    // { to: '/app/client-submissions', icon: FileText, label: lang === 'ar' ? 'طلبات العملاء' : 'Client Submissions', section: 'clients', permission: 'view_scripts' },
    ...(ENABLE_QUICK_ANALYSIS
      ? [{ to: '/app/quick-analysis', icon: Wand2, label: lang === 'ar' ? 'تحليل سريع' : 'Quick Analysis', section: null as string | null, permission: null as string | null }]
      : []),
    { to: '/app/glossary', icon: BookOpen, label: t('glossary'), section: 'glossary', permission: 'manage_glossary' },
    { to: '/app/tasks', icon: FileText, label: lang === 'ar' ? 'المهام' : 'Tasks', section: 'tasks', permission: 'view_tasks' },
    { to: '/app/reports', icon: FileText, label: t('reports'), section: 'reports', permission: 'view_reports' },
    ...(settings?.features?.enableCertificates ? [{ to: '/app/certificates', icon: Award, label: t('certificates'), section: null as string | null, permission: null as string | null }] : []),
    { to: '/app/access-control', icon: ShieldCheck, label: t('accessControl'), section: 'access_control', permission: 'manage_users' },
    { to: '/app/audit', icon: History, label: t('auditLog'), section: 'audit', permission: 'view_audit' },

    // Always visible
    { to: '/app/settings', icon: Settings, label: t('settings'), section: null as string | null, permission: null as string | null },
  ];

  const adminSubtitle = lang === 'ar'
    ? 'إدارة المراجعات والنصوص والتقارير'
    : 'Reviews, scripts, reports, and operations';

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
    <div className="dashboard-theme dashboard-shell flex h-screen overflow-hidden p-3 text-text-main md:p-5">
      {/* Sidebar */}
      <aside
        className={cn(
          "dashboard-panel hidden flex-shrink-0 flex-col rounded-[calc(var(--radius)+0.75rem)] border border-border/70 shadow-[0_20px_60px_rgba(31,23,36,0.06)] transition-all duration-300 md:flex",
          isSidebarCollapsed ? "w-20" : "w-72"
        )}
      >
        <div className={cn("flex items-center border-b border-border/60", isSidebarCollapsed ? "h-20 justify-center px-3" : "px-5 py-5")}>
          <div className={cn("flex min-w-0 items-center", isSidebarCollapsed ? "justify-center" : "w-full gap-3")}>
            <img
              src="/dashboardlogo.png"
              alt="Raawi Film"
              className={cn("object-contain transition-all duration-300", isSidebarCollapsed ? "h-9" : "h-11")}
            />
            {!isSidebarCollapsed && (
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-[0.24em] text-text-muted">Admin</p>
                <p className="mt-1 truncate text-sm font-semibold text-text-main">{adminSubtitle}</p>
              </div>
            )}
          </div>
        </div>

        {!isSidebarCollapsed && (
          <div className="mx-4 mt-4 rounded-[calc(var(--radius)+0.6rem)] bg-primary px-4 py-4 text-white shadow-[0_18px_40px_rgba(103,42,85,0.16)]">
            <p className="text-xs font-medium uppercase tracking-[0.22em] text-white/70">
              {lang === 'ar' ? 'مساحة الإدارة' : 'Admin Space'}
            </p>
            <p className="mt-2 text-sm font-semibold">
              {lang === 'ar' ? 'لوحة راوي فيلم' : 'Raawi Film Console'}
            </p>
          </div>
        )}

        <nav className={cn("flex-1 space-y-2 overflow-y-auto py-4", isSidebarCollapsed ? "px-2" : "px-4")}>
          {navLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              title={isSidebarCollapsed ? link.label : undefined}
              className={({ isActive }) => cn(
                "dashboard-sidebar-link flex rounded-[calc(var(--radius)+0.45rem)] text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary/8 text-primary shadow-[0_10px_30px_rgba(103,42,85,0.08)]"
                  : "text-text-muted hover:bg-background hover:text-text-main",
                isActive && "is-active",
                isSidebarCollapsed ? "items-center justify-center px-2 py-3" : "items-center gap-3 px-4 py-3",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
              )}
            >
              <span className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl transition-colors",
                "bg-background/80 text-current"
              )}>
                <link.icon className="h-5 w-5 flex-shrink-0" />
              </span>
              {!isSidebarCollapsed && <span>{link.label}</span>}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Main Column */}
      <div className="ms-0 flex min-w-0 flex-1 flex-col md:ms-4">
        <Toaster position="top-center" />
        {/* Topbar */}
        <header className="dashboard-panel relative z-[140] flex h-16 items-center justify-between rounded-[calc(var(--radius)+0.75rem)] border border-border/70 px-4 shadow-[0_16px_40px_rgba(31,23,36,0.05)] md:px-6">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsSidebarCollapsed((value) => !value)}
              aria-label={isSidebarCollapsed
                ? (lang === 'ar' ? 'توسيع الشريط الجانبي' : 'Expand sidebar')
                : (lang === 'ar' ? 'طي الشريط الجانبي' : 'Collapse sidebar')}
              title={isSidebarCollapsed
                ? (lang === 'ar' ? 'توسيع الشريط الجانبي' : 'Expand sidebar')
                : (lang === 'ar' ? 'طي الشريط الجانبي' : 'Collapse sidebar')}
              className="hidden h-9 w-9 items-center justify-center rounded-[var(--radius)] text-text-muted transition-colors hover:bg-background hover:text-text-main focus:outline-none focus:ring-2 focus:ring-primary/20 md:flex"
            >
              {isSidebarCollapsed ? <PanelLeftOpen className="w-5 h-5" /> : <PanelLeftClose className="w-5 h-5" />}
            </button>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative z-[150]" ref={notifRef}>
              <button
                onClick={openNotifPanel}
                aria-label={lang === 'ar' ? 'الإشعارات' : 'Notifications'}
                className="relative flex h-9 w-9 items-center justify-center rounded-[var(--radius)] text-text-muted transition-colors hover:bg-background hover:text-text-main focus:outline-none focus:ring-2 focus:ring-primary/20"
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
                  className="dashboard-panel fixed z-[200] flex max-h-[min(24rem,70vh)] flex-col overflow-hidden rounded-[calc(var(--radius)+0.45rem)] border border-border/70 shadow-[0_24px_60px_rgba(31,23,36,0.14)]"
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
                          <div className="flex items-start gap-2">
                            <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
                              {(() => {
                                const Icon = getNotifIcon(n.type);
                                return <Icon className="h-3.5 w-3.5" />;
                              })()}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-text-main">{n.title}</p>
                              <p className="text-[11px] text-text-muted">{getNotifTypeLabel(n.type)}</p>
                            </div>
                          </div>
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
              className="flex items-center gap-2 rounded-[var(--radius)] px-2 py-1 text-sm font-medium text-text-muted transition-colors hover:bg-background hover:text-text-main focus:outline-none focus:ring-2 focus:ring-primary/20"
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
                className="flex h-8 w-8 items-center justify-center rounded-full bg-background text-text-muted transition-colors hover:bg-error/10 hover:text-error focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <LogOut className="w-4 h-4 rtl:rotate-180" />
              </button>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="mt-4 flex-1 overflow-auto rounded-[calc(var(--radius)+0.75rem)] p-1 md:p-3">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
  const getNotifIcon = useCallback((type: string) => {
    if (type === 'client_registration_arrived') return UserPlus;
    if (type === 'client_submission' || type === 'script_assigned') return FileText;
    if (type === 'certificate_payment_completed') return Receipt;
    if (type === 'certificate_issued') return BadgeCheck;
    return Bell;
  }, []);

  const getNotifTypeLabel = useCallback((type: string) => {
    if (type === 'client_registration_arrived') return lang === 'ar' ? 'تسجيل عميل جديد' : 'New Client Registration';
    if (type === 'client_submission') return lang === 'ar' ? 'تسليم من العميل' : 'Client Submission';
    if (type === 'script_assigned') return lang === 'ar' ? 'إسناد نص' : 'Script Assigned';
    if (type === 'certificate_payment_completed') return lang === 'ar' ? 'سداد رسوم الشهادة' : 'Certificate Payment';
    if (type === 'certificate_issued') return lang === 'ar' ? 'إصدار شهادة' : 'Certificate Issued';
    return lang === 'ar' ? 'إشعار' : 'Notification';
  }, [lang]);
