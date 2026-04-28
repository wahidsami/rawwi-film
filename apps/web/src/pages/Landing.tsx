import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpen,
  Brain,
  Clapperboard,
  Film,
  Globe,
  LogIn,
  MapPin,
  ShieldCheck,
  Sparkles,
  UserPlus,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useLangStore } from '@/store/langStore';
import { useAuthStore } from '@/store/authStore';

type MarketingCard = {
  titleAr: string;
  titleEn: string;
  bodyAr: string;
  bodyEn: string;
  image: string;
};

const featureCards: MarketingCard[] = [
  {
    titleAr: 'حساب واحد لنصوصك',
    titleEn: 'One home for your scripts',
    bodyAr: 'كل النصوص السينمائية الخاصة بشركتك في مكان واحد مع متابعة واضحة للحالة والقرارات.',
    bodyEn: 'Keep all your company scripts in one place with clear status and decision tracking.',
    image: 'https://images.unsplash.com/photo-1485846234645-a62644f84728?auto=format&fit=crop&w=1200&q=80',
  },
  {
    titleAr: 'تحليل ذكي للمخالفات',
    titleEn: 'Smart compliance analysis',
    bodyAr: 'تحليل آلي مدعوم بقواعد ومنهجية مراجعة تساعد على رصد المخالفات وتقديم تقرير منظم.',
    bodyEn: 'Automated rule-guided analysis that helps detect issues and produce a structured report.',
    image: 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=1200&q=80',
  },
  {
    titleAr: 'تقرير جاهز للمراجعة',
    titleEn: 'Reviewer-ready reporting',
    bodyAr: 'إدارة الملاحظات، المراجعة، واعتماد النتائج ضمن تدفق عمل واضح لشركات الإنتاج والفرق الداخلية.',
    bodyEn: 'Manage findings, review decisions, and approvals in a clear workflow for production teams.',
    image: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80',
  },
];

const locationCards = [
  {
    titleAr: 'العُلا',
    titleEn: 'AlUla',
    bodyAr: 'طبيعة صخرية وآثار تاريخية تمنح النصوص بُعدًا بصريًا فريدًا.',
    bodyEn: 'Dramatic rock formations and heritage landmarks for visually rich storytelling.',
    image: 'https://images.unsplash.com/photo-1548013146-72479768bada?auto=format&fit=crop&w=1200&q=80',
  },
  {
    titleAr: 'الدرعية',
    titleEn: 'Diriyah',
    bodyAr: 'عمارة نجدية أصيلة وهوية تاريخية تناسب الأعمال الدرامية والثقافية.',
    bodyEn: 'Authentic Najdi architecture and cultural heritage for period and dramatic productions.',
    image: 'https://images.unsplash.com/photo-1518684079-3c830dcef090?auto=format&fit=crop&w=1200&q=80',
  },
  {
    titleAr: 'البحر الأحمر',
    titleEn: 'Red Sea',
    bodyAr: 'سواحل ومشاهد بحرية حديثة تمنح الإنتاجات مساحة بصرية واسعة ومتنوعة.',
    bodyEn: 'Modern coastal scenery and expansive visual backdrops for diverse productions.',
    image: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80',
  },
];

const filmCards = [
  { title: 'Kandahar', year: '2023', image: 'https://m.media-amazon.com/images/I/513qYXGPkYL._UF894,1000_QL80_.jpg' },
  { title: 'Dunki', year: '2023', image: 'https://m.media-amazon.com/images/M/MV5BMThhZjM4M2UtYmE1NC00YTMzLTk3ZTAtNmQ1ZmI4YmRmZGE1XkEyXkFqcGc@._V1_FMjpg_UX1000_.jpg' },
  { title: 'The Cello', year: '2023', image: 'https://m.media-amazon.com/images/M/MV5BMWQ1OGFkN2YtMjExZC00ZjE1LThiOGQtMWMwY2JlZmY4ODkwXkEyXkFqcGc@._V1_.jpg' },
  { title: 'Barakah Meets Barakah', year: '2016', image: 'https://m.media-amazon.com/images/M/MV5BZTAyODQ5ZGUtMDgxNi00MTE3LTk3ZjAtMjEwNzRjNWQ3MGUyXkEyXkFqcGc@._V1_.jpg' },
];

const newsCards = [
  {
    titleAr: 'تطوير تجربة مراجعة النصوص والإنتاج',
    titleEn: 'Advancing script review workflows',
    bodyAr: 'تحديثات مستمرة على أدوات التحليل والمراجعة لرفع دقة الرصد وتسريع دورة العمل.',
    bodyEn: 'Continuous updates to analysis and review tools to improve accuracy and speed.',
  },
  {
    titleAr: 'دعم أفضل لشركات الإنتاج',
    titleEn: 'Better support for production companies',
    bodyAr: 'بوابة موحدة لتسجيل الشركات، رفع النصوص، متابعة الحالة، واستلام التقارير.',
    bodyEn: 'A unified portal for company registration, script submission, tracking, and reports.',
  },
  {
    titleAr: 'منصة أكثر وضوحًا للمراجعين',
    titleEn: 'Clearer workflows for reviewers',
    bodyAr: 'تحسينات في واجهات النتائج والتقارير لتسهيل اتخاذ القرار وتوثيق الملاحظات.',
    bodyEn: 'Result and reporting improvements that make review decisions easier to manage.',
  },
];

export function Landing() {
  const navigate = useNavigate();
  const { lang, toggleLang } = useLangStore();
  const { isAuthenticated, isClient } = useAuthStore();

  const isArabic = lang === 'ar';
  const dashboardHref = isClient() ? '/client' : '/app';

  const goToDashboard = () => {
    navigate(dashboardHref);
  };

  return (
    <div className="min-h-screen bg-[#090909] text-white" dir={isArabic ? 'rtl' : 'ltr'}>
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#090909]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 md:px-8">
          <div className="flex items-center gap-3">
            <img src="/loginlogo.png" alt="Raawi Film" className="h-11 w-auto object-contain" />
            <div className="hidden sm:block">
              <p className="text-sm font-semibold">{isArabic ? 'راوي فيلم' : 'Raawi Film'}</p>
              <p className="text-xs text-white/60">
                {isArabic ? 'منصة التحليل الذكي للنصوص السينمائية' : 'Smart film script analysis platform'}
              </p>
            </div>
          </div>

          <nav className="hidden items-center gap-6 lg:flex">
            <a href="#hero" className="text-sm text-white/75 transition hover:text-white">{isArabic ? 'الرئيسية' : 'Home'}</a>
            <a href="#about" className="text-sm text-white/75 transition hover:text-white">{isArabic ? 'عن راوي' : 'About'}</a>
            <a href="#locations" className="text-sm text-white/75 transition hover:text-white">{isArabic ? 'مواقع التصوير' : 'Locations'}</a>
            <a href="#news" className="text-sm text-white/75 transition hover:text-white">{isArabic ? 'الأخبار' : 'Updates'}</a>
            <a href="#contact" className="text-sm text-white/75 transition hover:text-white">{isArabic ? 'تواصل معنا' : 'Contact'}</a>
          </nav>

          <div className="flex items-center gap-2">
            <button
              onClick={toggleLang}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white/85 transition hover:bg-white/10"
            >
              <Globe className="h-4 w-4" />
              <span>{isArabic ? 'EN' : 'عربي'}</span>
            </button>

            {isAuthenticated ? (
              <Button onClick={goToDashboard} className="gap-2">
                <ShieldCheck className="h-4 w-4" />
                {isArabic ? 'الدخول إلى النظام' : 'Open dashboard'}
              </Button>
            ) : (
              <>
                <Link to="/portal/register">
                  <Button variant="outline" className="hidden gap-2 sm:inline-flex">
                    <UserPlus className="h-4 w-4" />
                    {isArabic ? 'تسجيل شركة' : 'Register company'}
                  </Button>
                </Link>
                <Link to="/login">
                  <Button className="gap-2">
                    <LogIn className="h-4 w-4" />
                    {isArabic ? 'تسجيل الدخول' : 'Login'}
                  </Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main>
        <section id="hero" className="relative overflow-hidden border-b border-white/10">
          <div
            className="absolute inset-0 bg-cover bg-center opacity-25"
            style={{ backgroundImage: "url('/cover.jpg')" }}
          />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(118,182,183,0.22),transparent_40%),linear-gradient(135deg,rgba(118,182,183,0.12),transparent_35%),linear-gradient(180deg,rgba(0,0,0,0.35),rgba(0,0,0,0.82))]" />
          <div className="relative mx-auto grid min-h-[calc(100vh-73px)] max-w-7xl items-center gap-12 px-4 py-20 md:px-8 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-8">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#76B6B7]/30 bg-[#76B6B7]/10 px-4 py-2 text-sm text-[#d7f3f3]">
                <Sparkles className="h-4 w-4" />
                <span>{isArabic ? 'منصة ذكية لمراجعة النصوص السينمائية' : 'Smart platform for script review'}</span>
              </div>

              <div className="space-y-4">
                <h1 className="max-w-4xl text-4xl font-bold leading-tight text-white md:text-6xl">
                  {isArabic
                    ? 'صفحة الهبوط القديمة لراوي تعود كواجهة النظام الأولى'
                    : 'Raawi’s original landing page returns as the system front door'}
                </h1>
                <p className="max-w-2xl text-lg leading-8 text-white/75 md:text-xl">
                  {isArabic
                    ? 'استخرجنا روح الصفحة القديمة من نظام FilmSaudi وأعدنا بنائها داخل راوي الحالي لتكون أول ما يراه المستخدم: تعريف أوضح، قيمة أسرع، ومسار مباشر إلى الدخول أو تسجيل الشركات.'
                    : 'We rebuilt the spirit of the old FilmSaudi landing inside the current Raawi system so visitors first see a clearer introduction, stronger value, and direct entry points.'}
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                {isAuthenticated ? (
                  <Button size="lg" onClick={goToDashboard} className="gap-2">
                    <ShieldCheck className="h-5 w-5" />
                    {isArabic ? 'الانتقال إلى لوحة التحكم' : 'Go to dashboard'}
                  </Button>
                ) : (
                  <>
                    <Link to="/portal/register">
                      <Button size="lg" className="gap-2">
                        <UserPlus className="h-5 w-5" />
                        {isArabic ? 'ابدأ بتسجيل شركتك' : 'Register your company'}
                      </Button>
                    </Link>
                    <Link to="/portal">
                      <Button size="lg" variant="outline" className="gap-2">
                        <Film className="h-5 w-5" />
                        {isArabic ? 'بوابة شركات الإنتاج' : 'Production portal'}
                      </Button>
                    </Link>
                  </>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-3xl font-bold text-[#76B6B7]">V2</p>
                  <p className="mt-1 text-sm text-white/70">{isArabic ? 'تحليل موحد على النسخة الأحدث' : 'Unified latest analysis pipeline'}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-3xl font-bold text-[#76B6B7]">AI</p>
                  <p className="mt-1 text-sm text-white/70">{isArabic ? 'رصد، مراجعة، وتحرير داخل تدفق واحد' : 'Detection, review, and editing in one flow'}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-3xl font-bold text-[#76B6B7]">24/7</p>
                  <p className="mt-1 text-sm text-white/70">{isArabic ? 'وصول دائم للشركة والفريق الداخلي' : 'Always-on access for company and internal teams'}</p>
                </div>
              </div>
            </div>

            <div className="grid gap-4">
              {[
                {
                  titleAr: 'فسح النص أسرع',
                  titleEn: 'Faster script clearance',
                  bodyAr: 'رفع النص، تشغيل التحليل، ومتابعة الملاحظات ضمن تجربة موحدة.',
                  bodyEn: 'Upload, analyze, and review findings in one flow.',
                },
                {
                  titleAr: 'مراجعة أوضح',
                  titleEn: 'Clearer review',
                  bodyAr: 'تعديل الملاحظات، إدارة الاعتماد، والتصدير النهائي من نفس النظام.',
                  bodyEn: 'Edit findings, manage approvals, and export from the same place.',
                },
                {
                  titleAr: 'بوابة مجانية للشركات',
                  titleEn: 'Free company portal',
                  bodyAr: 'تسجيل مجاني للشركات ورفع النصوص ومتابعة حالة الطلبات.',
                  bodyEn: 'Free company registration, submissions, and status tracking.',
                },
              ].map((item) => (
                <div key={item.titleAr} className="rounded-3xl border border-white/10 bg-black/35 p-6 shadow-[0_20px_80px_rgba(0,0,0,0.28)] backdrop-blur">
                  <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[#76B6B7]/15 text-[#76B6B7]">
                    <Clapperboard className="h-5 w-5" />
                  </div>
                  <h2 className="text-xl font-semibold text-white">{isArabic ? item.titleAr : item.titleEn}</h2>
                  <p className="mt-2 text-sm leading-7 text-white/70">{isArabic ? item.bodyAr : item.bodyEn}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="about" className="border-b border-white/10 bg-[#0d0d0d] py-24">
          <div className="mx-auto max-w-7xl px-4 md:px-8">
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-sm font-semibold tracking-[0.25em] text-[#76B6B7] uppercase">
                {isArabic ? 'عن راوي' : 'About Raawi'}
              </p>
              <h2 className="mt-4 text-3xl font-bold text-white md:text-5xl">
                {isArabic ? 'منصة واحدة لإدارة النص، التحليل، والمراجعة' : 'One platform for script intake, analysis, and review'}
              </h2>
              <p className="mt-5 text-lg leading-8 text-white/70">
                {isArabic
                  ? 'أعدنا تقديم الرسائل الأساسية من صفحة FilmSaudi القديمة داخل النظام الحالي، مع الحفاظ على الهدف نفسه: تسهيل رحلة شركة الإنتاج من رفع النص وحتى استلام النتيجة.'
                  : 'We brought the core story of the old FilmSaudi landing into the current product while preserving its main goal: making the production company journey simpler from upload to final result.'}
              </p>
            </div>

            <div className="mt-14 grid gap-6 lg:grid-cols-3">
              {featureCards.map((card) => (
                <article key={card.titleAr} className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] shadow-[0_30px_80px_rgba(0,0,0,0.25)]">
                  <div className="h-56 bg-cover bg-center" style={{ backgroundImage: `linear-gradient(rgba(0,0,0,0.22), rgba(0,0,0,0.48)), url(${card.image})` }} />
                  <div className="p-6">
                    <h3 className="text-xl font-semibold text-white">{isArabic ? card.titleAr : card.titleEn}</h3>
                    <p className="mt-3 text-sm leading-7 text-white/70">{isArabic ? card.bodyAr : card.bodyEn}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="border-b border-white/10 bg-black py-24">
          <div className="mx-auto max-w-7xl px-4 md:px-8">
            <div className="flex items-end justify-between gap-6">
              <div>
                <p className="text-sm font-semibold tracking-[0.25em] text-[#76B6B7] uppercase">
                  {isArabic ? 'مرجع بصري' : 'Visual reference'}
                </p>
                <h2 className="mt-4 text-3xl font-bold text-white md:text-5xl">
                  {isArabic ? 'أفلام مصوّرة في السعودية' : 'Films shot in Saudi Arabia'}
                </h2>
              </div>
            </div>

            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {filmCards.map((film) => (
                <article key={film.title} className="group overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]">
                  <div className="h-96 bg-cover bg-center transition duration-500 group-hover:scale-[1.03]" style={{ backgroundImage: `linear-gradient(rgba(0,0,0,0.08), rgba(0,0,0,0.4)), url(${film.image})` }} />
                  <div className="p-5">
                    <h3 className="text-lg font-semibold text-white">{film.title}</h3>
                    <p className="mt-1 text-sm text-white/60">{film.year}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="locations" className="border-b border-white/10 bg-[#0b0b0b] py-24">
          <div className="mx-auto max-w-7xl px-4 md:px-8">
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-sm font-semibold tracking-[0.25em] text-[#76B6B7] uppercase">
                {isArabic ? 'مواقع التصوير' : 'Filming locations'}
              </p>
              <h2 className="mt-4 text-3xl font-bold text-white md:text-5xl">
                {isArabic ? 'تنوع بصري يلهم القصص' : 'A visual range that inspires stories'}
              </h2>
            </div>

            <div className="mt-14 grid gap-6 lg:grid-cols-3">
              {locationCards.map((card) => (
                <article key={card.titleAr} className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]">
                  <div className="h-72 bg-cover bg-center" style={{ backgroundImage: `linear-gradient(rgba(0,0,0,0.16), rgba(0,0,0,0.55)), url(${card.image})` }} />
                  <div className="p-6">
                    <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#76B6B7]/20 bg-[#76B6B7]/10 px-3 py-1 text-xs text-[#d7f3f3]">
                      <MapPin className="h-3.5 w-3.5" />
                      <span>{isArabic ? 'موقع تصوير' : 'Location'}</span>
                    </div>
                    <h3 className="text-xl font-semibold text-white">{isArabic ? card.titleAr : card.titleEn}</h3>
                    <p className="mt-3 text-sm leading-7 text-white/70">{isArabic ? card.bodyAr : card.bodyEn}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="news" className="border-b border-white/10 bg-black py-24">
          <div className="mx-auto max-w-7xl px-4 md:px-8">
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-sm font-semibold tracking-[0.25em] text-[#76B6B7] uppercase">
                {isArabic ? 'آخر الأخبار' : 'Latest updates'}
              </p>
              <h2 className="mt-4 text-3xl font-bold text-white md:text-5xl">
                {isArabic ? 'تطورات المنصة وصناعة العمل' : 'Platform and workflow updates'}
              </h2>
            </div>

            <div className="mt-14 grid gap-6 lg:grid-cols-3">
              {newsCards.map((card, index) => (
                <article key={card.titleAr} className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
                  <div className="mb-4 inline-flex items-center gap-2 text-sm text-[#76B6B7]">
                    <BookOpen className="h-4 w-4" />
                    <span>{isArabic ? `تحديث ${index + 1}` : `Update ${index + 1}`}</span>
                  </div>
                  <h3 className="text-xl font-semibold text-white">{isArabic ? card.titleAr : card.titleEn}</h3>
                  <p className="mt-3 text-sm leading-7 text-white/70">{isArabic ? card.bodyAr : card.bodyEn}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="contact" className="bg-[linear-gradient(135deg,#170f14_0%,#090909_45%,#0b1414_100%)] py-24">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 md:px-8 lg:grid-cols-[1fr_0.95fr]">
            <div>
              <p className="text-sm font-semibold tracking-[0.25em] text-[#76B6B7] uppercase">
                {isArabic ? 'ابدأ الآن' : 'Get started'}
              </p>
              <h2 className="mt-4 text-3xl font-bold text-white md:text-5xl">
                {isArabic ? 'سجّل شركتك أو ادخل إلى النظام' : 'Register your company or enter the system'}
              </h2>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-white/70">
                {isArabic
                  ? 'الصفحة الجديدة أصبحت المدخل الرئيسي للنظام، بينما تستمر جميع أدوات راوي الحالية كما هي داخل التطبيق. من هنا يمكن للزائر التعرف على المنصة ثم التوجه مباشرة إلى التسجيل أو الدخول.'
                  : 'This new page becomes the front door to the system while all existing Raawi tools continue to work inside the application.'}
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link to="/portal/register">
                  <Button size="lg" className="gap-2">
                    <UserPlus className="h-5 w-5" />
                    {isArabic ? 'تسجيل مجاني للشركات' : 'Free company registration'}
                  </Button>
                </Link>
                <Link to="/login">
                  <Button size="lg" variant="outline" className="gap-2">
                    <LogIn className="h-5 w-5" />
                    {isArabic ? 'تسجيل الدخول' : 'Login'}
                  </Button>
                </Link>
              </div>
            </div>

            <div className="rounded-[32px] border border-white/10 bg-black/35 p-6 shadow-[0_30px_100px_rgba(0,0,0,0.35)] backdrop-blur">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                  <p className="text-sm text-white/50">{isArabic ? 'المسار الإداري' : 'Admin path'}</p>
                  <p className="mt-2 text-lg font-semibold text-white">{isArabic ? 'تحليل، مراجعة، تقارير' : 'Analysis, review, reports'}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                  <p className="text-sm text-white/50">{isArabic ? 'بوابة الشركات' : 'Company portal'}</p>
                  <p className="mt-2 text-lg font-semibold text-white">{isArabic ? 'تسجيل، رفع، متابعة' : 'Register, submit, track'}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:col-span-2">
                  <div className="flex items-start gap-3">
                    <div className="mt-1 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-[#76B6B7]/15 text-[#76B6B7]">
                      <Brain className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm text-white/50">{isArabic ? 'ما الذي تغير؟' : 'What changed?'}</p>
                      <p className="mt-2 text-sm leading-7 text-white/75">
                        {isArabic
                          ? 'أصبحت الواجهة العامة مستقلة عن التطبيق الداخلي. هذا يمنحنا صفحة أولى أجمل وأوضح للمستخدمين، مع إبقاء النظام التشغيلي الحالي كما هو داخل `/app`.'
                          : 'The public-facing experience is now separated from the internal application, giving us a stronger first impression while preserving the current operational system under `/app`.'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10 bg-black py-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 text-center text-sm text-white/55 md:flex-row md:px-8">
          <div className="flex items-center gap-3">
            <img src="/fclogo.png" alt="Film Commission" className="h-9 w-auto object-contain opacity-90" />
            <span>{isArabic ? 'راوي فيلم' : 'Raawi Film'}</span>
          </div>
          <p>{isArabic ? '© 2026 جميع الحقوق محفوظة' : '© 2026 All rights reserved'}</p>
          <a href="#hero" className="inline-flex items-center gap-2 text-white/70 transition hover:text-white">
            <span>{isArabic ? 'العودة للأعلى' : 'Back to top'}</span>
            <ArrowLeft className={`h-4 w-4 ${isArabic ? 'rotate-90' : '-rotate-90'}`} />
          </a>
        </div>
      </footer>
    </div>
  );
}
