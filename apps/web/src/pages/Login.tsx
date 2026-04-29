import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { useLangStore } from '@/store/langStore';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Globe } from 'lucide-react';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const { login } = useAuthStore();
  const { t, lang, toggleLang } = useLangStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      await login(email, password);
      const target = useAuthStore.getState().isClient() ? '/client' : '/app';
      navigate(target, { replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Login failed';
      const isInvalidCreds = /400|invalid|credentials|password/i.test(msg);
      setError(isInvalidCreds
        ? (lang === 'ar' ? 'بريد أو كلمة مرور غير صحيحة.' : 'Invalid email or password.')
        : msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background text-text-main">
      {/* Main content */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-4xl flex rounded-2xl shadow-xl overflow-hidden border border-border bg-surface">

          {/* Left side — Form */}
          <div className="flex-1 p-8 sm:p-10 relative">
            {/* Language toggle */}
            <button
              onClick={toggleLang}
              className="absolute top-4 right-4 flex items-center gap-1.5 text-xs font-medium text-text-muted hover:text-text-main transition-colors px-2.5 py-1.5 rounded-md hover:bg-background border border-border"
            >
              <Globe className="w-3.5 h-3.5" />
              <span>{lang === 'ar' ? 'English' : 'عربي'}</span>
            </button>

            <div className="max-w-sm mx-auto mt-6 space-y-6">
              {/* FC Logo */}
              <div className="flex justify-center">
                <img src="/fclogo.png" alt="FC" className="h-12 object-contain" />
              </div>

              {/* Header */}
              <div className="space-y-1 text-center">
                <h2 className="text-2xl font-bold tracking-tight">{t('login')}</h2>
                <p className="text-text-muted text-sm">
                  {lang === 'ar' ? 'أدخل بيانات الاعتماد الخاصة بك' : 'Enter your credentials to continue'}
                </p>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                  label={t('email')}
                  type="email"
                  placeholder="user@raawi.film"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  dir="ltr"
                  autoComplete="email"
                />
                <Input
                  label={t('password')}
                  type="password"
                  placeholder="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  dir="ltr"
                  autoComplete="current-password"
                />

                {error && (
                  <div className="p-2.5 text-xs text-error bg-error/10 border border-error/20 rounded-md">
                    {error}
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full"
                  isLoading={isLoading}
                >
                  {t('login')}
                </Button>

                <div className="text-center pt-1">
                  <Link to="/" className="text-sm text-text-muted hover:text-text-main">
                    {lang === 'ar' ? 'العودة للرئيسية' : 'Back to main'}
                  </Link>
                </div>
              </form>
            </div>
          </div>

          {/* Right side — Brand */}
          <div className="hidden md:flex w-[45%] bg-primary items-center justify-center p-8 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-primary to-primary-hover" />
            <div className="absolute -right-16 -top-16 w-64 h-64 rounded-full bg-white/8 blur-2xl" />
            <div className="absolute -left-10 -bottom-10 w-48 h-48 rounded-full bg-white/5 blur-2xl" />
            <div className="relative z-10 text-white text-center space-y-5">
              <img src="/loginlogo.png" alt="Raawi Film" className="h-24 mx-auto drop-shadow-xl" />
              <h1 className="text-3xl font-bold tracking-tight">{lang === 'ar' ? 'راوي فيلم' : 'Raawi Film'}</h1>
              <p className="text-white/70 text-sm leading-relaxed max-w-xs mx-auto">
                {lang === 'ar'
                  ? 'منصة التحليل الرقمي للنصوص السنمائية'
                  : 'automated film script analysis platform'}
              </p>
            </div>
          </div>

        </div>
      </div>

      {/* Footer */}
      <footer className="py-5 flex justify-center">
        <img src="/footer.png" alt="Powered by" className="h-32 object-contain opacity-80" />
      </footer>
    </div>
  );
}
