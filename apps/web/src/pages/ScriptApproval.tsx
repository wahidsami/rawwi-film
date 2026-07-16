import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, FileText, Globe, Info, Mail, Phone, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useLangStore } from '@/store/langStore';

export function ScriptApproval() {
  const { lang, toggleLang } = useLangStore();
  const isArabic = lang === 'ar';

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <main id="main-content" className="min-h-screen bg-gov-surface pt-24 pb-20 text-text-main">
      <div className="mx-auto max-w-[1280px] px-6 md:px-8">
        <div className="mb-8 flex items-center justify-between gap-4">
          <Link to="/" className="inline-flex items-center gap-3">
            <img src="/colorlogo.png" alt="Film Commission" className="h-12 w-auto object-contain" />
            <span className="text-sm font-semibold tracking-wide text-text-muted">{isArabic ? 'هيئة الأفلام' : 'Film Commission'}</span>
          </Link>

          <button
            onClick={toggleLang}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-text-muted transition hover:text-text-main"
          >
            <Globe className="h-4 w-4" />
            <span>{isArabic ? 'English' : 'العربية'}</span>
          </button>
        </div>

        <div className="overflow-hidden rounded-3xl border border-border bg-surface shadow-xl">
          <div className="grid gap-0 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="p-6 md:p-10">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2 text-sm font-semibold text-primary">
                <FileText className="h-4 w-4" />
                <span>{isArabic ? 'خدمة اعتماد النص' : 'Script approval service'}</span>
              </div>

              <h1 className="text-3xl font-bold tracking-tight text-text-main md:text-5xl">
                {isArabic ? 'اعتماد النص السينمائي' : 'Film script approval'}
              </h1>
              <p className="mt-4 max-w-3xl text-base leading-8 text-text-muted md:text-lg">
                {isArabic
                  ? 'قدّم النص، راجعه، ثم أكمل خطوات الاعتماد في مسار واضح ومباشر.'
                  : 'Submit your script, review the results, and complete the approval flow in a clear path.'}
              </p>

              <div className="mt-8 grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-border bg-background p-5">
                  <h2 className="mb-3 text-lg font-semibold text-text-main">
                    {isArabic ? 'الخطوات' : 'Workflow'}
                  </h2>
                  <ol className="space-y-3 text-sm text-text-muted">
                    <li>1. {isArabic ? 'رفع النص' : 'Upload the script'}</li>
                    <li>2. {isArabic ? 'بدء المراجعة' : 'Start the review'}</li>
                    <li>3. {isArabic ? 'استعراض النتيجة' : 'Review the result'}</li>
                    <li>4. {isArabic ? 'متابعة الاعتماد' : 'Continue to approval'}</li>
                  </ol>
                </div>

                <div className="rounded-2xl border border-border bg-background p-5">
                  <h2 className="mb-3 text-lg font-semibold text-text-main">
                    {isArabic ? 'المتطلبات' : 'Requirements'}
                  </h2>
                  <ul className="space-y-3 text-sm text-text-muted">
                    <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 text-success" /> {isArabic ? 'حساب مستفيد فعال' : 'An active beneficiary account'}</li>
                    <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 text-success" /> {isArabic ? 'ملف نص جاهز' : 'A ready script file'}</li>
                    <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 text-success" /> {isArabic ? 'بيانات الشركة' : 'Company information'}</li>
                    <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 text-success" /> {isArabic ? 'معلومات التواصل' : 'Contact details'}</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="border-t border-border bg-muted/30 p-6 md:p-10 lg:border-t-0 lg:border-s">
              <div className="overflow-hidden rounded-2xl border border-border bg-background shadow-sm">
                <img src="/cover.jpg" alt={isArabic ? 'اعتماد النص' : 'Script approval'} className="h-64 w-full object-cover" />
              </div>

              <div className="mt-6 space-y-4">
                <div className="rounded-2xl border border-border bg-background p-5">
                  <h2 className="text-lg font-semibold text-text-main">
                    {isArabic ? 'النتائج المتوقعة' : 'Expected results'}
                  </h2>
                  <div className="mt-4 space-y-3 text-sm text-text-muted">
                    <div className="flex items-start gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 text-primary" /> {isArabic ? 'مسار اعتماد واضح' : 'A clear approval path'}</div>
                    <div className="flex items-start gap-2"><Info className="mt-0.5 h-4 w-4 text-secondary" /> {isArabic ? 'تتبّع الملاحظات' : 'Track findings and comments'}</div>
                    <div className="flex items-start gap-2"><Info className="mt-0.5 h-4 w-4 text-warning" /> {isArabic ? 'الانتقال إلى المراجعة' : 'Move into review'}</div>
                  </div>
                </div>

                <div className="rounded-2xl border border-border bg-background p-5">
                  <h2 className="text-lg font-semibold text-text-main">
                    {isArabic ? 'الدعم' : 'Support'}
                  </h2>
                  <div className="mt-4 space-y-3 text-sm text-text-muted">
                    <div className="flex items-center gap-3">
                      <Mail className="h-4 w-4" />
                      <span dir="ltr">cinamaa@moc.gov.sa</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Phone className="h-4 w-4" />
                      <span dir="ltr">+966 11 000 0000</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  <Link to="/client/login">
                    <Button className="w-full gap-2">
                      <span>{isArabic ? 'ابدأ الخدمة' : 'Start Service'}</span>
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </Link>
                  <Link to="/" className="text-center text-sm font-medium text-primary hover:text-primary-hover">
                    {isArabic ? 'العودة إلى الصفحة الرئيسية' : 'Back to landing page'}
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
