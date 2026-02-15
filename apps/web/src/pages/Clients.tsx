import { useState } from 'react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { useLangStore } from '@/store/langStore';
import { useDataStore } from '@/store/dataStore';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { CompanyAvatar } from '@/components/ui/CompanyAvatar';
import { ClientModal } from '@/components/ClientModal';
import {
  Building2,
  FileText,
  Clock,
  CheckCircle,
  Plus,
  Search,
  User,
  Calendar,
  FolderGit2,
  Edit2,
  Trash2,
  Download,
  UserCheck
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { cn } from '@/utils/cn';
import { usersApi } from '@/api';

export function Clients() {
  const { t, lang } = useLangStore();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { companies, isLoading, removeCompany } = useDataStore();

  const filteredClients = companies.filter(c =>
    c.nameAr.includes(search) ||
    c.nameEn.toLowerCase().includes(search.toLowerCase())
  );

  const { user, hasSection } = useAuthStore();
  const [editingCompanyId, setEditingCompanyId] = useState<string | null>(null);

  const isAdmin = user?.role === 'Super Admin' || user?.role === 'Admin' || hasSection('access_control');
  const [exportingPdf, setExportingPdf] = useState(false);

  // NEW: Fetch creators map for display
  const [creators, setCreators] = useState<Record<string, string>>({});

  useState(() => {
    if (isAdmin) {
      usersApi.getUsers()
        .then(users => {
          const map: Record<string, string> = {};
          users.forEach(u => map[u.id] = u.name);
          setCreators(map);
        })
        .catch(err => console.error('Failed to load creators:', err));
    }
  });

  const handleExportPdf = async () => {
    setExportingPdf(true);
    try {
      // 1. Fetch Template
      const response = await fetch('/src/templates/clients-overview-report-template.html');
      const template = await response.text();

      const isAr = lang === 'ar';
      const baseUrl = window.location.origin;

      // Images
      const loginLogo = `${baseUrl}/loginlogo.png`;
      const footerImg = `${baseUrl}/footer.png`;
      const dashLogo = `${baseUrl}/loginlogo.png`;

      // 2. Prepare Data
      const clientsData = filteredClients.map(c => ({
        name: isAr ? c.nameAr : c.nameEn,
        nameSecondary: isAr ? c.nameEn : c.nameAr,
        representative: c.representativeName,
        email: c.email,
        phone: c.phone || c.mobile || '—',
        registrationDate: c.createdAt,
        scriptsCount: c.scriptsCount,
        status: c.scriptsCount > 0 ? (isAr ? 'نشط' : 'Active') : (isAr ? 'غير نشط' : 'Inactive'),
        statusStyle: c.scriptsCount > 0
          ? 'background: #ECFDF5; color: #065F46; border: 1px solid #A7F3D0;'
          : 'background: #F3F4F6; color: #6B7280; border: 1px solid #E5E7EB;'
      }));

      // Stats
      const totalClients = companies.length;
      const totalScripts = companies.reduce((acc, c) => acc + (c.scriptsCount || 0), 0);
      const avgScripts = totalClients > 0 ? Math.round((totalScripts / totalClients) * 10) / 10 : 0;
      const activeClients = companies.filter(c => (c.scriptsCount || 0) > 0).length;

      // 3. Replacements
      let html = template;
      const replacements: Record<string, string> = {
        '{{lang}}': isAr ? 'ar' : 'en',
        '{{dir}}': isAr ? 'rtl' : 'ltr',
        '{{formattedDate}}': new Date().toLocaleDateString(isAr ? 'ar-SA' : 'en-GB'),
        '{{generationTimestamp}}': new Date().toLocaleString(),
        '{{loginLogoBase64}}': loginLogo,
        '{{footerImageBase64}}': footerImg,
        '{{dashboardLogoBase64}}': dashLogo,

        // Labels
        '{{labels.reportTitle}}': isAr ? 'تقرير محفظة العملاء' : 'Clients Portfolio Report',
        '{{labels.subtitle}}': isAr ? 'نظام إدارة العملاء' : 'Client Management System',
        '{{labels.totalClients}}': isAr ? 'إجمالي العملاء' : 'Total Clients',
        '{{labels.date}}': isAr ? 'التاريخ' : 'Date',
        '{{labels.executiveSummary}}': isAr ? 'الملخص التنفيذي' : 'Executive Summary',
        '{{labels.totalScripts}}': isAr ? 'إجمالي النصوص' : 'Total Scripts',
        '{{labels.avgScripts}}': isAr ? 'متوسط النصوص' : 'Avg Scripts',
        '{{labels.activeClients}}': isAr ? 'عملاء نشطون' : 'Active Clients',
        '{{labels.clientsDetails}}': isAr ? 'تفاصيل العملاء' : 'Clients Details',
        '{{labels.clientName}}': isAr ? 'اسم العميل' : 'Client Name',
        '{{labels.representative}}': isAr ? 'المندوب' : 'Representative',
        '{{labels.contact}}': isAr ? 'الاتصال' : 'Contact',
        '{{labels.registrationDate}}': isAr ? 'تاريخ التسجيل' : 'Registration Date',
        '{{labels.scriptsCount}}': isAr ? 'عدد النصوص' : 'Scripts',
        '{{labels.status}}': isAr ? 'الحالة' : 'Status',

        // Stats Values
        '{{stats.totalClients}}': String(totalClients),
        '{{stats.totalScripts}}': String(totalScripts),
        '{{stats.avgScriptsPerClient}}': String(avgScripts),
        '{{stats.activeClients}}': String(activeClients),
        '{{totalClients}}': String(totalClients),
      };

      Object.entries(replacements).forEach(([key, val]) => {
        html = html.split(key).join(val);
      });

      // 4. Generate Table Rows
      const rowsHtml = clientsData.map(item => `
        <tr>
            <td>
                <div class="font-bold">${item.name}</div>
                <div style="font-size: 9px; color: #6B7280; margin-top: 2px;">${item.nameSecondary}</div>
            </td>
            <td>${item.representative}</td>
            <td>
                <div style="font-size: 9px;">${item.email}</div>
                <div style="font-size: 9px; color: #6B7280;">${item.phone}</div>
            </td>
            <td>${item.registrationDate}</td>
            <td style="text-align: center; font-weight: 600;">${item.scriptsCount}</td>
            <td>
                <span style="padding: 2px 6px; border-radius: 4px; font-size: 9px; font-weight: 600; ${item.statusStyle}">
                    ${item.status}
                </span>
            </td>
        </tr>
      `).join('');

      // Replace loop block
      const loopRegex = /{{#each clients}}([\s\S]*?){{\/each}}/m;
      html = html.replace(loopRegex, rowsHtml);

      // 5. Open Window
      const win = window.open('', '_blank');
      if (!win) {
        toast.error(isAr ? 'تم حظر النافذة المنبثقة' : 'Popup blocked');
        return;
      }

      setTimeout(() => {
        win.document.write(html);
        win.document.close();

        // Delay print to allow images to load
        setTimeout(() => {
          win.print();
        }, 500);
      }, 100);

    } catch (err: unknown) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : 'PDF export failed');
    } finally {
      setExportingPdf(false);
    }
  };

  const handleOpenAddModal = () => {
    setEditingCompanyId(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setEditingCompanyId(id);
    setIsModalOpen(true);
  };

  const handleDeleteClient = async (e: React.MouseEvent, client: { companyId: string; nameAr: string; nameEn: string; scriptsCount?: number }) => {
    e.stopPropagation();
    const name = lang === 'ar' ? client.nameAr : client.nameEn;
    const hasScripts = Number(client.scriptsCount ?? 0) > 0;
    const message = hasScripts
      ? (lang === 'ar'
        ? `سيتم حذف الشركة "${name}" وجميع النصوص والتحليلات المرتبطة بها. هل أنت متأكد؟`
        : `This will delete "${name}" and all associated scripts and analyses. Are you sure?`)
      : (lang === 'ar'
        ? `حذف الشركة "${name}"؟`
        : `Delete "${name}"?`);
    if (!window.confirm(message)) return;
    await removeCompany(client.companyId);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-main">{t('clients')}</h1>
          <p className="text-text-muted mt-1">{lang === 'ar' ? 'إدارة الشركات والعملاء المسجلين' : 'Manage registered companies and clients'}</p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="flex items-center gap-2"
            onClick={handleExportPdf}
            disabled={exportingPdf}
          >
            <Download className="w-4 h-4" />
            {t('exportPdf')}
          </Button>
          {isAdmin && (
            <Button className="flex items-center gap-2" onClick={handleOpenAddModal}>
              <Plus className="w-4 h-4" />
              {t('addNewClient')}
            </Button>
          )}
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('totalClients')}</CardTitle>
            <Building2 className="h-4 w-4 text-text-muted" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-text-main">{companies.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('registeredScripts')}</CardTitle>
            <FileText className="h-4 w-4 text-text-muted" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-text-main">
              {companies.reduce((acc, c) => acc + (Number.isFinite(Number(c.scriptsCount)) ? Number(c.scriptsCount) : 0), 0)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('pendingScripts')}</CardTitle>
            <Clock className="h-4 w-4 text-text-muted" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-text-main">0</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('approvedScripts')}</CardTitle>
            <CheckCircle className="h-4 w-4 text-text-muted" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-text-main">0</div>
          </CardContent>
        </Card>
      </div>

      {/* Search Input */}
      <div className="flex justify-between items-center">
        <div className="relative w-full sm:w-80">
          <Search className={cn("absolute top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted", lang === 'ar' ? 'right-3' : 'left-3')} />
          <Input
            placeholder={t('searchClients')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={cn("h-10", lang === 'ar' ? 'pr-9' : 'pl-9')}
          />
        </div>
      </div>

      {/* Grid of Company Cards */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="flex gap-4">
                  <div className="w-12 h-12 rounded bg-border"></div>
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-border rounded w-2/3"></div>
                    <div className="h-3 bg-border rounded w-1/3"></div>
                  </div>
                </div>
                <div className="mt-6 space-y-3">
                  <div className="h-3 bg-border rounded w-full"></div>
                  <div className="h-3 bg-border rounded w-full"></div>
                </div>
              </CardContent>
            </Card>
          ))
        ) : filteredClients.map((client) => (
          <Card
            key={client.companyId}
            className="hover:shadow-md transition-shadow cursor-pointer group"
            onClick={() => navigate(`/clients/${client.companyId}`)}
          >
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <CompanyAvatar
                  name={lang === 'ar' ? client.nameAr : client.nameEn}
                  logoUrl={client.logoUrl ?? client.avatarUrl ?? undefined}
                  size={48}
                  className="rounded-[var(--radius)] border border-border"
                />
                <div className="flex-1 min-w-0 pr-6 relative">
                  <h3 className="text-base font-semibold text-text-main truncate group-hover:text-primary transition-colors">
                    {lang === 'ar' ? client.nameAr : client.nameEn}
                  </h3>
                  <p className="text-sm text-text-muted truncate">
                    {lang === 'ar' ? client.nameEn : client.nameAr}
                  </p>
                  {isAdmin && (
                    <div className="absolute top-0 end-0 flex items-center gap-0.5">
                      <button
                        onClick={(e) => handleOpenEditModal(e, client.companyId)}
                        className="p-1.5 text-text-muted hover:text-primary hover:bg-primary/10 rounded-md transition-colors"
                        aria-label="Edit Client"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => handleDeleteClient(e, client)}
                        className="p-1.5 text-text-muted hover:text-error hover:bg-error/10 rounded-md transition-colors"
                        aria-label="Delete Client"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-6 space-y-3">
                <div className="flex items-center gap-3 text-sm">
                  <User className="w-4 h-4 text-text-muted flex-shrink-0" />
                  <span className="text-text-muted w-28 flex-shrink-0">{t('representative')}:</span>
                  <span className="text-text-main font-medium truncate">{client.representativeName}</span>
                </div>

                <div className="flex items-center gap-3 text-sm">
                  <Calendar className="w-4 h-4 text-text-muted flex-shrink-0" />
                  <span className="text-text-muted w-28 flex-shrink-0">{t('registrationDate')}:</span>
                  <span className="text-text-main font-medium truncate">{client.createdAt}</span>
                </div>

                <div className="flex items-center gap-3 text-sm">
                  <FolderGit2 className="w-4 h-4 text-text-muted flex-shrink-0" />
                  <span className="text-text-muted w-28 flex-shrink-0">{t('scriptsCount')}:</span>
                  <span className="text-text-main font-medium truncate">{Number.isFinite(Number(client.scriptsCount)) ? Number(client.scriptsCount) : 0}</span>
                </div>

                {/* NEW: Created By Display (Admin Only) */}
                {isAdmin && client.created_by && (
                  <div className="flex items-center gap-3 text-sm">
                    <UserCheck className="w-4 h-4 text-text-muted flex-shrink-0" />
                    <span className="text-text-muted w-28 flex-shrink-0">{t('createdBy')}:</span>
                    <span className="text-text-main font-medium truncate">
                      {creators[client.created_by] || 'Unknown'}
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
        {filteredClients.length === 0 && (
          <div className="col-span-full py-12 text-center text-text-muted">
            {lang === 'ar' ? 'لم يتم العثور على شركات' : 'No companies found'}
          </div>
        )}
      </div>

      <ClientModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        companyId={editingCompanyId}
      />
    </div >
  );
}
