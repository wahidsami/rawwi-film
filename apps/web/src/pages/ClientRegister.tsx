import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { clientPortalApi } from '@/api';
import { useLangStore } from '@/store/langStore';

type BeneficiaryType = 'company' | 'individual' | null;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NATIONAL_ID_REGEX = /^1\d{9}$/;
const IQAMA_REGEX = /^2\d{9}$/;
const LOGO_MIMES = new Set(['image/png', 'image/jpeg']);
const DOC_MIMES = new Set(['application/pdf', 'image/png', 'image/jpeg']);
const COUNTRIES = ['Saudi Arabia', 'United Arab Emirates', 'Kuwait', 'Bahrain', 'Qatar', 'Oman', 'Egypt', 'Jordan', 'Morocco', 'Tunisia', 'Algeria', 'Iraq', 'Syria', 'Lebanon', 'Yemen', 'Sudan', 'United States', 'United Kingdom', 'France', 'Germany', 'India', 'Pakistan', 'Turkey', 'Other'];
const COUNTRY_DIAL_CODES: ReadonlyArray<{ country: string; code: string }> = [
  { country: 'Saudi Arabia', code: '+966' },
  { country: 'United Arab Emirates', code: '+971' },
  { country: 'Kuwait', code: '+965' },
  { country: 'Bahrain', code: '+973' },
  { country: 'Qatar', code: '+974' },
  { country: 'Oman', code: '+968' },
  { country: 'Egypt', code: '+20' },
  { country: 'Jordan', code: '+962' },
  { country: 'Morocco', code: '+212' },
  { country: 'Tunisia', code: '+216' },
  { country: 'Algeria', code: '+213' },
  { country: 'Iraq', code: '+964' },
  { country: 'Syria', code: '+963' },
  { country: 'Lebanon', code: '+961' },
  { country: 'Yemen', code: '+967' },
  { country: 'Sudan', code: '+249' },
  { country: 'United States', code: '+1' },
  { country: 'United Kingdom', code: '+44' },
  { country: 'France', code: '+33' },
  { country: 'Germany', code: '+49' },
  { country: 'India', code: '+91' },
  { country: 'Pakistan', code: '+92' },
  { country: 'Turkey', code: '+90' },
  { country: 'Other', code: '+000' },
];

function composeInternationalPhone(countryCode: string, localNumber: string): string {
  const normalizedCode = countryCode.trim().replace(/\s+/g, '');
  const normalizedNumber = localNumber.trim().replace(/\s+/g, '');
  if (!normalizedCode || !normalizedNumber) return '';
  return `${normalizedCode}${normalizedNumber}`;
}

function PhoneInputWithCountryCode(props: {
  label: string;
  codeLabel: string;
  numberLabel: string;
  countryCode: string;
  onCountryCodeChange: (value: string) => void;
  number: string;
  onNumberChange: (value: string) => void;
  required?: boolean;
  isArabic: boolean;
}) {
  const { label, codeLabel, numberLabel, countryCode, onCountryCodeChange, number, onNumberChange, required, isArabic } = props;
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return COUNTRY_DIAL_CODES;
    return COUNTRY_DIAL_CODES.filter((item) => item.country.toLowerCase().includes(q) || item.code.includes(q));
  }, [search]);

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-text-main">{label}</p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
        <div className="md:col-span-2 rounded-md border border-border bg-background p-2">
          <label className="mb-1 block text-xs text-text-muted">{codeLabel}</label>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={isArabic ? 'ابحث عن الدولة أو المفتاح' : 'Search country or code'}
            className="mb-2 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
          />
          <select
            value={countryCode}
            onChange={(e) => onCountryCodeChange(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-2 py-2 text-sm"
            required={required}
          >
            {filtered.map((item) => (
              <option key={`${item.country}-${item.code}`} value={item.code}>
                {item.country} ({item.code})
              </option>
            ))}
          </select>
        </div>
        <div className="md:col-span-3">
          <Input
            label={numberLabel}
            value={number}
            onChange={(e) => onNumberChange(e.target.value)}
            required={required}
            placeholder={isArabic ? 'أدخل رقم الجوال' : 'Enter mobile number'}
            dir="ltr"
          />
        </div>
      </div>
    </div>
  );
}

export function ClientRegister() {
  const { lang } = useLangStore();
  const isArabic = lang === 'ar';
  const [beneficiaryType, setBeneficiaryType] = useState<BeneficiaryType>(null);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    companyNameAr: '', companyNameEn: '', website: '', email: '', phone: '', city: '',
    phoneCountryCode: '+966',
    contactName: '', contactPosition: '', contactEmail: '', contactMobile: '',
    contactMobileCountryCode: '+966',
    password: '', confirmPassword: '', about: '', yearsOfExperience: '',
    fullName: '', dateOfBirth: '', nationality: 'Saudi Arabia', nationalIdOrIqama: '', individualCity: '', individualMobile: '',
    individualMobileCountryCode: '+966',
    acceptedTerms: false, acceptedRegulations: false,
  });
  const [terms, setTerms] = useState<{ ar: string; en: string } | null>(null);
  const [regulations, setRegulations] = useState<{ ar: string; en: string } | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [companyLogoFile, setCompanyLogoFile] = useState<File | null>(null);
  const [companyLogoPreview, setCompanyLogoPreview] = useState<string | null>(null);
  const [crDocument, setCrDocument] = useState<File | null>(null);
  const [licenseDocument, setLicenseDocument] = useState<File | null>(null);
  const [nationalAddressDocument, setNationalAddressDocument] = useState<File | null>(null);
  const [mediaContentLicenseDocument, setMediaContentLicenseDocument] = useState<File | null>(null);
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [idDocumentFile, setIdDocumentFile] = useState<File | null>(null);

  useEffect(() => {
    clientPortalApi.getTerms().then(setTerms).catch(() => setTerms(null));
    clientPortalApi.getRegulations().then(setRegulations).catch(() => setRegulations(null));
  }, []);

  useEffect(() => {
    if (!companyLogoFile) return setCompanyLogoPreview(null);
    const nextUrl = URL.createObjectURL(companyLogoFile);
    setCompanyLogoPreview(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [companyLogoFile]);

  const setField = (key: keyof typeof form, value: string | boolean) => setForm((prev) => ({ ...prev, [key]: value }));
  const isSaudiIndividual = form.nationality.trim().toLowerCase() === 'saudi arabia';
  const individualIdLabel = isSaudiIndividual ? (isArabic ? 'رقم الهوية الوطنية *' : 'National ID No. *') : (isArabic ? 'رقم الإقامة *' : 'Iqama No. *');

  const validateStep = (targetStep: number): string | null => {
    if (!beneficiaryType) return isArabic ? 'اختر نوع التسجيل أولاً' : 'Please select registration type first';
    if (beneficiaryType === 'company') {
      if (targetStep === 1) {
        if (!form.companyNameAr.trim() || !form.companyNameEn.trim()) return isArabic ? 'يرجى إدخال اسم الشركة بالعربية والإنجليزية' : 'Please enter company name in Arabic and English';
        if (!EMAIL_REGEX.test(form.email.trim())) return isArabic ? 'يرجى إدخال بريد شركة صحيح' : 'Please enter a valid company email';
        if (!form.phoneCountryCode.trim() || !form.phone.trim()) return isArabic ? 'يرجى إدخال رقم هاتف الشركة مع مفتاح الدولة' : 'Please enter company phone with country code';
        if (!form.city.trim()) return isArabic ? 'يرجى إدخال المدينة' : 'Please enter city';
      }
      if (targetStep === 2) {
        if (!form.contactName.trim() || !form.contactPosition.trim()) return isArabic ? 'يرجى إدخال اسم مسؤول التواصل والمنصب' : 'Please enter contact person name and position';
        if (!EMAIL_REGEX.test(form.contactEmail.trim())) return isArabic ? 'يرجى إدخال بريد مسؤول التواصل بشكل صحيح' : 'Please enter a valid contact email';
        if (!form.contactMobileCountryCode.trim() || !form.contactMobile.trim()) return isArabic ? 'يرجى إدخال جوال مسؤول التواصل مع مفتاح الدولة' : 'Please enter contact mobile with country code';
        if (form.password.length < 8) return isArabic ? 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' : 'Password must be at least 8 characters';
        if (form.password !== form.confirmPassword) return isArabic ? 'كلمتا المرور غير متطابقتين' : 'Passwords do not match';
      }
      if (targetStep === 3) {
        if (companyLogoFile && !LOGO_MIMES.has(companyLogoFile.type)) return isArabic ? 'شعار الشركة يجب أن يكون PNG أو JPEG' : 'Company logo must be PNG or JPEG';
        if (!crDocument || !licenseDocument || !nationalAddressDocument) return isArabic ? 'يرجى رفع السجل التجاري والرخصة والعنوان الوطني' : 'Please upload CR, license, and national address documents';
        if (!DOC_MIMES.has(crDocument.type) || !DOC_MIMES.has(licenseDocument.type) || !DOC_MIMES.has(nationalAddressDocument.type)) return isArabic ? 'المستندات يجب أن تكون PDF أو PNG أو JPEG' : 'Documents must be PDF, PNG, or JPEG';
        if (!form.acceptedTerms) return isArabic ? 'يجب الموافقة على الشروط والأحكام' : 'You must agree to the terms and conditions';
        if (!form.acceptedRegulations) return isArabic ? 'يجب الموافقة على الضوابط العامة للأعمال الدرامية والوثائقية' : 'You must agree to comply with the general regulations';
      }
      return null;
    }

    if (targetStep === 1) {
      if (!form.fullName.trim()) return isArabic ? 'الاسم مطلوب' : 'Name is required';
      if (!form.dateOfBirth) return isArabic ? 'تاريخ الميلاد مطلوب' : 'Date of birth is required';
      if (!form.nationality.trim()) return isArabic ? 'الجنسية مطلوبة' : 'Nationality is required';
      if (!EMAIL_REGEX.test(form.contactEmail.trim())) return isArabic ? 'يرجى إدخال بريد صحيح' : 'Please enter a valid email';
      if (!form.individualMobileCountryCode.trim() || !form.individualMobile.trim()) return isArabic ? 'يرجى إدخال الجوال مع مفتاح الدولة' : 'Please enter mobile with country code';
      if (!form.individualCity.trim()) return isArabic ? 'المدينة مطلوبة' : 'City is required';
      if (isSaudiIndividual && !NATIONAL_ID_REGEX.test(form.nationalIdOrIqama.trim())) return isArabic ? 'الهوية الوطنية يجب أن تكون 10 أرقام وتبدأ بـ 1' : 'National ID must be 10 digits and start with 1';
      if (!isSaudiIndividual && !IQAMA_REGEX.test(form.nationalIdOrIqama.trim())) return isArabic ? 'الإقامة يجب أن تكون 10 أرقام وتبدأ بـ 2' : 'Iqama must be 10 digits and start with 2';
      if (form.password.length < 8) return isArabic ? 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' : 'Password must be at least 8 characters';
      if (form.password !== form.confirmPassword) return isArabic ? 'كلمتا المرور غير متطابقتين' : 'Passwords do not match';
    }
    if (targetStep === 2) {
      if (!cvFile) return isArabic ? 'يرجى رفع السيرة الذاتية' : 'Please upload CV';
      if (!idDocumentFile || !DOC_MIMES.has(idDocumentFile.type)) return isArabic ? 'يرجى رفع مستند الهوية/الإقامة' : 'Please upload ID/Iqama document';
      if (!form.acceptedTerms) return isArabic ? 'يجب الموافقة على الشروط والأحكام' : 'You must agree to the terms and conditions';
      if (!form.acceptedRegulations) return isArabic ? 'يجب الموافقة على الضوابط العامة للأعمال الدرامية والوثائقية' : 'You must agree to comply with the general regulations';
    }
    return null;
  };

  const maxSteps = beneficiaryType === 'individual' ? 2 : 3;
  const isFinalStep = step === maxSteps;
  const isSubmitEnabled = isFinalStep && form.acceptedTerms && form.acceptedRegulations;
  const nextStep = () => {
    const e = validateStep(step);
    if (e) return setError(e);
    setError('');
    setStep((prev) => Math.min(maxSteps, prev + 1));
  };
  const prevStep = () => { setError(''); setStep((prev) => Math.max(1, prev - 1)); };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    const e = validateStep(maxSteps);
    if (e) return setError(e);
    setIsSaving(true);
    try {
      if (beneficiaryType === 'company') {
        const companyPhone = composeInternationalPhone(form.phoneCountryCode, form.phone);
        const contactMobile = composeInternationalPhone(form.contactMobileCountryCode, form.contactMobile);
        await clientPortalApi.register({
          beneficiaryType: 'company',
          name: form.contactName.trim(),
          email: form.contactEmail.trim().toLowerCase(),
          companyEmail: form.email.trim().toLowerCase(),
          password: form.password,
          companyNameAr: form.companyNameAr.trim(),
          companyNameEn: form.companyNameEn.trim(),
          website: form.website.trim() || undefined,
          phone: companyPhone,
          city: form.city.trim(),
          representativeName: form.contactName.trim(),
          representativeTitle: form.contactPosition.trim(),
          mobile: companyPhone,
          contactEmail: form.contactEmail.trim().toLowerCase(),
          contactMobile,
          about: form.about.trim() || undefined,
          yearsOfExperience: form.yearsOfExperience ? Number.parseInt(form.yearsOfExperience, 10) : null,
          companyLogoFile,
          legalDocuments: { cr: crDocument, license: licenseDocument, nationalAddress: nationalAddressDocument, mediaContentProductionLicense: mediaContentLicenseDocument },
          acceptedTerms: form.acceptedTerms,
          acceptedRegulations: form.acceptedRegulations,
        });
      } else {
        const individualMobile = composeInternationalPhone(form.individualMobileCountryCode, form.individualMobile);
        await clientPortalApi.register({
          beneficiaryType: 'individual',
          name: form.fullName.trim(),
          email: form.contactEmail.trim().toLowerCase(),
          password: form.password,
          companyNameAr: form.fullName.trim(),
          companyNameEn: form.fullName.trim(),
          phone: individualMobile,
          city: form.individualCity.trim(),
          mobile: individualMobile,
          contactEmail: form.contactEmail.trim().toLowerCase(),
          contactMobile: individualMobile,
          acceptedTerms: form.acceptedTerms,
          acceptedRegulations: form.acceptedRegulations,
          individualProfile: {
            fullName: form.fullName.trim(),
            dateOfBirth: form.dateOfBirth,
            nationality: form.nationality,
            nationalIdOrIqama: form.nationalIdOrIqama.trim(),
            city: form.individualCity.trim(),
            mobile: individualMobile,
            cvFile,
            idDocumentFile,
          },
        });
      }
      setSuccess(isArabic ? 'تم إرسال طلب التسجيل بنجاح. ستصلك رسالة بريدية بعد مراجعة الطلب.' : 'Registration request submitted successfully. You will receive an email after review.');
    } catch (err) {
      setError(err instanceof Error ? err.message : (isArabic ? 'فشل التسجيل' : 'Registration failed'));
    } finally {
      setIsSaving(false);
    }
  };

  const fileInputClass = 'block w-full text-sm text-text-muted file:me-3 file:rounded-md file:border file:border-border file:bg-background file:px-3 file:py-2 file:text-text-main hover:file:bg-surface';

  if (success) return <div className="flex min-h-screen items-center justify-center bg-background p-6 text-text-main"><div className="w-full max-w-xl rounded-2xl border border-border bg-surface p-8 text-center shadow-sm"><img src="/fclogo.png" alt="Film Commission" className="mx-auto mb-5 h-14 object-contain" /><h1 className="text-2xl font-bold">{isArabic ? 'تم استلام الطلب' : 'Request Received'}</h1><p className="mt-3 text-text-muted">{success}</p><div className="mt-6 flex justify-center gap-3"><Link to="/client/login"><Button variant="outline">{isArabic ? 'تسجيل الدخول' : 'Login'}</Button></Link><Link to="/"><Button>{isArabic ? 'العودة' : 'Back'}</Button></Link></div></div></div>;

  if (!beneficiaryType) {
    return (
      <div className="min-h-screen bg-background p-6 text-text-main">
        <div className="mx-auto w-full max-w-4xl rounded-2xl border border-border bg-surface p-6 shadow-sm md:p-8">
          <div className="mb-5 flex justify-center"><img src="/fclogo.png" alt="Film Commission" className="h-14 object-contain" /></div>
          <h1 className="text-center text-2xl font-bold">{isArabic ? 'اختر نوع التسجيل' : 'Select Registration Type'}</h1>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <button type="button" onClick={() => { setBeneficiaryType('company'); setStep(1); }} className="rounded-xl border border-border bg-background p-6 text-start hover:border-primary"><h2 className="text-lg font-semibold">{isArabic ? 'التسجيل كشركة' : 'Register as Company'}</h2></button>
            <button type="button" onClick={() => { setBeneficiaryType('individual'); setStep(1); }} className="rounded-xl border border-border bg-background p-6 text-start hover:border-primary"><h2 className="text-lg font-semibold">{isArabic ? 'التسجيل كفرد' : 'Register as Individual'}</h2></button>
          </div>
          <div className="mt-6 flex justify-center gap-3"><Link to="/client/login"><Button variant="outline">{isArabic ? 'تسجيل الدخول' : 'Login'}</Button></Link><Link to="/"><Button variant="outline">{isArabic ? 'العودة' : 'Back'}</Button></Link></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6 text-text-main">
      <div className="mx-auto w-full max-w-5xl rounded-2xl border border-border bg-surface p-6 shadow-sm md:p-8">
        <div className="mb-5 flex justify-center"><img src="/fclogo.png" alt="Film Commission" className="h-14 object-contain" /></div>
        <div className="mb-6 space-y-2"><h1 className="text-2xl font-bold">{beneficiaryType === 'company' ? (isArabic ? 'تسجيل مستفيد' : 'Beneficiary Registration') : (isArabic ? 'طلب انضمام فرد' : 'Individual Join Request')}</h1><p className="text-sm font-medium text-text-main">{`${isArabic ? 'الخطوة' : 'Step'} ${step}/${maxSteps}`}</p></div>
        <form onSubmit={handleSubmit} className="space-y-6">
          {beneficiaryType === 'company' && step === 1 && <section className="grid grid-cols-1 gap-4 md:grid-cols-2"><Input label={isArabic ? 'اسم الشركة بالعربية *' : 'Company Name Arabic *'} value={form.companyNameAr} onChange={(e) => setField('companyNameAr', e.target.value)} required /><Input label={isArabic ? 'اسم الشركة بالإنجليزية *' : 'Company Name English *'} value={form.companyNameEn} onChange={(e) => setField('companyNameEn', e.target.value)} required dir="ltr" /><Input label={isArabic ? 'الموقع الإلكتروني' : 'Company Website'} value={form.website} onChange={(e) => setField('website', e.target.value)} dir="ltr" /><Input label={isArabic ? 'البريد الإلكتروني *' : 'Email *'} type="email" value={form.email} onChange={(e) => setField('email', e.target.value)} required dir="ltr" /><div className="md:col-span-2"><PhoneInputWithCountryCode label={isArabic ? 'رقم هاتف الشركة *' : 'Company Phone *'} codeLabel={isArabic ? 'مفتاح الدولة' : 'Country code'} numberLabel={isArabic ? 'رقم الهاتف' : 'Phone number'} countryCode={form.phoneCountryCode} onCountryCodeChange={(value) => setField('phoneCountryCode', value)} number={form.phone} onNumberChange={(value) => setField('phone', value)} required isArabic={isArabic} /></div><Input label={isArabic ? 'المدينة *' : 'City *'} value={form.city} onChange={(e) => setField('city', e.target.value)} required /></section>}
          {beneficiaryType === 'company' && step === 2 && <><section className="grid grid-cols-1 gap-4 md:grid-cols-2"><Input label={isArabic ? 'اسم مسؤول التواصل *' : 'Contact Person Name *'} value={form.contactName} onChange={(e) => setField('contactName', e.target.value)} required /><Input label={isArabic ? 'المنصب *' : 'Position *'} value={form.contactPosition} onChange={(e) => setField('contactPosition', e.target.value)} required /><Input label={isArabic ? 'البريد الإلكتروني *' : 'Email *'} type="email" value={form.contactEmail} onChange={(e) => setField('contactEmail', e.target.value)} required dir="ltr" /><div className="md:col-span-2"><PhoneInputWithCountryCode label={isArabic ? 'جوال مسؤول التواصل *' : 'Contact Mobile *'} codeLabel={isArabic ? 'مفتاح الدولة' : 'Country code'} numberLabel={isArabic ? 'رقم الجوال' : 'Mobile number'} countryCode={form.contactMobileCountryCode} onCountryCodeChange={(value) => setField('contactMobileCountryCode', value)} number={form.contactMobile} onNumberChange={(value) => setField('contactMobile', value)} required isArabic={isArabic} /></div></section><section className="grid grid-cols-1 gap-4 md:grid-cols-2"><Input label={isArabic ? 'كلمة المرور *' : 'Password *'} type="password" value={form.password} onChange={(e) => setField('password', e.target.value)} required minLength={8} dir="ltr" /><Input label={isArabic ? 'تأكيد كلمة المرور *' : 'Confirm Password *'} type="password" value={form.confirmPassword} onChange={(e) => setField('confirmPassword', e.target.value)} required minLength={8} dir="ltr" /></section><section className="grid grid-cols-1 gap-4 md:grid-cols-3"><Input label={isArabic ? 'سنوات الخبرة' : 'Years of Experience'} type="number" min={0} value={form.yearsOfExperience} onChange={(e) => setField('yearsOfExperience', e.target.value)} /><div className="md:col-span-2"><Textarea label={isArabic ? 'نبذة عن الشركة' : 'About the Company'} value={form.about} onChange={(e) => setField('about', e.target.value)} rows={4} /></div></section></>}
          {beneficiaryType === 'individual' && step === 1 && <section className="grid grid-cols-1 gap-4 md:grid-cols-2"><Input label={isArabic ? 'الاسم الكامل *' : 'Full Name *'} value={form.fullName} onChange={(e) => setField('fullName', e.target.value)} required /><Input label={isArabic ? 'تاريخ الميلاد *' : 'Date of Birth *'} type="date" value={form.dateOfBirth} onChange={(e) => setField('dateOfBirth', e.target.value)} required /><label className="text-sm font-medium text-text-main">{isArabic ? 'الجنسية *' : 'Nationality *'}<select className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2" value={form.nationality} onChange={(e) => setField('nationality', e.target.value)}>{COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></label><Input label={individualIdLabel} value={form.nationalIdOrIqama} onChange={(e) => setField('nationalIdOrIqama', e.target.value)} required dir="ltr" maxLength={10} /><Input label={isArabic ? 'البريد الإلكتروني *' : 'Email *'} type="email" value={form.contactEmail} onChange={(e) => setField('contactEmail', e.target.value)} required dir="ltr" /><div className="md:col-span-2"><PhoneInputWithCountryCode label={isArabic ? 'الجوال *' : 'Mobile *'} codeLabel={isArabic ? 'مفتاح الدولة' : 'Country code'} numberLabel={isArabic ? 'رقم الجوال' : 'Mobile number'} countryCode={form.individualMobileCountryCode} onCountryCodeChange={(value) => setField('individualMobileCountryCode', value)} number={form.individualMobile} onNumberChange={(value) => setField('individualMobile', value)} required isArabic={isArabic} /></div><Input label={isArabic ? 'المدينة *' : 'City *'} value={form.individualCity} onChange={(e) => setField('individualCity', e.target.value)} required /><Input label={isArabic ? 'كلمة المرور *' : 'Password *'} type="password" value={form.password} onChange={(e) => setField('password', e.target.value)} required minLength={8} dir="ltr" /><Input label={isArabic ? 'تأكيد كلمة المرور *' : 'Confirm Password *'} type="password" value={form.confirmPassword} onChange={(e) => setField('confirmPassword', e.target.value)} required minLength={8} dir="ltr" /></section>}
          {((beneficiaryType === 'company' && step === 3) || (beneficiaryType === 'individual' && step === 2)) && <><section className="grid grid-cols-1 gap-4 md:grid-cols-2">{beneficiaryType === 'company' ? <><div className="space-y-2"><label className="block text-sm font-medium text-text-main">{isArabic ? 'شعار الشركة (PNG/JPEG)' : 'Company Logo (PNG/JPEG)'}</label><input type="file" accept="image/png,image/jpeg" onChange={(e) => setCompanyLogoFile(e.target.files?.[0] ?? null)} className={fileInputClass} />{companyLogoPreview && <img src={companyLogoPreview} alt="" className="h-16 w-16 rounded-md border border-border bg-background object-cover" />}</div><div className="space-y-2"><label className="block text-sm font-medium text-text-main">{isArabic ? 'السجل التجاري * (PDF/JPEG/PNG)' : 'CR Document * (PDF/JPEG/PNG)'}</label><input type="file" accept="application/pdf,image/png,image/jpeg" onChange={(e) => setCrDocument(e.target.files?.[0] ?? null)} className={fileInputClass} /></div><div className="space-y-2"><label className="block text-sm font-medium text-text-main">{isArabic ? 'الرخصة * (PDF/JPEG/PNG)' : 'License Document * (PDF/JPEG/PNG)'}</label><input type="file" accept="application/pdf,image/png,image/jpeg" onChange={(e) => setLicenseDocument(e.target.files?.[0] ?? null)} className={fileInputClass} /></div><div className="space-y-2"><label className="block text-sm font-medium text-text-main">{isArabic ? 'مستند العنوان الوطني * (PDF/JPEG/PNG)' : 'National Address Document * (PDF/JPEG/PNG)'}</label><input type="file" accept="application/pdf,image/png,image/jpeg" onChange={(e) => setNationalAddressDocument(e.target.files?.[0] ?? null)} className={fileInputClass} /></div><div className="space-y-2"><label className="block text-sm font-medium text-text-main">{isArabic ? 'رخصة إنتاج المحتوى الإعلامي المرئي والمسموع (اختياري)' : 'Audio-Visual Media Content Production License (Optional)'}</label><input type="file" accept="application/pdf,image/png,image/jpeg" onChange={(e) => setMediaContentLicenseDocument(e.target.files?.[0] ?? null)} className={fileInputClass} /></div></> : <><div className="space-y-2"><label className="block text-sm font-medium text-text-main">{isArabic ? 'السيرة الذاتية (PDF) *' : 'CV (PDF) *'}</label><input type="file" accept="application/pdf" onChange={(e) => setCvFile(e.target.files?.[0] ?? null)} className={fileInputClass} /></div><div className="space-y-2"><label className="block text-sm font-medium text-text-main">{isArabic ? 'مستند الهوية/الإقامة *' : 'National ID / Iqama *'}</label><input type="file" accept="application/pdf,image/png,image/jpeg" onChange={(e) => setIdDocumentFile(e.target.files?.[0] ?? null)} className={fileInputClass} /></div></>}</section><section className="rounded-xl border border-border bg-background/60 p-4"><p className="text-sm font-semibold text-text-main">{isArabic ? 'الشروط والأحكام' : 'Terms and Conditions'}</p><p className="mt-2 whitespace-pre-wrap text-sm text-text-muted">{isArabic ? terms?.ar : terms?.en}</p><label className="mt-4 flex items-start gap-2 text-sm text-text-main"><input type="checkbox" checked={form.acceptedTerms} onChange={(e) => setField('acceptedTerms', e.target.checked)} /><span>{isArabic ? 'أفهم وأوافق على الالتزام بالشروط والأحكام' : 'I understand and agree to comply with the terms and conditions'}</span></label></section><section className="rounded-xl border border-border bg-background/60 p-4"><p className="text-sm font-semibold text-text-main">{isArabic ? 'الضوابط العامة للأعمال الدرامية والوثائقية' : 'General Regulations for Dramatic and Documentary Works'}</p><p className="mt-2 whitespace-pre-wrap text-sm text-text-muted">{isArabic ? regulations?.ar : regulations?.en}</p><label className="mt-4 flex items-start gap-2 text-sm text-text-main"><input type="checkbox" checked={form.acceptedRegulations} onChange={(e) => setField('acceptedRegulations', e.target.checked)} /><span>{isArabic ? 'أفهم وسألتزم بالضوابط العامة للأعمال الدرامية والوثائقية' : 'I understand and will comply with the general regulations for dramatic and documentary works'}</span></label></section></>}
          {error && <div className="rounded-md border border-error/20 bg-error/10 p-3 text-sm text-error">{error}</div>}
          <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4"><Button type="button" variant="outline" onClick={() => { setBeneficiaryType(null); setStep(1); }}>{isArabic ? 'تغيير النوع' : 'Change Type'}</Button>{step > 1 && <Button type="button" variant="outline" onClick={prevStep}>{isArabic ? 'السابق' : 'Previous'}</Button>}{step < maxSteps ? <Button type="button" onClick={nextStep}>{isArabic ? 'التالي' : 'Next'}</Button> : <Button type="submit" isLoading={isSaving} disabled={!isSubmitEnabled}>{isArabic ? 'إرسال طلب الانضمام' : 'Submit Join Request'}</Button>}<Link to="/client/login"><Button type="button" variant="outline">{isArabic ? 'لديك حساب؟ تسجيل الدخول' : 'Already have an account? Login'}</Button></Link></div>
        </form>
      </div>
    </div>
  );
}
