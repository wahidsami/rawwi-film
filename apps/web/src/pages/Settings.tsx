import { useState } from 'react';
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

type TabId = 'account' | 'platform' | 'security' | 'branding' | 'features';

export default function Settings() {
  const { t, lang } = useLangStore();
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabId>('account');
  const { settings, updateSettings } = useSettingsStore();

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
                    onSubmit={(e) => e.preventDefault()}
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
                        <Input type="password" autoComplete="current-password" />
                      </div>
                      <div className="max-w-md">
                        <label className="block text-sm font-medium text-text-muted mb-1.5">{t('newPassword')}</label>
                        <Input type="password" autoComplete="new-password" />
                      </div>
                      <div className="max-w-md">
                        <label className="block text-sm font-medium text-text-muted mb-1.5">{t('confirmPassword')}</label>
                        <Input type="password" autoComplete="new-password" />
                      </div>
                    </div>
                    <button type="submit" className="px-4 py-2 bg-primary text-white text-sm rounded-md font-medium hover:bg-primary/90 transition-colors">
                      {t('saveChanges')}
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
                          value={settings.security.sessionTimeoutMinutes.toString()}
                          onChange={(e) => updateSection('security', { sessionTimeoutMinutes: parseInt(e.target.value) })}
                          options={[
                            { value: '15', label: '15' },
                            { value: '30', label: '30' },
                            { value: '60', label: '60' },
                            { value: '240', label: '240' }
                          ]}
                        />
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
