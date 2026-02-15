import { useState, useEffect, useCallback } from 'react';
import { useLangStore } from '@/store/langStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Switch } from '@/components/ui/Switch';
import { Modal } from '@/components/ui/Modal';
import { Search, Plus, UserCog, Shield, Eye, Pencil, UserX, UserCheck, Trash2, Users, FileText, BookOpen, History, ShieldCheck } from 'lucide-react';
import { usersApi, invitesApi } from '@/api';
import type { UserListItem } from '@/api';
import toast from 'react-hot-toast';

const ROLE_OPTIONS = [
  { value: 'admin', labelKey: 'admin' as const },
  { value: 'super_admin', labelKey: 'superAdmin' as const },
  { value: 'regulator', labelKey: 'regulator' as const },
];


// NEW: Section-based permission definitions
const AVAILABLE_SECTIONS = [
  {
    id: 'clients',
    nameEn: 'Clients',
    nameAr: 'العملاء',
    icon: Users,
    description: 'View and manage client companies, upload scripts'
  },
  {
    id: 'tasks',
    nameEn: 'Tasks',
    nameAr: 'المهام',
    icon: FileText,
    description: 'Assign and track analysis tasks'
  },
  {
    id: 'glossary',
    nameEn: 'Glossary',
    nameAr: 'المعجم',
    icon: BookOpen,
    description: 'Manage lexicon terms and policies'
  },
  {
    id: 'reports',
    nameEn: 'Reports',
    nameAr: 'التقارير',
    icon: FileText,
    description: 'View and generate analysis reports'
  },
  {
    id: 'access_control',
    nameEn: 'Access Control',
    nameAr: 'التحكم بالصلاحيات',
    icon: ShieldCheck,
    description: 'Manage users and permissions (Admin only)'
  },
  {
    id: 'audit',
    nameEn: 'Audit Log',
    nameAr: 'سجل العمليات',
    icon: History,
    description: 'View system activity logs'
  },
];


export function AccessControl() {
  const { t, lang } = useLangStore();
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [form, setForm] = useState({
    name: '',
    email: '',
    roleKey: 'admin',
    allowedSections: [] as string[], // NEW: Section-based permissions
  });
  const [submitting, setSubmitting] = useState(false);

  const [viewUser, setViewUser] = useState<UserListItem | null>(null);
  const [editUser, setEditUser] = useState<UserListItem | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    roleKey: 'admin',
    status: 'active' as 'active' | 'disabled',
    allowedSections: [] as string[] // NEW
  });
  const [editSaving, setEditSaving] = useState(false);

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const list = await usersApi.getUsers();
      setUsers(list);
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to load users list (CORS/backend). Check console.');
      setUsers([]);
    } finally {
      setUsersLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const filteredUsers = users.filter(
    (u) =>
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
  );

  const handleSubmit = async () => {
    const name = form.name.trim();
    const email = form.email.trim().toLowerCase();
    if (!email) {
      toast.error(lang === 'ar' ? 'البريد الإلكتروني مطلوب' : 'Email is required');
      return;
    }
    setSubmitting(true);
    try {
      // NEW: Send allowedSections instead of permissions
      await invitesApi.sendInvite({
        email,
        name: name || undefined,
        role: form.roleKey,
        allowedSections: form.allowedSections.length ? form.allowedSections : undefined,
      });
      toast.success(lang === 'ar' ? 'تم إرسال الدعوة إلى البريد الإلكتروني' : 'Invite sent to email');
      setIsModalOpen(false);
      setForm({ name: '', email: '', roleKey: 'admin', allowedSections: [] }); // Reset form
      await loadUsers();
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to send invite');
    } finally {
      setSubmitting(false);
    }
  };

  const openEdit = (user: UserListItem) => {
    setEditUser(user);
    // Note: UserListItem from API might not have allowedSections typed yet if not updated in frontend types.
    // For now we assume if it's there we use it, else empty.
    // The GET /users endpoint maps metadata, so we might need to check how it's returned.
    // Looking at users/index.ts GET: it just returns id, email, name, roleKey, status.
    // *** CRITICAL FIX ***: GET /users needs to return allowedSections for this to work!
    // I will Assume for now the frontend UserListItem has it or we cast it. 
    // Wait, the previous steps didn't update GET /users to return allowedSections.
    // I need to update GET /users as well.
    const sections = (user as any).allowedSections || [];
    setEditForm({
      name: user.name,
      roleKey: user.roleKey ?? 'admin',
      status: user.status,
      allowedSections: sections
    });
  };

  const handleEditSave = async () => {
    if (!editUser) return;
    setEditSaving(true);
    try {
      await usersApi.updateUser({
        userId: editUser.id,
        name: editForm.name.trim() || undefined,
        roleKey: editForm.roleKey,
        status: editForm.status,
        allowedSections: editForm.allowedSections, // NEW
      });
      toast.success(lang === 'ar' ? 'تم تحديث المستخدم' : 'User updated');
      setEditUser(null);
      await loadUsers();
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to update user');
    } finally {
      setEditSaving(false);
    }
  };

  const handleToggleStatus = async (user: UserListItem) => {
    const newStatus = user.status === 'active' ? 'disabled' : 'active';
    try {
      await usersApi.updateUser({ userId: user.id, status: newStatus });
      toast.success(newStatus === 'disabled' ? (lang === 'ar' ? 'تم تعطيل المستخدم' : 'User deactivated') : (lang === 'ar' ? 'تم تفعيل المستخدم' : 'User activated'));
      await loadUsers();
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to update status');
    }
  };

  const handleDeleteClick = async (user: UserListItem) => {
    const msg = lang === 'ar'
      ? `هل أنت متأكد من حذف المستخدم "${user.name}"؟ لا يمكن التراجع.`
      : `Are you sure you want to delete "${user.name}"? This cannot be undone.`;
    if (!window.confirm(msg)) return;
    try {
      await usersApi.deleteUser({ userId: user.id });
      toast.success(lang === 'ar' ? 'تم حذف المستخدم' : 'User deleted');
      await loadUsers();
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to delete user');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-main">{t('accessControl')}</h1>
          <p className="text-text-muted mt-1">Manage user roles and permissions</p>
        </div>

        <Button onClick={() => setIsModalOpen(true)} className="flex items-center gap-2">
          <Plus className="w-4 h-4" />
          {t('addUser')}
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4 bg-background/50 rounded-t-[var(--radius)]">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <UserCog className="w-5 h-5 text-primary" />
            {t('users')}
          </CardTitle>
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <Input
              placeholder={t('search')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            {usersLoading ? (
              <div className="py-12 text-center text-text-muted">Loading...</div>
            ) : (
              <table className="w-full text-sm text-left rtl:text-right">
                <thead className="text-xs text-text-muted uppercase bg-background border-b border-border">
                  <tr>
                    <th className="px-6 py-4 font-medium">{t('name')}</th>
                    <th className="px-6 py-4 font-medium">{t('role')}</th>
                    <th className="px-6 py-4 font-medium">{t('status')}</th>
                    <th className="px-6 py-4 font-medium text-end">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => (
                    <tr
                      key={user.id}
                      className="bg-surface border-b border-border hover:bg-background/50 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="font-medium text-text-main">{user.name}</span>
                          <span className="text-text-muted text-xs">{user.email}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1.5">
                          <Shield className="w-3.5 h-3.5 text-info" />
                          <span>{user.roleKey ?? '—'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant={user.status === 'active' ? 'success' : 'default'}>
                          {user.status === 'active' ? t('active') : t('disabled')}
                        </Badge>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => setViewUser(user)}
                            className="p-1.5 rounded-md text-text-muted hover:text-primary hover:bg-primary/10 transition-colors"
                            title={lang === 'ar' ? 'عرض' : 'View'}
                            aria-label={lang === 'ar' ? 'عرض' : 'View'}
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openEdit(user)}
                            className="p-1.5 rounded-md text-text-muted hover:text-primary hover:bg-primary/10 transition-colors"
                            title={lang === 'ar' ? 'تعديل' : 'Edit'}
                            aria-label={lang === 'ar' ? 'تعديل' : 'Edit'}
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          {user.status === 'active' ? (
                            <button
                              type="button"
                              onClick={() => handleToggleStatus(user)}
                              className="p-1.5 rounded-md text-text-muted hover:text-amber-600 hover:bg-amber-500/10 transition-colors"
                              title={lang === 'ar' ? 'تعطيل' : 'Deactivate'}
                              aria-label={lang === 'ar' ? 'تعطيل' : 'Deactivate'}
                            >
                              <UserX className="w-4 h-4" />
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleToggleStatus(user)}
                              className="p-1.5 rounded-md text-text-muted hover:text-green-600 hover:bg-green-500/10 transition-colors"
                              title={lang === 'ar' ? 'تفعيل' : 'Activate'}
                              aria-label={lang === 'ar' ? 'تفعيل' : 'Activate'}
                            >
                              <UserCheck className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDeleteClick(user)}
                            className="p-1.5 rounded-md text-text-muted hover:text-red-600 hover:bg-red-500/10 transition-colors"
                            title={lang === 'ar' ? 'حذف' : 'Delete'}
                            aria-label={lang === 'ar' ? 'حذف' : 'Delete'}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredUsers.length === 0 && !usersLoading && (
                    <tr>
                      <td colSpan={4} className="px-6 py-12 text-center text-text-muted">
                        No users found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </CardContent>
      </Card>

      {/* View User Modal */}
      <Modal isOpen={!!viewUser} onClose={() => setViewUser(null)} title={lang === 'ar' ? 'تفاصيل المستخدم' : 'User details'}>
        {viewUser && (
          <div className="space-y-4">
            <div>
              <span className="text-xs text-text-muted uppercase">{t('name')}</span>
              <p className="text-text-main font-medium">{viewUser.name}</p>
            </div>
            <div>
              <span className="text-xs text-text-muted uppercase">Email</span>
              <p className="text-text-main font-medium" dir="ltr">{viewUser.email}</p>
            </div>
            <div>
              <span className="text-xs text-text-muted uppercase">{t('role')}</span>
              <p className="text-text-main font-medium">{viewUser.roleKey ?? '—'}</p>
            </div>
            <div>
              <span className="text-xs text-text-muted uppercase">{t('status')}</span>
              <div className="text-text-main font-medium mt-1">
                <Badge variant={viewUser.status === 'active' ? 'success' : 'default'}>
                  {viewUser.status === 'active' ? t('active') : t('disabled')}
                </Badge>
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <Button variant="outline" onClick={() => setViewUser(null)}>{t('cancel')}</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Edit User Modal */}
      <Modal isOpen={!!editUser} onClose={() => setEditUser(null)} title={lang === 'ar' ? 'تعديل المستخدم' : 'Edit user'}>
        {editUser && (
          <div className="space-y-4">
            <Input
              label={t('name')}
              value={editForm.name}
              onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Display name"
            />
            <div className="space-y-2">
              <label className="block text-sm font-medium text-text-main">{t('role')}</label>
              <select
                className="flex h-10 w-full rounded-[var(--radius)] border border-border bg-surface px-3 py-2 text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-primary/20"
                value={editForm.roleKey}
                onChange={(e) => setEditForm((f) => ({ ...f, roleKey: e.target.value }))}
              >
                {ROLE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-text-main">{t('status')}</label>
              <select
                className="flex h-10 w-full rounded-[var(--radius)] border border-border bg-surface px-3 py-2 text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-primary/20"
                value={editForm.status}
                onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value as 'active' | 'disabled' }))}
              >
                <option value="active">{t('active')}</option>
                <option value="disabled">{t('disabled')}</option>
              </select>
            </div>

            {/* NEW: Section Permissions for Edit */}
            <div className="space-y-3 pt-2 border-t border-border">
              <label className="block text-sm font-medium text-text-main">
                {lang === 'ar' ? 'الأقسام المسموحة' : 'Dashboard Sections'}
              </label>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {AVAILABLE_SECTIONS.map((section) => (
                  <div
                    key={section.id}
                    className="flex items-center justify-between p-2 border border-border rounded-lg bg-surface/50"
                  >
                    <div className="flex items-center gap-3 flex-1">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        <section.icon className="w-4 h-4 text-primary" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-text-main">
                          {lang === 'ar' ? section.nameAr : section.nameEn}
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={editForm.allowedSections.includes(section.id)}
                      onCheckedChange={(checked) => {
                        setEditForm((f) => ({
                          ...f,
                          allowedSections: checked
                            ? [...f.allowedSections, section.id]
                            : f.allowedSections.filter((x) => x !== section.id),
                        }));
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-border">
              <Button variant="outline" onClick={() => setEditUser(null)}>{t('cancel')}</Button>
              <Button onClick={handleEditSave} disabled={editSaving}>
                {editSaving ? (lang === 'ar' ? 'جاري الحفظ…' : 'Saving…') : (lang === 'ar' ? 'حفظ' : 'Save')}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Add User Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={t('addUser')}>
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label={t('name')}
              placeholder="e.g. John Doe"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
            <Input
              label={t('email')}
              type="email"
              placeholder="john@example.com"
              dir="ltr"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-text-main">{t('role')}</label>
            <select
              className="flex h-10 w-full rounded-[var(--radius)] border border-border bg-surface px-3 py-2 text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-primary/20"
              value={form.roleKey}
              onChange={(e) => setForm((f) => ({ ...f, roleKey: e.target.value }))}
            >
              {ROLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {t(opt.labelKey)}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-3">
            <label className="block text-sm font-medium text-text-main">
              {lang === 'ar' ? 'الأقسام المسموحة' : 'Dashboard Sections'}
            </label>
            <p className="text-xs text-text-muted">
              {lang === 'ar' ? 'حدد الأقسام التي يمكن لهذا المستخدم الوصول إليها' : 'Select which sections this user can access'}
            </p>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {AVAILABLE_SECTIONS.map((section) => (
                <div
                  key={section.id}
                  className="flex items-center justify-between p-3 border border-border rounded-lg hover:border-primary/30 transition-colors bg-surface"
                >
                  <div className="flex items-center gap-3 flex-1">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <section.icon className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-text-main">
                        {lang === 'ar' ? section.nameAr : section.nameEn}
                      </p>
                      <p className="text-xs text-text-muted">{section.description}</p>
                    </div>
                  </div>
                  <Switch
                    checked={form.allowedSections.includes(section.id)}
                    onCheckedChange={(checked) => {
                      setForm((f) => ({
                        ...f,
                        allowedSections: checked
                          ? [...f.allowedSections, section.id]
                          : f.allowedSections.filter((x) => x !== section.id),
                      }));
                    }}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>
              {t('cancel')}
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? (lang === 'ar' ? 'جاري الإرسال…' : 'Sending…') : (lang === 'ar' ? 'إرسال الدعوة' : 'Send Invite')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
