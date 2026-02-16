import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { useLangStore } from '@/store/langStore';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import toast from 'react-hot-toast';
import { Globe } from 'lucide-react';

export function ForgotPassword() {
  const { t, lang, toggleLang } = useLangStore();
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) throw error;

      setSent(true);
      toast.success(lang === 'ar' ? 'تم إرسال رابط استعادة كلمة المرور' : 'Reset link sent to your email');
    } catch (err: any) {
      toast.error(err?.message ?? (lang === 'ar' ? 'فشل إرسال الرابط' : 'Failed to send reset link'));
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-md bg-surface p-8 rounded-2xl shadow-xl border border-border text-center space-y-6">
          <div className="w-16 h-16 mx-auto bg-success/10 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-text-main">
            {lang === 'ar' ? 'تحقق من بريدك الإلكتروني' : 'Check your email'}
          </h1>
          <p className="text-text-muted">
            {lang === 'ar' ? 'تم إرسال رابط استعادة كلمة المرور إلى' : 'A password reset link has been sent to'}
          </p>
          <p className="font-medium text-text-main">{email}</p>
          <p className="text-sm text-text-muted">
            {lang === 'ar'
              ? 'يرجى التحقق من بريدك الوارد والنقر على الرابط لإعادة تعيين كلمة المرور.'
              : 'Please check your inbox and click the link to reset your password.'}
          </p>
          <Link to="/login" className="text-sm text-primary hover:underline block mt-4">
            {lang === 'ar' ? 'العودة لتسجيل الدخول' : 'Back to Login'}
          </Link>
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

          <div className="space-y-1 mb-6 text-center">
            <h1 className="text-2xl font-bold text-text-main">{t('forgotPassword')}</h1>
            <p className="text-text-muted text-sm">
              {lang === 'ar'
                ? 'أدخل بريدك الإلكتروني لإرسال رابط استعادة كلمة المرور.'
                : 'Enter your email to receive a password reset link.'}
            </p>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <Input
              label={t('email')}
              type="email"
              placeholder="user@raawi.film"
              dir="ltr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
            <Button className="w-full" type="submit" disabled={submitting}>
              {submitting
                ? (lang === 'ar' ? 'جاري الإرسال…' : 'Sending...')
                : (lang === 'ar' ? 'إرسال رابط الاستعادة' : 'Send Reset Link')}
            </Button>
          </form>

          <p className="mt-6 text-center">
            <Link to="/login" className="text-sm text-primary hover:underline">
              {lang === 'ar' ? 'العودة لتسجيل الدخول' : 'Back to Login'}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
