import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { useLangStore } from '@/store/langStore';
import { useDataStore } from '@/store/dataStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { CompanyAvatar } from '@/components/ui/CompanyAvatar';
import { ClientModal } from '@/components/ClientModal';
import {
  Building2,
  CheckCircle,
  Clock,
  Download,
  Edit2,
  FileText,
  FolderGit2,
  Grid2X2,
  List,
  Loader2,
  Plus,
  Search,
  Trash2,
  User,
  UserCheck,
  XCircle,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useSettingsStore } from '@/store/settingsStore';
import { cn } from '@/utils/cn';
import { companiesApi, usersApi } from '@/api';
import type { Company } from '@/api/models';
import { downloadClientsPdf } from '@/components/reports/clients/download';

type ClientTab = 'new' | 'clients' | 'internal';
type ViewMode = 'cards' | 'table';

const VIEW_STORAGE_KEY = 'raawi-admin-clients-view';
const PAGE_SIZE = 10;

function clientDisplayName(client: Company, lang: 'ar' | 'en') {
  return lang === 'ar' ? client.nameAr : client.nameEn;
}

function statusBadge(client: Company, lang: 'ar' | 'en') {
  const status = client.approvalStatus ?? 'approved';
  if (status === 'pending') return <Badge variant="warning">{lang === 'ar' ? 'قيد المراجعة' : 'Pending'}</Badge>;
  if (status === 'rejected') return <Badge variant="error">{lang === 'ar' ? 'مرفوض' : 'Rejected'}</Badge>;
  return <Badge variant="success">{lang === 'ar' ? 'معتمد' : 'Approved'}</Badge>;
}

export function Clients() {
  const { t, lang } = useLangStore();
  const { settings } = useSettingsStore();
  const navigate = useNavigate();
  const { companies, scripts, isLoading, removeCompany, fetchInitialData } = useDataStore();
  const { user, hasSection } = useAuthStore();
  const isAdmin = user?.role === 'Super Admin' || user?.role === 'Admin' || hasSection('access_control');

  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<ClientTab>('new');
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = window.localStorage.getItem(VIEW_STORAGE_KEY);
    return saved === 'table' ? 'table' : 'cards';
  });
  const [page, setPage] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [creators, setCreators] = useState<Record<string, string>>({});
  const [rejectClient, setRejectClient] = useState<Company | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [actionId, setActionId] = useState<string | null>(null);

  useEffect(() => {
    window.localStorage.setItem(VIEW_STORAGE_KEY, viewMode);
  }, [viewMode]);

  useEffect(() => {
    setPage(1);
  }, [activeTab, search, viewMode]);

  useEffect(() => {
    if (!isAdmin) return;
    usersApi.getUsers()
      .then((users) => {
        const map: Record<string, string> = {};
        users.forEach((u) => { map[u.id] = u.name; });
        setCreators(map);
      })
      .catch((err) => console.error('Failed to load creators:', err));
  }, [isAdmin]);

  const portalPendingOrRejected = companies.filter((client) => (client.source ?? 'internal') === 'portal' && (client.approvalStatus ?? 'pending') !== 'approved');
  const portalApproved = companies.filter((client) => (client.source ?? 'internal') === 'portal' && (client.approvalStatus ?? 'pending') === 'approved');
  const internalClients = companies.filter((client) => (client.source ?? 'internal') === 'internal');

  const tabClients = activeTab === 'new' ? portalPendingOrRejected : activeTab === 'clients' ? portalApproved : internalClients;

  const filteredClients = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tabClients;
    return tabClients.filter((client) =>
      client.nameAr.includes(search.trim()) ||
      client.nameEn.toLowerCase().includes(q) ||
      (client.email ?? '').toLowerCase().includes(q) ||
      (client.representativeName ?? '').toLowerCase().includes(q)
    );
  }, [tabClients, search]);

  const pageCount = Math.max(1, Math.ceil(filteredClients.length / PAGE_SIZE));
  const pagedClients = viewMode === 'table'
    ? filteredClients.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
    : filteredClients;

  const companyIds = new Set(filteredClients.map((client) => client.companyId));
  const pendingScriptsCount = scripts.filter((script) => companyIds.has(script.companyId) && ['pending', 'in_review', 'In Review'].includes(script.status as string)).length;
  const approvedScriptsCount = scripts.filter((script) => companyIds.has(script.companyId) && script.status === 'approved').length;

  const handleExportPdf = async () => {
    setExportingPdf(true);
    try {
      await downloadClientsPdf({
        companies: filteredClients,
        lang: lang === 'ar' ? 'ar' : 'en',
        dateFormat: settings?.platform?.dateFormat,
      });
      toast.success(lang === 'ar' ? 'تم تنزيل التقرير' : 'Report downloaded');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'PDF export failed');
    } finally {
      setExportingPdf(false);
    }
  };

  const handleOpenAddModal = () => {
    setIsModalOpen(true);
  };

  const handleOpenEditPage = (event: React.MouseEvent, client: Company) => {
    event.stopPropagation();
    if ((client.source ?? 'internal') !== 'internal') {
      toast.error(lang === 'ar' ? 'يمكن تعديل العملاء الداخليين فقط من هنا' : 'Only internal clients can be edited here');
      return;
    }
    navigate(`/clients/${client.companyId}/edit`);
  };

  const handleDeleteClient = async (event: React.MouseEvent, client: Company) => {
    event.stopPropagation();
    if ((client.source ?? 'internal') !== 'internal') {
      toast.error(lang === 'ar' ? 'لا يمكن حذف طلبات البوابة من هنا' : 'Portal clients cannot be deleted here');
      return;
    }
    const name = clientDisplayName(client, lang === 'ar' ? 'ar' : 'en');
    const hasScripts = Number(client.scriptsCount ?? 0) > 0;
    const message = hasScripts
      ? (lang === 'ar'
        ? `سيتم حذف الشركة "${name}" وجميع النصوص والتحليلات المرتبطة بها. هل أنت متأكد؟`
        : `This will delete "${name}" and all associated scripts and analyses. Are you sure?`)
      : (lang === 'ar' ? `حذف الشركة "${name}"؟` : `Delete "${name}"?`);
    if (!window.confirm(message)) return;
    await removeCompany(client.companyId);
  };

  const approveClient = async (client: Company) => {
    setActionId(client.companyId);
    try {
      await companiesApi.approveCompany(client.companyId);
      toast.success(lang === 'ar' ? 'تم اعتماد العميل وإرسال بريد القبول' : 'Client approved and acceptance email sent');
      await fetchInitialData();
      setActiveTab('clients');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Approval failed');
    } finally {
      setActionId(null);
    }
  };

  const rejectRegistration = async () => {
    if (!rejectClient) return;
    if (!rejectionReason.trim()) {
      toast.error(lang === 'ar' ? 'يرجى كتابة سبب الرفض' : 'Please write a rejection reason');
      return;
    }
    setActionId(rejectClient.companyId);
    try {
      await companiesApi.rejectCompany(rejectClient.companyId, rejectionReason.trim());
      toast.success(lang === 'ar' ? 'تم رفض الطلب وإرسال السبب للعميل' : 'Request rejected and reason emailed to client');
      setRejectClient(null);
      setRejectionReason('');
      await fetchInitialData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Rejection failed');
    } finally {
      setActionId(null);
    }
  };

  const tabs: Array<{ id: ClientTab; label: string; count: number }> = [
    { id: 'new', label: lang === 'ar' ? 'الجدد' : 'New', count: portalPendingOrRejected.length },
    { id: 'clients', label: lang === 'ar' ? 'العملاء' : 'Clients', count: portalApproved.length },
    { id: 'internal', label: lang === 'ar' ? 'عملاء داخليون' : 'Internal Clients', count: internalClients.length },
  ];

  const renderActions = (client: Company) => {
    const isInternal = (client.source ?? 'internal') === 'internal';
    const isPending = (client.approvalStatus ?? 'approved') === 'pending';
    if (!isAdmin) return null;
    if (activeTab === 'new') {
      return (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={(event) => { event.stopPropagation(); navigate(`/app/clients/${client.companyId}/request`); }}>
            {lang === 'ar' ? 'عرض الطلب' : 'View Request'}
          </Button>
          {isPending && (
            <>
              <Button size="sm" onClick={(event) => { event.stopPropagation(); void approveClient(client); }} disabled={actionId === client.companyId}>
                <CheckCircle className="me-1 h-4 w-4" />
                {lang === 'ar' ? 'اعتماد' : 'Approve'}
              </Button>
              <Button variant="danger" size="sm" onClick={(event) => { event.stopPropagation(); setRejectClient(client); }} disabled={actionId === client.companyId}>
                <XCircle className="me-1 h-4 w-4" />
                {lang === 'ar' ? 'رفض' : 'Reject'}
              </Button>
            </>
          )}
        </div>
      );
    }
    if (!isInternal) return null;
    return (
      <div className="flex items-center justify-end gap-0.5">
        <button
          onClick={(event) => handleOpenEditPage(event, client)}
          className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-primary/10 hover:text-primary"
          aria-label="Edit Client"
        >
          <Edit2 className="h-4 w-4" />
        </button>
        <button
          onClick={(event) => void handleDeleteClient(event, client)}
          className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-error/10 hover:text-error"
          aria-label="Delete Client"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    );
  };

  const renderClientCard = (client: Company) => (
    <Card
      key={client.companyId}
      className="group cursor-pointer transition-shadow hover:shadow-[0_20px_50px_rgba(31,23,36,0.08)]"
      onClick={() => activeTab === 'new' ? navigate(`/app/clients/${client.companyId}/request`) : navigate(`/clients/${client.companyId}`)}
    >
      <CardContent className="p-6">
        <div className="flex items-start gap-4">
          <CompanyAvatar
            name={clientDisplayName(client, lang === 'ar' ? 'ar' : 'en')}
            logoUrl={client.logoUrl ?? client.avatarUrl ?? undefined}
            size={48}
            className="rounded-[var(--radius)] border border-border"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-base font-semibold text-text-main transition-colors group-hover:text-primary">
                  {clientDisplayName(client, lang === 'ar' ? 'ar' : 'en')}
                </h3>
                <p className="truncate text-sm text-text-muted">{lang === 'ar' ? client.nameEn : client.nameAr}</p>
              </div>
              {statusBadge(client, lang === 'ar' ? 'ar' : 'en')}
            </div>
          </div>
        </div>

        <div className="mt-6 space-y-3">
          <div className="flex items-center gap-3 text-sm">
            <User className="h-4 w-4 flex-shrink-0 text-text-muted" />
            <span className="w-28 flex-shrink-0 text-text-muted">{t('representative')}:</span>
            <span className="truncate font-medium text-text-main">{client.representativeName || '—'}</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <FolderGit2 className="h-4 w-4 flex-shrink-0 text-text-muted" />
            <span className="w-28 flex-shrink-0 text-text-muted">{t('scriptsCount')}:</span>
            <span className="truncate font-medium text-text-main">{Number.isFinite(Number(client.scriptsCount)) ? Number(client.scriptsCount) : 0}</span>
          </div>
          {isAdmin && client.created_by && (
            <div className="flex items-center gap-3 text-sm">
              <UserCheck className="h-4 w-4 flex-shrink-0 text-text-muted" />
              <span className="w-28 flex-shrink-0 text-text-muted">{lang === 'ar' ? 'أنشأ بواسطة' : 'Created By'}:</span>
              <span className="truncate font-medium text-text-main">{creators[client.created_by] || '—'}</span>
            </div>
          )}
          <div className="pt-2">{renderActions(client)}</div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="dashboard-page-header flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between md:p-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-main">{t('clients')}</h1>
          <p className="mt-1 text-text-muted">{lang === 'ar' ? 'إدارة طلبات التسجيل والعملاء والشركات الداخلية' : 'Manage registration requests, portal clients, and internal companies'}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" className="flex items-center gap-2" onClick={handleExportPdf} disabled={exportingPdf}>
            {exportingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {exportingPdf ? (lang === 'ar' ? 'جاري تجهيز PDF...' : 'Preparing PDF...') : t('exportPdf')}
          </Button>
          {isAdmin && (
            <Button className="flex items-center gap-2" onClick={handleOpenAddModal}>
              <Plus className="h-4 w-4" />
              {t('addNewClient')}
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{lang === 'ar' ? 'طلبات جديدة' : 'New Requests'}</CardTitle>
            <Clock className="h-4 w-4 text-text-muted" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-text-main">{portalPendingOrRejected.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{lang === 'ar' ? 'عملاء البوابة' : 'Portal Clients'}</CardTitle>
            <Building2 className="h-4 w-4 text-text-muted" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-text-main">{portalApproved.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('pendingScripts')}</CardTitle>
            <FileText className="h-4 w-4 text-text-muted" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-text-main">{pendingScriptsCount}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('approvedScripts')}</CardTitle>
            <CheckCircle className="h-4 w-4 text-text-muted" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-text-main">{approvedScriptsCount}</div></CardContent>
        </Card>
      </div>

      <div className="dashboard-panel space-y-4 rounded-[calc(var(--radius)+0.55rem)] border border-border/70 p-4 shadow-[0_16px_40px_rgba(31,23,36,0.04)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2 overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex items-center gap-2 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                  activeTab === tab.id ? 'bg-primary text-white' : 'bg-white/70 text-text-muted hover:bg-surface-hover',
                )}
              >
                <span>{tab.label}</span>
                <span className={cn('rounded-full px-2 py-0.5 text-xs', activeTab === tab.id ? 'bg-white/20' : 'bg-background')}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Button variant={viewMode === 'cards' ? 'primary' : 'outline'} size="sm" onClick={() => setViewMode('cards')} aria-label="Card view">
              <Grid2X2 className="h-4 w-4" />
            </Button>
            <Button variant={viewMode === 'table' ? 'primary' : 'outline'} size="sm" onClick={() => setViewMode('table')} aria-label="Table view">
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="relative w-full sm:w-80">
          <Search className={cn('absolute top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted', lang === 'ar' ? 'right-3' : 'left-3')} />
          <Input
            placeholder={t('searchClients')}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className={cn('h-10', lang === 'ar' ? 'pr-9' : 'pl-9')}
          />
        </div>
      </div>

      {viewMode === 'cards' ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {isLoading ? Array.from({ length: 6 }).map((_, index) => (
            <Card key={index} className="animate-pulse"><CardContent className="h-48 p-6" /></Card>
          )) : pagedClients.map(renderClientCard)}
        </div>
      ) : (
        <Card className="dashboard-table-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left rtl:text-right">
              <thead className="border-b border-border text-xs uppercase text-text-muted">
                <tr>
                  <th className="px-6 py-4 font-medium">{lang === 'ar' ? 'الشركة' : 'Company'}</th>
                  <th className="px-6 py-4 font-medium">{lang === 'ar' ? 'المسؤول' : 'Contact'}</th>
                  <th className="px-6 py-4 font-medium">{lang === 'ar' ? 'الحالة' : 'Status'}</th>
                  <th className="px-6 py-4 font-medium">{lang === 'ar' ? 'النصوص' : 'Scripts'}</th>
                  <th className="px-6 py-4 font-medium text-end">{lang === 'ar' ? 'الإجراءات' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody>
                {pagedClients.map((client) => (
                  <tr
                    key={client.companyId}
                    className="cursor-pointer border-b border-border bg-transparent transition-colors"
                    onClick={() => activeTab === 'new' ? navigate(`/app/clients/${client.companyId}/request`) : navigate(`/clients/${client.companyId}`)}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <CompanyAvatar name={clientDisplayName(client, lang === 'ar' ? 'ar' : 'en')} logoUrl={client.logoUrl ?? undefined} size={36} />
                        <div>
                          <p className="font-medium text-text-main">{clientDisplayName(client, lang === 'ar' ? 'ar' : 'en')}</p>
                          <p className="text-xs text-text-muted">{client.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-text-muted">{client.representativeName || '—'}</td>
                    <td className="px-6 py-4">{statusBadge(client, lang === 'ar' ? 'ar' : 'en')}</td>
                    <td className="px-6 py-4">{client.scriptsCount ?? 0}</td>
                    <td className="px-6 py-4 text-end">{renderActions(client)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pageCount > 1 && (
            <div className="flex items-center justify-between border-t border-border px-6 py-4">
              <span className="text-sm text-text-muted">{filteredClients.length} {lang === 'ar' ? 'نتيجة' : 'results'}</span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>{t('previous')}</Button>
                <span className="text-sm text-text-muted">{page} / {pageCount}</span>
                <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)}>{t('next')}</Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {!isLoading && filteredClients.length === 0 && (
        <div className="py-12 text-center text-text-muted">
          {lang === 'ar' ? 'لا توجد نتائج في هذا القسم' : 'No results in this section'}
        </div>
      )}

      <Modal
        isOpen={!!rejectClient}
        onClose={() => { setRejectClient(null); setRejectionReason(''); }}
        title={lang === 'ar' ? 'سبب رفض طلب التسجيل' : 'Registration Rejection Reason'}
      >
        <div className="space-y-4">
          <Input
            label={lang === 'ar' ? 'سبب الرفض' : 'Rejection Reason'}
            value={rejectionReason}
            onChange={(event) => setRejectionReason(event.target.value)}
            required
          />
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button variant="outline" onClick={() => { setRejectClient(null); setRejectionReason(''); }}>{t('cancel')}</Button>
            <Button variant="danger" onClick={() => void rejectRegistration()} disabled={!!actionId}>
              {lang === 'ar' ? 'إرسال الرفض' : 'Submit Rejection'}
            </Button>
          </div>
        </div>
      </Modal>

      <ClientModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} companyId={null} />
    </div>
  );
}
