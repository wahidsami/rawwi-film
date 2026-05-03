import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowUpRight,
  Award,
  BellRing,
  Building2,
  CreditCard,
  Clock3,
  Eye,
  FileCheck2,
  FolderKanban,
  Pencil,
  Search,
  Settings2,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { FileUpload } from '@/components/ui/FileUpload';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { ClientPortalLayout, type ClientPortalSection } from '@/components/client-portal/ClientPortalLayout';
import { ClientCertificatesSection } from '@/components/client-portal/ClientCertificatesSection';
import {
  certificatesApi,
  clientPortalApi,
  notificationsApi,
  scriptsApi,
  type ClientCertificatesResponse,
  type ClientPortalMeResponse,
  type ClientPortalSubmissionItem,
  type ClientPortalRejectionDetailsResponse,
  type NotificationItem,
} from '@/api';
import { useAuthStore } from '@/store/authStore';
import { useLangStore } from '@/store/langStore';
import type { Script } from '@/api/models';
import { supabase } from '@/lib/supabaseClient';
import { API_BASE_URL } from '@/lib/env';
import { downloadAnalysisPdf } from '@/components/reports/analysis/download';
import { extractDocxWithPages } from '@/utils/documentExtract';
import { PDF_EXTRACTION_INTERVAL_MS, PDF_EXTRACTION_TIMEOUT_MS, waitForVersionExtraction } from '@/utils/waitForVersionExtraction';
import {
  buildScriptClassificationSelectOptions,
  LEGACY_SCRIPT_CLASSIFICATION_OPTIONS,
  useScriptClassificationOptions,
} from '@/lib/scriptClassificationOptions';
import { cn } from '@/utils/cn';

type UploadResult = {
  success: boolean;
  fileUrl: string;
  path: string;
  fileName: string;
  fileSize: number;
  versionId: string | null;
  versionNumber: number | null;
};

type ComplianceTabKey = 'guidelines' | 'age';

function statusLabel(status: string, lang: 'ar' | 'en'): string {
  const key = status.toLowerCase();
  if (key === 'approved') return lang === 'ar' ? 'مقبول' : 'Approved';
  if (key === 'rejected') return lang === 'ar' ? 'مرفوض' : 'Rejected';
  if (key === 'analysis_running') return lang === 'ar' ? 'التحليل جارٍ' : 'Analysis Running';
  if (key === 'review_required') return lang === 'ar' ? 'بحاجة لمراجعة' : 'Needs Review';
  if (key === 'in_review') return lang === 'ar' ? 'قيد المراجعة' : 'In Review';
  if (key === 'draft') return lang === 'ar' ? 'مسودة' : 'Draft';
  return status;
}

function statusVariant(status: string): 'default' | 'success' | 'warning' | 'error' | 'outline' {
  const key = status.toLowerCase();
  if (key === 'approved') return 'success';
  if (key === 'rejected') return 'error';
  if (key === 'analysis_running' || key === 'review_required' || key === 'in_review') return 'warning';
  return 'outline';
}

function formatSubscriptionLabel(
  subscription: ClientPortalMeResponse['subscription'] | null | undefined,
  lang: 'ar' | 'en',
): string {
  if (!subscription) return '';
  const plan = subscription.plan === 'free' ? (lang === 'ar' ? 'الخطة المجانية' : 'Free plan') : subscription.plan;
  const status = subscription.status === 'active' ? (lang === 'ar' ? 'نشط' : 'Active') : (lang === 'ar' ? 'غير نشط' : 'Inactive');
  return `${plan} • ${status}`;
}

type NotificationFilter = 'all' | 'unread' | 'read';

function notificationTypeLabel(type: string, lang: 'ar' | 'en'): string {
  const key = type.toLowerCase();
  if (key.includes('payment')) return lang === 'ar' ? 'دفع' : 'Payment';
  if (key.includes('certificate')) return lang === 'ar' ? 'شهادة' : 'Certificate';
  if (key.includes('review')) return lang === 'ar' ? 'مراجعة' : 'Review';
  if (key.includes('report')) return lang === 'ar' ? 'تقرير' : 'Report';
  if (key.includes('script')) return lang === 'ar' ? 'نص' : 'Script';
  if (key.includes('system')) return lang === 'ar' ? 'نظام' : 'System';
  return lang === 'ar' ? 'تنبيه' : 'Alert';
}

function formatNotificationDate(value: string, lang: 'ar' | 'en'): string {
  const date = new Date(value);
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function ComplianceGuidelinesSection({ lang }: { lang: 'ar' | 'en' }) {
  const isArabic = lang === 'ar';
  const [activeTab, setActiveTab] = useState<ComplianceTabKey>('guidelines');

  const ageRatings = useMemo(() => [
    {
      code: 'G',
      labelAr: 'الفيلم مناسب لجميع الفئات العمرية',
      labelEn: 'Suitable for all ages',
      summaryAr: 'المحتوى ضمن إطار إيجابي وخالٍ من تأثيرات العنف أو التهديد.',
      summaryEn: 'Positive content with no violence or threatening impact.',
      detailsAr: 'يتضمن بشكل أساسي الأفلام الكرتونية.',
      detailsEn: 'Primarily includes animated films.',
    },
    {
      code: 'PG',
      labelAr: 'يُنصح بوجود إشراف عائلي',
      labelEn: 'Parental guidance recommended',
      summaryAr: 'المحتوى بشكل عام آمن.',
      summaryEn: 'Content is generally safe.',
      detailsAr: 'قد يحتوي على القليل من العنف أو الحزن أو الخيال. ويُعرض في سياق مناسب للأطفال.',
      detailsEn: 'May contain mild violence, sadness, or fantasy, presented in a child-appropriate context.',
    },
    {
      code: 'PG12',
      labelAr: 'يلزم مرافقة الراشدين لمن هم تحت 12 عامًا',
      labelEn: 'Adult accompaniment required for under 12',
      summaryAr: 'المحتوى بشكل عام آمن.',
      summaryEn: 'Content is generally safe.',
      detailsAr: 'تتضمن هذه الفئة أفلام الخيال العلمي والأبطال الخارقين والأفلام المأخوذة من الكتب الكوميدية. وقد تحتوي على بعض المشاهد التي قد لا تناسب من هم تحت 12 عامًا، ويُنصح أن يقوم الراشدون بتقييم مدى ملاءمة المحتوى.',
      detailsEn: 'Includes sci-fi, superhero, and comic-book adaptations. Some scenes may not suit viewers under 12; adults should assess suitability.',
    },
    {
      code: 'PG15',
      labelAr: 'يلزم مرافقة الراشدين لمن هم تحت 15 عامًا',
      labelEn: 'Adult accompaniment required for under 15',
      summaryAr: 'مواضيع الأفلام مناسبة لعمر 15 سنة فما فوق.',
      summaryEn: 'Themes are suitable for ages 15 and above.',
      detailsAr: 'يُسمح بدخول من هم أصغر بشرط وجود راشدين. وقد تتضمن مشاهد غير مناسبة لبعض الفئات مثل أفلام الأكشن والأبطال الخارقين والخيال العلمي والكوارث الطبيعية والرومانسية بحبكة بسيطة وأفلام الحروب البسيطة.',
      detailsEn: 'Younger viewers may enter with adults. May include action, superheroes, sci-fi, natural disasters, light romance, and mild war themes.',
    },
    {
      code: 'R15',
      labelAr: 'يمنع دخول المشاهدين أقل من 15 عامًا',
      labelEn: 'No viewers under 15',
      summaryAr: 'المحتوى يتضمن مواضيع ناضجة.',
      summaryEn: 'Contains mature themes.',
      detailsAr: 'تُطرح بشكل غير مناسب لمن هم في هذا العمر وما دونه، وتشمل أمثلة مثل الحروب والجريمة والعصابات والرومانسية والرعب والعنف.',
      detailsEn: 'Not suitable for viewers at or below this age. Examples include war, crime, romance, horror, and violence.',
    },
    {
      code: 'R18',
      labelAr: 'يمنع دخول المشاهدين أقل من 18 عامًا',
      labelEn: 'No viewers under 18',
      summaryAr: 'المحتوى يتضمن مواضيع حساسة.',
      summaryEn: 'Contains sensitive themes.',
      detailsAr: 'قد يحتوي على مشاهد عنيفة للغاية أو العنف المنزلي أو مواضيع سياسية.',
      detailsEn: 'May include extreme violence, domestic violence, or political themes.',
    },
  ], [isArabic]);

  const violations = useMemo(() => [
    {
      number: 1,
      titleAr: 'المساس بالثوابت الدينية',
      titleEn: 'Religious fundamentals',
      bodyAr: 'يشمل هذا النوع من المخالفات أي محتوى يتضمن إساءة أو تشويه أو سخرية أو تشكيك في أصول الشريعة الإسلامية، بما في ذلك القرآن الكريم والأحاديث النبوية المتواترة والشعائر الأساسية. ويمكن أن يظهر ذلك في الحوارات أو المشاهد أو حتى من خلال السخرية أو التلميح أو الرمزية. ومن أبرز مؤشرات هذا النوع من الانتهاك استخدام عبارات استهزاء بالدين، أو ربطه بسلوكيات سلبية بشكل تهكمي، أو تصوير شخصيات دينية بصورة مهينة، أو إعادة تفسير النصوص الدينية بطريقة ساخرة أو محرفة.',
      examplesAr: 'ومن الأمثلة على ذلك مشاهد تسخر من الصلاة أو الأذان، أو تصوير شخصية دينية كمخادعة أو جاهلة، أو حوارات تشكك في النصوص الدينية بأسلوب استهزائي، أو استخدام آيات وأحاديث في سياق كوميدي غير لائق.',
    },
    {
      number: 2,
      titleAr: 'المساس بالقيادة السياسية',
      titleEn: 'Political leadership',
      bodyAr: 'يتعلق هذا البند بأي محتوى يتضمن إساءة مباشرة أو غير مباشرة لرموز الدولة، مثل الملوك أو ولاة العهد أو القيادات العليا. وقد يظهر ذلك من خلال ذكر هذه الشخصيات أو الإشارة إليها بسياق سلبي، أو عبر تلميحات سياسية ساخرة، أو إسقاطات درامية واضحة تستهدف القيادة.',
      examplesAr: 'تشمل الأمثلة الحوارات التي تسخر من القيادة، أو تقديم شخصيات تمثلها بصورة فاسدة أو ضعيفة، أو مشاهد تدعو إلى التمرد عليها.',
    },
    {
      number: 3,
      titleAr: 'الإضرار بالأمن الوطني',
      titleEn: 'National security',
      bodyAr: 'يشمل هذا النوع من المحتوى كل ما يمكن أن يهدد استقرار الدولة أو يشجع على سلوكيات تمس الأمن العام. ويظهر ذلك عادة من خلال استخدام كلمات أو دعوات صريحة مثل التمرد أو العصيان أو إسقاط النظام، أو تقديم تعليمات عملية يمكن تنفيذها، أو تمجيد الفوضى والجرائم.',
      examplesAr: 'ومن أبرز الأمثلة شرح كيفية تصنيع المتفجرات، أو الدعوة للإضرابات والعصيان المدني، أو تصوير رجال الأمن كأعداء للمجتمع، أو التقليل من خطورة الإرهاب والعنف.',
    },
    {
      number: 4,
      titleAr: 'المحتوى التاريخي غير الموثوق',
      titleEn: 'Unreliable historical content',
      bodyAr: 'يتعلق هذا البند بالمحتوى الذي يعرض معلومات تاريخية عن المملكة أو الشخصيات الإسلامية دون الاعتماد على مصادر موثوقة ومعتمدة. ويظهر ذلك من خلال تقديم روايات تختلف بشكل واضح عن الحقائق المعروفة، أو عرض معلومات دون سند، أو تحريف الأحداث التاريخية.',
      examplesAr: 'ومن الأمثلة تغيير أحداث تاريخية معروفة، أو اختلاق مواقف لشخصيات تاريخية، أو تقديم روايات بديلة دون توضيح أنها خيالية.',
    },
    {
      number: 5,
      titleAr: 'الإساءة للمجتمع أو الهوية الوطنية',
      titleEn: 'Community or national identity',
      bodyAr: 'يشمل هذا النوع من المخالفات أي محتوى يتضمن تعميمات سلبية أو تشويهًا لصورة المجتمع السعودي أو مكوناته. وغالبًا ما يظهر ذلك من خلال استخدام ألفاظ تعميمية مثل "دائمًا" أو "كل"، أو ربط المجتمع بصفات سلبية جماعية، أو الإساءة لقبائل أو عوائل.',
      examplesAr: 'ومن الأمثلة على ذلك وصف السعوديين بصفات سلبية عامة، أو تصوير قبيلة كاملة بصورة إجرامية، أو نسب ثقافات غير سعودية إلى المجتمع، أو الترويج لقطع صلة الرحم.',
    },
    {
      number: 6,
      titleAr: 'محتوى الجرائم الموجه للأطفال',
      titleEn: 'Crime content for children',
      bodyAr: 'يتعلق هذا البند بالمحتوى الموجه للأطفال الذي يعرض الجرائم أو السلوكيات الخطرة بطريقة إيجابية أو محفزة. ويظهر ذلك عندما يتم تقديم شخصية محبوبة ترتكب جرائم دون عواقب، أو استخدام عناصر إخراجية تجعل الجريمة تبدو ممتعة، أو غياب أي نتائج سلبية للسلوك.',
      examplesAr: 'ومن الأمثلة طفل يتابع شخصية تسرق وتنجح، أو تقديم العصابات كأبطال، أو تصوير تعاطي المخدرات بشكل ممتع.',
    },
    {
      number: 7,
      titleAr: 'الترويج للمخدرات والمسكرات',
      titleEn: 'Drugs and alcohol promotion',
      bodyAr: 'يشمل هذا النوع من المحتوى أي عرض يقوم بتعليم أو تشجيع استخدام أو تصنيع المخدرات أو الكحول. ويظهر ذلك من خلال شرح خطوات التصنيع، أو ربط هذه المواد بالمتعة أو النجاح أو حل المشكلات.',
      examplesAr: 'ومن الأمثلة تقديم طريقة تصنيع مخدر، أو تصوير المخدرات كوسيلة للتخلص من المشاكل، أو إظهار شخصية ناجحة بسبب تعاطيها.',
    },
    {
      number: 8,
      titleAr: 'إيذاء الطفل وذوي الإعاقة',
      titleEn: 'Harm to children and persons with disabilities',
      bodyAr: 'يتضمن هذا البند أي محتوى يحتوي على إيذاء أو استغلال أو سخرية من الأطفال أو ذوي الإعاقة. وقد يظهر ذلك من خلال مشاهد عنف غير مبرر، أو استخدام ألفاظ مهينة، أو تقديم هذه الفئات كوسيلة للضحك.',
      examplesAr: 'ومن الأمثلة التنمر على طفل أو شخص من ذوي الإعاقة، أو مشاهد تعذيب، أو السخرية من الإعاقة بشكل مباشر أو ضمني.',
    },
    {
      number: 9,
      titleAr: 'المحتوى الجنسي غير المناسب',
      titleEn: 'Inappropriate sexual content',
      bodyAr: 'يشمل هذا البند أي محتوى يروج أو يلمّح لسلوكيات جنسية غير مناسبة للجمهور العام، خاصة إذا تم تقديمها بشكل إيجابي. ويظهر ذلك من خلال التلميحات الجنسية أو الحوارات الإيحائية أو تطبيع هذه السلوكيات.',
      examplesAr: 'ومن الأمثلة الحوارات ذات الطابع الجنسي الصريح أو غير المباشر، أو الترويج لعلاقات غير مناسبة للقاصرين.',
    },
    {
      number: 10,
      titleAr: 'المشاهد الجنسية الصريحة',
      titleEn: 'Explicit sexual scenes',
      bodyAr: 'يتعلق هذا البند بعرض مباشر للممارسات الجنسية، سواء من خلال مشاهد جسدية واضحة أو تصوير تفصيلي للعلاقات. ويُعد هذا النوع من المحتوى من أكثر أنواع المخالفات وضوحًا نظرًا لطبيعته المباشرة.',
      examplesAr: 'ويشمل ذلك اللقطات أو المشاهد التي تعرض العلاقة الحميمة بصورة واضحة أو مفصلة.',
    },
    {
      number: 11,
      titleAr: 'الألفاظ النابية',
      titleEn: 'Profanity',
      bodyAr: 'يشمل هذا البند استخدام الكلمات المسيئة أو الخادشة، سواء كانت مباشرة أو ضمنية. وتظهر المخالفة من خلال استخدام الشتائم أو الألفاظ ذات الطابع الجنسي أو المهين، خاصة إذا تكرر استخدامها أو كان لها تأثير سلبي واضح على سياق العمل.',
      examplesAr: 'ومن الأمثلة الشتائم المباشرة أو الإيحاءات اللفظية المهينة أو الألفاظ الجنسية الفجة.',
    },
    {
      number: 12,
      titleAr: 'الإساءة إلى المرأة أو تعنيفها',
      titleEn: 'Abuse or violence against women',
      bodyAr: 'يتضمن هذا النوع من المحتوى أي إساءة للمرأة أو تقليل من شأنها أو تبرير أو تجميل العنف ضدها، سواء كان ذلك جسديًا أو نفسيًا أو اجتماعيًا. وقد يظهر في الحوارات أو السلوكيات داخل المشاهد أو الرسائل الضمنية أو حتى في الكوميديا.',
      examplesAr: 'ومن المؤشرات تبرير إيذاء المرأة، أو تصويرها كأقل قيمة بشكل متكرر، أو استخدام ألفاظ مهينة، أو عرض العنف ضدها دون إدانة.',
    },
    {
      number: 13,
      titleAr: 'تقويض قيم الأسرة',
      titleEn: 'Undermining family values',
      bodyAr: 'يشمل هذا البند أي محتوى يروج لتفكك الأسرة أو يضعف الروابط الأسرية دون طرح متوازن أو نقدي. ويظهر ذلك من خلال تشجيع القطيعة بين أفراد الأسرة، أو تصوير الأسرة ككيان سلبي بالكامل، أو الترويج لسلوكيات تهدم العلاقات.',
      examplesAr: 'ومن الأمثلة الدعوة لقطع العلاقة مع الوالدين دون مبرر، أو تقديم الخيانة الزوجية بشكل طبيعي، أو التقليل من أهمية الأسرة بشكل متكرر.',
    },
    {
      number: 14,
      titleAr: 'الإساءة إلى الوالدين',
      titleEn: 'Disrespect to parents',
      bodyAr: 'يتعلق هذا البند بأي محتوى يتضمن إهانة أو تحقير أو إساءة مباشرة أو غير مباشرة للأب أو الأم. ويظهر ذلك من خلال استخدام ألفاظ مهينة، أو تقديم سلوكيات عقوق بشكل طبيعي، أو التقليل من مكانة الوالدين.',
      examplesAr: 'ومن الأمثلة حوارات تتضمن سب الوالدين، أو مشاهد اعتداء عليهم، أو تقديمهم كشخصيات مثيرة للسخرية بشكل متكرر.',
    },
    {
      number: 15,
      titleAr: 'الإساءة إلى كبار السن',
      titleEn: 'Disrespect to the elderly',
      bodyAr: 'يشمل هذا النوع من المحتوى أي إساءة أو تهميش أو سخرية من كبار السن، سواء من خلال تصويرهم كعبء أو بلا قيمة، أو السخرية من حالتهم الصحية أو أعمارهم، أو تجاهل حقوقهم.',
      examplesAr: 'ومن الأمثلة مشاهد تسخر من شخص مسن، أو تقديم كبار السن كشخصيات غير مهمة، أو استغلالهم أو إهمالهم دون إدانة.',
    },
    {
      number: 16,
      titleAr: 'التنمر الجارح والسخرية',
      titleEn: 'Bullying and mockery',
      bodyAr: 'يشمل هذا البند أي محتوى يتضمن إساءة متكررة أو مقصودة لشخص أو فئة من خلال السخرية أو الإهانة أو التقليل من القيمة، سواء بشكل مباشر أو غير مباشر. ويظهر ذلك في الحوارات أو الكوميديا أو التفاعل بين الشخصيات أو السرد.',
      examplesAr: 'ومن أبرز المؤشرات استخدام ألفاظ مهينة بشكل متكرر، أو استهداف صفات شخصية مثل الشكل أو العمر أو الإعاقة، أو وجود ردود فعل إيجابية على الإساءة، أو غياب أي إدانة لها.',
    },
  ], [isArabic]);

  const renderCardText = (ar: string, en: string) => (isArabic ? ar : en);

  return (
    <div className="space-y-6">
      <section
        className="relative overflow-hidden rounded-[calc(var(--radius)+0.75rem)] border border-border/80 shadow-[0_24px_70px_rgba(31,23,36,0.08)]"
        style={{
          backgroundImage: "url('/bannerguide.jpg')",
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <div className="absolute inset-0 bg-background/70" />
        <div className="relative grid gap-6 p-6 md:grid-cols-[minmax(0,1fr)_260px] md:p-8">
          <div className="space-y-4">
            <Badge variant="outline" className="w-fit border-border/80 bg-background/80 px-3 py-1 text-[11px] uppercase tracking-[0.22em]">
              {renderCardText('إرشادات البوابة', 'Portal Guidance')}
            </Badge>
            <div>
              <h2 className="text-3xl font-bold text-text-main md:text-4xl">
                {renderCardText('ارشادات الامتثال', 'Compliance Guidelines')}
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-text-muted md:text-base">
                {renderCardText(
                  'دليل مرجعي يوضح تصنيف الأعمار والمخالفات النصية الشائعة، مع عرض منظم يساعد على القراءة السريعة والمراجعة الدقيقة.',
                  'A reference guide for age ratings and common text violations, arranged for quick scanning and careful review.',
                )}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="success" className="px-3 py-1 text-[11px]">
                {renderCardText('مرجع رقابي', 'Review reference')}
              </Badge>
              <Badge variant="outline" className="px-3 py-1 text-[11px]">
                {renderCardText('محتوى مرئي ومباشر', 'Visual and direct content')}
              </Badge>
              <Badge variant="outline" className="px-3 py-1 text-[11px]">
                {renderCardText('قابل للتحديث لاحقًا', 'Upgradeable later')}
              </Badge>
            </div>
          </div>
          <div className="grid gap-3 self-end">
            <Card className="border-border/70 bg-background/85">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <FileCheck2 className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-text-main">{renderCardText('مخالفات النصوص', 'Text Violations')}</p>
                  <p className="text-xs text-text-muted">{renderCardText('16 بندًا مرجعيًا', '16 reference items')}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-border/70 bg-background/85">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-warning/10 text-warning">
                  <Award className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-text-main">{renderCardText('التصنيف العمري', 'Age Rating')}</p>
                  <p className="text-xs text-text-muted">{renderCardText('6 فئات منظمة', '6 structured groups')}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap gap-2 rounded-[calc(var(--radius)+0.45rem)] border border-border/70 bg-background/85 p-2 shadow-[0_12px_30px_rgba(31,23,36,0.04)]">
        <button
          type="button"
          onClick={() => setActiveTab('guidelines')}
          className={cn(
            'flex-1 rounded-[calc(var(--radius)+0.35rem)] px-4 py-3 text-start transition-all duration-200',
            activeTab === 'guidelines' ? 'bg-primary text-white shadow-[0_12px_30px_rgba(103,42,85,0.18)]' : 'hover:bg-surface text-text-main',
          )}
        >
          <p className="text-sm font-semibold">{renderCardText('Compliance Guidelines / مخالفات النصوص', 'Compliance Guidelines / Text Violations')}</p>
          <p className={cn('mt-1 text-xs', activeTab === 'guidelines' ? 'text-white/80' : 'text-text-muted')}>
            {renderCardText('تصنيف البنود الرقابية وإبراز أمثلة المخالفات', 'Regulatory items and examples of violations')}
          </p>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('age')}
          className={cn(
            'flex-1 rounded-[calc(var(--radius)+0.35rem)] px-4 py-3 text-start transition-all duration-200',
            activeTab === 'age' ? 'bg-primary text-white shadow-[0_12px_30px_rgba(103,42,85,0.18)]' : 'hover:bg-surface text-text-main',
          )}
        >
          <p className="text-sm font-semibold">{renderCardText('التصنيف العمري', 'Age Rating')}</p>
          <p className={cn('mt-1 text-xs', activeTab === 'age' ? 'text-white/80' : 'text-text-muted')}>
            {renderCardText('إيضاح مستويات المشاهدة المناسبة', 'Audience suitability levels')}
          </p>
        </button>
      </div>

      {activeTab === 'guidelines' ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="grid gap-4 md:grid-cols-2">
            {violations.map((item) => (
              <Card key={item.number} className="group overflow-hidden border-border/80 bg-background/90 shadow-[0_18px_50px_rgba(31,23,36,0.06)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_24px_60px_rgba(31,23,36,0.10)]">
                <CardContent className="space-y-4 p-5">
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-error/10 text-error transition-transform duration-300 group-hover:scale-105">
                      <ShieldAlert className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="px-2 py-0 text-[10px]">
                          {item.number}
                        </Badge>
                        <h3 className="text-base font-bold leading-6 text-text-main">{renderCardText(item.titleAr, item.titleEn)}</h3>
                      </div>
                      <p className="mt-2 text-sm leading-7 text-text-muted">{renderCardText(item.bodyAr, item.bodyAr)}</p>
                    </div>
                  </div>
                  <div className="rounded-[calc(var(--radius)+0.2rem)] border border-border/70 bg-surface/80 p-4">
                    <p className="text-sm leading-7 text-text-main">{renderCardText(item.examplesAr, item.examplesAr)}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="space-y-4">
            <Card className="border-border/80 bg-background/90 shadow-[0_18px_50px_rgba(31,23,36,0.06)]">
              <CardContent className="space-y-4 p-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <Eye className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-text-main">{renderCardText('كيف تُقرأ هذه الصفحة؟', 'How to read this page?')}</p>
                    <p className="text-xs text-text-muted">{renderCardText('بنية سريعة تساعد على المراجعة', 'A quick structure for review')}</p>
                  </div>
                </div>
                <div className="space-y-3 text-sm leading-7 text-text-muted">
                  <p>{renderCardText('كل بطاقة تمثل نقطة مراجعة مستقلة يمكن توسيعها لاحقًا إلى دليل تفصيلي أو صفحة مرجعية منفصلة.', 'Each card is an independent review point that can later expand into a detailed or separate reference page.')}</p>
                  <p>{renderCardText('الترتيب الحالي يحافظ على الوضوح مع إبراز النصوص التي تحتاج إلى انتباه مباشر من المراجع.', 'The current order keeps the content clear while highlighting items needing direct reviewer attention.')}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-border/80 bg-background/90 shadow-[0_18px_50px_rgba(31,23,36,0.06)]">
              <CardContent className="space-y-3 p-5">
                <p className="text-sm font-semibold text-text-main">{renderCardText('أولوية التدقيق', 'Review priority')}</p>
                <div className="space-y-3">
                  {[
                    renderCardText('المحتوى الديني والسياسي أولًا', 'Religious and political content first'),
                    renderCardText('السلامة الوطنية ثم الفئات الحساسة', 'National safety then sensitive groups'),
                    renderCardText('السلوكيات الجنسية والعنف اللفظي', 'Sexual behavior and profanity'),
                  ].map((line) => (
                    <div key={line} className="flex items-start gap-3 rounded-[calc(var(--radius)+0.2rem)] border border-border/70 bg-surface/80 p-3 text-sm leading-6 text-text-main">
                      <span className="mt-1 h-2.5 w-2.5 rounded-full bg-primary" />
                      <span>{line}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="grid gap-4 md:grid-cols-2">
            {ageRatings.map((item) => (
              <Card key={item.code} className="group overflow-hidden border-border/80 bg-background/90 shadow-[0_18px_50px_rgba(31,23,36,0.06)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_24px_60px_rgba(31,23,36,0.10)]">
                <CardContent className="space-y-4 p-5">
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-warning/10 text-warning transition-transform duration-300 group-hover:scale-105">
                      <Award className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="warning" className="px-2 py-0 text-[10px]">
                          {item.code}
                        </Badge>
                        <h3 className="text-base font-bold leading-6 text-text-main">{renderCardText(item.labelAr, item.labelEn)}</h3>
                      </div>
                      <p className="mt-2 text-sm leading-7 text-text-muted">{renderCardText(item.summaryAr, item.summaryEn)}</p>
                    </div>
                  </div>
                  <div className="rounded-[calc(var(--radius)+0.2rem)] border border-border/70 bg-surface/80 p-4">
                    <p className="text-sm leading-7 text-text-main">{renderCardText(item.detailsAr, item.detailsEn)}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="space-y-4">
            <Card className="border-border/80 bg-background/90 shadow-[0_18px_50px_rgba(31,23,36,0.06)]">
              <CardContent className="space-y-4 p-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-success/10 text-success">
                    <Clock3 className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-text-main">{renderCardText('ملخص التصنيف', 'Rating summary')}</p>
                    <p className="text-xs text-text-muted">{renderCardText('نظرة سريعة على مستويات المشاهدة', 'A quick look at audience levels')}</p>
                  </div>
                </div>
                <div className="space-y-3 text-sm leading-7 text-text-muted">
                  <p>{renderCardText('التصنيف ليس منعًا بقدر ما هو توضيح لمستوى الملاءمة، ويُستخدم لتسهيل اختيار المشاهدة المناسبة.', 'Rating is guidance, not only restriction, and helps viewers choose the right content level.')}</p>
                  <p>{renderCardText('يمكن تطوير هذا القسم لاحقًا إلى بطاقة مرجعية أو أداة تصنيف تفاعلية داخل البوابة.', 'This section can later expand into a reference card or interactive rating tool inside the portal.')}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-border/80 bg-background/90 shadow-[0_18px_50px_rgba(31,23,36,0.06)]">
              <CardContent className="space-y-3 p-5">
                <p className="text-sm font-semibold text-text-main">{renderCardText('المفتاح البصري', 'Visual key')}</p>
                <div className="space-y-3">
                  {[
                    { badge: 'G', label: renderCardText('لجميع الأعمار', 'All ages') },
                    { badge: 'PG', label: renderCardText('إشراف عائلي', 'Parental guidance') },
                    { badge: 'R18', label: renderCardText('قيود عمرية', 'Age restriction') },
                  ].map((item) => (
                    <div key={item.badge} className="flex items-center gap-3 rounded-[calc(var(--radius)+0.2rem)] border border-border/70 bg-surface/80 p-3 text-sm leading-6 text-text-main">
                      <Badge variant="outline" className="min-w-12 justify-center px-2 py-0 text-[10px] font-bold">
                        {item.badge}
                      </Badge>
                      <span>{item.label}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

export function ClientPortal() {
  const navigate = useNavigate();
  const { lang, toggleLang } = useLangStore();
  const { logout, user } = useAuthStore();
  const { options: scriptClassificationOptions } = useScriptClassificationOptions();
  const workClassificationOptions = useMemo(
    () => buildScriptClassificationSelectOptions(lang === 'ar' ? 'ar' : 'en', scriptClassificationOptions),
    [lang, scriptClassificationOptions],
  );
  const expectedRankOptions = useMemo(
    () => [
      { value: 'high', label: lang === 'ar' ? 'عالية' : 'High' },
      { value: 'medium', label: lang === 'ar' ? 'متوسطة' : 'Medium' },
      { value: 'low', label: lang === 'ar' ? 'منخفضة' : 'Low' },
    ],
    [lang],
  );

  const [profile, setProfile] = useState<ClientPortalMeResponse | null>(null);
  const [submissions, setSubmissions] = useState<ClientPortalSubmissionItem[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notificationsUnreadCount, setNotificationsUnreadCount] = useState(0);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState('');
  const [notificationFilter, setNotificationFilter] = useState<NotificationFilter>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [uploaderKey, setUploaderKey] = useState(1);
  const [activeSection, setActiveSection] = useState<ClientPortalSection>('overview');
  const [entryMode, setEntryMode] = useState<'upload' | 'paste'>('upload');

  const [form, setForm] = useState<{
    title: string;
    type: 'Film' | 'Series';
    workClassification: string;
    expectedRank: 'low' | 'medium' | 'high';
    synopsis: string;
  }>({
    title: '',
    type: 'Film' as 'Film' | 'Series',
    workClassification: LEGACY_SCRIPT_CLASSIFICATION_OPTIONS[0]?.label_ar ?? '',
    expectedRank: 'medium',
    synopsis: '',
  });
  const [file, setFile] = useState<File | null>(null);
  const [manualText, setManualText] = useState('');

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState('');
  const [details, setDetails] = useState<ClientPortalRejectionDetailsResponse | null>(null);
  const [downloadingReportId, setDownloadingReportId] = useState<string | null>(null);
  const [scriptsSearch, setScriptsSearch] = useState('');
  const [scriptsStatusFilter, setScriptsStatusFilter] = useState<'all' | 'draft' | 'submitted' | 'approved' | 'rejected'>('all');
  const [scriptsPage, setScriptsPage] = useState(1);
  const [scriptToDelete, setScriptToDelete] = useState<ClientPortalSubmissionItem | null>(null);
  const [editingDraft, setEditingDraft] = useState<ClientPortalSubmissionItem | null>(null);
  const [paymentScriptId, setPaymentScriptId] = useState<string | null>(null);
  const [paymentData, setPaymentData] = useState<ClientCertificatesResponse | null>(null);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);
  const [paymentSuccessOpen, setPaymentSuccessOpen] = useState(false);
  const [paidScriptIds, setPaidScriptIds] = useState<Set<string>>(new Set());
  const [paymentForm, setPaymentForm] = useState({
    cardHolder: '',
    cardNumber: '',
    expiry: '',
    cvv: '',
  });

  const subscriptionLabel = useMemo(
    () => formatSubscriptionLabel(profile?.subscription ?? null, lang),
    [lang, profile?.subscription],
  );
  const notificationsFiltered = useMemo(() => {
    if (notificationFilter === 'unread') return notifications.filter((item) => !item.readAt);
    if (notificationFilter === 'read') return notifications.filter((item) => Boolean(item.readAt));
    return notifications;
  }, [notificationFilter, notifications]);
  const scriptStatusSummary = useMemo(() => {
    const summary = {
      total: submissions.length,
      approved: 0,
      rejected: 0,
      draft: 0,
      inFlight: 0,
    };
    submissions.forEach((item) => {
      const status = String(item.latestReportReviewStatus || item.status || '').toLowerCase();
      if (status === 'approved') summary.approved += 1;
      else if (status === 'rejected') summary.rejected += 1;
      else if (status === 'draft') summary.draft += 1;
      else summary.inFlight += 1;
    });
    return summary;
  }, [submissions]);
  const notificationStats = useMemo(() => {
    const unread = notificationsUnreadCount;
    const total = notifications.length;
    return {
      total,
      unread,
      read: Math.max(total - unread, 0),
    };
  }, [notifications.length, notificationsUnreadCount]);

  type RejectionReportBlock = {
    report: NonNullable<ClientPortalRejectionDetailsResponse['sharedReports']>[number]['report'];
    findings: NonNullable<ClientPortalRejectionDetailsResponse['sharedReports']>[number]['findings'];
  };

  type ReportSummaryShape = {
    findings_by_article?: Array<{
      article_id: number;
      top_findings?: Array<{
        title_ar?: string;
        severity?: string;
        confidence?: number;
        evidence_snippet?: string;
      }>;
    }>;
    canonical_findings?: Array<{
      canonical_finding_id: string;
      title_ar: string;
      evidence_snippet: string;
      severity: string;
      confidence: number;
      rationale?: string | null;
      pillar_id?: string | null;
      primary_article_id?: number | null;
      related_article_ids?: number[];
      start_line_chunk?: number | null;
      end_line_chunk?: number | null;
      page_number?: number | null;
      primary_policy_atom_id?: string | null;
      source?: string | null;
    }>;
    report_hints?: Array<{
      canonical_finding_id: string;
      title_ar: string;
      evidence_snippet: string;
      severity: string;
      confidence: number;
      rationale?: string | null;
      pillar_id?: string | null;
      primary_article_id?: number | null;
      related_article_ids?: number[];
      start_line_chunk?: number | null;
      end_line_chunk?: number | null;
    }>;
    script_summary?: {
      synopsis_ar: string;
      key_risky_events_ar?: string;
      narrative_stance_ar?: string;
      compliance_posture_ar?: string;
      confidence: number;
    };
  };

  const asReportSummary = (summaryJson?: Record<string, unknown> | null): ReportSummaryShape | null => {
    if (!summaryJson || typeof summaryJson !== 'object') return null;
    return summaryJson as ReportSummaryShape;
  };

  const downloadRejectionReportPdf = async (block: RejectionReportBlock) => {
    if (!details) return;
    setDetailsError('');
    setDownloadingReportId(block.report.id);
    try {
      const summary = asReportSummary(block.report.summaryJson);
      const canonicalFindings =
        summary?.canonical_findings && summary.canonical_findings.length > 0
          ? summary.canonical_findings
          : block.findings.map((finding, index) => ({
              canonical_finding_id: finding.id || `${block.report.id}-${index}`,
              title_ar: finding.titleAr || (lang === 'ar' ? 'مخالفة' : 'Finding'),
              evidence_snippet: finding.evidenceSnippet || '',
              severity: finding.severity || 'info',
              confidence: 1,
              rationale: finding.rationaleAr || finding.descriptionAr || null,
              primary_article_id: Number.isFinite(finding.articleId) ? finding.articleId : null,
              related_article_ids: [],
              page_number: finding.pageNumber ?? null,
              source: finding.source || 'ai',
            }));

      await downloadAnalysisPdf({
        scriptTitle: details.script.title || (lang === 'ar' ? 'تقرير النص' : 'Script Report'),
        clientName: profile?.company
          ? (lang === 'ar' ? profile.company.nameAr : profile.company.nameEn)
          : (lang === 'ar' ? 'شركة الإنتاج' : 'Production Company'),
        createdAt: block.report.createdAt,
        findingsByArticle: summary?.findings_by_article ?? null,
        canonicalFindings,
        reportHints: summary?.report_hints ?? null,
        scriptSummary: summary?.script_summary ?? null,
        lang,
      });
      setNotice(lang === 'ar' ? 'تم تنزيل تقرير PDF.' : 'PDF report downloaded.');
    } catch (err) {
      setDetailsError(err instanceof Error ? err.message : (lang === 'ar' ? 'تعذر تنزيل ملف PDF للتقرير' : 'Unable to download report PDF'));
    } finally {
      setDownloadingReportId(null);
    }
  };

  const loadProfileAndSubmissions = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const [me, list, certDashboard] = await Promise.all([
        clientPortalApi.getMe(),
        clientPortalApi.getSubmissions(),
        certificatesApi.getClientDashboard().catch(() => null),
      ]);
      setProfile(me);
      setSubmissions(list);
      if (certDashboard) {
        const paidIds = new Set(
          (certDashboard.items ?? [])
            .filter((item) => item.certificateStatus === 'issued' || item.latestPayment?.paymentStatus === 'completed')
            .map((item) => item.scriptId),
        );
        setPaidScriptIds(paidIds);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : (lang === 'ar' ? 'فشل تحميل بيانات البوابة' : 'Failed to load portal data'));
    } finally {
      setIsLoading(false);
    }
  }, [lang]);

  const refreshSubmissionsSilently = useCallback(async () => {
    try {
      const [list, certDashboard] = await Promise.all([
        clientPortalApi.getSubmissions(),
        certificatesApi.getClientDashboard().catch(() => null),
      ]);
      setSubmissions(list);
      if (certDashboard) {
        const paidIds = new Set(
          (certDashboard.items ?? [])
            .filter((item) => item.certificateStatus === 'issued' || item.latestPayment?.paymentStatus === 'completed')
            .map((item) => item.scriptId),
        );
        setPaidScriptIds(paidIds);
      }
    } catch {
      // Keep current list if a background refresh fails.
    }
  }, []);

  const loadNotifications = useCallback(async () => {
    setNotificationsLoading(true);
    setNotificationsError('');
    try {
      const response = await notificationsApi.getList();
      setNotifications(response.data ?? []);
      setNotificationsUnreadCount(response.unreadCount ?? 0);
    } catch (err) {
      setNotificationsError(err instanceof Error ? err.message : (lang === 'ar' ? 'تعذر تحميل الإشعارات' : 'Unable to load notifications'));
    } finally {
      setNotificationsLoading(false);
    }
  }, [lang]);

  const markNotificationRead = useCallback(async (notificationId: string) => {
    try {
      await notificationsApi.markRead(notificationId);
      setNotifications((prev) =>
        prev.map((item) =>
          item.id === notificationId
            ? { ...item, readAt: item.readAt ?? new Date().toISOString() }
            : item,
        ),
      );
      setNotificationsUnreadCount((prev) => Math.max(prev - 1, 0));
    } catch (err) {
      setNotificationsError(err instanceof Error ? err.message : (lang === 'ar' ? 'تعذر تحديث الإشعار' : 'Unable to update notification'));
    }
  }, [lang]);

  const markAllNotificationsRead = useCallback(async () => {
    try {
      await notificationsApi.markAllRead();
      const now = new Date().toISOString();
      setNotifications((prev) => prev.map((item) => (item.readAt ? item : { ...item, readAt: now })));
      setNotificationsUnreadCount(0);
    } catch (err) {
      setNotificationsError(err instanceof Error ? err.message : (lang === 'ar' ? 'تعذر تحديث الإشعارات' : 'Unable to update notifications'));
    }
  }, [lang]);

  useEffect(() => {
    loadProfileAndSubmissions();
  }, [loadProfileAndSubmissions]);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  useEffect(() => {
    const defaultClassification = workClassificationOptions[0]?.value ?? LEGACY_SCRIPT_CLASSIFICATION_OPTIONS[0]?.label_ar ?? '';
    setForm((prev) => {
      if (prev.workClassification && workClassificationOptions.some((option) => option.value === prev.workClassification)) {
        return prev;
      }
      return { ...prev, workClassification: defaultClassification };
    });
  }, [workClassificationOptions]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      refreshSubmissionsSilently();
    }, 5000);

    const handleFocus = () => {
      refreshSubmissionsSilently();
    };

    window.addEventListener('focus', handleFocus);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
    };
  }, [refreshSubmissionsSilently]);

  useEffect(() => {
    const companyId = profile?.company?.companyId;
    if (!companyId) return;

    const channel = supabase
      .channel(`client-portal-scripts:${companyId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scripts', filter: `company_id=eq.${companyId}` }, () => {
        refreshSubmissionsSilently();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.company?.companyId, refreshSubmissionsSilently]);

  useEffect(() => {
    if (activeSection === 'notifications') {
      void loadNotifications();
    }
  }, [activeSection, loadNotifications]);

  const uploadScriptDocument = async (scriptId: string, companyId: string, uploadFile: File): Promise<UploadResult> => {
    let { data: { session } } = await supabase.auth.getSession();
    let token = session?.access_token ?? null;
    if (!token) {
      await supabase.auth.refreshSession();
      ({ data: { session } } = await supabase.auth.getSession());
      token = session?.access_token ?? null;
    }
    if (!token) throw new Error('No auth token available');

    const formData = new FormData();
    formData.append('file', uploadFile);
    formData.append('scriptId', scriptId);
    formData.append('companyId', companyId);
    formData.append('createVersion', 'true');

    const response = await fetch(`${API_BASE_URL}/raawi-script-upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: (import.meta as any).env.VITE_SUPABASE_ANON_KEY,
      },
      body: formData,
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({} as Record<string, unknown>));
      const message = typeof body.error === 'string' ? body.error : `${response.status} ${response.statusText}`;
      throw new Error(message);
    }

    return response.json();
  };

  const handleSubmitScript = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice('');
    setError('');

    if (!profile?.company?.companyId) {
      setError(lang === 'ar' ? 'تعذّر تحديد الشركة الحالية' : 'Unable to resolve your company account');
      return;
    }
    if (!form.title.trim()) {
      setError(lang === 'ar' ? 'عنوان النص مطلوب' : 'Script title is required');
      return;
    }
    if (entryMode === 'upload' && !file) {
      setError(lang === 'ar' ? 'يجب إرفاق ملف النص' : 'Please attach a script file');
      return;
    }
    if (entryMode === 'paste' && !manualText.trim()) {
      setError(lang === 'ar' ? 'يجب إدخال نص في المحرر' : 'Please enter script text in the editor');
      return;
    }

    setIsSubmitting(true);
    let createdScriptId: string | null = null;
    try {
      const scriptPayload: Script = {
        id: '',
        companyId: profile.company.companyId,
        title: form.title.trim(),
        type: form.type,
        workClassification: form.workClassification,
        expectedRank: form.expectedRank,
        synopsis: form.synopsis.trim(),
        status: 'in_review',
        createdAt: new Date().toISOString(),
      };
      const created = await scriptsApi.addScript(scriptPayload);

      createdScriptId = created.id;
      const duplicateTitleWarning = created.warnings?.find((warning) => warning.code === 'duplicate_title_same_client');
      if (entryMode === 'upload') {
        const upload = await uploadScriptDocument(created.id, profile.company.companyId, file!);
        if (!upload.versionId) {
          throw new Error(lang === 'ar' ? 'تعذّر إنشاء نسخة النص' : 'Failed to create script version');
        }

        const ext = file!.name.toLowerCase().split('.').pop() || '';
        if (ext === 'pdf') {
          await scriptsApi.extractText(upload.versionId, undefined, { enqueueAnalysis: false });
          const extractedVersion = await waitForVersionExtraction(created.id, upload.versionId, {
            timeoutMs: PDF_EXTRACTION_TIMEOUT_MS,
            intervalMs: PDF_EXTRACTION_INTERVAL_MS,
          });
          if (!extractedVersion.extracted_text?.trim()) {
            throw new Error(lang === 'ar' ? 'لم يتم استخراج نص من الملف' : 'No text extracted from file');
          }
        } else if (ext === 'docx') {
          const { pages } = await extractDocxWithPages(file!);
          const res = await scriptsApi.extractText(upload.versionId, undefined, { pages, enqueueAnalysis: false });
          if (!(res as { extracted_text?: string }).extracted_text?.trim()) {
            throw new Error(lang === 'ar' ? 'لم يتم استخراج نص من الملف' : 'No text extracted from file');
          }
        } else if (ext === 'txt') {
          const text = await file!.text();
          if (!text.trim()) throw new Error(lang === 'ar' ? 'الملف النصي فارغ' : 'Text file is empty');
          await scriptsApi.extractText(upload.versionId, text, { enqueueAnalysis: false });
        } else {
          throw new Error(lang === 'ar' ? 'صيغة الملف غير مدعومة' : 'Unsupported file format');
        }
      } else {
        const version = await scriptsApi.createVersion(created.id, {
          source_file_name: 'client-editor-entry.txt',
          source_file_type: 'application/x-raawi-editor',
          source_file_size: manualText.trim().length,
          extraction_status: 'pending',
        });
        await scriptsApi.extractText(version.id, manualText.trim(), { enqueueAnalysis: false });
      }

      setForm({
        title: '',
        type: 'Film',
        workClassification: workClassificationOptions[0]?.value ?? LEGACY_SCRIPT_CLASSIFICATION_OPTIONS[0]?.label_ar ?? '',
        expectedRank: 'medium',
        synopsis: '',
      });
      setFile(null);
      setManualText('');
      setEntryMode('upload');
      setUploaderKey((v) => v + 1);
      setNotice(duplicateTitleWarning
        ? (lang === 'ar' ? duplicateTitleWarning.message : (duplicateTitleWarning.messageEn ?? duplicateTitleWarning.message))
        : (lang === 'ar'
          ? 'تم إرسال النص بنجاح، وسيتم مراجعته من فريق الإدارة.'
          : 'Script submitted successfully and sent to admin review.'));
      setActiveSection('scripts');
      await loadProfileAndSubmissions();
    } catch (err) {
      if (createdScriptId) {
        await scriptsApi.deleteScript(createdScriptId).catch(() => {});
      }
      setError(err instanceof Error ? err.message : (lang === 'ar' ? 'فشل إرسال النص' : 'Failed to submit script'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveDraft = async () => {
    setNotice('');
    setError('');
    if (!profile?.company?.companyId) {
      setError(lang === 'ar' ? 'تعذّر تحديد الشركة الحالية' : 'Unable to resolve your company account');
      return;
    }
    if (!form.title.trim()) {
      setError(lang === 'ar' ? 'عنوان النص مطلوب' : 'Script title is required');
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingDraft) {
        await scriptsApi.updateScript(editingDraft.scriptId, {
          title: form.title.trim(),
          type: form.type,
          workClassification: form.workClassification,
          expectedRank: form.expectedRank,
          synopsis: form.synopsis.trim(),
          status: 'draft',
        } as Partial<Script>);
      } else {
        const scriptPayload: Script = {
          id: '',
          companyId: profile.company.companyId,
          title: form.title.trim(),
          type: form.type,
          workClassification: form.workClassification,
          expectedRank: form.expectedRank,
          synopsis: form.synopsis.trim(),
          status: 'draft',
          createdAt: new Date().toISOString(),
        };
        const created = await scriptsApi.addScript(scriptPayload);
        const duplicateTitleWarning = created.warnings?.find((warning) => warning.code === 'duplicate_title_same_client');
        if (duplicateTitleWarning) {
          setNotice(lang === 'ar' ? duplicateTitleWarning.message : (duplicateTitleWarning.messageEn ?? duplicateTitleWarning.message));
        }
      }
      setNotice((current) => current || (lang === 'ar' ? 'تم حفظ النص كمسودة.' : 'Script saved as draft.'));
      setEditingDraft(null);
      await loadProfileAndSubmissions();
      setActiveSection('scripts');
    } catch (err) {
      setError(err instanceof Error ? err.message : (lang === 'ar' ? 'فشل حفظ المسودة' : 'Failed to save draft'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteScript = async () => {
    if (!scriptToDelete) return;
    setNotice('');
    setError('');
    try {
      await scriptsApi.deleteScript(scriptToDelete.scriptId);
      setNotice(lang === 'ar' ? 'تم إلغاء النص بنجاح.' : 'Script canceled successfully.');
      setScriptToDelete(null);
      await loadProfileAndSubmissions();
    } catch (err) {
      setError(err instanceof Error ? err.message : (lang === 'ar' ? 'تعذر إلغاء النص' : 'Unable to cancel script'));
    }
  };

  const startEditDraft = (item: ClientPortalSubmissionItem) => {
    setEditingDraft(item);
    setForm((prev) => ({
      ...prev,
      title: item.title ?? '',
      type: item.type === 'Series' ? 'Series' : 'Film',
      expectedRank: (item as ClientPortalSubmissionItem & { expectedRank?: 'low' | 'medium' | 'high' | null }).expectedRank ?? prev.expectedRank ?? 'medium',
      synopsis: prev.synopsis ?? '',
    }));
    setActiveSection('new-script');
  };

  const openPaymentPage = async (scriptId: string) => {
    setNotice('');
    setError('');
    setPaymentScriptId(scriptId);
    setActiveSection('payment');
    setPaymentLoading(true);
    try {
      const response = await certificatesApi.getClientDashboard();
      setPaymentData(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : (lang === 'ar' ? 'تعذر تحميل بيانات الدفع' : 'Unable to load payment data'));
    } finally {
      setPaymentLoading(false);
    }
  };

  const submitPayment = async () => {
    if (!paymentScriptId) return;
    const cardNumber = paymentForm.cardNumber.replace(/\s+/g, '');
    const cvv = paymentForm.cvv.trim();
    if (!paymentForm.cardHolder.trim()) {
      setError(lang === 'ar' ? 'اسم حامل البطاقة مطلوب' : 'Card holder name is required');
      return;
    }
    if (!/^\d{16}$/.test(cardNumber)) {
      setError(lang === 'ar' ? 'رقم البطاقة يجب أن يكون 16 رقمًا' : 'Card number must be 16 digits');
      return;
    }
    if (!/^\d{2}\/\d{2}$/.test(paymentForm.expiry.trim())) {
      setError(lang === 'ar' ? 'تاريخ الانتهاء يجب أن يكون MM/YY' : 'Expiry must be MM/YY');
      return;
    }
    if (!/^\d{3,4}$/.test(cvv)) {
      setError(lang === 'ar' ? 'رمز الأمان غير صالح' : 'Invalid security code');
      return;
    }

    setError('');
    setPaymentSubmitting(true);
    try {
      const res = await certificatesApi.processDemoPayment(paymentScriptId, 'visa_success');
      if (!res.ok && !res.alreadyIssued) {
        setError(res.error || (lang === 'ar' ? 'فشلت عملية الدفع' : 'Payment failed'));
        return;
      }
      setPaymentSuccessOpen(true);
      const refreshed = await certificatesApi.getClientDashboard();
      setPaymentData(refreshed);
      setPaidScriptIds(new Set(
        (refreshed.items ?? [])
          .filter((item) => item.certificateStatus === 'issued' || item.latestPayment?.paymentStatus === 'completed')
          .map((item) => item.scriptId),
      ));
      await loadProfileAndSubmissions();
    } catch (err) {
      setError(err instanceof Error ? err.message : (lang === 'ar' ? 'تعذر إتمام عملية الدفع' : 'Unable to complete payment'));
    } finally {
      setPaymentSubmitting(false);
    }
  };

  const openRejectionDetails = async (scriptId: string) => {
    setDetailsOpen(true);
    setDetailsLoading(true);
    setDetailsError('');
    setDetails(null);
    try {
      const payload = await clientPortalApi.getRejectionDetails(scriptId);
      setDetails(payload);
    } catch (err) {
      setDetailsError(err instanceof Error ? err.message : (lang === 'ar' ? 'تعذر تحميل تفاصيل الرفض' : 'Unable to load rejection details'));
    } finally {
      setDetailsLoading(false);
    }
  };

  const totalRejected = useMemo(() => submissions.filter((s) => s.status.toLowerCase() === 'rejected').length, [submissions]);
  const totalApproved = useMemo(() => submissions.filter((s) => s.status.toLowerCase() === 'approved').length, [submissions]);
  const totalPending = useMemo(
    () => submissions.filter((s) => ['analysis_running', 'review_required', 'in_review'].includes(s.status.toLowerCase())).length,
    [submissions],
  );
  const recentSubmissions = useMemo(() => submissions.slice(0, 5), [submissions]);
  const visibleSubmissions = useMemo(
    () => submissions.filter((s) => !['canceled', 'cancelled'].includes(s.status.toLowerCase())),
    [submissions],
  );
  const filteredSubmissions = useMemo(() => {
    const q = scriptsSearch.trim().toLowerCase();
    return visibleSubmissions.filter((item) => {
      const status = item.status.toLowerCase();
      const isDraft = status === 'draft';
      const isSubmitted = ['in_review', 'analysis_running', 'review_required'].includes(status);
      const passStatus =
        scriptsStatusFilter === 'all' ||
        (scriptsStatusFilter === 'draft' && isDraft) ||
        (scriptsStatusFilter === 'submitted' && isSubmitted) ||
        (scriptsStatusFilter === 'approved' && status === 'approved') ||
        (scriptsStatusFilter === 'rejected' && status === 'rejected');
      if (!passStatus) return false;
      if (!q) return true;
      return item.title.toLowerCase().includes(q) || item.type.toLowerCase().includes(q);
    });
  }, [visibleSubmissions, scriptsSearch, scriptsStatusFilter]);
  const scriptsPageSize = 10;
  const scriptsPageCount = Math.max(1, Math.ceil(filteredSubmissions.length / scriptsPageSize));
  const pagedSubmissions = filteredSubmissions.slice((scriptsPage - 1) * scriptsPageSize, scriptsPage * scriptsPageSize);

  useEffect(() => {
    setScriptsPage(1);
  }, [scriptsSearch, scriptsStatusFilter]);

  const handleLogout = () => {
    logout();
    navigate('/portal', { replace: true });
  };

  const renderSubmissionList = () => (
    <Card className="client-portal-panel overflow-hidden border-border/80 shadow-[0_18px_50px_rgba(31,23,36,0.06)]">
      <CardHeader>
        <CardTitle>{lang === 'ar' ? 'حالة النصوص المرسلة' : 'Submitted Scripts Status'}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex flex-col gap-3 md:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <Input
              value={scriptsSearch}
              onChange={(e) => setScriptsSearch(e.target.value)}
              placeholder={lang === 'ar' ? 'بحث باسم النص...' : 'Search by script title...'}
              className="pl-10"
            />
          </div>
          <select
            value={scriptsStatusFilter}
            onChange={(e) => setScriptsStatusFilter(e.target.value as typeof scriptsStatusFilter)}
            className="h-10 rounded-[var(--radius)] border border-border bg-surface px-3 text-sm"
          >
            <option value="all">{lang === 'ar' ? 'الكل' : 'All'}</option>
            <option value="draft">{lang === 'ar' ? 'مسودة' : 'Draft'}</option>
            <option value="submitted">{lang === 'ar' ? 'مُرسل' : 'Submitted'}</option>
            <option value="approved">{lang === 'ar' ? 'مقبول' : 'Approved'}</option>
            <option value="rejected">{lang === 'ar' ? 'مرفوض' : 'Rejected'}</option>
          </select>
        </div>
        {isLoading ? (
          <p className="text-sm text-text-muted">{lang === 'ar' ? 'جاري التحميل...' : 'Loading...'}</p>
        ) : filteredSubmissions.length === 0 ? (
          <p className="text-sm text-text-muted">{lang === 'ar' ? 'لا توجد نصوص مرسلة بعد.' : 'No submitted scripts yet.'}</p>
        ) : (
          <div className="overflow-x-auto rounded-[calc(var(--radius)+0.35rem)] border border-border bg-surface">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-xs uppercase text-text-muted">
                <tr>
                  <th className="px-4 py-3 text-start">#</th>
                  <th className="px-4 py-3 text-start">{lang === 'ar' ? 'اسم النص' : 'Script Name'}</th>
                  <th className="px-4 py-3 text-start">{lang === 'ar' ? 'وقت الإرسال' : 'Submission Time'}</th>
                  <th className="px-4 py-3 text-start">{lang === 'ar' ? 'الحالة' : 'Status'}</th>
                  <th className="px-4 py-3 text-start">{lang === 'ar' ? 'الإجراءات' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody>
                {pagedSubmissions.map((item, index) => {
                  const status = item.status.toLowerCase();
                  const isDraft = status === 'draft';
                  const isSubmitted = ['in_review', 'analysis_running', 'review_required'].includes(status);
                  const canPay = status === 'approved' && !paidScriptIds.has(item.scriptId);
                  return (
                    <tr key={item.scriptId} className="border-b border-border/70 last:border-b-0">
                      <td className="px-4 py-3 text-text-muted">{(scriptsPage - 1) * scriptsPageSize + index + 1}</td>
                      <td className="px-4 py-3 font-medium text-text-main">{item.title}</td>
                      <td className="px-4 py-3 text-text-muted">{new Date(item.createdAt).toLocaleString()}</td>
                      <td className="px-4 py-3"><Badge variant={statusVariant(item.status)}>{statusLabel(item.status, lang)}</Badge></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <Button size="sm" variant="ghost" onClick={() => navigate(`/workspace/${item.scriptId}`)} aria-label="view"><Eye className="h-4 w-4" /></Button>
                          {isDraft ? (
                            <Button size="sm" variant="ghost" onClick={() => startEditDraft(item)} aria-label="edit"><Pencil className="h-4 w-4" /></Button>
                          ) : null}
                          <Button size="sm" variant="ghost" onClick={() => setScriptToDelete(item)} aria-label="delete"><Trash2 className="h-4 w-4 text-error" /></Button>
                          {!isDraft && !isSubmitted && canPay ? (
                            <Button size="sm" variant="ghost" onClick={() => void openPaymentPage(item.scriptId)} aria-label="payment"><CreditCard className="h-4 w-4 text-primary" /></Button>
                          ) : null}
                          {status === 'rejected' ? (
                            <Button size="sm" variant="outline" onClick={() => openRejectionDetails(item.scriptId)}>
                              {lang === 'ar' ? 'تقرير الرفض' : 'Rejection'}
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="flex items-center justify-between border-t border-border px-4 py-3">
              <span className="text-xs text-text-muted">{filteredSubmissions.length} {lang === 'ar' ? 'نتيجة' : 'results'}</span>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" disabled={scriptsPage <= 1} onClick={() => setScriptsPage((v) => v - 1)}>{lang === 'ar' ? 'السابق' : 'Previous'}</Button>
                <span className="text-xs text-text-muted">{scriptsPage} / {scriptsPageCount}</span>
                <Button size="sm" variant="outline" disabled={scriptsPage >= scriptsPageCount} onClick={() => setScriptsPage((v) => v + 1)}>{lang === 'ar' ? 'التالي' : 'Next'}</Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );

  const renderNewScriptForm = () => (
    <Card className="client-portal-panel overflow-hidden border-border/80 shadow-[0_18px_50px_rgba(31,23,36,0.06)]">
      <CardHeader>
        <CardTitle>{lang === 'ar' ? 'إضافة نص جديد' : 'Add New Script'}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmitScript} className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="md:col-span-2 space-y-2">
            <label className="block text-sm font-medium text-text-main">
              {lang === 'ar' ? 'طريقة إدخال النص' : 'Script Entry Method'}
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setEntryMode('upload')}
                className={`rounded-[var(--radius)] border px-4 py-2 text-sm transition ${entryMode === 'upload' ? 'border-primary bg-primary text-white' : 'border-border bg-background text-text-main hover:bg-surface'}`}
              >
                {lang === 'ar' ? 'استيراد ملف' : 'Import file'}
              </button>
              <button
                type="button"
                onClick={() => setEntryMode('paste')}
                className={`rounded-[var(--radius)] border px-4 py-2 text-sm transition ${entryMode === 'paste' ? 'border-primary bg-primary text-white' : 'border-border bg-background text-text-main hover:bg-surface'}`}
              >
                {lang === 'ar' ? 'لصق النص في المحرر' : 'Paste into editor'}
              </button>
            </div>
            <p className="text-xs text-text-muted">
              {lang === 'ar'
                ? 'سنُبقي مسار الاستيراد الحالي كما هو، ونضيف مسار التحرير النصي بشكل آمن دون كسر الربط مع مساحة عمل الإدارة.'
                : 'The current import flow stays intact, while a safe text-entry path is added without breaking admin workspace wiring.'}
            </p>
          </div>
          <Input
            label={lang === 'ar' ? 'عنوان النص' : 'Script Title'}
            value={form.title}
            onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
            required
          />
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-text-main">{lang === 'ar' ? 'نوع الإنتاج' : 'Production Type'}</label>
            <select
              value={form.type}
              onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value as 'Film' | 'Series' }))}
              className="h-10 w-full rounded-[var(--radius)] border border-border bg-surface px-3 text-sm"
            >
              <option value="Film">{lang === 'ar' ? 'فيلم' : 'Film'}</option>
              <option value="Series">{lang === 'ar' ? 'مسلسل' : 'Series'}</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-text-main">{lang === 'ar' ? 'تصنيف العمل' : 'Work Classification'}</label>
            <select
              value={form.workClassification}
              onChange={(e) => setForm((prev) => ({ ...prev, workClassification: e.target.value }))}
              className="h-10 w-full rounded-[var(--radius)] border border-border bg-surface px-3 text-sm"
            >
              {workClassificationOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-text-main">{lang === 'ar' ? 'الرتبة المتوقعة' : 'Expected Rank'}</label>
            <select
              value={form.expectedRank}
              onChange={(e) => setForm((prev) => ({ ...prev, expectedRank: e.target.value as 'low' | 'medium' | 'high' }))}
              className="h-10 w-full rounded-[var(--radius)] border border-border bg-surface px-3 text-sm"
            >
              {expectedRankOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <Textarea
              label={lang === 'ar' ? 'ملخص النص' : 'Synopsis'}
              rows={4}
              value={form.synopsis}
              onChange={(e) => setForm((prev) => ({ ...prev, synopsis: e.target.value }))}
            />
          </div>
          {entryMode === 'upload' ? (
            <div className="md:col-span-2">
              <div key={uploaderKey}>
                <FileUpload
                  label={lang === 'ar' ? 'ملف النص' : 'Script File'}
                  accept=".pdf,.docx,.txt"
                  helperText={lang === 'ar' ? 'يدعم PDF وDOCX وTXT حتى 50MB. هذا هو المسار الحالي المرتبط بمساحة عمل الإدارة.' : 'Supports PDF, DOCX, and TXT up to 50MB. This is the current flow already wired to the admin workspace.'}
                  onChange={setFile}
                />
              </div>
            </div>
          ) : (
            <div className="md:col-span-2">
              <Textarea
                label={lang === 'ar' ? 'محرر النص' : 'Script Editor'}
                rows={14}
                value={manualText}
                onChange={(e) => setManualText(e.target.value)}
                placeholder={
                  lang === 'ar'
                    ? 'الصق النص هنا. سننشئ له نسخة نظامية ونمرره لنفس مسار المعالجة المستخدم في النظام الحالي.'
                    : 'Paste the script text here. We will create a proper version and send it through the same processing path used by the current system.'
                }
              />
            </div>
          )}
          <div className="md:col-span-2 flex flex-wrap items-center gap-3">
            <Button type="submit" isLoading={isSubmitting}>
              {lang === 'ar' ? 'إرسال للنظام' : 'Submit to Dashboard'}
            </Button>
            <Button type="button" variant="outline" isLoading={isSubmitting} onClick={handleSaveDraft}>
              {lang === 'ar' ? 'حفظ كمسودة' : 'Save Draft'}
            </Button>
            <Button type="button" variant="outline" onClick={loadProfileAndSubmissions} disabled={isLoading || isSubmitting}>
              {lang === 'ar' ? 'تحديث' : 'Refresh'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );

  const renderOverview = () => (
    <div className="space-y-4">
      <section className="client-portal-hero rounded-[calc(var(--radius)+0.85rem)] px-6 py-6 text-white shadow-[0_24px_60px_rgba(103,42,85,0.18)] md:px-8 md:py-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-medium uppercase tracking-[0.24em] text-white/70">
              {lang === 'ar' ? 'مرحباً بك في بوابة راوي' : 'Welcome to Raawi'}
            </p>
            <h2 className="mt-3 text-2xl font-bold md:text-3xl">
              {lang === 'ar' ? 'مساحتك الجديدة لإرسال النصوص ومتابعة التقارير' : 'Your workspace for submissions, reports, and certificates'}
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-white/80 md:text-base">
              {lang === 'ar'
                ? 'أصبحت بوابة العميل جاهزة لاستقبال أعمالك ومتابعة حالتها خطوة بخطوة، من رفع النص وحتى التقرير والشهادات، بتجربة واضحة ومرتبطة مباشرة بفريق المراجعة.'
                : 'Your client portal is ready for new work, with clear tracking from script upload through review reports and certificates, all connected directly to the review team.'}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 md:min-w-[300px]">
            <button
              type="button"
              onClick={() => setActiveSection('new-script')}
              className="rounded-2xl border border-white/20 bg-white/12 px-4 py-4 text-start transition hover:bg-white/18"
            >
              <p className="text-sm font-semibold">{lang === 'ar' ? 'إضافة نص' : 'Add Script'}</p>
              <p className="mt-1 text-xs text-white/70">{lang === 'ar' ? 'رفع ملف جديد للشركة' : 'Submit a new company script'}</p>
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('scripts')}
              className="rounded-2xl border border-white/20 bg-white/12 px-4 py-4 text-start transition hover:bg-white/18"
            >
              <p className="text-sm font-semibold">{lang === 'ar' ? 'متابعة النصوص' : 'Track Scripts'}</p>
              <p className="mt-1 text-xs text-white/70">{lang === 'ar' ? 'عرض الحالات والقرارات' : 'View statuses and decisions'}</p>
            </button>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-4 md:grid-cols-2">
        <Card className="client-portal-stat-card border-border/80 shadow-[0_18px_50px_rgba(31,23,36,0.06)]">
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-sm text-text-muted">{lang === 'ar' ? 'إجمالي النصوص' : 'Total Scripts'}</p>
              <p className="mt-2 text-3xl font-bold">{submissions.length}</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <FolderKanban className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>
        <Card className="client-portal-stat-card border-border/80 shadow-[0_18px_50px_rgba(31,23,36,0.06)]">
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-sm text-text-muted">{lang === 'ar' ? 'المعتمد' : 'Approved'}</p>
              <p className="mt-2 text-3xl font-bold text-success">{totalApproved}</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-success/10 text-success">
              <FileCheck2 className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>
        <Card className="client-portal-stat-card border-border/80 shadow-[0_18px_50px_rgba(31,23,36,0.06)]">
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-sm text-text-muted">{lang === 'ar' ? 'قيد المتابعة' : 'In Progress'}</p>
              <p className="mt-2 text-3xl font-bold text-warning">{totalPending}</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-warning/10 text-warning">
              <Clock3 className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>
        <Card className="client-portal-stat-card border-border/80 shadow-[0_18px_50px_rgba(31,23,36,0.06)]">
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-sm text-text-muted">{lang === 'ar' ? 'المرفوض' : 'Rejected'}</p>
              <p className="mt-2 text-3xl font-bold text-error">{totalRejected}</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-error/10 text-error">
              <ShieldAlert className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="client-portal-panel overflow-hidden border-border/80 shadow-[0_18px_50px_rgba(31,23,36,0.06)]">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>{lang === 'ar' ? 'أحدث النصوص' : 'Recent Scripts'}</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setActiveSection('scripts')}>
                {lang === 'ar' ? 'عرض الكل' : 'View all'}
                <ArrowUpRight className="ms-2 h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentSubmissions.length === 0 ? (
              <p className="text-sm text-text-muted">{lang === 'ar' ? 'لا توجد نصوص بعد. ابدأ بإضافة النص الأول.' : 'No scripts yet. Start by adding your first script.'}</p>
            ) : (
              recentSubmissions.map((item) => (
                <div key={item.scriptId} className="rounded-[calc(var(--radius)+0.3rem)] border border-border bg-background/80 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold">{item.title}</p>
                      <p className="mt-1 text-sm text-text-muted">{item.type} • {new Date(item.createdAt).toLocaleDateString()}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={statusVariant(item.status)}>{statusLabel(item.status, lang)}</Badge>
                      {item.status.toLowerCase() === 'rejected' ? (
                        <Button size="sm" variant="outline" onClick={() => openRejectionDetails(item.scriptId)}>
                          {lang === 'ar' ? 'تقرير الرفض' : 'Rejection report'}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="client-portal-panel overflow-hidden border-border/80 shadow-[0_18px_50px_rgba(31,23,36,0.06)]">
          <CardHeader>
            <CardTitle>{lang === 'ar' ? 'الأقسام التالية في الطريق' : 'Next sections in progress'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-[calc(var(--radius)+0.3rem)] border border-border bg-background/80 p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-secondary/15 text-secondary">
                  <Award className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold">{lang === 'ar' ? 'الشهادات' : 'Certificates'}</p>
                  <p className="mt-1 text-sm leading-6 text-text-muted">
                    {lang === 'ar' ? 'ربط أقوى مع الوثائق والشهادات المعتمدة سيصل في مرحلة منفصلة.' : 'A stronger issued-documents and certificates section will arrive in a dedicated phase.'}
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-[calc(var(--radius)+0.3rem)] border border-border bg-background/80 p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <BellRing className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold">{lang === 'ar' ? 'الإشعارات' : 'Notifications'}</p>
                  <p className="mt-1 text-sm leading-6 text-text-muted">
                    {lang === 'ar' ? 'سنفصل تنبيهات العميل لاحقًا بدل الاعتماد على متابعة الحالة يدويًا.' : 'Client notifications will be separated into their own stream in a later phase.'}
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-[calc(var(--radius)+0.3rem)] border border-border bg-background/80 p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-success/10 text-success">
                  <Settings2 className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold">{lang === 'ar' ? 'الإعدادات' : 'Settings'}</p>
                  <p className="mt-1 text-sm leading-6 text-text-muted">
                    {lang === 'ar' ? 'إعدادات الحساب والشركة ستنتقل لاحقًا إلى صفحة مستقلة شبيهة بالنظام القديم.' : 'Account and company settings will move later into a dedicated page closer to the old dashboard.'}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );

  const renderPlaceholderSection = (titleAr: string, titleEn: string, bodyAr: string, bodyEn: string) => (
    <Card className="client-portal-panel overflow-hidden border-border/80 shadow-[0_18px_50px_rgba(31,23,36,0.06)]">
      <CardHeader>
        <CardTitle>{lang === 'ar' ? titleAr : titleEn}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="max-w-3xl text-sm leading-7 text-text-muted">{lang === 'ar' ? bodyAr : bodyEn}</p>
      </CardContent>
    </Card>
  );

  const renderNotificationsSection = () => {
    const isArabic = lang === 'ar';
    return (
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-4">
          <Card className="overflow-hidden border-border/80 shadow-[0_18px_50px_rgba(31,23,36,0.06)]">
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle>{isArabic ? 'الإشعارات' : 'Notifications'}</CardTitle>
                  <p className="mt-2 max-w-3xl text-sm leading-7 text-text-muted">
                    {isArabic
                      ? 'متابعة التنبيهات الواردة من المنصة، مع إبراز الجديد أولًا وإمكانية وضع علامة قراءة مباشرة.'
                      : 'Track platform alerts in one place, with unread items surfaced first and quick read actions.'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{isArabic ? `الكل: ${notificationStats.total}` : `Total: ${notificationStats.total}`}</Badge>
                  <Badge variant={notificationStats.unread > 0 ? 'warning' : 'success'}>
                    {isArabic ? `غير المقروء: ${notificationStats.unread}` : `Unread: ${notificationStats.unread}`}
                  </Badge>
                  <Button variant="outline" size="sm" onClick={() => void loadNotifications()} isLoading={notificationsLoading}>
                    {isArabic ? 'تحديث' : 'Refresh'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void markAllNotificationsRead()}
                    disabled={notificationStats.unread === 0 || notificationsLoading}
                  >
                    {isArabic ? 'تمييز الكل كمقروء' : 'Mark all read'}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {[
                  { value: 'all' as const, label: isArabic ? 'الكل' : 'All' },
                  { value: 'unread' as const, label: isArabic ? 'غير المقروء' : 'Unread' },
                  { value: 'read' as const, label: isArabic ? 'المقروء' : 'Read' },
                ].map((option) => {
                  const active = notificationFilter === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setNotificationFilter(option.value)}
                      className={cn(
                        'rounded-full border px-4 py-2 text-sm font-medium transition',
                        active
                          ? 'border-primary bg-primary text-white shadow-[0_10px_24px_rgba(103,42,85,0.16)]'
                          : 'border-border bg-background text-text-main hover:bg-surface',
                      )}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>

              {notificationsLoading ? (
                <div className="rounded-[calc(var(--radius)+0.35rem)] border border-border bg-surface/70 p-4 text-sm text-text-muted">
                  {isArabic ? 'جاري تحميل الإشعارات...' : 'Loading notifications...'}
                </div>
              ) : notificationsError ? (
                <div className="rounded-[calc(var(--radius)+0.35rem)] border border-error/20 bg-error/10 p-4 text-sm text-error">
                  {notificationsError}
                </div>
              ) : notificationsFiltered.length === 0 ? (
                <div className="rounded-[calc(var(--radius)+0.35rem)] border border-border bg-surface/70 p-5 text-sm leading-7 text-text-muted">
                  {isArabic
                    ? 'لا توجد إشعارات ضمن هذا الفلتر الآن. ستظهر التنبيهات الجديدة هنا عندما تصل.'
                    : 'No notifications match this filter right now. New alerts will appear here when they arrive.'}
                </div>
              ) : (
                <div className="space-y-3">
                  {notificationsFiltered.map((item) => {
                    const unread = !item.readAt;
                    const summaryLabels = [
                      typeof item.metadata?.scriptTitle === 'string' ? item.metadata.scriptTitle : null,
                      typeof item.metadata?.script_title === 'string' ? item.metadata.script_title : null,
                      typeof item.metadata?.reportTitle === 'string' ? item.metadata.reportTitle : null,
                      typeof item.metadata?.report_title === 'string' ? item.metadata.report_title : null,
                    ].filter((value): value is string => Boolean(value && value.trim()));

                    return (
                      <Card
                        key={item.id}
                        className={cn(
                          'overflow-hidden border-border/80 bg-background/90 shadow-[0_18px_50px_rgba(31,23,36,0.05)] transition-all duration-300',
                          unread && 'border-primary/35 bg-primary/5',
                        )}
                      >
                        <CardContent className="space-y-3 p-5">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 flex-1 space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant={unread ? 'warning' : 'outline'}>{notificationTypeLabel(item.type, lang)}</Badge>
                                {unread ? <Badge variant="success">{isArabic ? 'غير مقروء' : 'Unread'}</Badge> : <Badge variant="outline">{isArabic ? 'مقروء' : 'Read'}</Badge>}
                              </div>
                              <h3 className="text-base font-semibold leading-6 text-text-main">{item.title}</h3>
                              {item.body ? <p className="text-sm leading-7 text-text-muted">{item.body}</p> : null}
                              {summaryLabels.length > 0 ? (
                                <div className="flex flex-wrap gap-2">
                                  {summaryLabels.slice(0, 2).map((label) => (
                                    <span key={label} className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-text-muted">
                                      {label}
                                    </span>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                            <div className="text-end text-xs text-text-muted">
                              <p>{formatNotificationDate(item.createdAt, lang)}</p>
                              <p className="mt-1">{item.id.slice(0, 8)}</p>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-3">
                            <p className="text-xs leading-6 text-text-muted">
                              {isArabic
                                ? 'يمكنك مراجعة الإشعار أو وضعه كمقروء بعد الاطلاع عليه.'
                                : 'Review the notification and mark it as read when you are done.'}
                            </p>
                            <div className="flex items-center gap-2">
                              {unread ? (
                                <Button size="sm" variant="outline" onClick={() => void markNotificationRead(item.id)}>
                                  {isArabic ? 'اعتماد كمقروء' : 'Mark read'}
                                </Button>
                              ) : null}
                              <Button
                                size="sm"
                                variant={unread ? 'default' : 'outline'}
                                onClick={() => void markNotificationRead(item.id)}
                                disabled={!unread}
                              >
                                {isArabic ? 'فتح' : 'Open'}
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="border-border/80 bg-background/90 shadow-[0_18px_50px_rgba(31,23,36,0.06)]">
            <CardContent className="space-y-4 p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <BellRing className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-text-main">{isArabic ? 'ملخص الإشعارات' : 'Notification summary'}</p>
                  <p className="text-xs text-text-muted">{isArabic ? 'نظرة سريعة على الحالة الحالية' : 'Quick view of the current inbox state'}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: isArabic ? 'الإجمالي' : 'Total', value: notificationStats.total },
                  { label: isArabic ? 'غير المقروء' : 'Unread', value: notificationStats.unread },
                  { label: isArabic ? 'المقروء' : 'Read', value: notificationStats.read },
                  { label: isArabic ? 'الفعال' : 'Active', value: notificationStats.unread > 0 ? notificationStats.unread : 0 },
                ].map((item) => (
                  <div key={item.label} className="rounded-[calc(var(--radius)+0.25rem)] border border-border bg-surface/80 p-3">
                    <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-text-muted">{item.label}</p>
                    <p className="mt-1 text-2xl font-semibold text-text-main">{item.value}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/80 bg-background/90 shadow-[0_18px_50px_rgba(31,23,36,0.06)]">
            <CardContent className="space-y-3 p-5">
              <p className="text-sm font-semibold text-text-main">{isArabic ? 'روابط سريعة' : 'Quick links'}</p>
              <div className="space-y-2">
                {[
                  { labelAr: 'النصوص', labelEn: 'Scripts', section: 'scripts' as const },
                  { labelAr: 'إضافة نص', labelEn: 'Add Script', section: 'new-script' as const },
                  { labelAr: 'الشهادات', labelEn: 'Certificates', section: 'certificates' as const },
                  { labelAr: 'إرشادات الامتثال', labelEn: 'Compliance Guidelines', section: 'compliance-guidelines' as const },
                ].map((item) => (
                  <Button
                    key={item.section}
                    variant="outline"
                    className="w-full justify-between"
                    onClick={() => setActiveSection(item.section)}
                  >
                    <span>{isArabic ? item.labelAr : item.labelEn}</span>
                    <ArrowUpRight className="h-4 w-4" />
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  };

  const renderSettingsSection = () => {
    const isArabic = lang === 'ar';
    const company = profile?.company;
    return (
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <Card className="overflow-hidden border-border/80 shadow-[0_18px_50px_rgba(31,23,36,0.06)]">
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle>{isArabic ? 'الإعدادات' : 'Settings'}</CardTitle>
                  <p className="mt-2 max-w-3xl text-sm leading-7 text-text-muted">
                    {isArabic
                      ? 'ملخص الحساب والشركة داخل البوابة. البيانات هنا للعرض والمراجعة السريعة، بينما التعديلات الإدارية تُدار من القناة الداخلية.'
                      : 'A summary of your account and company inside the portal. This view is for review and reference, while administrative updates are handled internally.'}
                  </p>
                </div>
                {subscriptionLabel ? <Badge variant="success">{subscriptionLabel}</Badge> : null}
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="rounded-[calc(var(--radius)+0.35rem)] border border-border bg-background/90 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <Settings2 className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-text-main">{isArabic ? 'الحساب' : 'Account'}</p>
                    <p className="text-xs text-text-muted">{isArabic ? 'بيانات الدخول والهوية' : 'Login and identity details'}</p>
                  </div>
                </div>
                <dl className="mt-4 space-y-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-text-muted">{isArabic ? 'الاسم' : 'Name'}</dt>
                    <dd className="text-end font-medium text-text-main">{profile?.user.name ?? '-'}</dd>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-text-muted">{isArabic ? 'البريد' : 'Email'}</dt>
                    <dd className="text-end font-medium text-text-main">{profile?.user.email ?? '-'}</dd>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-text-muted">{isArabic ? 'الدور' : 'Role'}</dt>
                    <dd className="text-end font-medium text-text-main">{profile?.user.role ?? '-'}</dd>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-text-muted">{isArabic ? 'الخطة' : 'Plan'}</dt>
                    <dd className="text-end font-medium text-text-main">{profile?.subscription.plan ?? '-'}</dd>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-text-muted">{isArabic ? 'الحالة' : 'Status'}</dt>
                    <dd className="text-end font-medium text-text-main">{profile?.subscription.status ?? '-'}</dd>
                  </div>
                </dl>
              </div>

              <div className="rounded-[calc(var(--radius)+0.35rem)] border border-border bg-background/90 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-success/10 text-success">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-text-main">{isArabic ? 'الشركة' : 'Company'}</p>
                    <p className="text-xs text-text-muted">{isArabic ? 'الملف المرتبط بالحساب' : 'Profile linked to this account'}</p>
                  </div>
                </div>
                <dl className="mt-4 space-y-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-text-muted">{isArabic ? 'الاسم العربي' : 'Arabic name'}</dt>
                    <dd className="text-end font-medium text-text-main">{company?.nameAr ?? '-'}</dd>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-text-muted">{isArabic ? 'الاسم الإنجليزي' : 'English name'}</dt>
                    <dd className="text-end font-medium text-text-main">{company?.nameEn ?? '-'}</dd>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-text-muted">{isArabic ? 'الجهة الممثلة' : 'Representative'}</dt>
                    <dd className="text-end font-medium text-text-main">{company?.representativeName ?? '-'}</dd>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-text-muted">{isArabic ? 'الصفة' : 'Title'}</dt>
                    <dd className="text-end font-medium text-text-main">{company?.representativeTitle ?? '-'}</dd>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-text-muted">{isArabic ? 'البريد' : 'Email'}</dt>
                    <dd className="text-end font-medium text-text-main">{company?.email ?? '-'}</dd>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-text-muted">{isArabic ? 'الجوال' : 'Mobile'}</dt>
                    <dd className="text-end font-medium text-text-main">{company?.mobile ?? '-'}</dd>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-text-muted">{isArabic ? 'تاريخ الانضمام' : 'Joined'}</dt>
                    <dd className="text-end font-medium text-text-main">{company?.createdAt ? formatNotificationDate(company.createdAt, lang) : '-'}</dd>
                  </div>
                </dl>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card className="border-border/80 bg-background/90 shadow-[0_18px_50px_rgba(31,23,36,0.06)]">
              <CardContent className="space-y-4 p-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-warning/10 text-warning">
                    <FolderKanban className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-text-main">{isArabic ? 'نشاط النصوص' : 'Script activity'}</p>
                    <p className="text-xs text-text-muted">{isArabic ? 'حالة سريعة للنصوص المرسلة' : 'A quick snapshot of submitted scripts'}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: isArabic ? 'إجمالي' : 'Total', value: scriptStatusSummary.total },
                    { label: isArabic ? 'مقبول' : 'Approved', value: scriptStatusSummary.approved },
                    { label: isArabic ? 'مرفوض' : 'Rejected', value: scriptStatusSummary.rejected },
                    { label: isArabic ? 'قيد المعالجة' : 'In review', value: scriptStatusSummary.inFlight },
                  ].map((item) => (
                    <div key={item.label} className="rounded-[calc(var(--radius)+0.25rem)] border border-border bg-surface/80 p-3">
                      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-text-muted">{item.label}</p>
                      <p className="mt-1 text-2xl font-semibold text-text-main">{item.value}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/80 bg-background/90 shadow-[0_18px_50px_rgba(31,23,36,0.06)]">
              <CardContent className="space-y-4 p-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <CreditCard className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-text-main">{isArabic ? 'الاشتراك' : 'Subscription'}</p>
                    <p className="text-xs text-text-muted">{isArabic ? 'تفاصيل الخطة والحالة' : 'Plan and status details'}</p>
                  </div>
                </div>
                <div className="space-y-3 rounded-[calc(var(--radius)+0.35rem)] border border-border bg-surface/80 p-4">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-text-muted">{isArabic ? 'الخطة' : 'Plan'}</span>
                    <span className="font-medium text-text-main">{profile?.subscription.plan ?? '-'}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-text-muted">{isArabic ? 'الحالة' : 'Status'}</span>
                    <span className="font-medium text-text-main">{profile?.subscription.status ?? '-'}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-text-muted">{isArabic ? 'الرسوم' : 'Price'}</span>
                    <span className="font-medium text-text-main">
                      {new Intl.NumberFormat(lang === 'ar' ? 'ar-SA' : 'en-US', {
                        style: 'currency',
                        currency: 'SAR',
                        maximumFractionDigits: 0,
                      }).format(profile?.subscription.price ?? 0)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="space-y-4">
          <Card className="border-border/80 bg-background/90 shadow-[0_18px_50px_rgba(31,23,36,0.06)]">
            <CardContent className="space-y-3 p-5">
              <p className="text-sm font-semibold text-text-main">{isArabic ? 'إجراءات سريعة' : 'Quick actions'}</p>
              <div className="space-y-2">
                {[
                  { labelAr: 'الإشعارات', labelEn: 'Notifications', section: 'notifications' as const },
                  { labelAr: 'نصوصي', labelEn: 'My Scripts', section: 'scripts' as const },
                  { labelAr: 'الشهادات', labelEn: 'Certificates', section: 'certificates' as const },
                  { labelAr: 'إرشادات الامتثال', labelEn: 'Compliance Guidelines', section: 'compliance-guidelines' as const },
                ].map((item) => (
                  <Button
                    key={item.section}
                    variant="outline"
                    className="w-full justify-between"
                    onClick={() => setActiveSection(item.section)}
                  >
                    <span>{isArabic ? item.labelAr : item.labelEn}</span>
                    <ArrowUpRight className="h-4 w-4" />
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/80 bg-background/90 shadow-[0_18px_50px_rgba(31,23,36,0.06)]">
            <CardContent className="space-y-3 p-5">
              <p className="text-sm font-semibold text-text-main">{isArabic ? 'ملاحظات مهمة' : 'Important notes'}</p>
              <div className="space-y-3 text-sm leading-7 text-text-muted">
                <p>
                  {isArabic
                    ? 'هذه الصفحة تعرض البيانات المتاحة للحساب والشركة داخل البوابة. أي تعديل إداري على الملف يتم عبر القناة الداخلية.'
                    : 'This page shows the account and company data available inside the portal. Administrative file updates are handled through the internal channel.'}
                </p>
                <p>
                  {isArabic
                    ? 'إذا احتجت تنبيهًا جديدًا أو تحديثًا على حالة نص، ستجده أولًا في قسم الإشعارات أو نصوصي.'
                    : 'If you need a new alert or a script status update, you will find it first in Notifications or My Scripts.'}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  };

  const renderPaymentPage = () => {
    const paymentItem = paymentData?.items?.find((item) => item.scriptId === paymentScriptId) ?? null;
    return (
      <Card className="client-portal-panel overflow-hidden border-border/80 shadow-[0_18px_50px_rgba(31,23,36,0.06)]">
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>{lang === 'ar' ? 'صفحة دفع رسوم الشهادة' : 'Certificate Fee Payment'}</CardTitle>
            <Button variant="outline" size="sm" onClick={() => setActiveSection('scripts')}>
              {lang === 'ar' ? 'العودة إلى نصوصي' : 'Back to My Scripts'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {paymentLoading ? (
            <p className="text-sm text-text-muted">{lang === 'ar' ? 'جاري تحميل بيانات الدفع...' : 'Loading payment details...'}</p>
          ) : !paymentItem ? (
            <p className="text-sm text-text-muted">{lang === 'ar' ? 'هذا النص غير متاح للدفع الآن.' : 'This script is not ready for payment right now.'}</p>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <div className="rounded-[calc(var(--radius)+0.35rem)] border border-border bg-surface p-4">
                  <p className="mb-3 text-sm font-semibold text-text-main">{lang === 'ar' ? 'بيانات الدفع' : 'Payment Details'}</p>
                  <div className="grid grid-cols-1 gap-3">
                    <Input
                      label={lang === 'ar' ? 'اسم حامل البطاقة' : 'Card Holder Name'}
                      value={paymentForm.cardHolder}
                      onChange={(e) => setPaymentForm((prev) => ({ ...prev, cardHolder: e.target.value }))}
                    />
                    <Input
                      label={lang === 'ar' ? 'رقم البطاقة' : 'Card Number'}
                      value={paymentForm.cardNumber}
                      onChange={(e) => setPaymentForm((prev) => ({ ...prev, cardNumber: e.target.value }))}
                      placeholder="4111111111111111"
                      maxLength={19}
                    />
                    <div className="grid grid-cols-2 gap-3">
                      <Input
                        label={lang === 'ar' ? 'تاريخ الانتهاء' : 'Expiry Date'}
                        value={paymentForm.expiry}
                        onChange={(e) => setPaymentForm((prev) => ({ ...prev, expiry: e.target.value }))}
                        placeholder="MM/YY"
                        maxLength={5}
                      />
                      <Input
                        label={lang === 'ar' ? 'رمز الأمان' : 'CVV'}
                        value={paymentForm.cvv}
                        onChange={(e) => setPaymentForm((prev) => ({ ...prev, cvv: e.target.value }))}
                        placeholder="123"
                        maxLength={4}
                      />
                    </div>
                  </div>
                  <div className="mt-4">
                    <Button className="w-full" onClick={() => void submitPayment()} isLoading={paymentSubmitting}>
                      {lang === 'ar' ? 'ادفع الآن' : 'Pay Now'}
                    </Button>
                  </div>
                </div>

                <div className="rounded-[calc(var(--radius)+0.35rem)] border border-border bg-background/70 p-4">
                  <p className="font-semibold text-text-main">{paymentItem.scriptTitle}</p>
                  <p className="mt-1 text-sm text-text-muted">{paymentItem.scriptType}</p>
                  <div className="mt-4 space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-text-muted">{lang === 'ar' ? 'الرسوم الأساسية' : 'Base Fee'}</span>
                      <span>{new Intl.NumberFormat(lang === 'ar' ? 'ar-SA' : 'en-US', { style: 'currency', currency: paymentItem.certificateFee.currency, maximumFractionDigits: 2 }).format(paymentItem.certificateFee.baseAmount)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-text-muted">{lang === 'ar' ? 'الضريبة' : 'Tax'}</span>
                      <span>{new Intl.NumberFormat(lang === 'ar' ? 'ar-SA' : 'en-US', { style: 'currency', currency: paymentItem.certificateFee.currency, maximumFractionDigits: 2 }).format(paymentItem.certificateFee.taxAmount)}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between rounded-md bg-primary/10 px-3 py-2 text-base font-semibold text-primary">
                      <span>{lang === 'ar' ? 'الإجمالي' : 'Total'}</span>
                      <span>{new Intl.NumberFormat(lang === 'ar' ? 'ar-SA' : 'en-US', { style: 'currency', currency: paymentItem.certificateFee.currency, maximumFractionDigits: 2 }).format(paymentItem.certificateFee.totalAmount)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    );
  };

  const renderActiveSection = () => {
    if (activeSection === 'overview') return renderOverview();
    if (activeSection === 'scripts') return renderSubmissionList();
    if (activeSection === 'new-script') return renderNewScriptForm();
    if (activeSection === 'payment') return renderPaymentPage();
    if (activeSection === 'certificates') {
      return <ClientCertificatesSection lang={lang} />;
    }
    if (activeSection === 'notifications') {
      return renderNotificationsSection();
    }
    if (activeSection === 'compliance-guidelines') {
      return <ComplianceGuidelinesSection lang={lang} />;
    }
    return renderSettingsSection();
  };

  return (
    <ClientPortalLayout
      lang={lang}
      companyName={
        profile?.company
          ? (lang === 'ar' ? profile.company.nameAr : profile.company.nameEn)
          : (lang === 'ar' ? 'جاري تحميل معلومات الشركة...' : 'Loading company profile...')
      }
      userName={user?.name}
      activeSection={activeSection}
      onSectionChange={setActiveSection}
      onToggleLanguage={toggleLang}
      onLogout={handleLogout}
      subscriptionLabel={subscriptionLabel}
      sectionBadges={{
        notifications: notificationsUnreadCount,
      }}
      summary={{
        totalScripts: submissions.length,
        rejectedScripts: totalRejected,
      }}
    >
      <div className="space-y-4">
        {error && (
          <div className="rounded-[calc(var(--radius)+0.3rem)] border border-error/20 bg-error/10 p-3 text-sm text-error">{error}</div>
        )}
        {notice && (
          <div className="rounded-[calc(var(--radius)+0.3rem)] border border-success/20 bg-success/10 p-3 text-sm text-success">{notice}</div>
        )}
        {renderActiveSection()}
      </div>

      <Modal
        isOpen={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        title={lang === 'ar' ? 'تفاصيل الرفض والمخالفات' : 'Rejection Report & Findings'}
        className="max-w-4xl"
      >
        {detailsLoading ? (
          <p className="text-sm text-text-muted">{lang === 'ar' ? 'جاري التحميل...' : 'Loading...'}</p>
        ) : detailsError ? (
          <p className="text-sm text-error">{detailsError}</p>
        ) : !details ? (
          <p className="text-sm text-text-muted">{lang === 'ar' ? 'لا توجد بيانات متاحة' : 'No details available'}</p>
        ) : (
          (() => {
            const reportBlocks =
              details.sharedReports && details.sharedReports.length > 0
                ? details.sharedReports
                : (details.report ? [{ report: details.report, findings: details.findings ?? [] }] : []);

            return (
              <div className="space-y-4">
                <div className="rounded-md border border-border bg-background p-3 space-y-2">
                  <p className="font-semibold">{details.script.title}</p>
                  {details.decision?.decidedAt && (
                    <p className="text-sm text-text-muted">
                      {lang === 'ar' ? 'تاريخ قرار الرفض:' : 'Rejection decision date:'} {new Date(details.decision.decidedAt).toLocaleString()}
                    </p>
                  )}
                  {details.decision?.adminComment && (
                    <p className="text-sm">
                      <span className="font-medium">{lang === 'ar' ? 'تعليق الإدارة:' : 'Admin comment:'}</span> {details.decision.adminComment}
                    </p>
                  )}
                  {!details.decision?.adminComment && details.report?.reviewNotes && (
                    <p className="text-sm">
                      <span className="font-medium">{lang === 'ar' ? 'ملاحظة المراجع:' : 'Reviewer note:'}</span> {details.report.reviewNotes}
                    </p>
                  )}
                </div>

                {reportBlocks.length === 0 ? (
                  <p className="text-sm text-text-muted">
                    {lang === 'ar'
                      ? 'لم يتم إرفاق تقارير مع قرار الرفض من الإدارة.'
                      : 'No analysis reports were attached to this rejection decision.'}
                  </p>
                ) : (
                  <div className="space-y-4 max-h-[55vh] overflow-auto pe-1">
                    {reportBlocks.map((block) => (
                      <div key={block.report.id} className="space-y-3 rounded-lg border border-border bg-background p-3">
                        <div className="space-y-2">
                          <p className="text-sm font-semibold">
                            {lang === 'ar' ? 'التقرير' : 'Report'} #{block.report.id.slice(0, 8)}
                          </p>
                          <p className="text-xs text-text-muted">
                            {lang === 'ar' ? 'تاريخ التقرير:' : 'Report date:'} {new Date(block.report.createdAt).toLocaleString()}
                          </p>
                          {block.report.reviewNotes && (
                            <p className="text-xs text-text-muted">
                              {lang === 'ar' ? 'ملاحظة المراجع:' : 'Reviewer note:'} {block.report.reviewNotes}
                            </p>
                          )}
                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void downloadRejectionReportPdf(block)}
                              isLoading={downloadingReportId === block.report.id}
                            >
                              {lang === 'ar' ? 'تنزيل PDF' : 'Download PDF'}
                            </Button>
                          </div>
                        </div>

                        <div className="space-y-3">
                          {block.findings.length === 0 ? (
                            <p className="text-sm text-text-muted">{lang === 'ar' ? 'لا توجد مخالفات متاحة في هذا التقرير' : 'No findings available in this report'}</p>
                          ) : (
                            block.findings.map((finding) => (
                              <div key={finding.id} className="rounded-md border border-border bg-surface p-3 space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="font-semibold">{finding.titleAr}</p>
                                  <Badge variant={finding.severity === 'high' || finding.severity === 'critical' ? 'error' : 'warning'}>
                                    {finding.severity}
                                  </Badge>
                                </div>
                                {finding.descriptionAr && (
                                  <p className="text-sm text-text-muted">{finding.descriptionAr}</p>
                                )}
                                <p className="text-sm leading-relaxed bg-background rounded p-2 border border-border">
                                  {finding.evidenceSnippet}
                                </p>
                                <p className="text-xs text-text-muted">
                                  {lang === 'ar' ? 'المادة' : 'Article'} #{finding.articleId}
                                  {finding.pageNumber ? ` • ${lang === 'ar' ? 'صفحة' : 'Page'} ${finding.pageNumber}` : ''}
                                </p>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()
        )}
      </Modal>
      <Modal
        isOpen={scriptToDelete != null}
        onClose={() => setScriptToDelete(null)}
        title={lang === 'ar' ? 'إلغاء النص' : 'Cancel Script'}
      >
        <div className="space-y-4">
          <p className="text-sm text-text-muted">
            {lang === 'ar'
              ? 'سيتم إلغاء هذا النص وإشعار الإدارة بذلك. هل تريد المتابعة؟'
              : 'This script will be canceled and admin will be notified. Continue?'}
          </p>
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" onClick={() => setScriptToDelete(null)}>
              {lang === 'ar' ? 'رجوع' : 'Back'}
            </Button>
            <Button variant="danger" onClick={handleDeleteScript}>
              {lang === 'ar' ? 'تأكيد الإلغاء' : 'Confirm Cancel'}
            </Button>
          </div>
        </div>
      </Modal>
      <Modal
        isOpen={paymentSuccessOpen}
        onClose={() => {
          setPaymentSuccessOpen(false);
          setActiveSection('scripts');
        }}
        title={lang === 'ar' ? 'تم الدفع بنجاح' : 'Payment Successful'}
      >
        <div className="space-y-4">
          <p className="text-sm text-text-muted">
            {lang === 'ar'
              ? 'مبروك! تم استلام دفعتك بنجاح. يمكنك زيارة قسم الشهادات خلال 5 دقائق وستجد شهادتك هناك.'
              : 'Congratulations! Your payment was completed successfully. Visit the Certificates section within 5 minutes to find your certificate.'}
          </p>
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setPaymentSuccessOpen(false);
                setActiveSection('scripts');
              }}
            >
              {lang === 'ar' ? 'إغلاق' : 'Close'}
            </Button>
            <Button onClick={() => { setPaymentSuccessOpen(false); setActiveSection('certificates'); }}>
              {lang === 'ar' ? 'الذهاب إلى الشهادات' : 'Go to Certificates'}
            </Button>
          </div>
        </div>
      </Modal>
    </ClientPortalLayout>
  );
}
