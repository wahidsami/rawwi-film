import poster1 from '../assets/images/poster_1_1784138208975.jpg';
import poster2 from '../assets/images/poster_2_1784138220115.jpg';
import poster3 from '../assets/images/poster_3_1784138231244.jpg';
import { ArrowRight } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

export default function FilmedIn() {
  const { t } = useLanguage();
  
  const films = [
    {
      id: 1,
      title: "Sands of Time",
      director: "Ahmad Al-Mansour",
      year: "2024",
      genre: "Drama",
      description: "An emotional journey across the vast Empty Quarter, exploring heritage and modern identity.",
      image: poster1
    },
    {
      id: 2,
      title: "Echoes of AlUla",
      director: "Sarah Al-Ghamdi",
      year: "2023",
      genre: "Historical Epic",
      description: "A visually stunning recreation of ancient civilizations that once thrived in the heart of the Nabataean kingdom.",
      image: poster2
    },
    {
      id: 3,
      title: "Neon Riyadh",
      director: "Fahad Al-Saud",
      year: "2025",
      genre: "Modern Thriller",
      description: "A gripping mystery set against the backdrop of Saudi Arabia's rapidly evolving capital city.",
      image: poster3
    }
  ];

  return (
    <section className="py-32 bg-sfc-navy text-white">
      <div className="max-w-[1280px] mx-auto px-6 md:px-8">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-20 border-b border-white/20 pb-8">
          <div className="max-w-2xl">
            <h2 className="text-4xl md:text-5xl font-bold mb-6 font-serif tracking-tight">{t('filmedInTitle')}</h2>
            <p className="text-white/70 text-lg leading-relaxed font-light">
              {t('filmedInDesc')}
            </p>
          </div>
          <div>
             <a href="#" className="inline-flex items-center gap-2 text-white font-medium hover:text-sfc-peach transition-colors group">
              <span>{t('viewFullGallery')}</span>
              <ArrowRight className="w-4 h-4 rtl:rotate-180 transition-transform group-hover:translate-x-1 rtl:group-hover:-translate-x-1" />
            </a>
          </div>
        </div>

        {/* Gallery Grid */}
        <div className="grid lg:grid-cols-3 gap-12 lg:gap-8">
          {films.map((film) => (
            <div key={film.id} className="group cursor-pointer">
              {/* Poster Container */}
              <div className="relative aspect-[2/3] overflow-hidden rounded-sm mb-6 bg-sfc-navy">
                <img 
                  src={film.image} 
                  alt={film.title}
                  className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105 opacity-90 group-hover:opacity-100"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-sfc-navy/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                
                {/* Overlay Action */}
                <div className="absolute bottom-0 start-0 w-full p-6 translate-y-4 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-500">
                  <span className="inline-flex items-center gap-2 text-sm font-medium text-white">
                    <span>{t('viewDetails')}</span>
                    <ArrowRight className="w-4 h-4 rtl:rotate-180" />
                  </span>
                </div>
              </div>
              
              {/* Meta Info */}
              <div>
                <div className="flex items-center justify-between mb-3 text-xs uppercase tracking-widest text-white/50 font-semibold">
                  <span>{t(`film${film.id}Genre` as any)}</span>
                  <span>{film.year}</span>
                </div>
                <h3 className="text-2xl font-bold mb-2 tracking-tight group-hover:text-sfc-peach transition-colors">{t(`film${film.id}Title` as any)}</h3>
                <p className="text-sm font-medium text-white/70 mb-4">{t(`film${film.id}Dir` as any)}</p>
                <p className="text-white/60 text-sm leading-relaxed line-clamp-3">
                  {t(`film${film.id}Desc` as any)}
                </p>
              </div>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
}
