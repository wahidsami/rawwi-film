import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { useAuthStore } from '@/store/authStore';
import { useLangStore } from '@/store/langStore';

export function ClientLanding() {
  const navigate = useNavigate();
  const { isAuthenticated, isClient } = useAuthStore();
  const { lang, toggleLang } = useLangStore();

  useEffect(() => {
    if (!isAuthenticated) return;
    navigate(isClient() ? '/client' : '/app', { replace: true });
  }, [isAuthenticated, isClient, navigate]);

  return (
    <div className="min-h-screen bg-background text-text-main">
      <header className="w-full border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/fclogo.png" alt="FC" className="h-8 w-auto" />
            <span className="text-sm text-text-muted">{lang === 'ar' ? 'بوابة شركات الإنتاج' : 'Production Companies Portal'}</span>
          </div>
          <button
            onClick={toggleLang}
            className="text-sm text-text-muted hover:text-text-main border border-border rounded-md px-3 py-1.5"
          >
            {lang === 'ar' ? 'English' : 'عربي'}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-16">
        <section className="rounded-2xl border border-border bg-surface p-8 md:p-12 shadow-sm">
          <div className="max-w-3xl space-y-6">
            <h1 className="text-3xl md:text-4xl font-bold leading-tight">
              {lang === 'ar'
                ? 'ارفع النصوص السينمائية لشركتك وتابع نتيجة المراجعة في مكان واحد'
                : 'Upload your company scripts and track review decisions in one place'}
            </h1>
            <p className="text-text-muted text-base md:text-lg leading-relaxed">
              {lang === 'ar'
                ? 'التسجيل مجاني بالكامل. بعد إنشاء الحساب يمكنك رفع النصوص، متابعة حالة التحليل، واستلام تقرير الرفض مع الملاحظات عند الحاجة.'
                : 'Registration is completely free. After signup, you can submit scripts, track analysis status, and receive rejection reports with findings when needed.'}
            </p>
            <div className="flex flex-wrap gap-3">
              <Link to="/portal/register">
                <Button>{lang === 'ar' ? 'تسجيل مجاني' : 'Free Registration'}</Button>
              </Link>
              <Link to="/login">
                <Button variant="outline">{lang === 'ar' ? 'تسجيل الدخول' : 'Login'}</Button>
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
