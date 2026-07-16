import { useState, useEffect } from 'react';
import { Search, Globe, User, Menu, X } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { Link, useLocation } from 'react-router-dom';

export default function Header() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { t, language, setLanguage } = useLanguage();
  const location = useLocation();
  const isHomePage = location.pathname === '/';

  const toggleLanguage = () => {
    setLanguage(language === 'ar' ? 'en' : 'ar');
  };

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const isHeaderSolid = isScrolled || !isHomePage;

  return (
    <header
      className={`fixed top-0 w-full z-50 transition-all duration-300 ${
        isHeaderSolid ? 'bg-white shadow-subtle py-4' : 'bg-transparent py-6'
      }`}
    >
      <div className="max-w-[1280px] mx-auto px-6 md:px-8">
        <div className="flex items-center justify-between">
          
            <Link to="/" className="flex-shrink-0 flex items-center gap-2">
              <img 
                src={isHeaderSolid ? "/colorlogo.png" : "/whitelogo.png"} 
                alt="Saudi Film Commission Logo" 
                className="h-10 md:h-12 w-auto transition-opacity" 
              />
            </Link>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center gap-8">
            <Link to="/" className={`text-sm font-medium transition-colors ${isHeaderSolid ? 'text-sfc-navy hover:text-sfc-green' : 'text-white hover:text-white/80'}`}>{t('navHome')}</Link>
            <a href="/#services" className={`text-sm font-medium transition-colors ${isHeaderSolid ? 'text-sfc-navy hover:text-sfc-green' : 'text-white hover:text-white/80'}`}>{t('navServices')}</a>
            <a href="/#filmed-in" className={`text-sm font-medium transition-colors ${isHeaderSolid ? 'text-sfc-navy hover:text-sfc-green' : 'text-white hover:text-white/80'}`}>{t('navFilmedIn')}</a>
            <a href="/#news" className={`text-sm font-medium transition-colors ${isHeaderSolid ? 'text-sfc-navy hover:text-sfc-green' : 'text-white hover:text-white/80'}`}>{t('navNews')}</a>
            <a href="/#about" className={`text-sm font-medium transition-colors ${isHeaderSolid ? 'text-sfc-navy hover:text-sfc-green' : 'text-white hover:text-white/80'}`}>{t('navAbout')}</a>
          </nav>

          {/* Action Buttons */}
          <div className="hidden lg:flex items-center gap-4">
            <button className={`p-2 rounded-full transition-colors ${isHeaderSolid ? 'text-sfc-navy hover:bg-gray-100' : 'text-white hover:bg-white/10'}`} aria-label={t('searchLabel')}>
              <Search className="w-5 h-5" />
            </button>
            <button onClick={toggleLanguage} className={`flex items-center gap-1 text-sm font-medium px-3 py-2 rounded-md transition-colors ${isHeaderSolid ? 'text-sfc-navy hover:bg-gray-100' : 'text-white hover:bg-white/10'}`}>
              <Globe className="w-4 h-4" />
              <span>{language === 'ar' ? 'EN' : 'AR'}</span>
            </button>
            <button className={`flex items-center gap-2 text-sm font-medium px-5 py-2.5 rounded-md transition-colors ${
              isHeaderSolid 
                ? 'bg-sfc-navy text-white hover:bg-sfc-navy/90' 
                : 'bg-white text-sfc-navy hover:bg-white/90'
            }`}>
              <User className="w-4 h-4" />
              <span>{t('login')}</span>
            </button>
          </div>

          {/* Mobile Menu Toggle */}
          <button 
            className={`lg:hidden p-2 rounded-md ${isHeaderSolid ? 'text-sfc-navy' : 'text-white'}`}
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle Menu"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden absolute top-full start-0 w-full bg-white shadow-lg border-t border-gray-100 py-4 px-6 flex flex-col gap-4">
          <Link to="/" onClick={() => setMobileMenuOpen(false)} className="text-sfc-navy font-medium py-2 border-b border-gray-50">{t('navHome')}</Link>
          <a href="/#services" onClick={() => setMobileMenuOpen(false)} className="text-sfc-navy font-medium py-2 border-b border-gray-50">{t('navServices')}</a>
          <a href="/#filmed-in" onClick={() => setMobileMenuOpen(false)} className="text-sfc-navy font-medium py-2 border-b border-gray-50">{t('navFilmedIn')}</a>
          <a href="/#news" onClick={() => setMobileMenuOpen(false)} className="text-sfc-navy font-medium py-2 border-b border-gray-50">{t('navNews')}</a>
          <a href="/#about" onClick={() => setMobileMenuOpen(false)} className="text-sfc-navy font-medium py-2 border-b border-gray-50">{t('navAbout')}</a>
          <div className="flex items-center gap-4 pt-2">
             <button onClick={toggleLanguage} className="flex items-center gap-2 text-sm font-medium text-sfc-navy">
              <Globe className="w-4 h-4" />
              <span>{language === 'ar' ? 'English (EN)' : 'العربية (AR)'}</span>
            </button>
            <button className="flex items-center gap-2 text-sm font-medium px-4 py-2 bg-sfc-navy text-white rounded-md w-full justify-center">
              <User className="w-4 h-4" />
              <span>{t('login')}</span>
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
