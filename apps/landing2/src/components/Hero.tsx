import heroImage from '../assets/images/hero_bg_1784138181464.jpg';
import { useLanguage } from '../contexts/LanguageContext';

export default function Hero() {
  const { t } = useLanguage();

  return (
    <section className="relative min-h-[90vh] flex items-center pt-24 pb-16 overflow-hidden">
      {/* Background Image with Overlay */}
      <div className="absolute inset-0 z-0">
        <img 
          src={heroImage} 
          alt="Saudi Film Production Crew" 
          className="w-full h-full object-cover object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-sfc-navy/90 via-sfc-navy/70 to-transparent"></div>
        <div className="absolute inset-0 bg-black/30"></div>
      </div>

      {/* Content */}
      <div className="relative z-10 w-full max-w-[1280px] mx-auto px-6 md:px-8">
        <div className="max-w-2xl">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-tight mb-4 tracking-tight">
            {t('heroTitle')}
          </h1>
          <h2 className="text-2xl md:text-3xl font-arabic font-semibold text-white/90 mb-6">
            {t('heroSubtitle')}
          </h2>
          <p className="text-lg text-white/80 mb-10 leading-relaxed max-w-xl">
            {t('heroDesc')}
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4">
            <a href="#services" className="inline-flex justify-center items-center px-8 py-4 bg-sfc-green text-white font-medium rounded-md hover:bg-sfc-green/90 transition-colors focus:ring-4 focus:ring-sfc-green/20 outline-none">
              {t('startService')}
            </a>
            <a href="#about" className="inline-flex justify-center items-center px-8 py-4 bg-white/10 text-white font-medium rounded-md border border-white/20 hover:bg-white/20 transition-colors focus:ring-4 focus:ring-white/10 outline-none backdrop-blur-sm">
              {t('learnMore')}
            </a>
          </div>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="absolute bottom-0 start-0 w-full border-t border-white/10 bg-sfc-navy/40 backdrop-blur-md">
        <div className="max-w-[1280px] mx-auto px-6 md:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 py-8">
            <div>
              <p className="text-3xl md:text-4xl font-bold text-white mb-1">200+</p>
              <p className="text-sm text-white/70 uppercase tracking-wider font-medium">{t('statScripts')}</p>
            </div>
            <div>
              <p className="text-3xl md:text-4xl font-bold text-white mb-1">50+</p>
              <p className="text-sm text-white/70 uppercase tracking-wider font-medium">{t('statCompanies')}</p>
            </div>
            <div>
              <p className="text-3xl md:text-4xl font-bold text-white mb-1">120</p>
              <p className="text-sm text-white/70 uppercase tracking-wider font-medium">{t('statFilms')}</p>
            </div>
            <div>
              <p className="text-3xl md:text-4xl font-bold text-white mb-1">45</p>
              <p className="text-sm text-white/70 uppercase tracking-wider font-medium">{t('statProjects')}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
