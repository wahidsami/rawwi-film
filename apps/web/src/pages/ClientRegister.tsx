import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { clientPortalApi } from '@/api';
import { useAuthStore } from '@/store/authStore';
import { useLangStore } from '@/store/langStore';

export function ClientRegister() {
  const navigate = useNavigate();
  const { login } = useAuthStore();
  const { lang } = useLangStore();

  const [form, setForm] = useState({
    name: '',
    companyNameAr: '',
    companyNameEn: '',
    representativeTitle: '',
    mobile: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const setField = (key: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (form.password !== form.confirmPassword) {
      setError(lang === 'ar' ? 'كلمتا المرور غير متطابقتين' : 'Passwords do not match');
      return;
    }

    setIsSaving(true);
    try {
      await clientPortalApi.register({
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
        companyNameAr: form.companyNameAr.trim(),
        companyNameEn: form.companyNameEn.trim(),
        representativeName: form.name.trim(),
        representativeTitle: form.representativeTitle.trim() || undefined,
        mobile: form.mobile.trim() || undefined,
      });
      await login(form.email.trim().toLowerCase(), form.password);
      navigate('/client', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : (lang === 'ar' ? 'فشل التسجيل' : 'Registration failed'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-text-main flex items-center justify-center p-6">
      <div className="w-full max-w-2xl border border-border bg-surface rounded-2xl p-6 md:p-8 shadow-sm">
        <div className="space-y-2 mb-6">
          <h1 className="text-2xl font-bold">{lang === 'ar' ? 'إنشاء حساب شركة إنتاج' : 'Create Production Company Account'}</h1>
          <p className="text-text-muted text-sm">
            {lang === 'ar' ? 'التسجيل مجاني 100% بدون أي رسوم اشتراك.' : 'Registration is 100% free with no subscription fees.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label={lang === 'ar' ? 'اسم المسؤول' : 'Contact Name'}
            value={form.name}
            onChange={(e) => setField('name', e.target.value)}
            required
          />
          <Input
            label={lang === 'ar' ? 'المسمى الوظيفي' : 'Title'}
            value={form.representativeTitle}
            onChange={(e) => setField('representativeTitle', e.target.value)}
          />
          <Input
            label={lang === 'ar' ? 'اسم الشركة (عربي)' : 'Company Name (Arabic)'}
            value={form.companyNameAr}
            onChange={(e) => setField('companyNameAr', e.target.value)}
            required
          />
          <Input
            label={lang === 'ar' ? 'Company Name (English)' : 'Company Name (English)'}
            value={form.companyNameEn}
            onChange={(e) => setField('companyNameEn', e.target.value)}
            required
            dir="ltr"
          />
          <Input
            label={lang === 'ar' ? 'البريد الإلكتروني' : 'Email'}
            type="email"
            value={form.email}
            onChange={(e) => setField('email', e.target.value)}
            required
            dir="ltr"
          />
          <Input
            label={lang === 'ar' ? 'رقم الجوال' : 'Mobile'}
            value={form.mobile}
            onChange={(e) => setField('mobile', e.target.value)}
            dir="ltr"
          />
          <Input
            label={lang === 'ar' ? 'كلمة المرور' : 'Password'}
            type="password"
            value={form.password}
            onChange={(e) => setField('password', e.target.value)}
            required
            minLength={8}
            dir="ltr"
          />
          <Input
            label={lang === 'ar' ? 'تأكيد كلمة المرور' : 'Confirm Password'}
            type="password"
            value={form.confirmPassword}
            onChange={(e) => setField('confirmPassword', e.target.value)}
            required
            minLength={8}
            dir="ltr"
          />

          {error && (
            <div className="md:col-span-2 rounded-md border border-error/20 bg-error/10 text-error text-sm p-3">
              {error}
            </div>
          )}

          <div className="md:col-span-2 flex flex-wrap items-center gap-3 pt-2">
            <Button type="submit" isLoading={isSaving}>
              {lang === 'ar' ? 'تسجيل مجاني' : 'Register for Free'}
            </Button>
            <Link to="/login">
              <Button type="button" variant="outline">
                {lang === 'ar' ? 'لديك حساب؟ تسجيل الدخول' : 'Already have an account? Login'}
              </Button>
            </Link>
            <Link to="/portal" className="text-sm text-text-muted hover:text-text-main">
              {lang === 'ar' ? 'العودة للصفحة الرئيسية' : 'Back to landing'}
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
