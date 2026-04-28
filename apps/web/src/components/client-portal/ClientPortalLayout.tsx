import { useState, type ReactNode } from 'react';
import {
  Award,
  Bell,
  Building2,
  ChevronLeft,
  ChevronRight,
  FileText,
  Globe,
  LayoutDashboard,
  LogOut,
  PlusSquare,
  Settings,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/utils/cn';

export type ClientPortalSection =
  | 'overview'
  | 'scripts'
  | 'new-script'
  | 'certificates'
  | 'notifications'
  | 'settings';

type ClientPortalLayoutProps = {
  lang: 'ar' | 'en';
  companyName: string;
  userName?: string;
  activeSection: ClientPortalSection;
  onSectionChange: (section: ClientPortalSection) => void;
  onToggleLanguage: () => void;
  onLogout: () => void;
  subscriptionLabel: string;
  summary: {
    totalScripts: number;
    rejectedScripts: number;
  };
  children: ReactNode;
};

type NavItem = {
  id: ClientPortalSection;
  labelAr: string;
  labelEn: string;
  descriptionAr: string;
  descriptionEn: string;
  icon: typeof LayoutDashboard;
  badge?: number;
};

const navItems: NavItem[] = [
  {
    id: 'overview',
    labelAr: 'لوحة التحكم',
    labelEn: 'Overview',
    descriptionAr: 'ملخص سريع لحركة النصوص',
    descriptionEn: 'Quick summary of script activity',
    icon: LayoutDashboard,
  },
  {
    id: 'scripts',
    labelAr: 'نصوصي',
    labelEn: 'My Scripts',
    descriptionAr: 'متابعة الحالات والقرارات',
    descriptionEn: 'Track statuses and decisions',
    icon: FileText,
  },
  {
    id: 'new-script',
    labelAr: 'إضافة نص',
    labelEn: 'Add Script',
    descriptionAr: 'رفع نص جديد للشركة',
    descriptionEn: 'Submit a new script',
    icon: PlusSquare,
  },
  {
    id: 'certificates',
    labelAr: 'الشهادات',
    labelEn: 'Certificates',
    descriptionAr: 'الشهادات والوثائق الصادرة',
    descriptionEn: 'Issued certificates and documents',
    icon: Award,
  },
  {
    id: 'notifications',
    labelAr: 'الإشعارات',
    labelEn: 'Notifications',
    descriptionAr: 'آخر التنبيهات والتحديثات',
    descriptionEn: 'Latest alerts and updates',
    icon: Bell,
  },
  {
    id: 'settings',
    labelAr: 'الإعدادات',
    labelEn: 'Settings',
    descriptionAr: 'بيانات الحساب والشركة',
    descriptionEn: 'Account and company settings',
    icon: Settings,
  },
];

export function ClientPortalLayout({
  lang,
  companyName,
  userName,
  activeSection,
  onSectionChange,
  onToggleLanguage,
  onLogout,
  subscriptionLabel,
  summary,
  children,
}: ClientPortalLayoutProps) {
  const isArabic = lang === 'ar';
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const CollapseIcon = isArabic
    ? (isSidebarCollapsed ? ChevronLeft : ChevronRight)
    : (isSidebarCollapsed ? ChevronRight : ChevronLeft);

  return (
    <div className="client-portal-theme client-portal-shell min-h-screen text-text-main">
      <div className="flex min-h-screen w-full flex-col px-3 py-3 md:px-5 md:py-5">
        <header className="client-portal-panel mb-4 rounded-[calc(var(--radius)+0.75rem)] border border-border/70 px-4 py-4 shadow-[0_20px_60px_rgba(31,23,36,0.08)] md:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Building2 className="h-7 w-7" />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-[0.24em] text-text-muted">
                  {isArabic ? 'بوابة شركات الإنتاج' : 'Production Company Portal'}
                </p>
                <h1 className="text-xl font-bold md:text-2xl">{companyName}</h1>
                <p className="text-sm text-text-muted">
                  {isArabic
                    ? 'لوحة الشركة لمتابعة النصوص والطلبات والوثائق'
                    : 'Company dashboard for scripts, requests, and documents'}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 md:gap-3">
              <Badge variant="success">{subscriptionLabel}</Badge>
              <Badge variant="outline">
                {isArabic ? `إجمالي النصوص: ${summary.totalScripts}` : `Total Scripts: ${summary.totalScripts}`}
              </Badge>
              <Badge variant={summary.rejectedScripts > 0 ? 'warning' : 'outline'}>
                {isArabic ? `المرفوض: ${summary.rejectedScripts}` : `Rejected: ${summary.rejectedScripts}`}
              </Badge>
              {userName ? <span className="px-2 text-sm text-text-muted">{userName}</span> : null}
              <Button variant="outline" size="sm" onClick={onToggleLanguage}>
                <Globe className="me-2 h-4 w-4" />
                {isArabic ? 'English' : 'عربي'}
              </Button>
              <Button variant="outline" size="sm" onClick={onLogout}>
                <LogOut className="me-2 h-4 w-4" />
                {isArabic ? 'تسجيل الخروج' : 'Logout'}
              </Button>
            </div>
          </div>
        </header>

        <div className={cn('grid flex-1 gap-4', isSidebarCollapsed ? 'lg:grid-cols-[92px_minmax(0,1fr)]' : 'lg:grid-cols-[300px_minmax(0,1fr)]')}>
          <aside className={cn('client-portal-panel hidden rounded-[calc(var(--radius)+0.75rem)] border border-border/70 p-4 shadow-[0_20px_60px_rgba(31,23,36,0.06)] lg:block', isSidebarCollapsed && 'px-3')}>
            <div className="mb-4 flex items-center justify-between gap-2">
              {!isSidebarCollapsed ? (
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-[0.24em] text-text-muted">
                    {isArabic ? 'تنقل البوابة' : 'Portal Navigation'}
                  </p>
                  <p className="mt-1 text-sm text-text-muted">
                    {isArabic ? 'يمكنك طي الشريط لتوسيع مساحة العمل.' : 'Collapse the sidebar to expand the workspace.'}
                  </p>
                </div>
              ) : (
                <span className="sr-only">{isArabic ? 'الشريط الجانبي' : 'Sidebar'}</span>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsSidebarCollapsed((value) => !value)}
                className="shrink-0"
                aria-label={isSidebarCollapsed
                  ? (isArabic ? 'توسيع الشريط الجانبي' : 'Expand sidebar')
                  : (isArabic ? 'طي الشريط الجانبي' : 'Collapse sidebar')}
                title={isSidebarCollapsed
                  ? (isArabic ? 'توسيع الشريط الجانبي' : 'Expand sidebar')
                  : (isArabic ? 'طي الشريط الجانبي' : 'Collapse sidebar')}
              >
                <CollapseIcon className="h-4 w-4" />
              </Button>
            </div>

            {!isSidebarCollapsed ? (
              <div className="client-portal-hero rounded-[calc(var(--radius)+0.6rem)] px-4 py-5 text-white">
                <p className="text-xs font-medium uppercase tracking-[0.24em] text-white/70">
                  {isArabic ? 'مساحة الشركة' : 'Company Space'}
                </p>
                <h2 className="mt-2 text-lg font-semibold">
                  {isArabic ? 'إدارة النصوص والطلبات' : 'Manage Scripts and Requests'}
                </h2>
                <p className="mt-2 text-sm leading-6 text-white/80">
                  {isArabic
                    ? 'هذا هو الغلاف الأساسي للبوابة الجديدة. سنضيف الأقسام تدريجيًا مع الحفاظ على ربطها الكامل مع الإدارة.'
                    : 'This is the foundation shell of the new portal. Sections will be added gradually while keeping full admin wiring.'}
                </p>
              </div>
            ) : null}

            <nav className={cn('space-y-2', !isSidebarCollapsed && 'mt-4')}>
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = item.id === activeSection;
                return (
                  <button
                    key={item.id}
                    type="button"
                    data-active={active}
                    onClick={() => onSectionChange(item.id)}
                    className={cn(
                      'client-portal-sidebar-link flex w-full rounded-[calc(var(--radius)+0.45rem)] px-4 py-3 text-start transition',
                      isSidebarCollapsed ? 'items-center justify-center px-2' : 'items-start gap-3',
                      active
                        ? 'bg-primary/8 text-primary shadow-[0_10px_30px_rgba(103,42,85,0.08)]'
                        : 'hover:bg-background text-text-main',
                    )}
                    aria-label={isArabic ? item.labelAr : item.labelEn}
                    title={isArabic ? item.labelAr : item.labelEn}
                  >
                    <span className={cn('mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl', active ? 'bg-primary text-white' : 'bg-background text-text-muted')}>
                      <Icon className="h-5 w-5" />
                    </span>
                    {!isSidebarCollapsed ? (
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2 text-sm font-semibold">
                          {isArabic ? item.labelAr : item.labelEn}
                          {typeof item.badge === 'number' && item.badge > 0 ? (
                            <Badge variant="outline" className="px-2 py-0 text-[10px]">
                              {item.badge}
                            </Badge>
                          ) : null}
                        </span>
                        <span className="mt-1 block text-xs leading-5 text-text-muted">
                          {isArabic ? item.descriptionAr : item.descriptionEn}
                        </span>
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </nav>
          </aside>

          <div className="min-w-0 space-y-4">
            <div className="client-portal-panel flex gap-2 overflow-x-auto rounded-[calc(var(--radius)+0.6rem)] border border-border/70 p-2 shadow-[0_16px_40px_rgba(31,23,36,0.05)] lg:hidden">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = item.id === activeSection;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSectionChange(item.id)}
                    className={cn(
                      'flex min-w-max items-center gap-2 rounded-[calc(var(--radius)+0.4rem)] px-3 py-2 text-sm transition',
                      active ? 'bg-primary text-white' : 'bg-background text-text-main',
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{isArabic ? item.labelAr : item.labelEn}</span>
                  </button>
                );
              })}
            </div>

            <div className="min-w-0">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
