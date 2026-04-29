import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { useLangStore } from '@/store/langStore';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import toast from 'react-hot-toast';
import { Globe } from 'lucide-react';

export function ClientForgotPassword() {
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
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : (lang === 'ar' ? 'فشل إرسال الرابط' : 'Failed to send reset link'));
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-md bg-surface p-8 rounded-2xl shadow-xl border border-border text-center space-y-6">
          <h1 className="text-2xl font-bold text-text-main">{lang === 'ar' ? 'تحقق من بريدك الإلكتروني' : 'Check your email'}</h1>
          <p className="text-text-muted">{email}</p>
          <Link to="/client/login" className="text-sm text-primary hover:underline block mt-4">
            {lang === 'ar' ? 'العودة لتسجيل دخول العملاء' : 'Back to Client Login'}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background text-text-main">
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md bg-surface p-8 rounded-2xl shadow-xl border border-border relative">
          <button onClick={toggleLang} className="absolute top-4 right-4 flex items-center gap-1.5 text-xs font-medium text-text-muted hover:text-text-main transition-colors px-2.5 py-1.5 rounded-md hover:bg-background border border-border">
            <Globe className="w-3.5 h-3.5" />
            <span>{lang === 'ar' ? 'English' : 'عربي'}</span>
          </button>
          <div className="space-y-1 mb-6 text-center">
            <h1 className="text-2xl font-bold text-text-main">{t('forgotPassword')}</h1>
          </div>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <Input label={t('email')} type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
            <Button className="w-full" type="submit" disabled={submitting}>
              {submitting ? (lang === 'ar' ? 'جاري الإرسال…' : 'Sending...') : (lang === 'ar' ? 'إرسال رابط الاستعادة' : 'Send Reset Link')}
            </Button>
          </form>
          <div className="mt-6 text-center space-y-2">
            <Link to="/client/login" className="text-sm text-primary hover:underline block">
              {lang === 'ar' ? 'العودة لتسجيل دخول العملاء' : 'Back to Client Login'}
            </Link>
            <Link to="/portal" className="text-sm text-text-muted hover:text-text-main block">
              {lang === 'ar' ? 'العودة للرئيسية' : 'Back to main'}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
