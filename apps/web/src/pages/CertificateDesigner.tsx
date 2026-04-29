import { useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent, PointerEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowLeft,
  CalendarDays,
  FileImage,
  Image as ImageIcon,
  Loader2,
  QrCode,
  Save,
  Type,
  X,
} from 'lucide-react';
import {
  certificatesApi,
  type CertificateBackgroundFit,
  type CertificateElementType,
  type CertificateOrientation,
  type CertificatePageSize,
  type CertificateTemplate,
  type CertificateTemplateElement,
} from '@/api';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { useLangStore } from '@/store/langStore';
import { cn } from '@/utils/cn';

const PAGE_RATIOS: Record<CertificatePageSize, number> = {
  A4: 297 / 210,
  A5: 210 / 148,
  Letter: 11 / 8.5,
};

const GRID_SIZE = 20;
const CANVAS_BASE_WIDTH = 1000;
const FILM_LOGO_PLACEHOLDER =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="120" viewBox="0 0 240 120"><rect width="240" height="120" rx="16" fill="#111827"/><text x="120" y="54" text-anchor="middle" font-family="Arial" font-size="18" fill="#ffffff">FILM</text><text x="120" y="80" text-anchor="middle" font-family="Arial" font-size="16" fill="#d1d5db">COMMISSION</text></svg>');

const CERTIFICATE_FONT_OPTIONS = [
  { label: 'Cairo', value: "'Cairo', Tahoma, sans-serif" },
  { label: 'Hacen Saudi Arabia', value: "'Hacen Saudi Arabia', 'Cairo', Tahoma, sans-serif" },
  { label: 'Hacen Tunisia', value: "'Hacen Tunisia', 'Cairo', Tahoma, sans-serif" },
  { label: 'Hacen Liner Screen', value: "'Hacen Liner Screen', 'Cairo', Tahoma, sans-serif" },
  { label: 'Hacen Algeria', value: "'Hacen Algeria', 'Cairo', Tahoma, sans-serif" },
  { label: 'Traditional Arabic', value: "'Traditional Arabic', 'Cairo', Tahoma, serif" },
  { label: 'Simplified Arabic', value: "'Simplified Arabic', 'Cairo', Tahoma, sans-serif" },
  { label: 'Tahoma', value: 'Tahoma, Arial, sans-serif' },
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Times New Roman', value: "'Times New Roman', serif" },
];

type DragMode = 'move' | 'resize';

function snap(value: number, enabled: boolean) {
  return enabled ? Math.round(value / GRID_SIZE) * GRID_SIZE : value;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function canvasBaseHeightFromRatio(ratio: number) {
  return CANVAS_BASE_WIDTH / ratio;
}

function clampElementToCanvas(
  element: CertificateTemplateElement,
  canvasWidth: number,
  canvasHeight: number,
): CertificateTemplateElement {
  const minWidth = 40;
  const minHeight = 32;
  const width = clamp(Number.isFinite(element.width) ? element.width : minWidth, minWidth, canvasWidth);
  const height = clamp(Number.isFinite(element.height) ? element.height : minHeight, minHeight, canvasHeight);
  const x = clamp(Number.isFinite(element.x) ? element.x : 0, 0, Math.max(0, canvasWidth - width));
  const y = clamp(Number.isFinite(element.y) ? element.y : 0, 0, Math.max(0, canvasHeight - height));
  return { ...element, x, y, width, height };
}

function makeElement(type: CertificateElementType, lang: 'ar' | 'en'): CertificateTemplateElement {
  const id = `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const base = {
    id,
    type,
    x: 120,
    y: 120,
    width: 220,
    height: 80,
    fontFamily: "'Cairo', Tahoma, sans-serif",
    fontSize: type === 'title' ? 34 : 18,
    bold: type === 'title',
    italic: false,
    color: '#111827',
    align: 'center' as const,
    opacity: 1,
  };
  if (type === 'logo') return { ...base, width: 160, height: 80, logoSource: 'film_commission', imageUrl: FILM_LOGO_PLACEHOLDER };
  if (type === 'qr') return { ...base, width: 120, height: 120 };
  if (type === 'image') return { ...base, width: 180, height: 120 };
  if (type === 'date') return { ...base, width: 340, height: 56, text: '{{issued_at_dual}}' };
  if (type === 'footer') return { ...base, width: 520, height: 56, text: lang === 'ar' ? 'نص تذييل الشهادة' : 'Certificate footer text' };
  if (type === 'paragraph') {
    return {
      ...base,
      width: 520,
      height: 120,
      text: lang === 'ar' ? 'اكتب النص هنا' : 'Write your text here',
    };
  }
  if (type === 'script_name') return { ...base, width: 520, height: 64, text: '{{script_title}}', fontSize: 28, bold: true };
  if (type === 'company_name') return { ...base, width: 520, height: 56, text: '{{company_name}}', fontSize: 24, bold: true };
  return { ...base, width: 520, height: 70, text: lang === 'ar' ? 'شهادة اعتماد' : 'Certificate of Approval' };
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function formatDualDate(date: Date, lang: 'ar' | 'en') {
  if (!Number.isFinite(date.getTime())) return '';
  const gregorianLocale = lang === 'ar' ? 'ar-SA' : 'en-US';
  const gregorian = new Intl.DateTimeFormat(gregorianLocale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
  const hijri = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
  return lang === 'ar' ? `${hijri} هـ الموافق ${gregorian} م` : gregorian;
}

function renderElementLabel(element: CertificateTemplateElement, lang: 'ar' | 'en') {
  if (element.type === 'qr') return 'QR';
  if (element.type === 'logo' && element.logoSource === 'client') return 'CLIENT LOGO';
  if (element.type === 'script_name') return '{{script_title}}';
  if (element.type === 'company_name') return '{{company_name}}';
  if (element.type === 'date') return formatDualDate(new Date(), lang);
  return element.text || element.type;
}

function getCanvasBackgroundStyle(template: CertificateTemplate, showGrid: boolean) {
  const images: string[] = [];
  const sizes: string[] = [];
  const repeats: string[] = [];
  const positions: string[] = [];

  if (template.backgroundImageUrl) {
    const imageSize = template.backgroundImageFit === 'tile' ? '160px 160px' : template.backgroundImageFit;
    const imageRepeat = template.backgroundImageFit === 'tile' ? 'repeat' : 'no-repeat';

    images.push(`linear-gradient(rgba(255,255,255,${1 - template.backgroundImageOpacity}), rgba(255,255,255,${1 - template.backgroundImageOpacity}))`);
    sizes.push('100% 100%');
    repeats.push('no-repeat');
    positions.push('center');

    images.push(`url("${template.backgroundImageUrl}")`);
    sizes.push(imageSize);
    repeats.push(imageRepeat);
    positions.push('center');
  }

  if (showGrid) {
    images.push('linear-gradient(rgba(17,24,39,.12) 1px, transparent 1px)');
    sizes.push(`${GRID_SIZE}px ${GRID_SIZE}px`);
    repeats.push('repeat');
    positions.push('center');

    images.push('linear-gradient(90deg, rgba(17,24,39,.12) 1px, transparent 1px)');
    sizes.push(`${GRID_SIZE}px ${GRID_SIZE}px`);
    repeats.push('repeat');
    positions.push('center');
  }

  return {
    backgroundImage: images.join(', '),
    backgroundSize: sizes.join(', '),
    backgroundRepeat: repeats.join(', '),
    backgroundPosition: positions.join(', '),
  };
}

export function CertificateDesigner() {
  const { templateId = '' } = useParams();
  const navigate = useNavigate();
  const { lang } = useLangStore();
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [template, setTemplate] = useState<CertificateTemplate | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [showGrid, setShowGrid] = useState(true);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [savedTemplateKey, setSavedTemplateKey] = useState('');
  const [showBackWarning, setShowBackWarning] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const dragState = useRef<{
    id: string;
    mode: DragMode;
    startX: number;
    startY: number;
    origin: CertificateTemplateElement;
  } | null>(null);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      setError('');
      try {
        const response = await certificatesApi.getTemplate(templateId);
        setTemplate(response.template);
        setSavedTemplateKey(JSON.stringify(response.template));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to load template');
      } finally {
        setIsLoading(false);
      }
    };
    if (templateId) void load();
  }, [templateId]);

  const text = useMemo(() => ({
    back: lang === 'ar' ? 'العودة إلى الشهادات' : 'Back to certificates',
    preview: lang === 'ar' ? 'معاينة' : 'Preview',
    save: lang === 'ar' ? 'حفظ' : 'Save',
    tools: lang === 'ar' ? 'الأدوات' : 'Tools',
    pageSize: lang === 'ar' ? 'حجم الصفحة' : 'Page size',
    orientation: lang === 'ar' ? 'الاتجاه' : 'Orientation',
    landscape: lang === 'ar' ? 'أفقي' : 'Landscape',
    portrait: lang === 'ar' ? 'عمودي' : 'Portrait',
    showGrid: lang === 'ar' ? 'إظهار الشبكة' : 'Show grid',
    snapToGrid: lang === 'ar' ? 'الالتقاط للشبكة' : 'Snap to grid',
    backgroundColor: lang === 'ar' ? 'لون الخلفية' : 'Background color',
    backgroundImage: lang === 'ar' ? 'صورة الخلفية' : 'Background image',
    imageFit: lang === 'ar' ? 'ملاءمة الصورة' : 'Image fit',
    cover: lang === 'ar' ? 'تغطية' : 'Cover',
    contain: lang === 'ar' ? 'احتواء' : 'Contain',
    tile: lang === 'ar' ? 'تكرار' : 'Tile',
    backgroundOpacity: lang === 'ar' ? 'شفافية الخلفية' : 'Background opacity',
    logo: lang === 'ar' ? 'الشعار' : 'Logo',
    title: lang === 'ar' ? 'العنوان' : 'Title',
    text: lang === 'ar' ? 'نص' : 'Text',
    scriptName: lang === 'ar' ? 'اسم النص' : 'Script Name',
    companyName: lang === 'ar' ? 'اسم الشركة' : 'Company Name',
    image: lang === 'ar' ? 'صورة' : 'Image',
    date: lang === 'ar' ? 'التاريخ' : 'Date',
    footer: lang === 'ar' ? 'التذييل' : 'Footer',
    settings: lang === 'ar' ? 'الإعدادات' : 'Settings',
    templateName: lang === 'ar' ? 'اسم القالب' : 'Template name',
    description: lang === 'ar' ? 'الوصف' : 'Description',
    selectElement: lang === 'ar' ? 'اختر عنصراً من مساحة التصميم لتعديل مكانه وتنسيقه.' : 'Select an element on the canvas to edit its placement and styling.',
    width: lang === 'ar' ? 'العرض' : 'Width',
    height: lang === 'ar' ? 'الارتفاع' : 'Height',
    font: lang === 'ar' ? 'الخط' : 'Font',
    size: lang === 'ar' ? 'الحجم' : 'Size',
    color: lang === 'ar' ? 'اللون' : 'Color',
    logoSource: lang === 'ar' ? 'مصدر الشعار' : 'Logo source',
    filmCommission: lang === 'ar' ? 'هيئة الأفلام' : 'Film Commission',
    clientLogo: lang === 'ar' ? 'شعار العميل' : 'Client Logo',
    uploadedLogo: lang === 'ar' ? 'شعار مرفوع' : 'Uploaded Logo',
    uploadLogo: lang === 'ar' ? 'رفع شعار' : 'Upload logo',
    uploadImage: lang === 'ar' ? 'رفع صورة' : 'Upload image',
    opacity: lang === 'ar' ? 'الشفافية' : 'Opacity',
    deleteElement: lang === 'ar' ? 'حذف العنصر' : 'Delete element',
    unsavedTitle: lang === 'ar' ? 'لديك تغييرات غير محفوظة' : 'You have unsaved changes',
    unsavedMessage: lang === 'ar'
      ? 'إذا عدت إلى صفحة الشهادات الآن، ستفقد التغييرات التي لم تحفظها.'
      : 'If you go back to the certificates page now, your unsaved changes will be lost.',
    stay: lang === 'ar' ? 'البقاء في المصمم' : 'Stay in designer',
    leave: lang === 'ar' ? 'الخروج دون حفظ' : 'Leave without saving',
  }), [lang]);

  const selected = useMemo(
    () => template?.templateData.elements.find((element) => element.id === selectedId) ?? null,
    [selectedId, template],
  );

  const canvasRatio = useMemo(() => {
    if (!template) return 16 / 9;
    const ratio = PAGE_RATIOS[template.pageSize] ?? PAGE_RATIOS.A4;
    return template.orientation === 'portrait' ? 1 / ratio : ratio;
  }, [template]);

  const currentTemplateKey = useMemo(() => template ? JSON.stringify(template) : '', [template]);
  const hasUnsavedChanges = Boolean(template && savedTemplateKey && currentTemplateKey !== savedTemplateKey);

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [hasUnsavedChanges]);

  const updateTemplate = (patch: Partial<CertificateTemplate>) => {
    setSuccess('');
    setTemplate((current) => current ? { ...current, ...patch } : current);
  };

  const updateElement = (id: string, patch: Partial<CertificateTemplateElement>) => {
    setSuccess('');
    setTemplate((current) => {
      if (!current) return current;
      const canvasHeight = canvasBaseHeightFromRatio(
        current.orientation === 'portrait'
          ? 1 / (PAGE_RATIOS[current.pageSize] ?? PAGE_RATIOS.A4)
          : (PAGE_RATIOS[current.pageSize] ?? PAGE_RATIOS.A4),
      );
      return {
        ...current,
        templateData: {
          elements: current.templateData.elements.map((element) =>
            element.id === id
              ? clampElementToCanvas({ ...element, ...patch }, CANVAS_BASE_WIDTH, canvasHeight)
              : element,
          ),
        },
      };
    });
  };

  const addElement = (type: CertificateElementType, x = 120, y = 120) => {
    setSuccess('');
    setTemplate((current) => {
      if (!current) return current;
      const ratio = current.orientation === 'portrait'
        ? 1 / (PAGE_RATIOS[current.pageSize] ?? PAGE_RATIOS.A4)
        : (PAGE_RATIOS[current.pageSize] ?? PAGE_RATIOS.A4);
      const canvasHeight = canvasBaseHeightFromRatio(ratio);
      const rawElement = { ...makeElement(type, lang), x: snap(x, snapToGrid), y: snap(y, snapToGrid) };
      const element = clampElementToCanvas(rawElement, CANVAS_BASE_WIDTH, canvasHeight);
      setSelectedId(element.id);
      return {
        ...current,
        templateData: { elements: [...current.templateData.elements, element] },
      };
    });
  };

  const onToolDragStart = (event: DragEvent, type: CertificateElementType) => {
    event.dataTransfer.setData('application/x-certificate-tool', type);
    event.dataTransfer.effectAllowed = 'copy';
  };

  const onCanvasDrop = (event: DragEvent) => {
    event.preventDefault();
    const type = event.dataTransfer.getData('application/x-certificate-tool') as CertificateElementType;
    if (!type) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const canvasHeight = canvasBaseHeightFromRatio(canvasRatio);
    const scaleX = CANVAS_BASE_WIDTH / rect.width;
    const scaleY = canvasHeight / rect.height;
    addElement(type, (event.clientX - rect.left) * scaleX, (event.clientY - rect.top) * scaleY);
  };

  const removeSelected = () => {
    if (!selectedId) return;
    setSuccess('');
    setTemplate((current) => current ? {
      ...current,
      templateData: { elements: current.templateData.elements.filter((element) => element.id !== selectedId) },
    } : current);
    setSelectedId('');
  };

  const onPointerDown = (event: PointerEvent, element: CertificateTemplateElement, mode: DragMode) => {
    event.preventDefault();
    event.stopPropagation();
    setSelectedId(element.id);
    dragState.current = {
      id: element.id,
      mode,
      startX: event.clientX,
      startY: event.clientY,
      origin: element,
    };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent) => {
    const state = dragState.current;
    if (!state) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const canvasHeight = canvasBaseHeightFromRatio(canvasRatio);
    const dx = (event.clientX - state.startX) * (CANVAS_BASE_WIDTH / rect.width);
    const dy = (event.clientY - state.startY) * (canvasHeight / rect.height);
    if (state.mode === 'move') {
      updateElement(state.id, {
        x: snap(state.origin.x + dx, snapToGrid),
        y: snap(state.origin.y + dy, snapToGrid),
      });
    } else {
      updateElement(state.id, {
        width: snap(state.origin.width + dx, snapToGrid),
        height: snap(state.origin.height + dy, snapToGrid),
      });
    }
  };

  const onPointerUp = () => {
    dragState.current = null;
  };

  const saveTemplate = async () => {
    if (!template) return;
    setIsSaving(true);
    setError('');
    setSuccess('');
    try {
      const response = await certificatesApi.updateTemplate(template.id, {
        name: template.name,
        description: template.description,
        isDefault: template.isDefault,
        pageSize: template.pageSize,
        orientation: template.orientation,
        backgroundColor: template.backgroundColor,
        backgroundImageUrl: template.backgroundImageUrl,
        backgroundImageFit: template.backgroundImageFit,
        backgroundImageOpacity: template.backgroundImageOpacity,
        templateData: template.templateData,
      });
      setTemplate(response.template);
      setSavedTemplateKey(JSON.stringify(response.template));
      setSuccess(lang === 'ar' ? 'تم حفظ القالب.' : 'Template saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save template');
    } finally {
      setIsSaving(false);
    }
  };

  const uploadBackground = async (file?: File) => {
    if (!file) return;
    updateTemplate({ backgroundImageUrl: await readFileAsDataUrl(file) });
  };

  const uploadElementImage = async (file?: File) => {
    if (!file || !selected) return;
    updateElement(selected.id, { imageUrl: await readFileAsDataUrl(file), logoSource: selected.type === 'logo' ? 'uploaded' : selected.logoSource });
  };

  const goBackToCertificates = () => {
    if (hasUnsavedChanges) {
      setShowBackWarning(true);
      return;
    }
    navigate('/app/certificates');
  };

  const resolvePreviewText = (value?: string) => {
    return (value ?? '')
      .replaceAll('{{script_title}}', lang === 'ar' ? 'اسم النص المعتمد' : 'Approved Script Name')
      .replaceAll('{{company_name}}', lang === 'ar' ? 'اسم الشركة المالكة' : 'Owning Company Name')
      .replaceAll('{{issued_at}}', new Date().toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-US'))
      .replaceAll('{{approved_at}}', new Date().toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-US'))
      .replaceAll('{{issued_at_dual}}', formatDualDate(new Date(), lang))
      .replaceAll('{{approved_at_dual}}', formatDualDate(new Date(), lang))
      .replaceAll('{{certificate_number}}', 'CERT-XXXXXX')
      .replaceAll('{{amount_paid}}', lang === 'ar' ? '٤٬٠٢٥ ر.س' : 'SAR 4,025');
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-text-muted">
        <Loader2 className="h-4 w-4 animate-spin" />
        {lang === 'ar' ? 'جاري تحميل المصمم...' : 'Loading designer...'}
      </div>
    );
  }

  if (!template) {
    return <div className="rounded-[var(--radius)] border border-error/20 bg-error/10 p-3 text-sm text-error">{error || 'Template not found'}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-main">{template.name}</h1>
          <p className="mt-1 text-sm text-text-muted">{lang === 'ar' ? 'مصمم قالب الشهادة' : 'Certificate template designer'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={goBackToCertificates}>
            <ArrowLeft className="me-2 h-4 w-4 rtl:rotate-180" />
            {text.back}
          </Button>
          <Button variant="outline" onClick={() => setShowPreview(true)}>
            {text.preview}
          </Button>
          <Button onClick={() => void saveTemplate()} isLoading={isSaving}>
            <Save className="me-2 h-4 w-4" />
            {text.save}
          </Button>
        </div>
      </div>

      {error && <div className="rounded-[var(--radius)] border border-error/20 bg-error/10 p-3 text-sm text-error">{error}</div>}
      {success && <div className="rounded-[var(--radius)] border border-success/20 bg-success/10 p-3 text-sm text-success">{success}</div>}

      <div className="grid min-h-[calc(100vh-12rem)] grid-cols-1 gap-4 xl:grid-cols-[260px_minmax(0,1fr)_300px]">
        <Card>
          <CardContent className="space-y-3 p-4">
            <p className="text-sm font-semibold uppercase tracking-wide text-text-muted">{text.tools}</p>
            <Select
              label={text.pageSize}
              value={template.pageSize}
              onChange={(event) => updateTemplate({ pageSize: event.target.value as CertificatePageSize })}
              options={[{ label: 'A4', value: 'A4' }, { label: 'A5', value: 'A5' }, { label: 'Letter', value: 'Letter' }]}
            />
            <Select
              label={text.orientation}
              value={template.orientation}
              onChange={(event) => updateTemplate({ orientation: event.target.value as CertificateOrientation })}
              options={[{ label: text.landscape, value: 'landscape' }, { label: text.portrait, value: 'portrait' }]}
            />
            <label className="flex items-center justify-between rounded-[var(--radius)] border border-border p-2 text-sm">
              <span>{text.showGrid}</span>
              <input type="checkbox" checked={showGrid} onChange={(event) => setShowGrid(event.target.checked)} />
            </label>
            <label className="flex items-center justify-between rounded-[var(--radius)] border border-border p-2 text-sm">
              <span>{text.snapToGrid}</span>
              <input type="checkbox" checked={snapToGrid} onChange={(event) => setSnapToGrid(event.target.checked)} />
            </label>
            <Input label={text.backgroundColor} type="color" value={template.backgroundColor} onChange={(event) => updateTemplate({ backgroundColor: event.target.value })} />
            <Input label={text.backgroundImage} type="file" accept="image/*" onChange={(event) => void uploadBackground(event.target.files?.[0])} />
            <Select
              label={text.imageFit}
              value={template.backgroundImageFit}
              onChange={(event) => updateTemplate({ backgroundImageFit: event.target.value as CertificateBackgroundFit })}
              options={[{ label: text.cover, value: 'cover' }, { label: text.contain, value: 'contain' }, { label: text.tile, value: 'tile' }]}
            />
            <Input
              label={text.backgroundOpacity}
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={template.backgroundImageOpacity}
              onChange={(event) => updateTemplate({ backgroundImageOpacity: Number(event.target.value) })}
            />
            <div className="grid grid-cols-2 gap-2 pt-2">
              <Button draggable variant="outline" size="sm" onDragStart={(event) => onToolDragStart(event, 'logo')} onClick={() => addElement('logo')}><ImageIcon className="me-2 h-4 w-4" />{text.logo}</Button>
              <Button draggable variant="outline" size="sm" onDragStart={(event) => onToolDragStart(event, 'title')} onClick={() => addElement('title')}><Type className="me-2 h-4 w-4" />{text.title}</Button>
              <Button draggable variant="outline" size="sm" onDragStart={(event) => onToolDragStart(event, 'paragraph')} onClick={() => addElement('paragraph')}><Type className="me-2 h-4 w-4" />{text.text}</Button>
              <Button draggable variant="outline" size="sm" onDragStart={(event) => onToolDragStart(event, 'script_name')} onClick={() => addElement('script_name')}><Type className="me-2 h-4 w-4" />{text.scriptName}</Button>
              <Button draggable variant="outline" size="sm" onDragStart={(event) => onToolDragStart(event, 'company_name')} onClick={() => addElement('company_name')}><Type className="me-2 h-4 w-4" />{text.companyName}</Button>
              <Button draggable variant="outline" size="sm" onDragStart={(event) => onToolDragStart(event, 'qr')} onClick={() => addElement('qr')}><QrCode className="me-2 h-4 w-4" />QR</Button>
              <Button draggable variant="outline" size="sm" onDragStart={(event) => onToolDragStart(event, 'image')} onClick={() => addElement('image')}><FileImage className="me-2 h-4 w-4" />{text.image}</Button>
              <Button draggable variant="outline" size="sm" onDragStart={(event) => onToolDragStart(event, 'date')} onClick={() => addElement('date')}><CalendarDays className="me-2 h-4 w-4" />{text.date}</Button>
              <Button draggable variant="outline" size="sm" className="col-span-2" onDragStart={(event) => onToolDragStart(event, 'footer')} onClick={() => addElement('footer')}>{text.footer}</Button>
            </div>
          </CardContent>
        </Card>

        <div className="flex min-h-[640px] items-center justify-center overflow-auto rounded-[var(--radius)] border border-border bg-background p-6">
          <div
            ref={canvasRef}
            className="relative shadow-xl"
            style={{
              width: 'min(100%, 1000px)',
              aspectRatio: `${canvasRatio}`,
              backgroundColor: template.backgroundColor,
              ...getCanvasBackgroundStyle(template, showGrid),
            }}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onDragOver={(event) => event.preventDefault()}
            onDrop={onCanvasDrop}
            onPointerDown={() => setSelectedId('')}
          >
            {template.templateData.elements.map((element) => (
              <div
                key={element.id}
                className={cn(
                  'group absolute select-none border bg-white/5 p-1 text-text-main',
                  selectedId === element.id ? 'border-primary ring-2 ring-primary/20' : 'border-transparent hover:border-primary/40',
                )}
                style={{
                  left: `${(element.x / CANVAS_BASE_WIDTH) * 100}%`,
                  top: `${(element.y / canvasBaseHeightFromRatio(canvasRatio)) * 100}%`,
                  width: `${(element.width / CANVAS_BASE_WIDTH) * 100}%`,
                  height: `${(element.height / canvasBaseHeightFromRatio(canvasRatio)) * 100}%`,
                  opacity: element.opacity ?? 1,
                  fontFamily: element.fontFamily,
                  fontSize: element.fontSize,
                  fontWeight: element.bold ? 700 : 400,
                  fontStyle: element.italic ? 'italic' : 'normal',
                  color: element.color,
                  textAlign: element.align,
                }}
                onPointerDown={(event) => onPointerDown(event, element, 'move')}
              >
                {element.type === 'qr' ? (
                  <div className="flex h-full w-full items-center justify-center border-2 border-dashed border-text-muted bg-white text-xs font-semibold text-text-muted">
                    QR
                  </div>
                ) : element.type === 'logo' && element.logoSource === 'client' ? (
                  <div className="flex h-full w-full items-center justify-center border border-dashed border-text-muted text-xs">
                    {text.clientLogo}
                  </div>
                ) : element.type === 'image' || element.type === 'logo' ? (
                  element.imageUrl ? <img src={element.imageUrl} alt="" className="h-full w-full object-contain" /> : <div className="flex h-full items-center justify-center border border-dashed border-text-muted text-xs">{text.image}</div>
                ) : (
                <div className="h-full w-full overflow-hidden whitespace-pre-wrap">{renderElementLabel(element, lang)}</div>
                )}
                <span
                  className="absolute bottom-0 end-0 h-4 w-4 cursor-se-resize rounded-tl bg-primary"
                  onPointerDown={(event) => onPointerDown(event, element, 'resize')}
                />
                <button
                  type="button"
                  className="absolute end-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-error/85 text-white opacity-0 transition group-hover:opacity-100"
                  onClick={(event) => {
                    event.stopPropagation();
                    setTemplate((current) => current ? {
                      ...current,
                      templateData: { elements: current.templateData.elements.filter((entry) => entry.id !== element.id) },
                    } : current);
                    if (selectedId === element.id) setSelectedId('');
                  }}
                  aria-label={text.deleteElement}
                  title={text.deleteElement}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <Card>
          <CardContent className="space-y-3 p-4">
            <p className="text-sm font-semibold uppercase tracking-wide text-text-muted">{text.settings}</p>
            {!selected ? (
              <div className="space-y-3">
                <Input label={text.templateName} value={template.name} onChange={(event) => updateTemplate({ name: event.target.value })} />
                <Textarea label={text.description} value={template.description ?? ''} onChange={(event) => updateTemplate({ description: event.target.value })} />
                <p className="text-sm text-text-muted">{text.selectElement}</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <Input label="X" type="number" value={selected.x} onChange={(event) => updateElement(selected.id, { x: Number(event.target.value) })} />
                  <Input label="Y" type="number" value={selected.y} onChange={(event) => updateElement(selected.id, { y: Number(event.target.value) })} />
                  <Input label={text.width} type="number" value={selected.width} onChange={(event) => updateElement(selected.id, { width: Number(event.target.value) })} />
                  <Input label={text.height} type="number" value={selected.height} onChange={(event) => updateElement(selected.id, { height: Number(event.target.value) })} />
                </div>
                {(selected.type === 'title' || selected.type === 'paragraph' || selected.type === 'script_name' || selected.type === 'company_name' || selected.type === 'date' || selected.type === 'footer') && (
                  <>
                    <Textarea label={text.text} value={selected.text ?? ''} onChange={(event) => updateElement(selected.id, { text: event.target.value })} />
                    <Select
                      label={text.font}
                      value={selected.fontFamily ?? "'Cairo', Tahoma, sans-serif"}
                      onChange={(event) => updateElement(selected.id, { fontFamily: event.target.value })}
                      options={CERTIFICATE_FONT_OPTIONS}
                    />
                    <Input label={text.size} type="number" value={selected.fontSize ?? 18} onChange={(event) => updateElement(selected.id, { fontSize: Number(event.target.value) })} />
                    <Input label={text.color} type="color" value={selected.color ?? '#111827'} onChange={(event) => updateElement(selected.id, { color: event.target.value })} />
                    <div className="flex gap-2">
                      <Button variant={selected.bold ? 'primary' : 'outline'} size="sm" onClick={() => updateElement(selected.id, { bold: !selected.bold })}>B</Button>
                      <Button variant={selected.italic ? 'primary' : 'outline'} size="sm" onClick={() => updateElement(selected.id, { italic: !selected.italic })}>I</Button>
                      <Button variant={selected.align === 'left' ? 'primary' : 'outline'} size="sm" onClick={() => updateElement(selected.id, { align: 'left' })}><AlignLeft className="h-4 w-4" /></Button>
                      <Button variant={selected.align === 'center' ? 'primary' : 'outline'} size="sm" onClick={() => updateElement(selected.id, { align: 'center' })}><AlignCenter className="h-4 w-4" /></Button>
                      <Button variant={selected.align === 'right' ? 'primary' : 'outline'} size="sm" onClick={() => updateElement(selected.id, { align: 'right' })}><AlignRight className="h-4 w-4" /></Button>
                    </div>
                  </>
                )}
                {selected.type === 'logo' && (
                  <>
                    <Select
                      label={text.logoSource}
                      value={selected.logoSource ?? 'film_commission'}
                      onChange={(event) => {
                        const logoSource = event.target.value as 'film_commission' | 'client' | 'uploaded';
                        updateElement(selected.id, {
                          logoSource,
                          imageUrl:
                            logoSource === 'film_commission'
                              ? FILM_LOGO_PLACEHOLDER
                              : (logoSource === 'client' ? undefined : selected.imageUrl),
                        });
                      }}
                      options={[{ label: text.filmCommission, value: 'film_commission' }, { label: text.clientLogo, value: 'client' }, { label: text.uploadedLogo, value: 'uploaded' }]}
                    />
                    <Input label={text.uploadLogo} type="file" accept="image/*" onChange={(event) => void uploadElementImage(event.target.files?.[0])} />
                  </>
                )}
                {selected.type === 'image' && <Input label={text.uploadImage} type="file" accept="image/*" onChange={(event) => void uploadElementImage(event.target.files?.[0])} />}
                <Input
                  label={text.opacity}
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={selected.opacity ?? 1}
                  onChange={(event) => updateElement(selected.id, { opacity: Number(event.target.value) })}
                />
                <Button variant="danger" size="sm" onClick={removeSelected}>{text.deleteElement}</Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Modal
        isOpen={showPreview}
        onClose={() => setShowPreview(false)}
        title={text.preview}
        className="max-w-5xl"
      >
        <div className="max-h-[75vh] overflow-auto rounded-[var(--radius)] border border-border bg-background p-4">
          <div
            className="relative mx-auto shadow-xl"
            style={{
              width: 'min(100%, 1000px)',
              aspectRatio: `${canvasRatio}`,
              backgroundColor: template.backgroundColor,
              ...getCanvasBackgroundStyle(template, false),
            }}
          >
            {template.templateData.elements.map((element) => (
              <div
                key={`preview-${element.id}`}
                className="absolute overflow-hidden"
                style={{
                  left: `${(element.x / CANVAS_BASE_WIDTH) * 100}%`,
                  top: `${(element.y / canvasBaseHeightFromRatio(canvasRatio)) * 100}%`,
                  width: `${(element.width / CANVAS_BASE_WIDTH) * 100}%`,
                  height: `${(element.height / canvasBaseHeightFromRatio(canvasRatio)) * 100}%`,
                  opacity: element.opacity ?? 1,
                  fontFamily: element.fontFamily,
                  fontSize: element.fontSize,
                  fontWeight: element.bold ? 700 : 400,
                  fontStyle: element.italic ? 'italic' : 'normal',
                  color: element.color,
                  textAlign: element.align,
                  lineHeight: 1.35,
                }}
              >
                {element.type === 'qr' ? (
                  <div className="flex h-full w-full items-center justify-center border-2 border-dashed border-text-muted bg-white text-xs font-semibold text-text-muted">
                    QR
                  </div>
                ) : element.type === 'logo' && element.logoSource === 'client' ? (
                  <div className="flex h-full w-full items-center justify-center border border-dashed border-text-muted text-xs">
                    {text.clientLogo}
                  </div>
                ) : element.type === 'image' || element.type === 'logo' ? (
                  element.imageUrl ? <img src={element.imageUrl} alt="" className="h-full w-full object-contain" /> : <div className="flex h-full items-center justify-center border border-dashed border-text-muted text-xs">{text.image}</div>
                ) : (
                  <div className="h-full w-full whitespace-pre-wrap">
                    {resolvePreviewText(
                      element.type === 'date'
                        ? '{{issued_at_dual}}'
                        : element.type === 'script_name'
                          ? '{{script_title}}'
                          : element.type === 'company_name'
                            ? '{{company_name}}'
                            : (element.text ?? ''),
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showBackWarning}
        onClose={() => setShowBackWarning(false)}
        title={text.unsavedTitle}
      >
        <div className="space-y-4">
          <p className="text-sm text-text-muted">{text.unsavedMessage}</p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => setShowBackWarning(false)}>
              {text.stay}
            </Button>
            <Button variant="danger" onClick={() => navigate('/app/certificates')}>
              {text.leave}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
