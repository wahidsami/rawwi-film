import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { clientPortalApi } from '@/api';
import { useLangStore } from '@/store/langStore';

export function ClientRegister() {
  const { lang } = useLangStore();
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
    password: '',
    confirmPassword: '',
    about: '',
    yearsOfExperience: '',
    acceptedTerms: false,
  });
  const [terms, setTerms] = useState<{ ar: string; en: string } | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [companyLogoFile, setCompanyLogoFile] = useState<File | null>(null);
  const [companyLogoPreview, setCompanyLogoPreview] = useState<string | null>(null);
  const [crDocument, setCrDocument] = useState<File | null>(null);
  const [licenseDocument, setLicenseDocument] = useState<File | null>(null);
  const [nationalAddressDocument, setNationalAddressDocument] = useState<File | null>(null);

  useEffect(() => {
    clientPortalApi.getTerms().then(setTerms).catch(() => setTerms(null));
  }, []);

  useEffect(() => {
    if (!companyLogoFile) {
      setCompanyLogoPreview(null);
      return;
    }
    const nextUrl = URL.createObjectURL(companyLogoFile);
    setCompanyLogoPreview(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [companyLogoFile]);

  const setField = (key: keyof typeof form, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (form.password !== form.confirmPassword) {
      setError(lang === 'ar' ? 'كلمتا المرور غير متطابقتين' : 'Passwords do not match');
      return;
    }
    if (!form.acceptedTerms) {
      setError(lang === 'ar' ? 'يجب الموافقة على الشروط والأحكام' : 'You must agree to the terms and conditions');
      return;
    }
    if (!crDocument || !licenseDocument || !nationalAddressDocument) {
      setError(lang === 'ar' ? 'يرجى رفع السجل التجاري والرخصة والعنوان الوطني' : 'Please upload CR, license, and national address documents');
      return;
    }

    setIsSaving(true);
    try {
      await clientPortalApi.register({
        name: form.contactName.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
        companyNameAr: form.companyNameAr.trim(),
        companyNameEn: form.companyNameEn.trim(),
        website: form.website.trim() || undefined,
        phone: form.phone.trim(),
        addressLine1: form.addressLine1.trim(),
        addressLine2: form.addressLine2.trim() || undefined,
        city: form.city.trim(),
        postalCode: form.postalCode.trim(),
        representativeName: form.contactName.trim(),
        representativeTitle: form.contactPosition.trim(),
        mobile: form.phone.trim(),
        contactEmail: form.contactEmail.trim().toLowerCase() || form.email.trim().toLowerCase(),
        contactMobile: form.contactMobile.trim(),
        about: form.about.trim() || undefined,
        yearsOfExperience: form.yearsOfExperience ? Number.parseInt(form.yearsOfExperience, 10) : null,
        companyLogoFile,
        legalDocuments: {
          cr: crDocument,
          license: licenseDocument,
          nationalAddress: nationalAddressDocument,
        },
        acceptedTerms: form.acceptedTerms,
      });
      setSuccess(lang === 'ar'
        ? 'تم إرسال طلب التسجيل بنجاح. ستصلك رسالة بريدية بعد مراجعة الطلب.'
        : 'Registration request submitted successfully. You will receive an email after review.');
    } catch (err) {
      setError(err instanceof Error ? err.message : (lang === 'ar' ? 'فشل التسجيل' : 'Registration failed'));
    } finally {
      setIsSaving(false);
    }
  };

  const fileInputClass = 'block w-full text-sm text-text-muted file:me-3 file:rounded-md file:border file:border-border file:bg-background file:px-3 file:py-2 file:text-text-main hover:file:bg-surface';

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6 text-text-main">
        <div className="w-full max-w-xl rounded-2xl border border-border bg-surface p-8 text-center shadow-sm">
          <img src="/fclogo.png" alt="Film Commission" className="mx-auto mb-5 h-14 object-contain" />
          <h1 className="text-2xl font-bold">{lang === 'ar' ? 'تم استلام الطلب' : 'Request Received'}</h1>
          <p className="mt-3 text-text-muted">{success}</p>
          <div className="mt-6 flex justify-center gap-3">
            <Link to="/login"><Button variant="outline">{lang === 'ar' ? 'تسجيل الدخول' : 'Login'}</Button></Link>
            <Link to="/portal"><Button>{lang === 'ar' ? 'العودة' : 'Back'}</Button></Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6 text-text-main">
      <div className="mx-auto w-full max-w-5xl rounded-2xl border border-border bg-surface p-6 shadow-sm md:p-8">
        <div className="mb-5 flex justify-center">
          <img src="/fclogo.png" alt="Film Commission" className="h-14 object-contain" />
        </div>
        <div className="mb-6 space-y-2">
          <h1 className="text-2xl font-bold">{lang === 'ar' ? 'طلب انضمام شركة إنتاج' : 'Production Company Join Request'}</h1>
          <p className="text-sm text-text-muted">
            {lang === 'ar'
              ? 'سيتم تفعيل حسابك بعد مراجعة الطلب واعتماده من الإدارة.'
              : 'Your account will be activated after the admin team reviews and approves your request.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Input label={lang === 'ar' ? 'اسم الشركة بالعربية *' : 'Company Name Arabic *'} value={form.companyNameAr} onChange={(e) => setField('companyNameAr', e.target.value)} required />
            <Input label={lang === 'ar' ? 'اسم الشركة بالإنجليزية *' : 'Company Name English *'} value={form.companyNameEn} onChange={(e) => setField('companyNameEn', e.target.value)} required dir="ltr" />
            <Input label={lang === 'ar' ? 'الموقع الإلكتروني' : 'Company Website'} value={form.website} onChange={(e) => setField('website', e.target.value)} dir="ltr" />
            <Input label={lang === 'ar' ? 'بريد الشركة *' : 'Company Email *'} type="email" value={form.email} onChange={(e) => setField('email', e.target.value)} required dir="ltr" />
            <Input label={lang === 'ar' ? 'رقم هاتف الشركة السعودي *' : 'Saudi Company Phone *'} value={form.phone} onChange={(e) => setField('phone', e.target.value)} required placeholder="05XXXXXXXX" dir="ltr" />
            <Input label={lang === 'ar' ? 'المدينة *' : 'City *'} value={form.city} onChange={(e) => setField('city', e.target.value)} required />
            <Input label={lang === 'ar' ? 'العنوان الوطني - السطر الأول *' : 'Saudi Address Line 1 *'} value={form.addressLine1} onChange={(e) => setField('addressLine1', e.target.value)} required />
            <Input label={lang === 'ar' ? 'العنوان الوطني - السطر الثاني' : 'Saudi Address Line 2'} value={form.addressLine2} onChange={(e) => setField('addressLine2', e.target.value)} />
            <Input label={lang === 'ar' ? 'الرمز البريدي *' : 'Postal Code *'} value={form.postalCode} onChange={(e) => setField('postalCode', e.target.value)} required dir="ltr" />
          </section>

          <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Input label={lang === 'ar' ? 'اسم مسؤول التواصل *' : 'Contact Person Name *'} value={form.contactName} onChange={(e) => setField('contactName', e.target.value)} required />
            <Input label={lang === 'ar' ? 'المنصب *' : 'Position *'} value={form.contactPosition} onChange={(e) => setField('contactPosition', e.target.value)} required />
            <Input label={lang === 'ar' ? 'بريد مسؤول التواصل *' : 'Contact Email *'} type="email" value={form.contactEmail} onChange={(e) => setField('contactEmail', e.target.value)} required dir="ltr" />
            <Input label={lang === 'ar' ? 'جوال مسؤول التواصل *' : 'Contact Mobile *'} value={form.contactMobile} onChange={(e) => setField('contactMobile', e.target.value)} required placeholder="05XXXXXXXX" dir="ltr" />
          </section>

          <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Input label={lang === 'ar' ? 'كلمة المرور *' : 'Password *'} type="password" value={form.password} onChange={(e) => setField('password', e.target.value)} required minLength={8} dir="ltr" />
            <Input label={lang === 'ar' ? 'تأكيد كلمة المرور *' : 'Confirm Password *'} type="password" value={form.confirmPassword} onChange={(e) => setField('confirmPassword', e.target.value)} required minLength={8} dir="ltr" />
          </section>

          <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Input label={lang === 'ar' ? 'سنوات الخبرة' : 'Years of Experience'} type="number" min={0} value={form.yearsOfExperience} onChange={(e) => setField('yearsOfExperience', e.target.value)} />
            <div className="md:col-span-2">
              <Textarea label={lang === 'ar' ? 'نبذة عن الشركة' : 'About the Company'} value={form.about} onChange={(e) => setField('about', e.target.value)} rows={4} />
            </div>
          </section>

          <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-text-main">{lang === 'ar' ? 'شعار الشركة' : 'Company Logo'}</label>
              <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setCompanyLogoFile(e.target.files?.[0] ?? null)} className={fileInputClass} />
              {companyLogoPreview && <img src={companyLogoPreview} alt="" className="h-16 w-16 rounded-md border border-border bg-background object-cover" />}
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-text-main">{lang === 'ar' ? 'السجل التجاري *' : 'CR Document *'}</label>
              <input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" onChange={(e) => setCrDocument(e.target.files?.[0] ?? null)} className={fileInputClass} required />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-text-main">{lang === 'ar' ? 'الرخصة *' : 'License Document *'}</label>
              <input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" onChange={(e) => setLicenseDocument(e.target.files?.[0] ?? null)} className={fileInputClass} required />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-text-main">{lang === 'ar' ? 'مستند العنوان الوطني *' : 'National Address Document *'}</label>
              <input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" onChange={(e) => setNationalAddressDocument(e.target.files?.[0] ?? null)} className={fileInputClass} required />
            </div>
          </section>

          <section className="rounded-xl border border-border bg-background/60 p-4">
            <p className="text-sm font-semibold text-text-main">{lang === 'ar' ? 'الشروط والأحكام' : 'Terms and Conditions'}</p>
            <p className="mt-2 whitespace-pre-wrap text-sm text-text-muted">{lang === 'ar' ? terms?.ar : terms?.en}</p>
            <label className="mt-4 flex items-start gap-2 text-sm text-text-main">
              <input type="checkbox" checked={form.acceptedTerms} onChange={(e) => setField('acceptedTerms', e.target.checked)} required />
              <span>{lang === 'ar' ? 'أوافق على الشروط والأحكام' : 'I agree to the terms and conditions'}</span>
            </label>
          </section>

          {error && <div className="rounded-md border border-error/20 bg-error/10 p-3 text-sm text-error">{error}</div>}

          <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
            <Button type="submit" isLoading={isSaving}>{lang === 'ar' ? 'إرسال طلب الانضمام' : 'Submit Join Request'}</Button>
            <Link to="/login"><Button type="button" variant="outline">{lang === 'ar' ? 'لديك حساب؟ تسجيل الدخول' : 'Already have an account? Login'}</Button></Link>
            <Link to="/portal" className="text-sm text-text-muted hover:text-text-main">{lang === 'ar' ? 'العودة للصفحة الرئيسية' : 'Back to landing'}</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
