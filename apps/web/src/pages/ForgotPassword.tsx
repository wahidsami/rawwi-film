import { Link } from 'react-router-dom';
import { useLangStore } from '@/store/langStore';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

export function ForgotPassword() {
  const { t, lang } = useLangStore();

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md bg-surface p-8 rounded-2xl shadow-xl border border-border text-center space-y-6">
        <h1 className="text-2xl font-bold text-text-main">{t('forgotPassword')}</h1>
        <p className="text-text-muted">
          {lang === 'ar' ? 'أدخل بريدك الإلكتروني لإرسال رابط استعادة كلمة المرور.' : 'Enter your email to receive a password reset link.'}
        </p>
        <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
          <Input type="email" placeholder="user@raawi.film" dir="ltr" />
          <Button className="w-full">{t('save')}</Button>
        </form>
        <Link to="/login" className="text-sm text-primary hover:underline block">
          {lang === 'ar' ? 'العودة لتسجيل الدخول' : 'Back to Login'}
        </Link>
      </div>
    </div>
  );
}
