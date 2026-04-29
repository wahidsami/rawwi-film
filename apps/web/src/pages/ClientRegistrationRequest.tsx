import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, Download } from 'lucide-react';
import { useLangStore } from '@/store/langStore';
import { useDataStore } from '@/store/dataStore';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { CompanyAvatar } from '@/components/ui/CompanyAvatar';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { companiesApi } from '@/api';
import { supabase } from '@/lib/supabaseClient';

function statusBadge(status: string | undefined, lang: 'ar' | 'en') {
  if (status === 'pending') return <Badge variant="warning">{lang === 'ar' ? 'قيد المراجعة' : 'Pending'}</Badge>;
  if (status === 'rejected') return <Badge variant="error">{lang === 'ar' ? 'مرفوض' : 'Rejected'}</Badge>;
  return <Badge variant="success">{lang === 'ar' ? 'معتمد' : 'Approved'}</Badge>;
}

function splitStoragePath(pathOrUrl: string): { bucket: string; objectPath: string } | null {
  const trimmed = pathOrUrl.trim();
  if (!trimmed) return null;

  if (/^https?:\/\//i.test(trimmed)) {
    const marker = '/storage/v1/object/';
    const idx = trimmed.indexOf(marker);
    if (idx >= 0) {
      const rest = trimmed.slice(idx + marker.length);
      const publicPrefix = 'public/';
      const privatePrefix = 'sign/';
      const normalized = rest.startsWith(publicPrefix) ? rest.slice(publicPrefix.length) : rest.startsWith(privatePrefix) ? rest.slice(privatePrefix.length) : rest;
      const slash = normalized.indexOf('/');
      if (slash > 0) {
        const objectWithQuery = normalized.slice(slash + 1);
        const objectPath = objectWithQuery.split('?')[0].split('#')[0];
        return { bucket: normalized.slice(0, slash), objectPath };
      }
    }
    return null;
  }

  const slash = trimmed.indexOf('/');
  if (slash <= 0) return null;
  const objectPath = trimmed.slice(slash + 1).split('?')[0].split('#')[0];
  return { bucket: trimmed.slice(0, slash), objectPath };
}

export function ClientRegistrationRequest() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { lang } = useLangStore();
  const { companies, fetchInitialData } = useDataStore();
  const [actionId, setActionId] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');

  const company = useMemo(() => companies.find((c) => c.companyId === id), [companies, id]);

  if (!company || (company.source ?? 'internal') !== 'portal') {
    return <div className="p-8 text-center text-text-muted">{lang === 'ar' ? 'لم يتم العثور على طلب التسجيل' : 'Registration request not found'}</div>;
  }

  const downloadDocument = async (doc: { name: string; path?: string; url?: string }) => {
    try {
      const fromPath = doc.path ? splitStoragePath(doc.path) : null;
      const fromUrl = !fromPath && doc.url ? splitStoragePath(doc.url) : null;
      const parsed = fromPath ?? fromUrl;
      if (!parsed) throw new Error(lang === 'ar' ? 'مسار المستند غير صالح' : 'Invalid document path');

      const { data, error } = await supabase.storage.from(parsed.bucket).download(parsed.objectPath);
      if (error || !data) throw new Error(error?.message || (lang === 'ar' ? 'تعذر تنزيل المستند' : 'Failed to download document'));

      const blobUrl = URL.createObjectURL(data);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = doc.name || parsed.objectPath.split('/').pop() || 'document';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(blobUrl);
      toast.success(lang === 'ar' ? 'تم تنزيل المستند' : 'Document downloaded');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : (lang === 'ar' ? 'تعذر تنزيل المستند' : 'Failed to download document'));
    }
  };

  const approveClient = async () => {
    setActionId(company.companyId);
    try {
      await companiesApi.approveCompany(company.companyId);
      toast.success(lang === 'ar' ? 'تم اعتماد العميل وإرسال بريد القبول' : 'Client approved and acceptance email sent');
      await fetchInitialData();
      navigate('/app/clients');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Approval failed');
    } finally {
      setActionId(null);
    }
  };

  const rejectClient = async () => {
    if (!rejectionReason.trim()) {
      toast.error(lang === 'ar' ? 'يرجى كتابة سبب الرفض' : 'Please write a rejection reason');
      return;
    }
    setActionId(company.companyId);
    try {
      await companiesApi.rejectCompany(company.companyId, rejectionReason.trim());
      toast.success(lang === 'ar' ? 'تم رفض الطلب وإرسال السبب للعميل' : 'Request rejected and reason emailed to client');
      await fetchInitialData();
      navigate('/app/clients');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Rejection failed');
    } finally {
      setActionId(null);
    }
  };

  const detailRows = [
    [lang === 'ar' ? 'اسم الشركة بالعربية' : 'Company Arabic Name', company.nameAr],
    [lang === 'ar' ? 'اسم الشركة بالإنجليزية' : 'Company English Name', company.nameEn],
    [lang === 'ar' ? 'الموقع الإلكتروني' : 'Website', company.website || '—'],
    [lang === 'ar' ? 'البريد الإلكتروني' : 'Email', company.email || '—'],
    [lang === 'ar' ? 'رقم الشركة' : 'Company Phone', company.phone || company.mobile || '—'],
    [lang === 'ar' ? 'العنوان الوطني' : 'Saudi Address', [company.addressLine1, company.addressLine2, company.city, company.postalCode].filter(Boolean).join(', ') || '—'],
    [lang === 'ar' ? 'مسؤول التواصل' : 'Contact Person', company.representativeName || '—'],
    [lang === 'ar' ? 'المنصب' : 'Position', company.representativeTitle || '—'],
    [lang === 'ar' ? 'بريد مسؤول التواصل' : 'Contact Email', company.contactEmail || '—'],
    [lang === 'ar' ? 'جوال مسؤول التواصل' : 'Contact Mobile', company.contactMobile || '—'],
    [lang === 'ar' ? 'سنوات الخبرة' : 'Years of Experience', company.yearsOfExperience?.toString() || '—'],
    [lang === 'ar' ? 'عن الشركة' : 'About', company.about || '—'],
  ];

  return (
    <div className="space-y-6">
      <div className="dashboard-page-header flex items-center justify-between p-5 md:p-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" className="px-2" onClick={() => navigate('/app/clients')} aria-label="Back">
            <ArrowLeft className="h-5 w-5 rtl:rotate-180" />
          </Button>
          <h1 className="text-2xl font-bold text-text-main">{lang === 'ar' ? 'تفاصيل طلب التسجيل' : 'Registration Request Details'}</h1>
        </div>
      </div>

      <Card>
        <CardContent className="space-y-5 p-6">
          <div className="flex items-center gap-3">
            <CompanyAvatar name={lang === 'ar' ? company.nameAr : company.nameEn} logoUrl={company.logoUrl ?? undefined} size={56} />
            <div>
              <p className="font-semibold text-text-main">{lang === 'ar' ? company.nameAr : company.nameEn}</p>
              <div className="mt-1">{statusBadge(company.approvalStatus, lang === 'ar' ? 'ar' : 'en')}</div>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {detailRows.map(([label, value]) => (
              <div key={label} className="dashboard-item-card p-3">
                <p className="text-xs text-text-muted">{label}</p>
                <p className="mt-1 break-words text-sm font-medium text-text-main">{value}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <h2 className="text-lg font-semibold text-text-main">{lang === 'ar' ? 'المستندات القانونية' : 'Legal Documents'}</h2>
          <div className="mt-4 space-y-2">
            {(company.legalDocuments ?? []).length > 0 ? (
              company.legalDocuments?.map((doc) => (
                <div key={`${doc.type}-${doc.name}`} className="dashboard-item-card flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-text-main">{doc.name}</p>
                    <p className="text-xs text-text-muted">{doc.type}</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => void downloadDocument(doc)}>
                    <Download className="me-1 h-4 w-4" />
                    {lang === 'ar' ? 'تنزيل' : 'Download'}
                  </Button>
                </div>
              ))
            ) : (
              <p className="text-sm text-text-muted">—</p>
            )}
          </div>
        </CardContent>
      </Card>

      {(company.approvalStatus ?? 'pending') === 'pending' && (
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={() => navigate('/app/clients')}>{lang === 'ar' ? 'رجوع' : 'Back'}</Button>
          <Button onClick={() => void approveClient()} disabled={actionId === company.companyId}>{lang === 'ar' ? 'اعتماد الطلب' : 'Approve Request'}</Button>
          <Button variant="danger" onClick={() => setRejectOpen(true)} disabled={actionId === company.companyId}>{lang === 'ar' ? 'رفض الطلب' : 'Reject Request'}</Button>
        </div>
      )}

      {company.rejectionReason && (
        <div className="rounded-lg border border-error/20 bg-error/10 p-3 text-sm text-error">{company.rejectionReason}</div>
      )}

      <Modal isOpen={rejectOpen} onClose={() => { setRejectOpen(false); setRejectionReason(''); }} title={lang === 'ar' ? 'سبب رفض طلب التسجيل' : 'Registration Rejection Reason'}>
        <div className="space-y-4">
          <Input label={lang === 'ar' ? 'سبب الرفض' : 'Rejection Reason'} value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} required />
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button variant="outline" onClick={() => { setRejectOpen(false); setRejectionReason(''); }}>{lang === 'ar' ? 'إلغاء' : 'Cancel'}</Button>
            <Button variant="danger" onClick={() => void rejectClient()} disabled={!!actionId}>{lang === 'ar' ? 'إرسال الرفض' : 'Submit Rejection'}</Button>
          </div>
        </div>
      </Modal>

    </div>
  );
}
