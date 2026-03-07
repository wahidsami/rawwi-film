import { Link } from 'react-router-dom';
import { useLangStore } from '@/store/langStore';
import { FileQuestion } from 'lucide-react';
import { cn } from '@/utils/cn';

export function NotFound() {
  const { lang } = useLangStore();

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
      <FileQuestion className="w-16 h-16 text-text-muted mb-4" />
      <h1 className="text-2xl font-bold text-text-main mb-2">
        {lang === 'ar' ? 'الصفحة غير موجودة' : 'Page not found'}
      </h1>
      <p className="text-text-muted mb-6 max-w-md">
        {lang === 'ar' ? 'الصفحة التي تبحث عنها غير موجودة أو تم نقلها.' : 'The page you are looking for does not exist or has been moved.'}
      </p>
      <Link
        to="/"
        className={cn(
          "inline-flex items-center justify-center h-10 px-4 py-2 rounded-[var(--radius)] font-medium transition-colors",
          "bg-primary text-white hover:bg-primary-hover shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
        )}
      >
        {lang === 'ar' ? 'العودة للرئيسية' : 'Back to home'}
      </Link>
    </div>
  );
}
