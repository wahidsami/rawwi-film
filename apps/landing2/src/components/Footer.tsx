import { useLanguage } from '../contexts/LanguageContext';

export default function Footer() {
  const { t } = useLanguage();
  const logoUrl = `${import.meta.env.BASE_URL}whitelogo.png`;

  return (
    <footer className="bg-sfc-navy pt-20 pb-8 text-white/80 border-t-4 border-sfc-green">
      <div className="max-w-[1280px] mx-auto px-6 md:px-8">
        
        {/* Top 4 Columns */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-16">
          
          {/* Col 1: Brand */}
          <div className="flex flex-col">
            <div className="mb-8">
              <img src={logoUrl} alt="Saudi Film Commission Logo" className="h-12 md:h-16 w-auto opacity-90" />
            </div>
            <p className="text-sm leading-relaxed mb-6 font-light">
              {t('footerDesc')}
            </p>
            {/* Social Icons Placeholder */}
            <div className="flex gap-4">
              <a href="#" className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors" aria-label="Twitter">
                <span className="block w-4 h-4 bg-white mask-twitter"></span>
              </a>
              <a href="#" className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors" aria-label="LinkedIn">
                <span className="block w-4 h-4 bg-white mask-linkedin"></span>
              </a>
              <a href="#" className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors" aria-label="YouTube">
                <span className="block w-4 h-4 bg-white mask-youtube"></span>
              </a>
            </div>
          </div>

          {/* Col 2: Services */}
          <div>
            <h4 className="text-white font-bold mb-6 text-lg tracking-wide">{t('footerServices')}</h4>
            <ul className="space-y-4 text-sm font-light">
              <li><a href="#" className="hover:text-white transition-colors">{t('serviceScriptTitle')}</a></li>
              <li><a href="#" className="hover:text-white transition-colors">{t('fLinkShooting')}</a></li>
              <li><a href="#" className="hover:text-white transition-colors">{t('fLinkTalent')}</a></li>
              <li><a href="#" className="hover:text-white transition-colors">{t('fLinkIncentives')}</a></li>
              <li><a href="#" className="hover:text-white transition-colors">{t('fLinkArchival')}</a></li>
            </ul>
          </div>

          {/* Col 3: Support */}
          <div>
            <h4 className="text-white font-bold mb-6 text-lg tracking-wide">{t('footerSupport')}</h4>
            <ul className="space-y-4 text-sm font-light">
              <li><a href="#" className="hover:text-white transition-colors">{t('fLinkContact')}</a></li>
              <li><a href="#" className="hover:text-white transition-colors">{t('fLinkHelp')}</a></li>
              <li><a href="#" className="hover:text-white transition-colors">{t('fLinkAccessibility')}</a></li>
              <li><a href="#" className="hover:text-white transition-colors">{t('fLinkOpenData')}</a></li>
            </ul>
          </div>

          {/* Col 4: Quick Links */}
          <div>
            <h4 className="text-white font-bold mb-6 text-lg tracking-wide">{t('footerQuickLinks')}</h4>
            <ul className="space-y-4 text-sm font-light mb-8">
              <li><a href="#" className="hover:text-white transition-colors">{t('fLinkAbout')}</a></li>
              <li><a href="#" className="hover:text-white transition-colors">{t('fLinkMedia')}</a></li>
              <li><a href="#" className="hover:text-white transition-colors">{t('fLinkCareers')}</a></li>
            </ul>
            
            <div className="bg-white/5 p-4 rounded-md">
              <h5 className="text-white font-semibold text-sm mb-2">{t('newsletterTitle')}</h5>
              <form className="flex gap-2">
                <input 
                  type="email" 
                  placeholder={t('emailPlaceholder')} 
                  className="bg-white/10 border border-white/20 rounded-md px-3 py-2 text-sm w-full focus:outline-none focus:border-white focus:ring-1 focus:ring-white text-white placeholder:text-white/50"
                  required
                />
                <button type="submit" className="bg-white text-sfc-navy px-4 py-2 rounded-md text-sm font-semibold hover:bg-gray-100 transition-colors">
                  {t('subscribe')}
                </button>
              </form>
            </div>
          </div>

        </div>

        {/* Bottom Bar */}
        <div className="border-t border-white/10 pt-8 flex flex-col md:flex-row justify-between items-center gap-4 text-sm font-light">
          <div className="flex gap-6">
            <a href="#" className="hover:text-white transition-colors">{t('privacyPolicy')}</a>
            <a href="#" className="hover:text-white transition-colors">{t('termsOfUse')}</a>
            <a href="#" className="hover:text-white transition-colors">{t('siteMap')}</a>
          </div>
          <div>
            &copy; {new Date().getFullYear()} {t('allRightsReserved')}
          </div>
        </div>

      </div>
    </footer>
  );
}
