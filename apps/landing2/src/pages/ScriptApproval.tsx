import { useLanguage } from '../contexts/LanguageContext';
import { Clock, CheckCircle2, Info, Mail, Phone, ArrowRight, Download, PlayCircle, LogIn, FileText, Send, Bell, ShieldCheck } from 'lucide-react';
import { useEffect } from 'react';
import scriptImg from '../assets/images/about_img_1784138196047.jpg';
import { getBeneficiaryLoginUrl } from '../lib/urls';

export default function ScriptApproval() {
  const { t } = useLanguage();
  const beneficiaryLoginUrl = getBeneficiaryLoginUrl();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <main id="main-content" className="flex-grow bg-gov-surface pt-32 pb-24">
      <div className="max-w-[1280px] mx-auto px-6 md:px-8">
        
        {/* Title Area */}
        <div className="mb-12 border-b border-gray-200 pb-8">
          <h1 className="text-4xl md:text-5xl font-bold text-sfc-navy mb-6 tracking-tight">
            {t('serviceScriptTitle')}
          </h1>
          
          <div className="flex flex-wrap items-center gap-6 text-sm text-gray-600">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-900">{t('serviceCategoryLabel')}:</span>
              <span>{t('serviceCategoryValue')}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-900">{t('processingTimeLabel2')}:</span>
              <span>{t('processingTimeValue2')}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-900">{t('availabilityLabel')}:</span>
              <span>{t('availabilityValue')}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-900">{t('audienceLabel')}:</span>
              <span>{t('audienceValue')}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-900">{t('requiredLoginLabel')}:</span>
              <span>{t('requiredLoginValue')}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-900">{t('feesLabel')}:</span>
              <span>{t('feesValue')}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-900">{t('lastUpdatedLabel')}:</span>
              <span>{t('lastUpdatedValue')}</span>
            </div>
          </div>
        </div>

        {/* Content Layout */}
        <div className="flex flex-col lg:flex-row gap-12">
          
          {/* Main Content (70%) */}
          <div className="lg:w-2/3 space-y-12">
            
            {/* Hero Image */}
            <div className="rounded-xl overflow-hidden shadow-subtle border border-gray-100 h-80 relative">
              <img src={scriptImg} alt="" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-sfc-navy/20 mix-blend-multiply"></div>
            </div>

            {/* Service Description */}
            <section className="bg-white p-8 rounded-xl shadow-subtle border border-gray-100">
              <h2 className="text-2xl font-bold text-sfc-navy mb-6">{t('serviceDescTitle')}</h2>
              <div className="space-y-4 text-gray-700 leading-relaxed text-lg font-light">
                <p>{t('serviceDescText1')}</p>
                <p>{t('serviceDescText2')}</p>
              </div>
            </section>

            {/* Workflow Timeline */}
            <section className="bg-white p-8 rounded-xl shadow-subtle border border-gray-100">
              <h2 className="text-2xl font-bold text-sfc-navy mb-8">{t('workflowTitle')}</h2>
              
              <div className="relative border-s-2 border-gray-100 ms-4 space-y-8 pb-4">
                
                <div className="relative ps-8">
                  <div className="absolute -start-[17px] top-1 bg-sfc-green text-white w-8 h-8 rounded-full flex items-center justify-center shadow-sm">
                    1
                  </div>
                  <h3 className="text-xl font-bold text-sfc-navy mb-2">{t('step1Title')}</h3>
                  <p className="text-gray-600">{t('step1Desc')}</p>
                </div>

                <div className="relative ps-8">
                  <div className="absolute -start-[17px] top-1 bg-white border-2 border-sfc-green text-sfc-green w-8 h-8 rounded-full flex items-center justify-center shadow-sm">
                    2
                  </div>
                  <h3 className="text-xl font-bold text-sfc-navy mb-2">{t('step2Title')}</h3>
                  <p className="text-gray-600">{t('step2Desc')}</p>
                </div>

                <div className="relative ps-8">
                  <div className="absolute -start-[17px] top-1 bg-white border-2 border-sfc-green text-sfc-green w-8 h-8 rounded-full flex items-center justify-center shadow-sm">
                    3
                  </div>
                  <h3 className="text-xl font-bold text-sfc-navy mb-2">{t('step3Title')}</h3>
                  <p className="text-gray-600">{t('step3Desc')}</p>
                </div>

                <div className="relative ps-8">
                  <div className="absolute -start-[17px] top-1 bg-white border-2 border-sfc-green text-sfc-green w-8 h-8 rounded-full flex items-center justify-center shadow-sm">
                    4
                  </div>
                  <h3 className="text-xl font-bold text-sfc-navy mb-2">{t('step4Title')}</h3>
                  <p className="text-gray-600">{t('step4Desc')}</p>
                </div>

                <div className="relative ps-8">
                  <div className="absolute -start-[17px] top-1 bg-white border-2 border-sfc-green text-sfc-green w-8 h-8 rounded-full flex items-center justify-center shadow-sm">
                    5
                  </div>
                  <h3 className="text-xl font-bold text-sfc-navy mb-2">{t('step5Title')}</h3>
                  <p className="text-gray-600">{t('step5Desc')}</p>
                </div>

                <div className="relative ps-8">
                  <div className="absolute -start-[17px] top-1 bg-white border-2 border-sfc-green text-sfc-green w-8 h-8 rounded-full flex items-center justify-center shadow-sm">
                    6
                  </div>
                  <h3 className="text-xl font-bold text-sfc-navy mb-2">{t('step6Title')}</h3>
                  <p className="text-gray-600">{t('step6Desc')}</p>
                </div>
                
                <div className="relative ps-8">
                  <div className="absolute -start-[17px] top-1 bg-white border-2 border-sfc-green text-sfc-green w-8 h-8 rounded-full flex items-center justify-center shadow-sm">
                    7
                  </div>
                  <h3 className="text-xl font-bold text-sfc-navy mb-2">{t('step7Title')}</h3>
                  <p className="text-gray-600">{t('step7Desc')}</p>
                </div>

                <div className="relative ps-8">
                  <div className="absolute -start-[17px] top-1 bg-white border-2 border-sfc-green text-sfc-green w-8 h-8 rounded-full flex items-center justify-center shadow-sm">
                    8
                  </div>
                  <h3 className="text-xl font-bold text-sfc-navy mb-2">{t('step8Title')}</h3>
                  <p className="text-gray-600">{t('step8Desc')}</p>
                </div>

                <div className="relative ps-8">
                  <div className="absolute -start-[17px] top-1 bg-sfc-navy text-white w-8 h-8 rounded-full flex items-center justify-center shadow-sm">
                    9
                  </div>
                  <h3 className="text-xl font-bold text-sfc-navy mb-2">{t('step9Title')}</h3>
                  <p className="text-gray-600">{t('step9Desc')}</p>
                </div>

              </div>
            </section>

            {/* Required Documents */}
            <section className="bg-white p-8 rounded-xl shadow-subtle border border-gray-100">
              <h2 className="text-2xl font-bold text-sfc-navy mb-6">{t('documentsTitle')}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-start gap-4 p-4 rounded-lg bg-gray-50 border border-gray-100">
                  <FileText className="w-6 h-6 text-sfc-navy flex-shrink-0 mt-0.5" />
                  <span className="font-medium text-gray-800">{t('doc1')}</span>
                </div>
                <div className="flex items-start gap-4 p-4 rounded-lg bg-gray-50 border border-gray-100">
                  <FileText className="w-6 h-6 text-sfc-navy flex-shrink-0 mt-0.5" />
                  <span className="font-medium text-gray-800">{t('doc2')}</span>
                </div>
                <div className="flex items-start gap-4 p-4 rounded-lg bg-gray-50 border border-gray-100">
                  <FileText className="w-6 h-6 text-sfc-navy flex-shrink-0 mt-0.5" />
                  <span className="font-medium text-gray-800">{t('doc3')}</span>
                </div>
                <div className="flex items-start gap-4 p-4 rounded-lg bg-gray-50 border border-gray-100">
                  <FileText className="w-6 h-6 text-sfc-navy flex-shrink-0 mt-0.5" />
                  <span className="font-medium text-gray-800">{t('doc4')}</span>
                </div>
              </div>
            </section>

            {/* Service Requirements */}
            <section className="bg-white p-8 rounded-xl shadow-subtle border border-gray-100">
              <h2 className="text-2xl font-bold text-sfc-navy mb-6">{t('requirementsTitle')}</h2>
              <ul className="space-y-4">
                <li className="flex items-start gap-3 text-gray-700">
                  <CheckCircle2 className="w-5 h-5 text-sfc-green flex-shrink-0 mt-0.5" />
                  <span>{t('req1')}</span>
                </li>
                <li className="flex items-start gap-3 text-gray-700">
                  <CheckCircle2 className="w-5 h-5 text-sfc-green flex-shrink-0 mt-0.5" />
                  <span>{t('req2')}</span>
                </li>
                <li className="flex items-start gap-3 text-gray-700">
                  <CheckCircle2 className="w-5 h-5 text-sfc-green flex-shrink-0 mt-0.5" />
                  <span>{t('req3')}</span>
                </li>
                <li className="flex items-start gap-3 text-gray-700">
                  <CheckCircle2 className="w-5 h-5 text-sfc-green flex-shrink-0 mt-0.5" />
                  <span>{t('req4')}</span>
                </li>
              </ul>
            </section>

            {/* Expected Results */}
            <section className="bg-white p-8 rounded-xl shadow-subtle border border-gray-100">
              <h2 className="text-2xl font-bold text-sfc-navy mb-6">{t('expectedResultsTitle')}</h2>
              <div className="bg-sfc-green/10 border border-sfc-green/20 rounded-lg p-6 flex flex-col gap-3">
                 <div className="flex items-start gap-3">
                    <ShieldCheck className="w-5 h-5 text-sfc-green flex-shrink-0 mt-0.5" />
                    <span className="text-gray-800 font-medium">{t('res1')}</span>
                 </div>
                 <div className="flex items-start gap-3">
                    <Info className="w-5 h-5 text-sfc-navy flex-shrink-0 mt-0.5" />
                    <span className="text-gray-700">{t('res2')}</span>
                 </div>
                 <div className="flex items-start gap-3">
                    <Info className="w-5 h-5 text-sfc-orange flex-shrink-0 mt-0.5" />
                    <span className="text-gray-700">{t('res3')}</span>
                 </div>
              </div>
            </section>

          </div>

          {/* Left Sidebar (Service Info) (30%) */}
          <div className="lg:w-1/3">
            <div className="sticky top-32 space-y-6">
              
              {/* Action Card */}
              <div className="bg-white p-6 rounded-xl shadow-subtle border border-gray-100">
                <a href={beneficiaryLoginUrl} className="w-full flex items-center justify-center gap-2 bg-sfc-green text-white font-bold py-4 px-6 rounded-lg hover:bg-sfc-green/90 transition-colors focus:ring-4 focus:ring-sfc-green/20 outline-none mb-6 text-lg">
                  <span>{t('startService')}</span>
                  <ArrowRight className="w-5 h-5 rtl:rotate-180" />
                </a>
                
                <div className="space-y-4">
                  <div className="flex items-center justify-between pb-4 border-b border-gray-100">
                    <span className="text-gray-600 font-medium">{t('serviceStatusLabel')}</span>
                    <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-sm font-semibold">{t('serviceStatusValue')}</span>
                  </div>
                  <div className="flex items-center justify-between pb-4 border-b border-gray-100">
                    <span className="text-gray-600 font-medium">{t('processingTimeLabel2')}</span>
                    <span className="text-gray-900 font-medium text-end">{t('processingTimeValue2')}</span>
                  </div>
                  <div className="flex items-center justify-between pb-4 border-b border-gray-100">
                    <span className="text-gray-600 font-medium">{t('feesLabel')}</span>
                    <span className="text-gray-900 font-medium text-end">{t('feesValue')}</span>
                  </div>
                  <div className="flex items-center justify-between pb-4 border-b border-gray-100">
                    <span className="text-gray-600 font-medium">{t('audienceLabel')}</span>
                    <span className="text-gray-900 font-medium text-end">{t('audienceValue')}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600 font-medium">{t('languagesLabel')}</span>
                    <span className="text-gray-900 font-medium text-end">{t('languagesValue')}</span>
                  </div>
                </div>
              </div>

              {/* Support Card */}
              <div className="bg-white p-6 rounded-xl shadow-subtle border border-gray-100">
                <h3 className="text-lg font-bold text-sfc-navy mb-4">{t('supportLabel')}</h3>
                <div className="space-y-4">
                  <a href={`mailto:${t('supportEmail')}`} className="flex items-center gap-3 text-gray-700 hover:text-sfc-green transition-colors">
                    <Mail className="w-5 h-5 text-gray-400" />
                    <span className="font-medium" dir="ltr">{t('supportEmail')}</span>
                  </a>
                  <a href={`tel:${t('supportPhone')}`} className="flex items-center gap-3 text-gray-700 hover:text-sfc-green transition-colors">
                    <Phone className="w-5 h-5 text-gray-400" />
                    <span className="font-medium" dir="ltr">{t('supportPhone')}</span>
                  </a>
                  <a href="#" className="flex items-center gap-3 text-sfc-navy font-semibold hover:text-sfc-green transition-colors pt-2">
                    <Info className="w-5 h-5" />
                    <span>{t('faqLabel')}</span>
                  </a>
                </div>
              </div>

              {/* Related Services */}
              <div className="bg-white p-6 rounded-xl shadow-subtle border border-gray-100">
                <h3 className="text-lg font-bold text-sfc-navy mb-4">{t('relatedServicesLabel')}</h3>
                <p className="text-gray-500 text-sm">{t('noRelatedServices')}</p>
              </div>

            </div>
          </div>

        </div>
      </div>
    </main>
  );
}
