import aboutImage from '../assets/images/about_img_1784138196047.jpg';
import { ArrowRight } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

export default function About() {
  const { t } = useLanguage();

  return (
    <section id="about" className="py-24 bg-gov-surface">
      <div className="max-w-[1280px] mx-auto px-6 md:px-8">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          
          {/* Image */}
          <div className="relative rounded-lg overflow-hidden shadow-subtle group">
            <div className="aspect-[4/3] w-full">
              <img 
                src={aboutImage} 
                alt="Saudi Film Director on set" 
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
              />
            </div>
            <div className="absolute inset-0 ring-1 ring-inset ring-black/10 rounded-lg"></div>
          </div>

          {/* Content */}
          <div>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-1 bg-sfc-green rounded-full"></div>
              <h2 className="text-sfc-green font-semibold tracking-wide uppercase text-sm">{t('aboutLabel')}</h2>
            </div>
            
            <h3 className="text-3xl md:text-4xl font-bold text-sfc-navy mb-6 leading-tight">
              {t('aboutTitle')}
            </h3>
            
            <p className="text-gray-600 mb-10 text-lg leading-relaxed">
              {t('aboutDesc')}
            </p>

            <div className="space-y-8 mb-10">
              <div className="flex gap-4">
                <div className="w-1.5 h-auto bg-sfc-orange rounded-full flex-shrink-0"></div>
                <div>
                  <h4 className="text-xl font-bold text-sfc-navy mb-2">{t('missionTitle')}</h4>
                  <p className="text-gray-600 leading-relaxed">{t('missionDesc')}</p>
                </div>
              </div>
              
              <div className="flex gap-4">
                <div className="w-1.5 h-auto bg-sfc-teal rounded-full flex-shrink-0"></div>
                <div>
                  <h4 className="text-xl font-bold text-sfc-navy mb-2">{t('visionTitle')}</h4>
                  <p className="text-gray-600 leading-relaxed">{t('visionDesc')}</p>
                </div>
              </div>
            </div>

            <a href="#" className="inline-flex items-center gap-2 text-sfc-green font-semibold hover:text-sfc-navy transition-colors group">
              <span>{t('learnMoreAboutUs')}</span>
              <ArrowRight className="w-4 h-4 rtl:rotate-180 transition-transform group-hover:translate-x-1 rtl:group-hover:-translate-x-1" />
            </a>
          </div>

        </div>
      </div>
    </section>
  );
}
