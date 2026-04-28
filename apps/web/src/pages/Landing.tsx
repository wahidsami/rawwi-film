import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  DollarSign,
  Globe,
  Lightbulb,
  LogIn,
  MapPin,
  Menu,
  Shield,
  UserPlus,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useLangStore } from '@/store/langStore';
import { useAuthStore } from '@/store/authStore';

const heroSlides = [
  {
    id: 1,
    titleAr: 'فسح النص مع راوي أسرع',
    titleEn: 'Get script clearance faster with Raawi',
    subtitleAr: 'مع راوي يمكنك رفع النص، تشغيل التحليل، ومتابعة رحلة المراجعة من مكان واحد.',
    subtitleEn: 'Upload the script, run the analysis, and follow the review journey from one place.',
    image:
      'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=1600&q=80',
  },
  {
    id: 2,
    titleAr: 'راوي يدقق النصوص السينمائية',
    titleEn: 'Raawi reviews film scripts intelligently',
    subtitleAr: 'تحليل أوضح، تقارير أنظف، وربط أسرع بين الملاحظات والنص الأصلي.',
    subtitleEn: 'Clearer analysis, cleaner reports, and faster evidence-to-text grounding.',
    image:
      'https://images.unsplash.com/photo-1518998053901-5348d3961a04?auto=format&fit=crop&w=1600&q=80',
  },
  {
    id: 3,
    titleAr: 'المنصة الذكية لمراجعة النصوص السينمائية',
    titleEn: 'The smart platform for cinematic script review',
    subtitleAr: 'تجربة متكاملة لشركات الإنتاج: رفع، تحليل، مراجعة، واعتماد في تدفق واحد.',
    subtitleEn: 'A unified workflow for production companies: upload, analyze, review, and approve.',
    image: '/cover.jpg',
  },
];

const aboutCards = [
  {
    titleAr: 'حساب واحد لنصوصك',
    titleEn: 'One home for your scripts',
    bodyAr: 'جميع النصوص السينمائية الخاصة بشركتك في مكان واحد.',
    bodyEn: 'All your company scripts in one place.',
    image:
      'https://images.unsplash.com/photo-1536240478700-b869070f9279?auto=format&fit=crop&w=1200&q=80',
  },
  {
    titleAr: 'محرر ومتابعة أوضح',
    titleEn: 'Cleaner review flow',
    bodyAr: 'واجهة تساعد على تتبع الملاحظات والقرارات والتعديلات بسهولة.',
    bodyEn: 'A cleaner interface for findings, decisions, and edits.',
    image:
      'https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?auto=format&fit=crop&w=1200&q=80',
  },
  {
    titleAr: 'تحليل النص الذكي',
    titleEn: 'Smart script analysis',
    bodyAr: 'تحليل آلي وتقارير تفصيلية تساعد على اكتشاف المشكلات بشكل مبكر.',
    bodyEn: 'Automated analysis and detailed reports that surface issues early.',
    image:
      'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1200&q=80',
  },
];

const films = [
  { id: 1, title: 'Kandahar', year: '2023', image: 'https://m.media-amazon.com/images/I/513qYXGPkYL._UF894,1000_QL80_.jpg' },
  { id: 2, title: 'Dunki', year: '2023', image: 'https://m.media-amazon.com/images/M/MV5BMThhZjM4M2UtYmE1NC00YTMzLTk3ZTAtNmQ1ZmI4YmRmZGE1XkEyXkFqcGc@._V1_FMjpg_UX1000_.jpg' },
  { id: 3, title: 'Cherry', year: '2021', image: 'https://m.media-amazon.com/images/M/MV5BOGZlOWM5YWQtZjk2YS00ZTIyLWJkMDgtZTYwNDFjNGI3YjFiXkEyXkFqcGc@._V1_.jpg' },
  { id: 4, title: 'The Cello', year: '2023', image: 'https://m.media-amazon.com/images/M/MV5BMWQ1OGFkN2YtMjExZC00ZjE1LThiOGQtMWMwY2JlZmY4ODkwXkEyXkFqcGc@._V1_.jpg' },
  { id: 5, title: 'Wadjda', year: '2021', image: 'https://m.media-amazon.com/images/M/MV5BMjI4MzMyNzM2Ml5BMl5BanBnXkFtZTgwNDQ5MDgwMDE@._V1_FMjpg_UX1000_.jpg' },
  { id: 6, title: 'Malcolm X', year: '1992', image: 'https://m.media-amazon.com/images/M/MV5BMDBjNzhlNDgtNGQzOC00OGE2LTlhMzQtZDVlMzFhZjg4MmI5XkEyXkFqcGc@._V1_FMjpg_UX1000_.jpg' },
  { id: 7, title: 'Barakah Meets Barakah', year: '2016', image: 'https://m.media-amazon.com/images/M/MV5BZTAyODQ5ZGUtMDgxNi00MTE3LTk3ZjAtMjEwNzRjNWQ3MGUyXkEyXkFqcGc@._V1_.jpg' },
  { id: 8, title: 'Le Grand Voyage', year: '2004', image: 'https://m.media-amazon.com/images/M/MV5BN2Y1YzRjODItNjkxNy00YzcwLTllMmItZTA1YWU5MDg5ODY0XkEyXkFqcGc@._V1_FMjpg_UX1000_.jpg' },
  { id: 9, title: 'Journey to Mecca', year: '2009', image: 'https://m.media-amazon.com/images/M/MV5BMTQ1MDcxNjYzMF5BMl5BanBnXkFtZTcwODEwMDA1Nw@@._V1_FMjpg_UX1000_.jpg' },
];

const locations = [
  {
    id: 1,
    nameAr: 'العُلا التاريخية',
    nameEn: 'Historic AlUla',
    cityAr: 'المدينة المنورة',
    cityEn: 'Madinah',
    featureAr: 'كنوز أثرية ومقابر نبطية وتكوينات صخرية فريدة.',
    featureEn: 'Ancient heritage, Nabataean tombs, and dramatic rock formations.',
    image:
      'https://vid.alarabiya.net/images/2017/07/21/bfae2f58-343b-4d93-acdd-740ba92321b1/bfae2f58-343b-4d93-acdd-740ba92321b1_16x9_1200x676.jpg',
  },
  {
    id: 2,
    nameAr: 'نيوم',
    nameEn: 'NEOM',
    cityAr: 'تبوك',
    cityEn: 'Tabuk',
    featureAr: 'بحر وجبل وصحراء في مساحة واحدة لهوية بصرية مستقبلية.',
    featureEn: 'Sea, mountain, and desert in one cinematic futuristic region.',
    image: 'https://www.vision2030.gov.sa/media/twdjd3ye/sindalah.webp',
  },
  {
    id: 3,
    nameAr: 'جدة التاريخية',
    nameEn: 'Historic Jeddah',
    cityAr: 'جدة',
    cityEn: 'Jeddah',
    featureAr: 'عمارة حجازية قديمة وبيوت الروشان وأزقة غنية بالهوية.',
    featureEn: 'Hijazi architecture, roshan houses, and identity-rich alleys.',
    image: 'https://cdn.salla.sa/ApXEE/1RigZ880Fp4VcStQ6aI3uXmKkPN4a4oGTHJ1XMI5.jpg',
  },
  {
    id: 4,
    nameAr: 'الدرعية',
    nameEn: 'Diriyah',
    cityAr: 'الرياض',
    cityEn: 'Riyadh',
    featureAr: 'الطراز النجدي الطيني القديم ومشهد تاريخي شديد الخصوصية.',
    featureEn: 'Distinctive Najdi architecture and deeply historic atmosphere.',
    image: 'https://assets-diriyah.diriyah.me/8cbd4b9bcf984719ad8d09996cb2f648?width=3840&quality=80&transform=true&format=webp',
  },
  {
    id: 5,
    nameAr: 'واجهة الرياض',
    nameEn: 'Riyadh Front',
    cityAr: 'الرياض',
    cityEn: 'Riyadh',
    featureAr: 'مشهد حضري حديث مناسب للأعمال العصرية والإيقاع السريع.',
    featureEn: 'A modern cityscape fit for contemporary productions.',
    image: 'https://waditrip.sa/wp-content/uploads/2018/10/%D9%81%D8%AA%D9%82%D8%AA%D9%82%D9%81%D8%AA%D9%82%D9%81%D8%AA-1024x576.jpg',
  },
  {
    id: 6,
    nameAr: 'جزر فرسان',
    nameEn: 'Farasan Islands',
    cityAr: 'جازان',
    cityEn: 'Jazan',
    featureAr: 'شواطئ ومياه فيروزية وإحساس بصري مختلف تمامًا.',
    featureEn: 'White beaches, turquoise waters, and a distinctive visual feel.',
    image: 'https://cnn-arabic-images.cnn.io/cloudinary/image/upload/w_1920,h_1080,c_fill,q_auto,g_center/cnnarabic/2020/08/17/images/162713.jpg',
  },
];

const newsItems = [
  {
    id: 1,
    titleAr: 'إطلاق مسار أوضح لمراجعة النصوص',
    titleEn: 'A clearer script review journey',
    dateAr: '١٥ أبريل ٢٠٢٦',
    dateEn: '15 Apr 2026',
    summaryAr: 'تحسينات في تسلسل الرفع والتحليل والمراجعة والتصدير لرفع وضوح التجربة.',
    summaryEn: 'Workflow improvements across upload, analysis, review, and export.',
    image:
      'https://images.unsplash.com/photo-1616530940355-351fabd9524b?auto=format&fit=crop&w=1080&q=80',
  },
  {
    id: 2,
    titleAr: 'تعزيز بوابة شركات الإنتاج',
    titleEn: 'Enhancing the production portal',
    dateAr: '١٢ أبريل ٢٠٢٦',
    dateEn: '12 Apr 2026',
    summaryAr: 'تطوير تجربة الشركات في التسجيل المجاني ورفع النصوص ومتابعة التقارير.',
    summaryEn: 'Improved registration, submission, and report follow-up for companies.',
    image:
      'https://images.unsplash.com/photo-1519662978799-2f05096d3636?auto=format&fit=crop&w=1080&q=80',
  },
  {
    id: 3,
    titleAr: 'تحسينات على دقة المخرجات',
    titleEn: 'Output quality improvements',
    dateAr: '٨ أبريل ٢٠٢٦',
    dateEn: '8 Apr 2026',
    summaryAr: 'مزيد من التشديد على ربط الملاحظة بالنص وتقليل الضوضاء في النتائج.',
    summaryEn: 'Stronger evidence grounding and lower report noise in findings.',
    image:
      'https://images.unsplash.com/photo-1695014192231-18462db3ebde?auto=format&fit=crop&w=1080&q=80',
  },
];

function getLoopedDiff(index: number, activeIndex: number, length: number) {
  let diff = index - activeIndex;
  if (diff > length / 2) diff -= length;
  if (diff < -length / 2) diff += length;
  return diff;
}

export function Landing() {
  const navigate = useNavigate();
  const { lang, toggleLang } = useLangStore();
  const { isAuthenticated, isClient } = useAuthStore();
  const isArabic = lang === 'ar';
  const dashboardHref = isClient() ? '/client' : '/app';

  const [heroIndex, setHeroIndex] = useState(0);
  const [showIncentiveDropdown, setShowIncentiveDropdown] = useState(false);
  const [filmIndex, setFilmIndex] = useState(4);
  const [locationIndex, setLocationIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setHeroIndex((prev) => (prev + 1) % heroSlides.length);
    }, 6000);
    return () => window.clearInterval(timer);
  }, []);

  const currentHero = heroSlides[heroIndex];

  const filmCards = useMemo(
    () =>
      films.map((film, index) => {
        const diff = getLoopedDiff(index, filmIndex, films.length);
        if (diff === 0) return { film, style: { x: 0, scale: 1, rotate: 0, opacity: 1, z: 10 } };
        if (diff === 1) return { film, style: { x: -240, scale: 0.76, rotate: 42, opacity: 0.78, z: 9 } };
        if (diff === -1) return { film, style: { x: 240, scale: 0.76, rotate: -42, opacity: 0.78, z: 9 } };
        if (diff === 2) return { film, style: { x: -430, scale: 0.56, rotate: 54, opacity: 0.48, z: 8 } };
        if (diff === -2) return { film, style: { x: 430, scale: 0.56, rotate: -54, opacity: 0.48, z: 8 } };
        if (diff === 3) return { film, style: { x: -600, scale: 0.4, rotate: 60, opacity: 0.28, z: 7 } };
        if (diff === -3) return { film, style: { x: 600, scale: 0.4, rotate: -60, opacity: 0.28, z: 7 } };
        return { film, style: { x: diff > 0 ? -760 : 760, scale: 0.24, rotate: diff > 0 ? 65 : -65, opacity: 0, z: 6 } };
      }),
    [filmIndex]
  );

  return (
    <div className="min-h-screen bg-black text-white" dir={isArabic ? 'rtl' : 'ltr'}>
      <header className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-[#141414]/95 backdrop-blur-sm">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-4 lg:px-10">
          <div className="flex items-center gap-3">
            <img src="/loginlogo.png" alt="Raawi Film" className="h-14 w-auto object-contain" />
          </div>

          <nav className="hidden items-center gap-10 xl:flex">
            <a href="#hero" className="group relative text-white transition hover:text-white/90">
              <span>{isArabic ? 'الرئيسية' : 'Home'}</span>
              <span className="absolute inset-x-0 -bottom-2 h-px w-0 bg-red-600 transition-all duration-300 group-hover:w-full" />
            </a>
            <div
              className="relative"
              onMouseEnter={() => setShowIncentiveDropdown(true)}
              onMouseLeave={() => setShowIncentiveDropdown(false)}
            >
              <a href="#about" className="group relative flex items-center gap-1 text-white transition hover:text-white/90">
                <span>{isArabic ? 'مميزات راوي' : 'Raawi features'}</span>
                <ChevronDown className={`h-4 w-4 transition ${showIncentiveDropdown ? 'rotate-180' : ''}`} />
                <span className="absolute inset-x-0 -bottom-2 h-px w-0 bg-red-600 transition-all duration-300 group-hover:w-full" />
              </a>
              {showIncentiveDropdown && (
                <div className="absolute top-full right-0 mt-3 w-56 overflow-hidden rounded-2xl border border-red-900/40 bg-[#1a1a1a] shadow-2xl shadow-black/50">
                  <a href="#about" className="flex items-center gap-3 px-4 py-3 text-sm text-white transition hover:bg-red-950/30">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-600/20 text-red-300">
                      <DollarSign className="h-4 w-4" />
                    </div>
                    <span>{isArabic ? 'عن راوي' : 'About Raawi'}</span>
                  </a>
                  <a href="#contact" className="flex items-center gap-3 px-4 py-3 text-sm text-white transition hover:bg-red-950/30">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-600/20 text-red-300">
                      <Lightbulb className="h-4 w-4" />
                    </div>
                    <span>{isArabic ? 'ابدأ الآن' : 'Get started'}</span>
                  </a>
                </div>
              )}
            </div>
            <a href="#locations" className="group relative text-white transition hover:text-white/90">
              <span>{isArabic ? 'مواقع التصوير' : 'Locations'}</span>
              <span className="absolute inset-x-0 -bottom-2 h-px w-0 bg-red-600 transition-all duration-300 group-hover:w-full" />
            </a>
            <a href="#films" className="group relative text-white transition hover:text-white/90">
              <span>{isArabic ? 'أفلام' : 'Films'}</span>
              <span className="absolute inset-x-0 -bottom-2 h-px w-0 bg-red-600 transition-all duration-300 group-hover:w-full" />
            </a>
            <a href="#news" className="group relative text-white transition hover:text-white/90">
              <span>{isArabic ? 'الأخبار' : 'News'}</span>
              <span className="absolute inset-x-0 -bottom-2 h-px w-0 bg-red-600 transition-all duration-300 group-hover:w-full" />
            </a>
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
              <>
                <Link to="/portal/register" className="hidden text-red-500 transition hover:text-red-400 md:inline-flex">
                  <UserPlus className="h-5 w-5" />
                </Link>
                <Link to="/login" className="text-white transition hover:text-red-500">
                  <LogIn className="h-5 w-5" />
                </Link>
              </>
            )}
            <div className="h-6 w-px bg-white/20" />
            <button onClick={toggleLang} className="inline-flex items-center gap-1.5 text-sm text-white/85 transition hover:text-white">
              <Globe className="h-4 w-4" />
              <span>{isArabic ? 'EN' : 'عربي'}</span>
            </button>
            <button className="xl:hidden">
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      <main>
        <section id="hero" className="relative h-screen overflow-hidden pt-20">
          <div className="absolute inset-0 transition-all duration-1000">
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: `url(${currentHero.image})` }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/70 to-black/40" />
            <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-transparent to-black/60" />
            <div className="absolute inset-0 bg-red-950/20" />
          </div>

          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_50%,rgba(211,47,47,0.12),transparent_42%)] opacity-70" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_50%,rgba(118,182,183,0.1),transparent_38%)] opacity-60" />

          <div className="relative flex h-full items-center justify-center px-4 text-center">
            <div className="mx-auto max-w-5xl">
              <h1 className="mb-8 text-5xl font-bold leading-tight text-white md:text-6xl lg:text-7xl">
                {isArabic ? currentHero.titleAr : currentHero.titleEn}
              </h1>
              <p className="mx-auto mb-10 max-w-3xl text-xl text-gray-300 md:text-2xl">
                {isArabic ? currentHero.subtitleAr : currentHero.subtitleEn}
              </p>

              <div className="flex justify-center">
                {isAuthenticated ? (
                  <Button size="lg" onClick={() => navigate(dashboardHref)} className="gap-3 bg-[#76B6B7] text-black hover:bg-[#5a9fa0]">
                    <span>{isArabic ? 'الدخول إلى لوحة التحكم' : 'Go to dashboard'}</span>
                    <ChevronLeft className={`h-5 w-5 ${isArabic ? 'rotate-180' : ''}`} />
                  </Button>
                ) : (
                  <Link to="/portal/register">
                    <Button size="lg" className="gap-3 bg-[#76B6B7] text-black hover:bg-[#5a9fa0]">
                      <span>{isArabic ? 'اكتشف المزيد' : 'Discover more'}</span>
                      <ChevronLeft className={`h-5 w-5 ${isArabic ? 'rotate-180' : ''}`} />
                    </Button>
                  </Link>
                )}
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
            className="absolute left-8 top-1/2 z-20 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-red-900/50 bg-black/50 backdrop-blur-sm transition hover:bg-red-950/50"
          >
            <ChevronLeft className="h-6 w-6 text-white" />
          </button>
          <button
            onClick={() => setHeroIndex((prev) => (prev + 1) % heroSlides.length)}
            className="absolute right-8 top-1/2 z-20 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-red-900/50 bg-black/50 backdrop-blur-sm transition hover:bg-red-950/50"
          >
            <ChevronRight className="h-6 w-6 text-white" />
          </button>

          <div className="absolute bottom-12 left-1/2 z-20 flex -translate-x-1/2 gap-3" dir="ltr">
            {heroSlides.map((slide, index) => (
              <button
                key={slide.id}
                onClick={() => setHeroIndex(index)}
                className={`h-1 rounded-full transition-all duration-500 ${index === heroIndex ? 'w-12 bg-red-600' : 'w-8 bg-white/30 hover:bg-white/50'}`}
              />
            ))}
          </div>
        </section>

        <section id="about" className="relative overflow-hidden bg-gradient-to-b from-black via-neutral-950 to-black py-28">
          <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'linear-gradient(rgba(220,38,38,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(220,38,38,0.3) 1px, transparent 1px)', backgroundSize: '50px 50px' }} />
          <div className="mx-auto max-w-7xl px-4 lg:px-10">
            <div className="mb-20 text-center">
              <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-red-800/50 bg-red-950/50 px-6 py-3">
                <Clapperboard className="h-5 w-5 text-red-400" />
                <span className="text-lg text-red-300">{isArabic ? 'نبذة عنا' : 'About us'}</span>
              </div>
              <h2 className="mb-6 text-5xl text-white md:text-6xl">{isArabic ? 'منصة راوي' : 'Raawi Platform'}</h2>
              <p className="mx-auto max-w-4xl text-2xl text-gray-300">
                {isArabic
                  ? 'منصة تتبع هيئة الأفلام لتسهيل مراجعة النصوص السينمائية ومساعدة الشركات على فهم الملاحظات مبكرًا.'
                  : 'A Film Commission-aligned platform that helps production companies review scripts and understand issues earlier.'}
              </p>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
              {aboutCards.map((card) => (
                <article key={card.titleAr} className="group relative overflow-hidden rounded-2xl border border-red-900/20 p-8 transition-all duration-500 hover:border-red-600/50">
                  <div className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-110" style={{ backgroundImage: `url(${card.image})` }} />
                  <div className="absolute inset-0 bg-gradient-to-br from-black/85 via-black/80 to-black/85 group-hover:from-black/75 group-hover:via-black/70 group-hover:to-black/75 transition-all duration-500" />
                  <div className="relative z-10">
                    <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-xl border border-red-600/30 bg-gradient-to-br from-red-600/30 to-red-900/30">
                      <Clapperboard className="h-8 w-8 text-red-400" />
                    </div>
                    <h3 className="mb-3 text-2xl text-white transition group-hover:text-red-400">
                      {isArabic ? card.titleAr : card.titleEn}
                    </h3>
                    <p className="leading-relaxed text-gray-300">{isArabic ? card.bodyAr : card.bodyEn}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="films" className="relative overflow-hidden bg-[#141414] py-32">
          <div className="absolute inset-0 bg-gradient-to-b from-black via-[#141414] to-black" />
          <div className="relative mx-auto max-w-7xl px-4 lg:px-8">
            <div className="mb-20 text-center">
              <h2 className="mb-4 text-5xl text-white md:text-6xl">
                {isArabic ? 'أفلام حصلت على فسح النص السعودي' : 'Films cleared in Saudi Arabia'}
              </h2>
              <p className="mx-auto max-w-3xl text-xl text-gray-400">
                {isArabic ? 'أفلام صورت بين طبيعتنا وثقافتنا ضمن مشهد سينمائي متنامٍ.' : 'Films produced across the Kingdom’s growing cinematic landscape.'}
              </p>
              <div className="mt-8 flex items-center justify-center gap-4">
                <div className="h-px w-24 bg-gradient-to-r from-transparent via-red-600 to-[#76B6B7]" />
                <div className="h-2 w-2 rounded-full bg-[#76B6B7]" />
                <div className="h-px w-24 bg-gradient-to-l from-transparent via-red-600 to-[#76B6B7]" />
              </div>
            </div>

            <div className="relative flex h-[700px] items-center justify-center">
              <div className="absolute inset-0 flex items-center justify-center" style={{ perspective: '2000px', perspectiveOrigin: 'center center' }}>
                <div className="relative h-full w-full">
                  {filmCards.map(({ film, style }) => {
                    const isActive = film.id === films[filmIndex].id;
                    return (
                      <div
                        key={film.id}
                        className="absolute left-1/2 top-1/2 transition-all duration-700 ease-out"
                        style={{
                          transform: `translate(-50%, -50%) translateX(${style.x}px) rotateY(${style.rotate}deg) scale(${style.scale})`,
                          opacity: style.opacity,
                          zIndex: style.z,
                          transformStyle: 'preserve-3d',
                          pointerEvents: isActive ? 'auto' : 'none',
                        }}
                      >
                        <div className="relative">
                          <div
                            className="relative overflow-hidden rounded-2xl shadow-2xl"
                            style={{
                              width: '280px',
                              height: '420px',
                              boxShadow: isActive ? '0 40px 80px rgba(0,0,0,0.8), 0 0 60px rgba(220,38,38,0.3)' : '0 20px 40px rgba(0,0,0,0.6)',
                            }}
                          >
                            <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${film.image})`, filter: isActive ? 'none' : 'saturate(0.7) brightness(0.8)' }} />
                            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" style={{ opacity: isActive ? 0.8 : 0.92 }} />
                            {isActive && <div className="absolute inset-0 rounded-2xl border-2 border-red-600/30" />}
                          </div>

                          <div
                            className="absolute left-0 top-full h-full w-full overflow-hidden rounded-b-2xl"
                            style={{
                              transform: 'scaleY(-1)',
                              transformOrigin: 'top',
                              opacity: isActive ? 0.28 : 0.14,
                              maskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, transparent 60%)',
                              WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, transparent 60%)',
                            }}
                          >
                            <div className="h-full w-full bg-cover bg-center" style={{ backgroundImage: `url(${film.image})`, filter: 'blur(2px) brightness(0.4)' }} />
                          </div>

                          {isActive && (
                            <div className="absolute -bottom-32 left-0 right-0 text-center">
                              <h3 className="mb-2 text-3xl text-white">{film.title}</h3>
                              <p className="text-lg text-red-400">{film.year}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <button
                onClick={() => setFilmIndex((prev) => (prev - 1 + films.length) % films.length)}
                className="absolute right-8 top-1/2 z-20 flex h-16 w-16 -translate-y-1/2 items-center justify-center rounded-full bg-red-600/90 shadow-lg shadow-red-950/50 transition hover:scale-110 hover:bg-red-600"
              >
                <ChevronRight className="h-8 w-8 text-white" />
              </button>
              <button
                onClick={() => setFilmIndex((prev) => (prev + 1) % films.length)}
                className="absolute left-8 top-1/2 z-20 flex h-16 w-16 -translate-y-1/2 items-center justify-center rounded-full bg-red-600/90 shadow-lg shadow-red-950/50 transition hover:scale-110 hover:bg-red-600"
              >
                <ChevronLeft className="h-8 w-8 text-white" />
              </button>

              <div className="absolute bottom-0 left-1/2 z-20 flex -translate-x-1/2 gap-3">
                {films.map((film, index) => (
                  <button
                    key={film.id}
                    onClick={() => setFilmIndex(index)}
                    className={`h-2 rounded-full transition-all duration-500 ${index === filmIndex ? 'w-12 bg-red-600' : 'w-2 bg-white/30 hover:bg-white/50'}`}
                  />
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="locations" className="relative overflow-hidden bg-gradient-to-b from-black via-neutral-950 to-black py-32">
          <div className="mx-auto max-w-7xl px-4 lg:px-10">
            <div className="mb-16 text-center">
              <h2 className="mb-4 text-5xl text-white md:text-6xl">{isArabic ? 'مواقع التصوير' : 'Filming locations'}</h2>
              <p className="mx-auto max-w-3xl text-xl text-gray-400">
                {isArabic ? 'اكتشف جمال وتنوع مواقع التصوير كي تلهمك في قصتك القادمة.' : 'Discover visually rich locations across the Kingdom for your next story.'}
              </p>
            </div>

            <div className="mb-12 flex h-[600px] gap-2" dir="ltr">
              {locations.map((location, index) => {
                const active = index === locationIndex;
                return (
                  <div
                    key={location.id}
                    onClick={() => setLocationIndex(index)}
                    className="group relative cursor-pointer overflow-hidden rounded-2xl transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)]"
                    style={{
                      width: active ? '70%' : '5%',
                      backgroundImage: `url(${location.image})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                    }}
                  >
                    <div className={`absolute inset-0 transition-all duration-500 ${active ? 'bg-gradient-to-t from-black via-black/70 to-black/40' : 'bg-black/60 group-hover:bg-black/50'}`} />

                    {!active && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="whitespace-nowrap text-2xl tracking-wider text-white" style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}>
                          {isArabic ? location.nameAr : location.nameEn}
                        </div>
                      </div>
                    )}

                    {active && (
                      <div className="absolute inset-0 flex items-end p-12" dir={isArabic ? 'rtl' : 'ltr'}>
                        <div className="max-w-2xl text-right">
                          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-red-600/50 bg-red-600/20 px-4 py-2 backdrop-blur-sm">
                            <MapPin className="h-4 w-4 text-red-400" />
                            <span className="text-sm text-red-300">{isArabic ? location.cityAr : location.cityEn}</span>
                          </div>
                          <h3 className="mb-6 text-5xl text-white">{isArabic ? location.nameAr : location.nameEn}</h3>
                          <p className="mb-8 text-lg leading-relaxed text-gray-300">{isArabic ? location.featureAr : location.featureEn}</p>
                          <button className="inline-flex items-center gap-3 rounded-lg bg-[#76B6B7] px-8 py-4 text-lg text-black shadow-2xl transition hover:scale-105 hover:bg-[#5a9fa0]">
                            <span>{isArabic ? 'استكشف' : 'Explore'}</span>
                            <ArrowLeft className="h-5 w-5" />
                          </button>
                        </div>
                      </div>
                    )}

                    {!active && (
                      <div className="absolute left-1/2 top-1/2 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 opacity-0 backdrop-blur-sm transition group-hover:opacity-100">
                        <ArrowLeft className="h-6 w-6 rotate-180 text-white" />
                      </div>
                    )}

                    {active && <div className="absolute right-0 top-0 h-full w-1 bg-gradient-to-b from-red-600 to-red-800" />}
                  </div>
                );
              })}
            </div>

            <div className="mb-12 flex justify-center gap-3">
              {locations.map((location, index) => (
                <button
                  key={location.id}
                  onClick={() => setLocationIndex(index)}
                  className={`h-2 rounded-full transition-all duration-500 ${index === locationIndex ? 'w-12 bg-red-600' : 'w-2 bg-white/30 hover:bg-white/50'}`}
                />
              ))}
            </div>
          </div>
        </section>

        <section id="news" className="relative overflow-hidden bg-gradient-to-b from-black via-neutral-950 to-black py-24">
          <div className="mx-auto max-w-7xl px-4 lg:px-8">
            <div className="mb-16 text-center">
              <h2 className="mb-4 text-5xl text-white md:text-6xl">{isArabic ? 'آخر الأخبار' : 'Latest news'}</h2>
              <p className="mx-auto max-w-3xl text-xl text-gray-400">
                {isArabic ? 'تابع آخر التطورات في منصة راوي وتجربة العمل السينمائي.' : 'Follow the latest updates around Raawi and script workflows.'}
              </p>
            </div>

            <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
              {newsItems.map((item, index) => (
                <article key={item.id} className="group overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900 transition-all duration-500 hover:border-red-900/50 hover:shadow-2xl hover:shadow-red-950/30">
                  <div className="relative h-56 overflow-hidden">
                    <div className="absolute inset-0 bg-cover bg-center transition duration-700 group-hover:scale-110" style={{ backgroundImage: `url(${item.image})` }} />
                    <div className="absolute inset-0 bg-gradient-to-t from-neutral-900 via-neutral-900/40 to-transparent" />
                  </div>
                  <div className="p-6">
                    <div className="mb-3 flex items-center gap-2 text-sm" style={{ color: index % 2 === 0 ? '#76B6B7' : 'rgb(248 113 113)' }}>
                      <Calendar className="h-4 w-4" />
                      <span>{isArabic ? item.dateAr : item.dateEn}</span>
                    </div>
                    <h3 className="mb-3 text-xl text-white transition group-hover:text-red-400">{isArabic ? item.titleAr : item.titleEn}</h3>
                    <p className="mb-4 leading-relaxed text-gray-400">{isArabic ? item.summaryAr : item.summaryEn}</p>
                    <div className="flex items-center gap-2 transition-all duration-300 group-hover:gap-3" style={{ color: index % 2 === 0 ? '#76B6B7' : 'rgb(239 68 68)' }}>
                      <span>{isArabic ? 'اقرأ المزيد' : 'Read more'}</span>
                      <ArrowLeft className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="contact" className="overflow-hidden bg-[linear-gradient(to_bottom_right,#3b0c12,#000,#111827)] py-24">
          <div className="mx-auto max-w-7xl px-4 lg:px-8">
            <div className="grid gap-10 lg:grid-cols-[1fr_0.95fr]">
              <div>
                <h2 className="mb-4 text-5xl text-white md:text-6xl">{isArabic ? 'ابدأ الآن' : 'Get started now'}</h2>
                <p className="max-w-2xl text-xl leading-8 text-gray-300">
                  {isArabic
                    ? 'الآن يمكن أن تكون الصفحة الأولى للنظام أقرب بكثير للهوية القديمة، بينما يبقى التطبيق التشغيلي بالكامل داخل /app.'
                    : 'The public homepage now gets much closer to the old identity while the operational application remains under /app.'}
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <Link to="/portal/register">
                    <Button size="lg" className="gap-2 bg-[#76B6B7] text-black hover:bg-[#5a9fa0]">
                      <UserPlus className="h-5 w-5" />
                      {isArabic ? 'تسجيل مجاني للشركات' : 'Free company registration'}
                    </Button>
                  </Link>
                  <Link to="/login">
                    <Button size="lg" variant="outline" className="gap-2 border-white/20 text-white hover:bg-white/10">
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
                    <p className="text-sm text-white/50">{isArabic ? 'المسار التشغيلي' : 'Operational path'}</p>
                    <p className="mt-2 text-sm leading-7 text-white/75">
                      {isArabic
                        ? 'يفتح الزائر الصفحة العامة أولًا على /، ثم ينتقل المستخدم الداخلي إلى /app حيث تبقى كل وظائف راوي الحالية كما هي.'
                        : 'Visitors now land on / first, while the internal operational system remains available under /app.'}
                    </p>
                  </div>
                </div>
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
              <img src="/loginlogo.png" alt="Raawi Logo" className="mb-4 h-14 w-auto object-contain" />
              <h3 className="mb-2 text-xl text-white">{isArabic ? 'عن منصة راوي' : 'About Raawi'}</h3>
              <p className="leading-relaxed text-gray-400">
                {isArabic ? 'منصة راوي تضع بين يديك أداة قوية لتحليل النصوص ومتابعتها داخل المملكة العربية السعودية.' : 'Raawi provides a focused environment for script analysis and review.'}
              </p>
            </div>
            <div className="text-right">
              <h3 className="mb-2 text-xl text-white">{isArabic ? 'روابط سريعة' : 'Quick links'}</h3>
              <ul className="space-y-2 text-gray-400">
                <li><a href="#hero" className="transition hover:text-red-400">{isArabic ? 'الرئيسية' : 'Home'}</a></li>
                <li><a href="#about" className="transition hover:text-red-400">{isArabic ? 'عن راوي' : 'About'}</a></li>
                <li><a href="#locations" className="transition hover:text-red-400">{isArabic ? 'مواقع التصوير' : 'Locations'}</a></li>
                <li><a href="#films" className="transition hover:text-red-400">{isArabic ? 'الأفلام' : 'Films'}</a></li>
              </ul>
            </div>
            <div className="text-right">
              <h3 className="mb-2 text-xl text-white">{isArabic ? 'الوصول السريع' : 'Quick access'}</h3>
              <ul className="space-y-2 text-gray-400">
                <li><Link to="/login" className="transition hover:text-red-400">{isArabic ? 'تسجيل الدخول' : 'Login'}</Link></li>
                <li><Link to="/portal/register" className="transition hover:text-red-400">{isArabic ? 'تسجيل شركة' : 'Register company'}</Link></li>
                <li><Link to="/portal" className="transition hover:text-red-400">{isArabic ? 'بوابة الشركات' : 'Company portal'}</Link></li>
                <li><a href="#contact" className="transition hover:text-red-400">{isArabic ? 'ابدأ الآن' : 'Get started'}</a></li>
              </ul>
            </div>
            <div className="text-right">
              <h3 className="mb-2 text-xl text-white">{isArabic ? 'معلومات عامة' : 'General info'}</h3>
              <p className="text-gray-400">{isArabic ? 'الرياض، المملكة العربية السعودية' : 'Riyadh, Saudi Arabia'}</p>
              <p className="mt-2 text-gray-400">info@raawi.film</p>
            </div>
          </div>

          <div className="border-t border-red-900/20 py-8">
            <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
              <p className="text-center text-sm text-gray-500">{isArabic ? '© 2026 راوي فيلم — جميع الحقوق محفوظة' : '© 2026 Raawi Film — All rights reserved'}</p>
              <a href="#hero" className="inline-flex items-center gap-2 text-sm text-white/70 transition hover:text-white">
                <span>{isArabic ? 'العودة للأعلى' : 'Back to top'}</span>
                <ArrowLeft className={`h-4 w-4 ${isArabic ? 'rotate-90' : '-rotate-90'}`} />
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
