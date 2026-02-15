import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useLangStore } from '@/store/langStore';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { invitesApi } from '@/api';
import toast from 'react-hot-toast';
import { Globe } from 'lucide-react';

export function SetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const navigate = useNavigate();
  const { lang, toggleLang } = useLangStore();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token.trim()) {
      toast.error(lang === 'ar' ? 'رابط الدعوة غير صالح' : 'Invalid invite link');
    }
  }, [token, lang]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) {
      toast.error(lang === 'ar' ? 'رابط الدعوة غير صالح' : 'Invalid invite link');
      return;
    }
    if (password.length < 8) {
      toast.error(lang === 'ar' ? 'كلمة المرور 8 أحرف على الأقل' : 'Password must be at least 8 characters');
      return;
    }
    if (password !== confirmPassword) {
      toast.error(lang === 'ar' ? 'كلمتا المرور غير متطابقتين' : 'Passwords do not match');
      return;
    }
    setSubmitting(true);
    try {
      await invitesApi.consumeInvite({
        token: token.trim(),
        password,
        name: name.trim() || undefined,
      });
      setSuccess(true);
      toast.success(lang === 'ar' ? 'تم تعيين كلمة المرور بنجاح' : 'Password set successfully');
      setTimeout(() => navigate('/login', { replace: true }), 1500);
    } catch (err: any) {
      toast.error(err?.message ?? (lang === 'ar' ? 'فشل تعيين كلمة المرور' : 'Failed to set password'));
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-md bg-surface p-8 rounded-2xl shadow-xl border border-border text-center space-y-6">
          <p className="text-lg font-medium text-text-main">
            {lang === 'ar' ? 'تم تعيين كلمة المرور بنجاح' : 'Password set successfully'}
          </p>
          <p className="text-sm text-text-muted">
            {lang === 'ar' ? 'جاري تحويلك إلى صفحة تسجيل الدخول…' : 'Redirecting you to login…'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background text-text-main">
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md bg-surface p-8 rounded-2xl shadow-xl border border-border relative">
          <button
            onClick={toggleLang}
            className="absolute top-4 right-4 flex items-center gap-1.5 text-xs font-medium text-text-muted hover:text-text-main transition-colors px-2.5 py-1.5 rounded-md hover:bg-background border border-border"
          >
            <Globe className="w-3.5 h-3.5" />
            <span>{lang === 'ar' ? 'English' : 'عربي'}</span>
          </button>

          <div className="space-y-1 mb-6">
            <h1 className="text-2xl font-bold text-text-main">
              {lang === 'ar' ? 'تعيين كلمة المرور' : 'Set your password'}
            </h1>
            <p className="text-sm text-text-muted">
              {lang === 'ar' ? 'أدخل كلمة مرور جديدة واختيارياً اسمك للعرض.' : 'Enter a new password and optionally your display name.'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label={lang === 'ar' ? 'كلمة المرور' : 'Password'}
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
              dir="ltr"
            />
            <Input
              label={lang === 'ar' ? 'تأكيد كلمة المرور' : 'Confirm password'}
              type="password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              minLength={8}
              required
              dir="ltr"
            />
            <Input
              label={lang === 'ar' ? 'الاسم (اختياري)' : 'Name (optional)'}
              placeholder={lang === 'ar' ? 'اسمك للعرض' : 'Your display name'}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Button type="submit" className="w-full" disabled={submitting || !token.trim()}>
              {submitting ? (lang === 'ar' ? 'جاري الحفظ…' : 'Setting password…') : (lang === 'ar' ? 'تعيين كلمة المرور' : 'Set password')}
            </Button>
          </form>

          <p className="mt-6 text-center">
            <Link to="/login" className="text-sm text-primary hover:underline">
              {lang === 'ar' ? 'العودة لتسجيل الدخول' : 'Back to login'}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
