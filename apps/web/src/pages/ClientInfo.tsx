import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Building2, FileText } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { CompanyAvatar } from '@/components/ui/CompanyAvatar';
import { useDataStore } from '@/store/dataStore';
import { useLangStore } from '@/store/langStore';

function valueOrDash(value: unknown) {
  if (value === null || value === undefined || value === '') return '—';
  return String(value);
}

export function ClientInfo() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { lang } = useLangStore();
  const { companies, scripts } = useDataStore();

  const company = useMemo(() => companies.find((entry) => entry.companyId === id), [companies, id]);
  const companyScripts = useMemo(() => scripts.filter((script) => script.companyId === id), [scripts, id]);

  if (!company) {
    return <div className="p-8 text-center text-text-muted">{lang === 'ar' ? 'لم يتم العثور على الشركة' : 'Company not found.'}</div>;
  }

  const isAr = lang === 'ar';
  const rows = [
    [isAr ? 'اسم الشركة بالعربية' : 'Company Arabic Name', company.nameAr],
    [isAr ? 'اسم الشركة بالإنجليزية' : 'Company English Name', company.nameEn],
    [isAr ? 'مصدر العميل' : 'Client Source', company.source === 'portal' ? (isAr ? 'بوابة العملاء' : 'Client Portal') : (isAr ? 'إدخال داخلي' : 'Internal Entry')],
    [isAr ? 'حالة الاعتماد' : 'Approval Status', company.approvalStatus ?? 'approved'],
    [isAr ? 'الموقع الإلكتروني' : 'Website', company.website],
    [isAr ? 'بريد الشركة' : 'Company Email', company.email],
    [isAr ? 'هاتف الشركة' : 'Company Phone', company.phone ?? company.mobile],
    [isAr ? 'العنوان الوطني' : 'Saudi Address', [company.addressLine1, company.addressLine2, company.city, company.postalCode, company.country].filter(Boolean).join(', ')],
    [isAr ? 'اسم مسؤول التواصل' : 'Contact Person', company.representativeName],
    [isAr ? 'المنصب' : 'Position', company.representativeTitle],
    [isAr ? 'بريد مسؤول التواصل' : 'Contact Email', company.contactEmail],
    [isAr ? 'جوال مسؤول التواصل' : 'Contact Mobile', company.contactMobile],
    [isAr ? 'تاريخ الانضمام' : 'Joining Date', company.approvedAt ?? company.createdAt],
    [isAr ? 'سنوات الخبرة' : 'Years of Experience', company.yearsOfExperience],
    [isAr ? 'عن الشركة' : 'About Company', company.about],
  ];

  return (
    <div className="space-y-6">
      <div className="dashboard-page-header flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between md:p-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" className="px-2" onClick={() => navigate(`/clients/${company.companyId}`)} aria-label="Back">
            <ArrowLeft className="h-5 w-5 rtl:rotate-180" />
          </Button>
          <CompanyAvatar
            name={isAr ? company.nameAr : company.nameEn}
            logoUrl={company.logoUrl ?? company.avatarUrl ?? undefined}
            size={56}
            className="rounded-xl border border-border"
          />
          <div>
            <h1 className="text-2xl font-bold text-text-main">{isAr ? company.nameAr : company.nameEn}</h1>
            <p className="mt-1 text-sm text-text-muted">{isAr ? 'معلومات العميل والبيانات القانونية' : 'Client information and legal profile'}</p>
          </div>
        </div>
        <Badge variant={company.approvalStatus === 'rejected' ? 'error' : company.approvalStatus === 'pending' ? 'warning' : 'success'}>
          {company.approvalStatus === 'pending'
            ? (isAr ? 'قيد المراجعة' : 'Pending')
            : company.approvalStatus === 'rejected'
              ? (isAr ? 'مرفوض' : 'Rejected')
              : (isAr ? 'معتمد' : 'Approved')}
        </Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-5">
            <Building2 className="h-5 w-5 text-primary" />
            <div>
              <p className="text-xs text-text-muted">{isAr ? 'نوع العميل' : 'Client Type'}</p>
              <p className="font-semibold text-text-main">{company.source === 'portal' ? (isAr ? 'عميل بوابة' : 'Portal Client') : (isAr ? 'عميل داخلي' : 'Internal Client')}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-5">
            <FileText className="h-5 w-5 text-primary" />
            <div>
              <p className="text-xs text-text-muted">{isAr ? 'النصوص' : 'Scripts'}</p>
              <p className="font-semibold text-text-main">{companyScripts.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-text-muted">{isAr ? 'تاريخ الانضمام' : 'Joining Date'}</p>
            <p className="font-semibold text-text-main">{valueOrDash(company.approvedAt ?? company.createdAt)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-6">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {rows.map(([label, value]) => (
              <div key={label} className="dashboard-item-card p-4">
                <p className="text-xs text-text-muted">{label}</p>
                <p className="mt-1 break-words text-sm font-medium text-text-main">{valueOrDash(value)}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <h2 className="text-lg font-bold text-text-main">{isAr ? 'المستندات المرفقة' : 'Attached Documents'}</h2>
          <div className="mt-4 space-y-2">
            {(company.legalDocuments ?? []).length > 0 ? company.legalDocuments?.map((doc) => (
              <div key={`${doc.type}-${doc.name}`} className="dashboard-item-card flex items-center justify-between gap-3 p-3">
                <div>
                  <p className="font-medium text-text-main">{doc.name}</p>
                  <p className="text-xs text-text-muted">{doc.type}</p>
                </div>
              </div>
            )) : (
              <p className="text-sm text-text-muted">{isAr ? 'لا توجد مستندات مرفقة.' : 'No attached documents.'}</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
