import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft } from 'lucide-react';
import { useLangStore } from '@/store/langStore';
import { useDataStore } from '@/store/dataStore';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Card, CardContent } from '@/components/ui/Card';
import { CompanyAvatar } from '@/components/ui/CompanyAvatar';
import { companiesApi } from '@/api';

const SAUDI_MOBILE_REGEX = /^05\d{8}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LOGO_MIMES = new Set(['image/png', 'image/jpeg']);
const LOGO_MAX_BYTES = 2 * 1024 * 1024;
const LEGAL_DOC_MIMES = new Set(['application/pdf', 'image/png', 'image/jpeg']);
const LEGAL_DOC_MAX_BYTES = 10 * 1024 * 1024;

export function InternalClientEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { lang } = useLangStore();
  const { companies, updateCompany, fetchInitialData } = useDataStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [crDocument, setCrDocument] = useState<File | null>(null);
  const [licenseDocument, setLicenseDocument] = useState<File | null>(null);
  const [nationalAddressDocument, setNationalAddressDocument] = useState<File | null>(null);
  const [form, setForm] = useState({
    companyNameAr: '',
    companyNameEn: '',
    website: '',
    email: '',
    phone: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    postalCode: '',
    contactName: '',
    contactPosition: '',
    contactEmail: '',
    contactMobile: '',
    about: '',
    yearsOfExperience: '',
  });

  const company = useMemo(() => companies.find((c) => c.companyId === id), [companies, id]);

  useEffect(() => {
    if (!company) return;
    setForm({
      companyNameAr: company.nameAr ?? '',
      companyNameEn: company.nameEn ?? '',
      website: company.website ?? '',
      email: company.email ?? '',
      phone: company.phone ?? company.mobile ?? '',
      addressLine1: company.addressLine1 ?? '',
      addressLine2: company.addressLine2 ?? '',
      city: company.city ?? '',
      postalCode: company.postalCode ?? '',
      contactName: company.representativeName ?? '',
      contactPosition: company.representativeTitle ?? '',
      contactEmail: company.contactEmail ?? company.email ?? '',
      contactMobile: company.contactMobile ?? '',
      about: company.about ?? '',
      yearsOfExperience: company.yearsOfExperience != null ? String(company.yearsOfExperience) : '',
    });
  }, [company]);

  useEffect(() => () => {
    if (logoPreviewUrl) URL.revokeObjectURL(logoPreviewUrl);
  }, [logoPreviewUrl]);

  if (!company) return <div className="p-8 text-center text-text-muted">{lang === 'ar' ? 'العميل غير موجود' : 'Client not found'}</div>;
  if ((company.source ?? 'internal') !== 'internal') return <div className="p-8 text-center text-text-muted">{lang === 'ar' ? 'يمكن تعديل العملاء الداخليين فقط' : 'Only internal clients can be edited here'}</div>;

  const setField = (key: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: '' }));
  };

  const validate = () => {
    const next: Record<string, string> = {};
    if (!form.companyNameAr.trim()) next.companyNameAr = lang === 'ar' ? 'مطلوب' : 'Required';
    if (!form.companyNameEn.trim()) next.companyNameEn = lang === 'ar' ? 'مطلوب' : 'Required';
    if (!EMAIL_REGEX.test(form.email.trim())) next.email = lang === 'ar' ? 'بريد غير صالح' : 'Invalid email';
    if (!SAUDI_MOBILE_REGEX.test(form.phone.trim())) next.phone = lang === 'ar' ? 'صيغة الجوال: 05XXXXXXXX' : 'Mobile format: 05XXXXXXXX';
    if (!form.contactName.trim()) next.contactName = lang === 'ar' ? 'مطلوب' : 'Required';
    if (form.contactEmail.trim() && !EMAIL_REGEX.test(form.contactEmail.trim())) next.contactEmail = lang === 'ar' ? 'بريد غير صالح' : 'Invalid email';
    if (form.contactMobile.trim() && !SAUDI_MOBILE_REGEX.test(form.contactMobile.trim())) next.contactMobile = lang === 'ar' ? 'صيغة الجوال: 05XXXXXXXX' : 'Mobile format: 05XXXXXXXX';
    if (form.yearsOfExperience.trim()) {
      const years = Number.parseInt(form.yearsOfExperience, 10);
      if (!Number.isFinite(years) || years < 0) next.yearsOfExperience = lang === 'ar' ? 'رقم غير صالح' : 'Invalid number';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const onLogoPick = (file: File | null) => {
    if (!file) return;
    if (!LOGO_MIMES.has(file.type)) {
      toast.error(lang === 'ar' ? 'الشعار يجب أن يكون PNG أو JPEG' : 'Logo must be PNG or JPEG');
      return;
    }
    if (file.size > LOGO_MAX_BYTES) {
      toast.error(lang === 'ar' ? 'حجم الشعار أكبر من 2MB' : 'Logo exceeds 2MB');
      return;
    }
    if (logoPreviewUrl) URL.revokeObjectURL(logoPreviewUrl);
    setLogoFile(file);
    setLogoPreviewUrl(URL.createObjectURL(file));
  };

  const save = async () => {
    if (!validate()) return;
    setIsSaving(true);
    try {
      await updateCompany(company.companyId, {
        nameAr: form.companyNameAr.trim(),
        nameEn: form.companyNameEn.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim(),
        mobile: form.phone.trim(),
        representativeName: form.contactName.trim(),
        representativeTitle: form.contactPosition.trim() || null,
        website: form.website.trim() || null,
        addressLine1: form.addressLine1.trim() || null,
        addressLine2: form.addressLine2.trim() || null,
        city: form.city.trim() || null,
        postalCode: form.postalCode.trim() || null,
        contactEmail: form.contactEmail.trim().toLowerCase() || null,
        contactMobile: form.contactMobile.trim() || null,
        about: form.about.trim() || null,
        yearsOfExperience: form.yearsOfExperience.trim() ? Number.parseInt(form.yearsOfExperience, 10) : null,
      });
      if (logoFile) {
        await companiesApi.uploadCompanyLogo(company.companyId, logoFile);
      }
      if (crDocument) {
        await companiesApi.uploadCompanyLegalDocument(company.companyId, 'cr', crDocument);
      }
      if (licenseDocument) {
        await companiesApi.uploadCompanyLegalDocument(company.companyId, 'license', licenseDocument);
      }
      if (nationalAddressDocument) {
        await companiesApi.uploadCompanyLegalDocument(company.companyId, 'national_address', nationalAddressDocument);
      }
      await fetchInitialData();
      toast.success(lang === 'ar' ? 'تم تحديث بيانات العميل' : 'Client updated');
      navigate(`/clients/${company.companyId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : (lang === 'ar' ? 'فشل التحديث' : 'Update failed'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" className="px-2" onClick={() => navigate(`/clients/${company.companyId}`)} aria-label="Back">
          <ArrowLeft className="h-5 w-5 rtl:rotate-180" />
        </Button>
        <h1 className="text-2xl font-bold text-text-main">{lang === 'ar' ? 'تعديل بيانات العميل' : 'Edit Client Data'}</h1>
      </div>

      <Card>
        <CardContent className="space-y-5 p-6">
          <div className="flex items-center gap-4">
            <CompanyAvatar name={lang === 'ar' ? company.nameAr : company.nameEn} logoUrl={logoPreviewUrl ?? company.logoUrl ?? undefined} size={72} className="rounded-xl border border-border" />
            <div>
              <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
                {lang === 'ar' ? 'تغيير الشعار' : 'Change Logo'}
              </Button>
              <input ref={fileInputRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => onLogoPick(e.target.files?.[0] ?? null)} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Input label={lang === 'ar' ? 'اسم الشركة بالعربية *' : 'Company Name Arabic *'} value={form.companyNameAr} onChange={(e) => setField('companyNameAr', e.target.value)} error={errors.companyNameAr} />
            <Input label={lang === 'ar' ? 'اسم الشركة بالإنجليزية *' : 'Company Name English *'} value={form.companyNameEn} onChange={(e) => setField('companyNameEn', e.target.value)} error={errors.companyNameEn} dir="ltr" />
            <Input label={lang === 'ar' ? 'الموقع الإلكتروني' : 'Company Website'} value={form.website} onChange={(e) => setField('website', e.target.value)} dir="ltr" />
            <Input label={lang === 'ar' ? 'بريد الشركة *' : 'Company Email *'} value={form.email} onChange={(e) => setField('email', e.target.value)} error={errors.email} dir="ltr" />
            <Input label={lang === 'ar' ? 'رقم هاتف الشركة السعودي *' : 'Saudi Company Phone *'} value={form.phone} onChange={(e) => setField('phone', e.target.value)} error={errors.phone} dir="ltr" />
            <Input label={lang === 'ar' ? 'المدينة' : 'City'} value={form.city} onChange={(e) => setField('city', e.target.value)} />
            <Input label={lang === 'ar' ? 'العنوان الوطني - السطر الأول' : 'Saudi Address Line 1'} value={form.addressLine1} onChange={(e) => setField('addressLine1', e.target.value)} />
            <Input label={lang === 'ar' ? 'العنوان الوطني - السطر الثاني' : 'Saudi Address Line 2'} value={form.addressLine2} onChange={(e) => setField('addressLine2', e.target.value)} />
            <Input label={lang === 'ar' ? 'الرمز البريدي' : 'Postal Code'} value={form.postalCode} onChange={(e) => setField('postalCode', e.target.value)} dir="ltr" />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Input label={lang === 'ar' ? 'اسم مسؤول التواصل *' : 'Contact Person Name *'} value={form.contactName} onChange={(e) => setField('contactName', e.target.value)} error={errors.contactName} />
            <Input label={lang === 'ar' ? 'المنصب' : 'Position'} value={form.contactPosition} onChange={(e) => setField('contactPosition', e.target.value)} />
            <Input label={lang === 'ar' ? 'بريد مسؤول التواصل' : 'Contact Email'} value={form.contactEmail} onChange={(e) => setField('contactEmail', e.target.value)} error={errors.contactEmail} dir="ltr" />
            <Input label={lang === 'ar' ? 'جوال مسؤول التواصل' : 'Contact Mobile'} value={form.contactMobile} onChange={(e) => setField('contactMobile', e.target.value)} error={errors.contactMobile} dir="ltr" />
            <Input label={lang === 'ar' ? 'سنوات الخبرة' : 'Years of Experience'} type="number" min={0} value={form.yearsOfExperience} onChange={(e) => setField('yearsOfExperience', e.target.value)} error={errors.yearsOfExperience} />
          </div>

          <Textarea label={lang === 'ar' ? 'نبذة عن الشركة' : 'About the Company'} value={form.about} onChange={(e) => setField('about', e.target.value)} rows={4} />

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-text-main">{lang === 'ar' ? 'السجل التجاري (PDF/JPEG/PNG)' : 'CR Document (PDF/JPEG/PNG)'}</label>
              <input
                type="file"
                accept="application/pdf,image/png,image/jpeg"
                className="block w-full text-sm text-text-muted file:me-3 file:rounded-md file:border file:border-border file:bg-background file:px-3 file:py-2 file:text-text-main"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  if (file && (!LEGAL_DOC_MIMES.has(file.type) || file.size > LEGAL_DOC_MAX_BYTES)) {
                    toast.error(lang === 'ar' ? 'الصيغة المسموحة PDF/JPEG/PNG وبحجم أقصى 10MB' : 'Allowed format PDF/JPEG/PNG and max size 10MB');
                    setCrDocument(null);
                    return;
                  }
                  setCrDocument(file);
                }}
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-text-main">{lang === 'ar' ? 'الرخصة (PDF/JPEG/PNG)' : 'License Document (PDF/JPEG/PNG)'}</label>
              <input
                type="file"
                accept="application/pdf,image/png,image/jpeg"
                className="block w-full text-sm text-text-muted file:me-3 file:rounded-md file:border file:border-border file:bg-background file:px-3 file:py-2 file:text-text-main"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  if (file && (!LEGAL_DOC_MIMES.has(file.type) || file.size > LEGAL_DOC_MAX_BYTES)) {
                    toast.error(lang === 'ar' ? 'الصيغة المسموحة PDF/JPEG/PNG وبحجم أقصى 10MB' : 'Allowed format PDF/JPEG/PNG and max size 10MB');
                    setLicenseDocument(null);
                    return;
                  }
                  setLicenseDocument(file);
                }}
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-text-main">{lang === 'ar' ? 'العنوان الوطني (PDF/JPEG/PNG)' : 'National Address (PDF/JPEG/PNG)'}</label>
              <input
                type="file"
                accept="application/pdf,image/png,image/jpeg"
                className="block w-full text-sm text-text-muted file:me-3 file:rounded-md file:border file:border-border file:bg-background file:px-3 file:py-2 file:text-text-main"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  if (file && (!LEGAL_DOC_MIMES.has(file.type) || file.size > LEGAL_DOC_MAX_BYTES)) {
                    toast.error(lang === 'ar' ? 'الصيغة المسموحة PDF/JPEG/PNG وبحجم أقصى 10MB' : 'Allowed format PDF/JPEG/PNG and max size 10MB');
                    setNationalAddressDocument(null);
                    return;
                  }
                  setNationalAddressDocument(file);
                }}
              />
            </div>
          </div>

          <div className="rounded-lg border border-border bg-background/60 p-4">
            <p className="text-sm font-medium text-text-main">{lang === 'ar' ? 'المستندات المرفوعة حالياً' : 'Currently uploaded documents'}</p>
            <div className="mt-2 space-y-1 text-sm text-text-muted">
              {(company.legalDocuments ?? []).length > 0 ? (
                company.legalDocuments?.map((doc) => (
                  <p key={`${doc.type}-${doc.name}`}>{doc.type}: {doc.name}</p>
                ))
              ) : (
                <p>—</p>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button variant="outline" onClick={() => navigate(`/clients/${company.companyId}`)}>{lang === 'ar' ? 'إلغاء' : 'Cancel'}</Button>
            <Button onClick={save} isLoading={isSaving}>{lang === 'ar' ? 'حفظ' : 'Save'}</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
