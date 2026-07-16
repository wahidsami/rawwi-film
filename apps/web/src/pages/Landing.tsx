import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Globe,
  LogIn,
  MapPin,
  Menu,
  Shield,
  UserPlus,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAuthStore } from '@/store/authStore';
import { useLangStore } from '@/store/langStore';

const heroSlides = [
  {
    titleAr: 'انضم إلى منصة هيئة الأفلام الآن',
    titleEn: 'Join the Film Commission platform now',
    subtitleAr: 'هيئة الأفلام تساعدك في إيصال نصوصك السينمائية بسرعة أكبر للمراجعة والاعتماد.',
    subtitleEn: 'The Film Commission helps you get your film scripts reviewed and approved faster.',
    image: '/slide01.jpg',
  },
  {
    titleAr: 'هيئة الأفلام ستساعدك!',
    titleEn: 'The Film Commission will help!',
    subtitleAr: 'منصة واضحة لتنظيم النصوص، عرض الملاحظات، وتسهيل الوصول إلى أفضل نسخة.',
    subtitleEn: 'A clear platform to organize scripts, show findings, and reach the best version.',
    image: '/slide02.jpg',
  },
  {
    titleAr: 'شهادة النص... بسرعة',
    titleEn: 'Script certificate... so fast',
    subtitleAr: 'هيئة الأفلام تصدر شهادة اعتماد النص الخاصة بك بسرعة وبمسار واضح.',
    subtitleEn: 'The Film Commission issues your script approval certificate with a fast, clear flow.',
    image: '/slide03.jpg',
  },
];

const services = [
  {
    titleAr: 'اعتماد النص السينمائي',
    titleEn: 'Script approval',
    bodyAr: 'قدّم النص ثم تابع مراحل الاعتماد في مكان واحد.',
    bodyEn: 'Submit your script and follow the approval stages in one place.',
  },
  {
    titleAr: 'مراجعة ميسرة',
    titleEn: 'Simplified review',
    bodyAr: 'واجهة مرتبة تساعد على رؤية النتائج والملاحظات بسرعة.',
    bodyEn: 'A clean interface for quickly reviewing findings and comments.',
  },
  {
    titleAr: 'إصدار الشهادة',
    titleEn: 'Certificate issuance',
    bodyAr: 'احصل على شهادة الاعتماد بعد الموافقة بشكل مباشر.',
    bodyEn: 'Receive your approval certificate immediately after approval.',
  },
];

const locations = [
  {
    nameAr: 'العلا التاريخية',
    nameEn: 'Historic AlUla',
    cityAr: 'المدينة المنورة',
    cityEn: 'Madinah',
    image: '/raawi-dashboard-new.png',
  },
  {
    nameAr: 'جدة التاريخية',
    nameEn: 'Historic Jeddah',
    cityAr: 'جدة',
    cityEn: 'Jeddah',
    image: '/bannerguide.jpg',
  },
  {
    nameAr: 'الرياض الحديثة',
    nameEn: 'Modern Riyadh',
    cityAr: 'الرياض',
    cityEn: 'Riyadh',
    image: '/cover.jpg',
  },
];

const news = [
  {
    dateAr: '١٥ أبريل ٢٠٢٦',
    dateEn: '15 Apr 2026',
    titleAr: 'مسار أوضح لمراجعة النصوص',
    titleEn: 'A clearer script review journey',
    bodyAr: 'تحسينات جديدة في تجربة الرفع والتحليل والمراجعة لرفع وضوح النتائج.',
    bodyEn: 'New workflow improvements across upload, analysis, and review to make results clearer.',
  },
  {
    dateAr: '١٢ أبريل ٢٠٢٦',
    dateEn: '12 Apr 2026',
    titleAr: 'تعزيز بوابة المستفيدين',
    titleEn: 'Enhancing the beneficiary portal',
    bodyAr: 'تجربة أبسط لتسجيل الدخول ورفع النصوص ومتابعة التقارير.',
    bodyEn: 'A simpler experience for login, script submission, and report tracking.',
  },
  {
    dateAr: '٨ أبريل ٢٠٢٦',
    dateEn: '8 Apr 2026',
    titleAr: 'تحسينات على دقة المخرجات',
    titleEn: 'Output quality improvements',
    bodyAr: 'تركيز أكبر على ربط الملاحظة بالنص وتقليل الضوضاء في النتائج.',
    bodyEn: 'Stronger evidence grounding and lower noise in findings.',
  },
];

export function Landing() {
  const navigate = useNavigate();
  const { lang, toggleLang } = useLangStore();
  const { isAuthenticated, isClient } = useAuthStore();
  const isArabic = lang === 'ar';

  const [heroIndex, setHeroIndex] = useState(0);
  const [locationIndex, setLocationIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setHeroIndex((prev) => (prev + 1) % heroSlides.length);
    }, 6000);
    return () => window.clearInterval(timer);
  }, []);

  const hero = heroSlides[heroIndex];
  const dashboardHref = isClient() ? '/client' : '/app';

  return (
    <div className="min-h-screen bg-black text-white" dir={isArabic ? 'rtl' : 'ltr'}>
      <header className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-[#141414]/95 backdrop-blur-sm">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-4 lg:px-10">
          <Link to="/" className="flex items-center gap-3">
            <img src="/colorlogo.png" alt="Film Commission" className="h-14 w-auto object-contain" />
          </Link>

          <nav className="hidden items-center gap-8 xl:flex">
            <a href="#hero" className="text-white transition hover:text-white/85">{isArabic ? 'الرئيسية' : 'Home'}</a>
            <a href="#services" className="text-white transition hover:text-white/85">{isArabic ? 'الخدمات' : 'Services'}</a>
            <a href="#locations" className="text-white transition hover:text-white/85">{isArabic ? 'مواقع التصوير' : 'Locations'}</a>
            <a href="#news" className="text-white transition hover:text-white/85">{isArabic ? 'الأخبار' : 'News'}</a>
          </nav>

          <div className="flex items-center gap-3">
            {isAuthenticated ? (
              <button
                onClick={() => navigate(dashboardHref)}
                className="inline-flex items-center gap-2 rounded-xl border border-yellow-500/30 px-3 py-2 text-xs text-yellow-400 transition hover:border-yellow-400/40 hover:text-yellow-300"
              >
                <Shield className="h-4 w-4" />
                <span>{isArabic ? 'الدخول للنظام' : 'Open app'}</span>
              </button>
            ) : (
              <Link
                to="/client/login"
                className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/20"
                aria-label={isArabic ? 'دخول المستفيدين' : 'Beneficiary login'}
              >
                <LogIn className="h-4 w-4" />
                <span>{isArabic ? 'دخول المستفيدين' : 'Beneficiary Login'}</span>
              </Link>
            )}
            <button onClick={toggleLang} className="inline-flex items-center gap-1.5 text-sm text-white/85 transition hover:text-white">
              <Globe className="h-4 w-4" />
              <span>{isArabic ? 'EN' : 'عربي'}</span>
            </button>
            <button className="xl:hidden" aria-label="Menu">
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      <main>
        <section id="hero" className="relative min-h-screen overflow-hidden pt-20">
          <div className="absolute inset-0">
            <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${hero.image})` }} />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/70 to-black/40" />
            <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-transparent to-black/60" />
            <div className="absolute inset-0 bg-red-950/20" />
          </div>

          <div className="relative z-10 flex min-h-screen items-center justify-center px-4 text-center">
            <div className="mx-auto max-w-5xl">
              <h1 className="mb-8 text-5xl font-bold leading-tight text-white md:text-6xl lg:text-7xl">
                {isArabic ? hero.titleAr : hero.titleEn}
              </h1>
              <p className="mx-auto mb-10 max-w-3xl text-xl text-gray-300 md:text-2xl">
                {isArabic ? hero.subtitleAr : hero.subtitleEn}
              </p>

              <div className="flex justify-center">
                <Link to="/services/script-approval">
                  <Button size="lg" className="gap-3 bg-[#76B6B7] text-black hover:bg-[#5a9fa0]">
                    <span>{isArabic ? 'اعتماد النص' : 'Script Approval'}</span>
                    <ChevronRight className={`h-5 w-5 ${isArabic ? 'rotate-180' : ''}`} />
                  </Button>
                </Link>
              </div>

              <div className="mt-12 flex items-center justify-center gap-4">
                <div className="h-px w-24 bg-gradient-to-r from-transparent via-[#76B6B7] to-red-600" />
                <div className="h-2 w-2 rounded-full bg-[#76B6B7]" />
                <div className="h-px w-24 bg-gradient-to-l from-transparent via-[#76B6B7] to-red-600" />
              </div>
            </div>
          </div>

          <button
            onClick={() => setHeroIndex((prev) => (prev - 1 + heroSlides.length) % heroSlides.length)}
            className="absolute left-6 top-1/2 z-20 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-red-900/50 bg-black/50 backdrop-blur-sm transition hover:bg-red-950/50"
            aria-label="Previous slide"
          >
            <ChevronLeft className="h-6 w-6 text-white" />
          </button>
          <button
            onClick={() => setHeroIndex((prev) => (prev + 1) % heroSlides.length)}
            className="absolute right-6 top-1/2 z-20 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-red-900/50 bg-black/50 backdrop-blur-sm transition hover:bg-red-950/50"
            aria-label="Next slide"
          >
            <ChevronRight className="h-6 w-6 text-white" />
          </button>

          <div className="absolute bottom-0 left-0 z-20 w-full bg-black/40 backdrop-blur-sm">
            <div className="mx-auto grid max-w-7xl grid-cols-2 gap-6 px-4 py-6 text-sm md:grid-cols-4 lg:px-10">
              <div>
                <p className="text-3xl font-bold text-white">200+</p>
                <p className="text-white/70">{isArabic ? 'نصوص معتمدة' : 'Approved scripts'}</p>
              </div>
              <div>
                <p className="text-3xl font-bold text-white">50+</p>
                <p className="text-white/70">{isArabic ? 'شركات إنتاج' : 'Production companies'}</p>
              </div>
              <div>
                <p className="text-3xl font-bold text-white">120</p>
                <p className="text-white/70">{isArabic ? 'أفلام سعودية' : 'Saudi films'}</p>
              </div>
              <div>
                <p className="text-3xl font-bold text-white">45</p>
                <p className="text-white/70">{isArabic ? 'مشاريع مدعومة' : 'Supported projects'}</p>
              </div>
            </div>
          </div>
        </section>

        <section id="services" className="bg-[#f4f2f7] px-4 py-24 text-[#1f1724]">
          <div className="mx-auto max-w-7xl">
            <div className="mx-auto mb-14 max-w-3xl text-center">
              <p className="mb-3 text-sm font-semibold uppercase tracking-[0.3em] text-[#672a55]">
                {isArabic ? 'الخدمات الرقمية' : 'Digital services'}
              </p>
              <h2 className="text-4xl font-bold md:text-5xl">{isArabic ? 'اعتماد النص السينمائي' : 'Script approval'}</h2>
              <p className="mt-4 text-lg text-[#74697a]">
                {isArabic
                  ? 'الوصول إلى خدمة رسمية مبسطة لمراجعة النصوص واعتمادها قبل بدء الإنتاج.'
                  : 'Access a streamlined official service for script review and approval before production.'}
              </p>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              {services.map((service) => (
                <article key={isArabic ? service.titleAr : service.titleEn} className="rounded-3xl border border-[#e6deea] bg-white p-7 shadow-sm">
                  <div className="mb-4 inline-flex rounded-2xl bg-[#672a55]/10 px-4 py-2 text-sm font-semibold text-[#672a55]">
                    {isArabic ? service.titleAr : service.titleEn}
                  </div>
                  <p className="text-base leading-8 text-[#74697a]">
                    {isArabic ? service.bodyAr : service.bodyEn}
                  </p>
                </article>
              ))}
            </div>

            <div className="mt-10 flex justify-center">
              <Link to="/services/script-approval">
                <Button className="gap-2 bg-[#672a55] text-white hover:bg-[#7d3566]">
                  <span>{isArabic ? 'ابدأ الخدمة' : 'Start Service'}</span>
                  <ArrowRight className={`h-4 w-4 ${isArabic ? 'rotate-180' : ''}`} />
                </Button>
              </Link>
            </div>
          </div>
        </section>

        <section className="bg-black px-4 py-24">
          <div className="mx-auto max-w-7xl">
            <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
              <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-[#141414]">
                <img src="/cover.jpg" alt="Film Commission" className="h-full w-full object-cover" />
              </div>
              <div className="rounded-[2rem] border border-white/10 bg-[#141414] p-8">
                <p className="mb-3 text-sm font-semibold uppercase tracking-[0.3em] text-[#76B6B7]">
                  {isArabic ? 'مواقع التصوير' : 'Filming locations'}
                </p>
                <h2 className="text-4xl font-bold text-white md:text-5xl">
                  {isArabic ? 'اكتشف مواقع تصوير ملهمة' : 'Discover inspiring filming locations'}
                </h2>
                <p className="mt-4 text-lg leading-8 text-white/70">
                  {isArabic
                    ? 'ساعد جمهورك على الوصول إلى رحلة واضحة من الصفحة الرئيسية إلى خدمة اعتماد النص.'
                    : 'Guide your audience from the landing page directly into the script approval journey.'}
                </p>

                <div className="mt-8 space-y-4">
                  {locations.map((location, index) => (
                    <button
                      key={index}
                      onClick={() => setLocationIndex(index)}
                      className={`flex w-full items-center justify-between rounded-2xl border px-5 py-4 text-start transition ${
                        index === locationIndex
                          ? 'border-[#76B6B7] bg-[#76B6B7]/10 text-white'
                          : 'border-white/10 bg-white/5 text-white/80 hover:bg-white/10'
                      }`}
                    >
                      <div>
                        <div className="text-lg font-semibold">{isArabic ? location.nameAr : location.nameEn}</div>
                        <div className="mt-1 text-sm text-white/60">{isArabic ? location.cityAr : location.cityEn}</div>
                      </div>
                      <MapPin className="h-5 w-5" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="news" className="bg-[#111111] px-4 py-24">
          <div className="mx-auto max-w-7xl">
            <div className="mb-14 text-center">
              <p className="mb-3 text-sm font-semibold uppercase tracking-[0.3em] text-[#76B6B7]">
                {isArabic ? 'الأخبار' : 'News'}
              </p>
              <h2 className="text-4xl font-bold text-white md:text-5xl">
                {isArabic ? 'آخر الأخبار والتحديثات' : 'Latest news and updates'}
              </h2>
            </div>

            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {news.map((item) => (
                <article key={isArabic ? item.titleAr : item.titleEn} className="overflow-hidden rounded-3xl border border-white/10 bg-black/40">
                  <div className="h-56 bg-gradient-to-br from-[#672a55] to-[#1f1724]" />
                  <div className="p-6">
                    <div className="mb-3 flex items-center gap-2 text-sm text-[#76B6B7]">
                      <Calendar className="h-4 w-4" />
                      <span>{isArabic ? item.dateAr : item.dateEn}</span>
                    </div>
                    <h3 className="text-2xl font-semibold text-white">{isArabic ? item.titleAr : item.titleEn}</h3>
                    <p className="mt-3 leading-7 text-white/70">{isArabic ? item.bodyAr : item.bodyEn}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-[linear-gradient(to_bottom_right,#3b0c12,#000,#111827)] px-4 py-24">
          <div className="mx-auto max-w-7xl">
            <div className="grid gap-10 lg:grid-cols-[1fr_0.95fr]">
              <div>
                <h2 className="mb-4 text-5xl font-bold text-white md:text-6xl">
                  {isArabic ? 'ابدأ الآن' : 'Get started now'}
                </h2>
                <p className="max-w-2xl text-xl leading-8 text-gray-300">
                  {isArabic
                    ? 'هيئة الأفلام هي أداتك المثالية لتنظيم نصوصك وتحريرها والحصول على الموافقات.'
                    : 'The Film Commission is your central place to organize scripts, review feedback, and obtain approvals.'}
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <Link to="/client/login">
                    <Button size="lg" className="gap-2 bg-[#76B6B7] text-black hover:bg-[#5a9fa0]">
                      <UserPlus className="h-5 w-5" />
                      {isArabic ? 'دخول المستفيدين' : 'Beneficiary login'}
                    </Button>
                  </Link>
                  <Link to="/services/script-approval">
                    <Button size="lg" variant="outline" className="gap-2 border-white/20 text-white hover:bg-white/10">
                      <LogIn className="h-5 w-5" />
                      {isArabic ? 'الانتقال للخدمة' : 'Go to service'}
                    </Button>
                  </Link>
                </div>
              </div>

              <div className="rounded-[32px] border border-white/10 bg-black/35 p-6 shadow-[0_30px_100px_rgba(0,0,0,0.35)] backdrop-blur">
                <img src="/whitelogo.png" alt="Film Commission logo" className="mb-5 h-14 w-auto object-contain" />
                <h3 className="mb-4 text-2xl font-semibold text-white">
                  {isArabic ? 'مزايا الهيئة للمستفيدين' : 'Film Commission features for beneficiaries'}
                </h3>
                <ul className="space-y-3 text-white/80">
                  <li>{isArabic ? 'تسجيل سريع وسهل.' : 'Fast and easy registration.'}</li>
                  <li>{isArabic ? 'رفع النصوص ومتابعة الحالة خطوة بخطوة.' : 'Submit scripts and track status step by step.'}</li>
                  <li>{isArabic ? 'تقارير واضحة تساعد على التحسين قبل الاعتماد.' : 'Clear reports that help you improve before approval.'}</li>
                  <li>{isArabic ? 'إصدار شهادة الاعتماد بعد الموافقة.' : 'Approval certificate after acceptance.'}</li>
                </ul>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="relative overflow-hidden bg-black">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-red-600/50 to-transparent" />
        <div className="mx-auto max-w-7xl px-4 lg:px-8">
          <div className="grid gap-12 py-16 md:grid-cols-2 lg:grid-cols-4">
            <div className="text-right">
              <img src="/whitelogo.png" alt="Film Commission Logo" className="mb-4 h-14 w-auto object-contain" />
              <h3 className="mb-2 text-xl text-white">{isArabic ? 'عن هيئة الأفلام' : 'About the Film Commission'}</h3>
              <p className="leading-relaxed text-gray-400">
                {isArabic
                  ? 'هيئة الأفلام تقدم بيئة واضحة واحترافية لمراجعة النصوص واعتمادها داخل المملكة العربية السعودية.'
                  : 'The Film Commission provides a clear, professional environment for script review and approval in Saudi Arabia.'}
              </p>
            </div>
            <div className="text-right">
              <h3 className="mb-2 text-xl text-white">{isArabic ? 'روابط سريعة' : 'Quick links'}</h3>
              <ul className="space-y-2 text-gray-400">
                <li><a href="#hero" className="transition hover:text-red-400">{isArabic ? 'الرئيسية' : 'Home'}</a></li>
                <li><a href="#services" className="transition hover:text-red-400">{isArabic ? 'الخدمات' : 'Services'}</a></li>
                <li><a href="#locations" className="transition hover:text-red-400">{isArabic ? 'مواقع التصوير' : 'Locations'}</a></li>
                <li><a href="#news" className="transition hover:text-red-400">{isArabic ? 'الأخبار' : 'News'}</a></li>
              </ul>
            </div>
            <div className="text-right">
              <h3 className="mb-2 text-xl text-white">{isArabic ? 'الوصول السريع' : 'Quick access'}</h3>
              <ul className="space-y-2 text-gray-400">
                <li><Link to="/client/login" className="transition hover:text-red-400">{isArabic ? 'دخول المستفيدين' : 'Beneficiary login'}</Link></li>
                <li><Link to="/services/script-approval" className="transition hover:text-red-400">{isArabic ? 'اعتماد النص' : 'Script approval'}</Link></li>
                <li><a href="#hero" className="transition hover:text-red-400">{isArabic ? 'العودة للأعلى' : 'Back to top'}</a></li>
              </ul>
            </div>
            <div className="text-right">
              <h3 className="mb-2 text-xl text-white">{isArabic ? 'معلومات عامة' : 'General info'}</h3>
              <p className="text-gray-400">{isArabic ? 'الرياض، المملكة العربية السعودية' : 'Riyadh, Saudi Arabia'}</p>
              <p className="mt-2 text-gray-400">support@film.sa</p>
              <p className="mt-2 text-gray-400">+966 11 000 0000</p>
            </div>
          </div>

          <div className="border-t border-red-900/20 py-8">
            <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
              <p className="text-center text-sm text-gray-500">
                {isArabic ? '© 2026 هيئة الأفلام — جميع الحقوق محفوظة' : '© 2026 Film Commission — All rights reserved'}
              </p>
              <button
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                className="inline-flex items-center gap-2 text-sm text-white/70 transition hover:text-white"
              >
                <span>{isArabic ? 'العودة للأعلى' : 'Back to top'}</span>
                <ArrowRight className={`h-4 w-4 ${isArabic ? 'rotate-180' : '-rotate-90'}`} />
              </button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

