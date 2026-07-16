import news1 from '../assets/images/news_1_1784138243707.jpg';
import news2 from '../assets/images/news_2_1784138256413.jpg';
import { ArrowRight, Calendar } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

export default function News() {
  const { t } = useLanguage();

  const newsItems = [
    {
      id: 1,
      image: news1,
      date: "Oct 24, 2024",
      category: "Official Announcement",
      title: "Film Commission Launches New Global Production Incentive Program",
      summary: "A comprehensive new initiative aimed at attracting major international film and television productions to Saudi Arabia with competitive financial rebates."
    },
    {
      id: 2,
      image: news2,
      date: "Nov 02, 2024",
      category: "Industry Events",
      title: "Saudi Cinema Shines at the Red Sea International Film Festival",
      summary: "Local filmmakers receive top honors as the Saudi Film Commission showcases the Kingdom's rapid growth in cinematic storytelling and production capabilities."
    }
  ];

  return (
    <section className="py-24 bg-white">
      <div className="max-w-[1280px] mx-auto px-6 md:px-8">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 mb-12">
          <div>
            <h2 className="text-3xl md:text-4xl font-bold text-sfc-navy mb-4">{t('newsTitle')}</h2>
            <p className="text-gray-600 text-lg">{t('newsDesc')}</p>
          </div>
          <a href="#" className="inline-flex items-center gap-2 text-sfc-green font-semibold hover:text-sfc-navy transition-colors group">
            <span>{t('viewAllNews')}</span>
            <ArrowRight className="w-4 h-4 rtl:rotate-180 transition-transform group-hover:translate-x-1 rtl:group-hover:-translate-x-1" />
          </a>
        </div>

        {/* News Grid */}
        <div className="grid md:grid-cols-2 gap-8 lg:gap-12">
          {newsItems.map((item) => (
            <article key={item.id} className="group flex flex-col border border-gray-100 rounded-lg overflow-hidden hover:shadow-hover transition-shadow duration-300 bg-white">
              
              {/* Image */}
              <div className="relative aspect-[16/9] overflow-hidden bg-gray-100">
                <img 
                  src={item.image} 
                  alt="" 
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                />
                <div className="absolute top-4 start-4 bg-sfc-navy text-white text-xs font-semibold px-3 py-1.5 rounded-sm uppercase tracking-wide">
                  {t(`news${item.id}Category` as any)}
                </div>
              </div>
              
              {/* Content */}
              <div className="p-6 md:p-8 flex flex-col flex-grow">
                <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
                  <Calendar className="w-4 h-4" />
                  <time>{item.date}</time>
                </div>
                
                <h3 className="text-xl md:text-2xl font-bold text-sfc-navy mb-4 leading-snug group-hover:text-sfc-green transition-colors">
                  <a href="#" className="focus:outline-none">
                    {/* Expand link target to fill article */}
                    <span className="absolute inset-0 z-10" aria-hidden="true"></span>
                    {t(`news${item.id}Title` as any)}
                  </a>
                </h3>
                
                <p className="text-gray-600 leading-relaxed mb-6 flex-grow">
                  {t(`news${item.id}Desc` as any)}
                </p>
                
                <div className="inline-flex items-center gap-2 text-sfc-navy font-semibold text-sm group-hover:text-sfc-green transition-colors mt-auto">
                  <span>{t('readFullArticle')}</span>
                  <ArrowRight className="w-4 h-4 rtl:rotate-180" />
                </div>
              </div>

            </article>
          ))}
        </div>

      </div>
    </section>
  );
}
