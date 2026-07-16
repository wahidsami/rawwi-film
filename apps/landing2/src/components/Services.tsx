import { FileText, Clock, CheckCircle2, ArrowRight } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { Link } from 'react-router-dom';

export default function Services() {
  const { t } = useLanguage();

  return (
    <section id="services" className="py-24 bg-gov-surface-muted">
      <div className="max-w-[1280px] mx-auto px-6 md:px-8">
        
        {/* Section Header */}
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-sfc-navy mb-4">{t('servicesTitle')}</h2>
          <p className="text-gray-600 text-lg">
            {t('servicesDesc')}
          </p>
        </div>

        {/* Services Container - Centered Single Service as requested */}
        <div className="max-w-3xl mx-auto">
          
          <div className="bg-white rounded-xl shadow-subtle hover:shadow-hover transition-shadow duration-300 overflow-hidden border border-gray-100 flex flex-col md:flex-row">
            
            {/* Icon/Accent Area */}
            <div className="bg-sfc-navy p-8 flex items-center justify-center md:w-48 flex-shrink-0">
              <FileText className="w-16 h-16 text-white/90 stroke-[1.5]" />
            </div>
            
            {/* Content Area */}
            <div className="p-8 md:p-10 flex-grow flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-start mb-2">
                  <h3 className="text-2xl font-bold text-sfc-navy">{t('serviceScriptTitle')}</h3>
                  <span className="text-sm font-arabic font-semibold text-gray-500 bg-gray-100 px-3 py-1 rounded-full">{t('serviceScriptLabel')}</span>
                </div>
                
                <p className="text-gray-600 mb-6 leading-relaxed">
                  {t('serviceScriptDesc')}
                </p>
                
                <div className="flex flex-col sm:flex-row gap-6 mb-8">
                  <div className="flex items-center gap-2 text-sm text-gray-700">
                    <Clock className="w-5 h-5 text-sfc-teal" />
                    <span className="font-medium">{t('processingTimeLabel')}</span>
                    <span>{t('processingTimeValue')}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-700">
                    <CheckCircle2 className="w-5 h-5 text-sfc-green" />
                    <span className="font-medium">{t('eligibilityLabel')}</span>
                    <span>{t('eligibilityValue')}</span>
                  </div>
                </div>
              </div>
              
              <div>
                <Link to="/services/script-approval" className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-6 py-3 bg-sfc-navy text-white font-medium rounded-md hover:bg-sfc-navy/90 transition-colors focus:ring-4 focus:ring-sfc-navy/20 outline-none">
                  <span>{t('viewServiceDetails')}</span>
                  <ArrowRight className="w-4 h-4 rtl:rotate-180" />
                </Link>
              </div>
            </div>
            
          </div>
          
        </div>

      </div>
    </section>
  );
}
