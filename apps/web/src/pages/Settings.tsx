import { useEffect, useState } from 'react';
import { useLangStore } from '@/store/langStore';
import { useAuthStore } from '@/store/authStore';
import { useSettingsStore, AppSettings } from '@/store/settingsStore';
import { cn } from '@/utils/cn';
import { User, Settings as SettingsIcon, Shield, FileText, FlaskConical, LogOut } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Switch } from '@/components/ui/Switch';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { validatePassword } from '@/utils/validation';
import {
  createScriptClassificationOption,
  updateScriptClassificationOption,
  useScriptClassificationOptions,
} from '@/lib/scriptClassificationOptions';

type TabId = 'account' | 'platform' | 'security' | 'branding' | 'features';

export default function Settings() {
  const { t, lang } = useLangStore();
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabId>('account');
  const { settings, updateSettings } = useSettingsStore();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const {
    options: scriptClassificationOptions,
    isLoading: scriptClassificationLoading,
    reload: reloadScriptClassifications,
  } = useScriptClassificationOptions(true);
  const [classificationDrafts, setClassificationDrafts] = useState<Array<{
    id: string;
    labelAr: string;
    labelEn: string;
    sortOrder: string;
    isActive: boolean;
  }>>([]);
  const [newClassification, setNewClassification] = useState({
    labelAr: '',
    labelEn: '',
    sortOrder: '',
  });
  const [savingClassificationId, setSavingClassificationId] = useState<string | null>(null);
  const [creatingClassification, setCreatingClassification] = useState(false);

  const isAdmin = user?.role === 'Super Admin' || user?.role === 'Admin';

  const tabs = [
    { id: 'account', label: t('myAccount'), icon: User },
    ...(isAdmin ? [
      { id: 'platform', label: t('platformSettings'), icon: SettingsIcon },
      { id: 'security', label: t('security'), icon: Shield },
      { id: 'branding', label: t('brandingReports'), icon: FileText },
      { id: 'features', label: t('featureFlags'), icon: FlaskConical },
    ] : [])
  ] as { id: TabId; label: string; icon: any }[];

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const updateSection = <K extends keyof AppSettings>(section: K, values: Partial<AppSettings[K]>) => {
    updateSettings({ [section]: { ...settings[section], ...values } } as Partial<AppSettings>);
    toast.success(t('settingsUpdated'));
  };

  useEffect(() => {
    setClassificationDrafts(
      scriptClassificationOptions.map((option) => ({
        id: option.id,
        labelAr: option.label_ar,
        labelEn: option.label_en,
        sortOrder: String(option.sort_order),
        isActive: option.is_active,
      })),
    );
  }, [scriptClassificationOptions]);

  const updateClassificationDraft = (id: string, updates: Partial<{
    labelAr: string;
    labelEn: string;
    sortOrder: string;
    isActive: boolean;
  }>) => {
    setClassificationDrafts((drafts) => drafts.map((draft) => (
      draft.id === id ? { ...draft, ...updates } : draft
    )));
  };

  const handleSaveClassification = async (draft: {
    id: string;
    labelAr: string;
    labelEn: string;
    sortOrder: string;
    isActive: boolean;
  }) => {
    if (!draft.labelAr.trim() || !draft.labelEn.trim()) {
      toast.error(lang === 'ar' ? 'أدخل الاسم العربي والإنجليزي' : 'Enter both Arabic and English labels');
      return;
    }
    setSavingClassificationId(draft.id);
    try {
      await updateScriptClassificationOption(draft.id, {
        labelAr: draft.labelAr,
        labelEn: draft.labelEn,
        sortOrder: Number.parseInt(draft.sortOrder || '0', 10) || 0,
        isActive: draft.isActive,
      });
      await reloadScriptClassifications();
      toast.success(lang === 'ar' ? 'تم تحديث التصنيف' : 'Classification updated');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : (lang === 'ar' ? 'تعذر تحديث التصنيف' : 'Failed to update classification'));
    } finally {
      setSavingClassificationId(null);
    }
  };

  const handleToggleClassification = async (draft: {
    id: string;
    labelAr: string;
    labelEn: string;
    sortOrder: string;
    isActive: boolean;
  }) => {
    setSavingClassificationId(draft.id);
    try {
      await updateScriptClassificationOption(draft.id, {
        isActive: !draft.isActive,
      });
      await reloadScriptClassifications();
      toast.success(lang === 'ar'
        ? (draft.isActive ? 'تم إيقاف التصنيف' : 'تم تفعيل التصنيف')
        : (draft.isActive ? 'Classification disabled' : 'Classification enabled'));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : (lang === 'ar' ? 'تعذر تحديث حالة التصنيف' : 'Failed to update classification status'));
    } finally {
      setSavingClassificationId(null);
    }
  };

  const handleCreateClassification = async () => {
    if (!newClassification.labelAr.trim() || !newClassification.labelEn.trim()) {
      toast.error(lang === 'ar' ? 'أدخل الاسم العربي والإنجليزي' : 'Enter both Arabic and English labels');
      return;
    }
    setCreatingClassification(true);
    try {
      await createScriptClassificationOption({
        labelAr: newClassification.labelAr,
        labelEn: newClassification.labelEn,
        sortOrder: Number.parseInt(newClassification.sortOrder || '0', 10) || 0,
      });
      setNewClassification({ labelAr: '', labelEn: '', sortOrder: '' });
      await reloadScriptClassifications();
      toast.success(lang === 'ar' ? 'تمت إضافة التصنيف' : 'Classification added');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : (lang === 'ar' ? 'تعذر إضافة التصنيف' : 'Failed to add classification'));
    } finally {
      setCreatingClassification(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword.trim()) {
      toast.error(lang === 'ar' ? 'أدخل كلمة المرور الجديدة' : 'Enter new password');
      return;
    }
    const validation = validatePassword(newPassword);
    if (!validation.ok) {
      toast.error(lang === 'ar' ? (validation.message ?? 'كلمة مرور غير صالحة') : (validation.message ?? 'Invalid password'));
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error(lang === 'ar' ? 'كلمتا المرور غير متطابقتين' : 'Passwords do not match');
      return;
    }
    setChangingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success(lang === 'ar' ? 'تم تغيير كلمة المرور' : 'Password updated');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : (lang === 'ar' ? 'فشل تغيير كلمة المرور' : 'Failed to update password'));
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-main">{t('settings')}</h1>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        {/* Sub-sidebar Tabs */}
        <div className="w-full md:w-64 flex-shrink-0">
          <Card>
            <CardContent className="p-2 space-y-1">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors text-sm font-medium text-start",
                    activeTab === tab.id
                      ? "bg-primary/10 text-primary"
                      : "text-text-muted hover:bg-surface-hover hover:text-text-main"
                  )}
                >
                  <tab.icon className="w-5 h-5 flex-shrink-0" />
                  <span>{tab.label}</span>
                </button>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Content Area */}
        <div className="flex-1 min-w-0">
          <Card>
            <CardContent className="p-6">
              {activeTab === 'account' && (
                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2">
                  <div className="space-y-4">
                    <h3 className="text-lg font-bold text-text-main">{t('profile')}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-text-muted mb-1.5">{t('fullName')}</label>
                        <Input value={user?.name || ''} disabled />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-text-muted mb-1.5">{t('email')}</label>
                        <Input value={user?.email || ''} disabled dir="ltr" className="text-start" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-text-muted mb-1.5">{t('role')}</label>
                        <Input value={t(user?.role.toLowerCase().replace(' ', '') as any) || user?.role} disabled />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-text-muted mb-1.5">{t('preferredLanguage')}</label>
                        <Select 
                          value={lang}
                          disabled
                          options={[
                            { value: 'ar', label: 'العربية (Arabic)' },
                            { value: 'en', label: 'English' }
                          ]} 
                        />
                      </div>
                    </div>
                  </div>

                  <hr className="border-border" />

                  <form
                    className="space-y-4"
                    onSubmit={handleChangePassword}
                    aria-label={t('changePassword')}
                  >
                    {/* Hidden username for password-manager and a11y (Chrome recommends it) */}
                    <input
                      type="email"
                      name="username"
                      autoComplete="username"
                      defaultValue={user?.email ?? ''}
                      readOnly
                      aria-hidden="true"
                      className="absolute w-px h-px -m-px overflow-hidden p-0 border-0 opacity-0 pointer-events-none"
                    />
                    <h3 className="text-lg font-bold text-text-main">{t('changePassword')}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="md:col-span-2 max-w-md">
                        <label className="block text-sm font-medium text-text-muted mb-1.5">{t('currentPassword')}</label>
                        <Input type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
                      </div>
                      <div className="max-w-md">
                        <label className="block text-sm font-medium text-text-muted mb-1.5">{t('newPassword')}</label>
                        <Input type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                      </div>
                      <div className="max-w-md">
                        <label className="block text-sm font-medium text-text-muted mb-1.5">{t('confirmPassword')}</label>
                        <Input type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
                      </div>
                    </div>
                    <button type="submit" className="px-4 py-2 bg-primary text-white text-sm rounded-md font-medium hover:bg-primary/90 transition-colors disabled:opacity-50" disabled={changingPassword}>
                      {changingPassword ? (lang === 'ar' ? 'جاري الحفظ…' : 'Saving…') : t('saveChanges')}
                    </button>
                  </form>

                  <hr className="border-border" />

                  <div>
                    <button 
                      onClick={handleLogout}
                      className="flex items-center gap-2 px-4 py-2 bg-error/10 text-error text-sm rounded-md font-medium hover:bg-error/20 transition-colors"
                    >
                      <LogOut className="w-4 h-4 rtl:rotate-180" />
                      <span>{t('signOut')}</span>
                    </button>
                  </div>
                </div>
              )}

              {activeTab === 'platform' && isAdmin && (
                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2">
                  <div className="space-y-4">
                    <h3 className="text-lg font-bold text-text-main">{t('platformSettings')}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-sm font-medium text-text-muted mb-1.5">{t('defaultLanguage')}</label>
                        <Select 
                          value={settings.platform.defaultLanguage}
                          onChange={(e) => updateSection('platform', { defaultLanguage: e.target.value as any })}
                          options={[
                            { value: 'ar', label: 'العربية' },
                            { value: 'en', label: 'English' }
                          ]}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-text-muted mb-1.5">{t('defaultReportMode')}</label>
                        <Select 
                          value={settings.platform.reportMode}
                          onChange={(e) => updateSection('platform', { reportMode: e.target.value as any })}
                          options={[
                            { value: 'in_app', label: t('inApp') },
                            { value: 'standalone', label: t('standaloneHtml') },
                            { value: 'both', label: t('both') }
                          ]}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-text-muted mb-1.5">{t('dateFormat')}</label>
                        <Input 
                          value={settings.platform.dateFormat} 
                          onChange={(e) => updateSection('platform', { dateFormat: e.target.value })} 
                          dir="ltr"
                          className="text-start"
                        />
                      </div>
                    </div>
                  </div>

                  <hr className="border-border" />

                  <div className="space-y-4">
                    <h3 className="text-lg font-bold text-text-main">{t('versioningBehavior')}</h3>
                    
                    <div className="flex items-center justify-between p-4 bg-background rounded-lg border border-border">
                      <div className="space-y-0.5">
                        <p className="font-medium text-sm text-text-main">{t('createVersionOnReplace')}</p>
                      </div>
                      <Switch 
                        checked={settings.platform.createVersionOnFileReplace} 
                        onCheckedChange={(c) => updateSection('platform', { createVersionOnFileReplace: c })} 
                      />
                    </div>
                    
                    <div className="flex items-center justify-between p-4 bg-background rounded-lg border border-border">
                      <div className="space-y-0.5">
                        <p className="font-medium text-sm text-text-main">{t('requireOverrideReason')}</p>
                      </div>
                      <Switch 
                        checked={settings.platform.requireOverrideReason} 
                        onCheckedChange={(c) => updateSection('platform', { requireOverrideReason: c })} 
                      />
                    </div>
                  </div>

                  <hr className="border-border" />

                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-bold text-text-main">
                          {lang === 'ar' ? 'تصنيفات الأعمال' : 'Work Classifications'}
                        </h3>
                        <p className="text-sm text-text-muted">
                          {lang === 'ar'
                            ? 'أي تصنيف تضيفه هنا سيظهر تلقائياً في قوائم إضافة النصوص للإدارة والعميل.'
                            : 'Any classification added here will automatically appear in script creation dropdowns for admins and clients.'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void reloadScriptClassifications()}
                        className="px-3 py-2 text-sm rounded-md border border-border bg-background hover:bg-surface-hover transition-colors"
                      >
                        {lang === 'ar' ? 'تحديث' : 'Refresh'}
                      </button>
                    </div>

                    {scriptClassificationLoading ? (
                      <div className="rounded-lg border border-border bg-background px-4 py-6 text-sm text-text-muted">
                        {lang === 'ar' ? 'جاري تحميل التصنيفات...' : 'Loading classifications...'}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {classificationDrafts.map((draft) => (
                          <div key={draft.id} className="rounded-lg border border-border bg-background p-4">
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                              <Input
                                label={lang === 'ar' ? 'الاسم بالعربية' : 'Arabic Label'}
                                value={draft.labelAr}
                                onChange={(e) => updateClassificationDraft(draft.id, { labelAr: e.target.value })}
                              />
                              <Input
                                label={lang === 'ar' ? 'الاسم بالإنجليزية' : 'English Label'}
                                value={draft.labelEn}
                                onChange={(e) => updateClassificationDraft(draft.id, { labelEn: e.target.value })}
                              />
                              <Input
                                label={lang === 'ar' ? 'الترتيب' : 'Sort Order'}
                                type="number"
                                value={draft.sortOrder}
                                onChange={(e) => updateClassificationDraft(draft.id, { sortOrder: e.target.value })}
                              />
                              <div className="space-y-2">
                                <label className="block text-sm font-medium text-text-main">
                                  {lang === 'ar' ? 'الحالة' : 'Status'}
                                </label>
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className={cn(
                                    'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium',
                                    draft.isActive
                                      ? 'bg-success/10 text-success'
                                      : 'bg-surface-hover text-text-muted',
                                  )}>
                                    {draft.isActive
                                      ? (lang === 'ar' ? 'نشط' : 'Active')
                                      : (lang === 'ar' ? 'مخفي' : 'Hidden')}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => void handleToggleClassification(draft)}
                                    disabled={savingClassificationId === draft.id}
                                    className="px-3 py-2 text-xs rounded-md border border-border bg-surface hover:bg-surface-hover transition-colors disabled:opacity-50"
                                  >
                                    {draft.isActive
                                      ? (lang === 'ar' ? 'إيقاف' : 'Disable')
                                      : (lang === 'ar' ? 'تفعيل' : 'Enable')}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void handleSaveClassification(draft)}
                                    disabled={savingClassificationId === draft.id}
                                    className="px-3 py-2 text-xs rounded-md bg-primary text-white hover:bg-primary/90 transition-colors disabled:opacity-50"
                                  >
                                    {savingClassificationId === draft.id
                                      ? (lang === 'ar' ? 'جاري الحفظ…' : 'Saving…')
                                      : (lang === 'ar' ? 'حفظ' : 'Save')}
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="rounded-lg border border-dashed border-border bg-background p-4 space-y-4">
                      <h4 className="font-semibold text-text-main">
                        {lang === 'ar' ? 'إضافة تصنيف جديد' : 'Add New Classification'}
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <Input
                          label={lang === 'ar' ? 'الاسم بالعربية' : 'Arabic Label'}
                          value={newClassification.labelAr}
                          onChange={(e) => setNewClassification((state) => ({ ...state, labelAr: e.target.value }))}
                        />
                        <Input
                          label={lang === 'ar' ? 'الاسم بالإنجليزية' : 'English Label'}
                          value={newClassification.labelEn}
                          onChange={(e) => setNewClassification((state) => ({ ...state, labelEn: e.target.value }))}
                        />
                        <Input
                          label={lang === 'ar' ? 'الترتيب' : 'Sort Order'}
                          type="number"
                          value={newClassification.sortOrder}
                          onChange={(e) => setNewClassification((state) => ({ ...state, sortOrder: e.target.value }))}
                        />
                        <div className="flex items-end">
                          <button
                            type="button"
                            onClick={() => void handleCreateClassification()}
                            disabled={creatingClassification}
                            className="w-full h-10 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                          >
                            {creatingClassification
                              ? (lang === 'ar' ? 'جاري الإضافة…' : 'Adding…')
                              : (lang === 'ar' ? 'إضافة' : 'Add')}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'security' && isAdmin && (
                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2">
                  <div className="space-y-4">
                    <h3 className="text-lg font-bold text-text-main">{t('security')}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-sm font-medium text-text-muted mb-1.5">{t('sessionTimeout')}</label>
                        <Select 
                          value={Math.max(60, settings.security.sessionTimeoutMinutes).toString()}
                          onChange={(e) => updateSection('security', { sessionTimeoutMinutes: Math.max(60, parseInt(e.target.value, 10) || 60) })}
                          options={[
                            { value: '60', label: '60' },
                            { value: '120', label: '120' },
                            { value: '240', label: '240' },
                            { value: '480', label: '480' }
                          ]}
                        />
                        <p className="text-xs text-text-muted mt-1">{lang === 'ar' ? 'الحد الأدنى الموصى به: 60 دقيقة (لتجنب انقطاع الجلسة).' : 'Minimum recommended: 60 minutes (avoids session interruption).'}</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-text-muted mb-1.5">{t('auditLogRetention')}</label>
                        <Select 
                          value={settings.security.auditLogRetentionDays.toString()}
                          onChange={(e) => updateSection('security', { auditLogRetentionDays: parseInt(e.target.value) })}
                          options={[
                            { value: '30', label: '30' },
                            { value: '90', label: '90' },
                            { value: '180', label: '180' },
                            { value: '365', label: '365' }
                          ]}
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between p-4 bg-background rounded-lg border border-border mt-4">
                      <div className="space-y-0.5">
                        <p className="font-medium text-sm text-text-main">{t('forceRelogin')}</p>
                      </div>
                      <Switch 
                        checked={settings.security.forceRelogin} 
                        onCheckedChange={(c) => updateSection('security', { forceRelogin: c })} 
                      />
                    </div>
                  </div>

                  <hr className="border-border" />

                  <div className="space-y-4">
                    <h3 className="text-lg font-bold text-text-main">{t('passwordPolicy')}</h3>
                    <div className="p-4 bg-background rounded-lg border border-border">
                      <p className="text-sm text-text-muted">{t('passwordPolicyDesc')}</p>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'branding' && isAdmin && (
                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2">
                  <div className="space-y-4">
                    <h3 className="text-lg font-bold text-text-main">{t('brandingReports')}</h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-sm font-medium text-text-muted mb-1.5">{t('orgNameAr')}</label>
                        <Input 
                          value={settings.branding.orgNameAr} 
                          onChange={(e) => updateSection('branding', { orgNameAr: e.target.value })} 
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-text-muted mb-1.5">{t('orgNameEn')}</label>
                        <Input 
                          value={settings.branding.orgNameEn} 
                          onChange={(e) => updateSection('branding', { orgNameEn: e.target.value })} 
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-text-muted mb-1.5">{t('logoUpload')}</label>
                        <Input 
                          value={settings.branding.logoUrl} 
                          onChange={(e) => updateSection('branding', { logoUrl: e.target.value })} 
                          placeholder="https://..."
                          dir="ltr"
                          className="text-start"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-text-muted mb-1.5">{t('footerNoteAr')}</label>
                        <Input 
                          value={settings.branding.footerNoteAr} 
                          onChange={(e) => updateSection('branding', { footerNoteAr: e.target.value })} 
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-text-muted mb-1.5">{t('footerNoteEn')}</label>
                        <Input 
                          value={settings.branding.footerNoteEn} 
                          onChange={(e) => updateSection('branding', { footerNoteEn: e.target.value })} 
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-text-muted mb-1.5">{t('paperSize')}</label>
                        <Input value="A4" disabled />
                      </div>
                    </div>

                    <div className="flex items-center justify-between p-4 bg-background rounded-lg border border-border mt-4">
                      <div className="space-y-0.5">
                        <p className="font-medium text-sm text-text-main">{t('showDecisionBadge')}</p>
                      </div>
                      <Switch 
                        checked={settings.branding.showDecisionBadgeInPrint} 
                        onCheckedChange={(c) => updateSection('branding', { showDecisionBadgeInPrint: c })} 
                      />
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'features' && isAdmin && (
                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2">
                  <div className="space-y-4">
                    <h3 className="text-lg font-bold text-text-main">{t('featureFlags')}</h3>
                    
                    <div className="flex items-center justify-between p-4 bg-background rounded-lg border border-border">
                      <div className="space-y-1">
                        <p className="font-medium text-sm text-text-main">{t('enableCertificates')}</p>
                        <p className="text-xs text-text-muted">{t('featureCertDesc')}</p>
                      </div>
                      <Switch 
                        checked={settings.features.enableCertificates} 
                        onCheckedChange={(c) => updateSection('features', { enableCertificates: c })} 
                      />
                    </div>

                    <div className="flex items-center justify-between p-4 bg-background rounded-lg border border-border">
                      <div className="space-y-1">
                        <p className="font-medium text-sm text-text-main">{t('enableLexiconCsv')}</p>
                        <p className="text-xs text-text-muted">{t('featureLexiconDesc')}</p>
                      </div>
                      <Switch 
                        checked={settings.features.enableLexiconCsv} 
                        onCheckedChange={(c) => updateSection('features', { enableLexiconCsv: c })} 
                      />
                    </div>

                    <div className="flex items-center justify-between p-4 bg-background rounded-lg border border-border">
                      <div className="space-y-1">
                        <p className="font-medium text-sm text-text-main">{t('enableHiddenOverrides')}</p>
                        <p className="text-xs text-text-muted">{t('featureHiddenDesc')}</p>
                      </div>
                      <Switch 
                        checked={settings.features.enableHiddenOverrides} 
                        onCheckedChange={(c) => updateSection('features', { enableHiddenOverrides: c })} 
                      />
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
