import { useLangStore } from '@/store/langStore';
import { Card, CardContent } from '@/components/ui/Card';
import { Award } from 'lucide-react';

export function Certificates() {
  const { t, lang } = useLangStore();

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-text-main">{t('certificates')}</h1>
        <p className="text-text-muted mt-1">
          {lang === 'ar' ? 'إدارة الشهادات — قريباً' : 'Certificates management — coming soon'}
        </p>
      </div>
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-4">
            <Award className="w-8 h-8 text-primary" />
          </div>
          <p className="text-text-muted">
            {lang === 'ar'
              ? 'هذا القسم قيد التطوير. ستتمكن قريباً من إدارة الشهادات من هنا.'
              : 'This section is under development. You will be able to manage certificates here soon.'}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
