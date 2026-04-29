import { useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent, PointerEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  CalendarDays,
  FileImage,
  Image as ImageIcon,
  Loader2,
  QrCode,
  Save,
  Type,
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

function makeElement(type: CertificateElementType): CertificateTemplateElement {
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
  if (type === 'date') return { ...base, width: 220, height: 48, text: '{{issued_at}}' };
  if (type === 'footer') return { ...base, width: 520, height: 56, text: 'Certificate footer text' };
  if (type === 'paragraph') return { ...base, width: 520, height: 120, text: 'This certifies that {{script_title}} has been approved for {{company_name}}.' };
  return { ...base, width: 520, height: 70, text: 'Certificate of Approval' };
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function renderElementLabel(element: CertificateTemplateElement) {
  if (element.type === 'qr') return 'QR';
  if (element.type === 'date') return element.text || '{{issued_at}}';
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
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to load template');
      } finally {
        setIsLoading(false);
      }
    };
    if (templateId) void load();
  }, [templateId]);

  const selected = useMemo(
    () => template?.templateData.elements.find((element) => element.id === selectedId) ?? null,
    [selectedId, template],
  );

  const canvasRatio = useMemo(() => {
    if (!template) return 16 / 9;
    const ratio = PAGE_RATIOS[template.pageSize] ?? PAGE_RATIOS.A4;
    return template.orientation === 'portrait' ? 1 / ratio : ratio;
  }, [template]);

  const updateTemplate = (patch: Partial<CertificateTemplate>) => {
    setTemplate((current) => current ? { ...current, ...patch } : current);
  };

  const updateElement = (id: string, patch: Partial<CertificateTemplateElement>) => {
    setTemplate((current) => {
      if (!current) return current;
      return {
        ...current,
        templateData: {
          elements: current.templateData.elements.map((element) =>
            element.id === id ? { ...element, ...patch } : element,
          ),
        },
      };
    });
  };

  const addElement = (type: CertificateElementType, x = 120, y = 120) => {
    const element = { ...makeElement(type), x: snap(x, snapToGrid), y: snap(y, snapToGrid) };
    setTemplate((current) => current ? {
      ...current,
      templateData: { elements: [...current.templateData.elements, element] },
    } : current);
    setSelectedId(element.id);
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
    addElement(type, event.clientX - rect.left, event.clientY - rect.top);
  };

  const removeSelected = () => {
    if (!selectedId) return;
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
    const dx = event.clientX - state.startX;
    const dy = event.clientY - state.startY;
    if (state.mode === 'move') {
      updateElement(state.id, {
        x: Math.max(0, snap(state.origin.x + dx, snapToGrid)),
        y: Math.max(0, snap(state.origin.y + dy, snapToGrid)),
      });
    } else {
      updateElement(state.id, {
        width: Math.max(40, snap(state.origin.width + dx, snapToGrid)),
        height: Math.max(32, snap(state.origin.height + dy, snapToGrid)),
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
          <Button variant="outline" onClick={() => navigate('/app/certificates')}>
            {lang === 'ar' ? 'رجوع' : 'Back'}
          </Button>
          <Button variant="outline" onClick={() => setSelectedId('')}>
            {lang === 'ar' ? 'معاينة' : 'Preview'}
          </Button>
          <Button onClick={() => void saveTemplate()} isLoading={isSaving}>
            <Save className="me-2 h-4 w-4" />
            {lang === 'ar' ? 'حفظ' : 'Save'}
          </Button>
        </div>
      </div>

      {error && <div className="rounded-[var(--radius)] border border-error/20 bg-error/10 p-3 text-sm text-error">{error}</div>}
      {success && <div className="rounded-[var(--radius)] border border-success/20 bg-success/10 p-3 text-sm text-success">{success}</div>}

      <div className="grid min-h-[calc(100vh-12rem)] grid-cols-1 gap-4 xl:grid-cols-[260px_minmax(0,1fr)_300px]">
        <Card>
          <CardContent className="space-y-3 p-4">
            <p className="text-sm font-semibold uppercase tracking-wide text-text-muted">Tools</p>
            <Select
              label="Page size"
              value={template.pageSize}
              onChange={(event) => updateTemplate({ pageSize: event.target.value as CertificatePageSize })}
              options={[{ label: 'A4', value: 'A4' }, { label: 'A5', value: 'A5' }, { label: 'Letter', value: 'Letter' }]}
            />
            <Select
              label="Orientation"
              value={template.orientation}
              onChange={(event) => updateTemplate({ orientation: event.target.value as CertificateOrientation })}
              options={[{ label: 'Landscape', value: 'landscape' }, { label: 'Portrait', value: 'portrait' }]}
            />
            <label className="flex items-center justify-between rounded-[var(--radius)] border border-border p-2 text-sm">
              <span>Show grid</span>
              <input type="checkbox" checked={showGrid} onChange={(event) => setShowGrid(event.target.checked)} />
            </label>
            <label className="flex items-center justify-between rounded-[var(--radius)] border border-border p-2 text-sm">
              <span>Snap to grid</span>
              <input type="checkbox" checked={snapToGrid} onChange={(event) => setSnapToGrid(event.target.checked)} />
            </label>
            <Input label="Background color" type="color" value={template.backgroundColor} onChange={(event) => updateTemplate({ backgroundColor: event.target.value })} />
            <Input label="Background image" type="file" accept="image/*" onChange={(event) => void uploadBackground(event.target.files?.[0])} />
            <Select
              label="Image fit"
              value={template.backgroundImageFit}
              onChange={(event) => updateTemplate({ backgroundImageFit: event.target.value as CertificateBackgroundFit })}
              options={[{ label: 'Cover', value: 'cover' }, { label: 'Contain', value: 'contain' }, { label: 'Tile', value: 'tile' }]}
            />
            <Input
              label="Background opacity"
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={template.backgroundImageOpacity}
              onChange={(event) => updateTemplate({ backgroundImageOpacity: Number(event.target.value) })}
            />
            <div className="grid grid-cols-2 gap-2 pt-2">
              <Button draggable variant="outline" size="sm" onDragStart={(event) => onToolDragStart(event, 'logo')} onClick={() => addElement('logo')}><ImageIcon className="me-2 h-4 w-4" />Logo</Button>
              <Button draggable variant="outline" size="sm" onDragStart={(event) => onToolDragStart(event, 'title')} onClick={() => addElement('title')}><Type className="me-2 h-4 w-4" />Title</Button>
              <Button draggable variant="outline" size="sm" onDragStart={(event) => onToolDragStart(event, 'paragraph')} onClick={() => addElement('paragraph')}><Type className="me-2 h-4 w-4" />Text</Button>
              <Button draggable variant="outline" size="sm" onDragStart={(event) => onToolDragStart(event, 'qr')} onClick={() => addElement('qr')}><QrCode className="me-2 h-4 w-4" />QR</Button>
              <Button draggable variant="outline" size="sm" onDragStart={(event) => onToolDragStart(event, 'image')} onClick={() => addElement('image')}><FileImage className="me-2 h-4 w-4" />Image</Button>
              <Button draggable variant="outline" size="sm" onDragStart={(event) => onToolDragStart(event, 'date')} onClick={() => addElement('date')}><CalendarDays className="me-2 h-4 w-4" />Date</Button>
              <Button draggable variant="outline" size="sm" className="col-span-2" onDragStart={(event) => onToolDragStart(event, 'footer')} onClick={() => addElement('footer')}>Footer</Button>
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
                  'absolute select-none border bg-white/5 p-1 text-text-main',
                  selectedId === element.id ? 'border-primary ring-2 ring-primary/20' : 'border-transparent hover:border-primary/40',
                )}
                style={{
                  left: element.x,
                  top: element.y,
                  width: element.width,
                  height: element.height,
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
                ) : element.type === 'image' || element.type === 'logo' ? (
                  element.imageUrl ? <img src={element.imageUrl} alt="" className="h-full w-full object-contain" /> : <div className="flex h-full items-center justify-center border border-dashed border-text-muted text-xs">Image</div>
                ) : (
                  <div className="h-full w-full overflow-hidden whitespace-pre-wrap">{renderElementLabel(element)}</div>
                )}
                <span
                  className="absolute bottom-0 end-0 h-4 w-4 cursor-se-resize rounded-tl bg-primary"
                  onPointerDown={(event) => onPointerDown(event, element, 'resize')}
                />
              </div>
            ))}
          </div>
        </div>

        <Card>
          <CardContent className="space-y-3 p-4">
            <p className="text-sm font-semibold uppercase tracking-wide text-text-muted">Settings</p>
            {!selected ? (
              <div className="space-y-3">
                <Input label="Template name" value={template.name} onChange={(event) => updateTemplate({ name: event.target.value })} />
                <Textarea label="Description" value={template.description ?? ''} onChange={(event) => updateTemplate({ description: event.target.value })} />
                <p className="text-sm text-text-muted">Select an element on the canvas to edit its placement and styling.</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <Input label="X" type="number" value={selected.x} onChange={(event) => updateElement(selected.id, { x: Number(event.target.value) })} />
                  <Input label="Y" type="number" value={selected.y} onChange={(event) => updateElement(selected.id, { y: Number(event.target.value) })} />
                  <Input label="Width" type="number" value={selected.width} onChange={(event) => updateElement(selected.id, { width: Number(event.target.value) })} />
                  <Input label="Height" type="number" value={selected.height} onChange={(event) => updateElement(selected.id, { height: Number(event.target.value) })} />
                </div>
                {(selected.type === 'title' || selected.type === 'paragraph' || selected.type === 'date' || selected.type === 'footer') && (
                  <>
                    <Textarea label="Text" value={selected.text ?? ''} onChange={(event) => updateElement(selected.id, { text: event.target.value })} />
                    <Select
                      label="Font"
                      value={selected.fontFamily ?? "'Cairo', Tahoma, sans-serif"}
                      onChange={(event) => updateElement(selected.id, { fontFamily: event.target.value })}
                      options={CERTIFICATE_FONT_OPTIONS}
                    />
                    <Input label="Size" type="number" value={selected.fontSize ?? 18} onChange={(event) => updateElement(selected.id, { fontSize: Number(event.target.value) })} />
                    <Input label="Color" type="color" value={selected.color ?? '#111827'} onChange={(event) => updateElement(selected.id, { color: event.target.value })} />
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
                      label="Logo source"
                      value={selected.logoSource ?? 'film_commission'}
                      onChange={(event) => {
                        const logoSource = event.target.value as 'film_commission' | 'client' | 'uploaded';
                        updateElement(selected.id, {
                          logoSource,
                          imageUrl: logoSource === 'film_commission' ? FILM_LOGO_PLACEHOLDER : selected.imageUrl,
                        });
                      }}
                      options={[{ label: 'Film Commission', value: 'film_commission' }, { label: 'Client Logo', value: 'client' }, { label: 'Uploaded Logo', value: 'uploaded' }]}
                    />
                    <Input label="Upload logo" type="file" accept="image/*" onChange={(event) => void uploadElementImage(event.target.files?.[0])} />
                  </>
                )}
                {selected.type === 'image' && <Input label="Upload image" type="file" accept="image/*" onChange={(event) => void uploadElementImage(event.target.files?.[0])} />}
                <Input
                  label="Opacity"
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={selected.opacity ?? 1}
                  onChange={(event) => updateElement(selected.id, { opacity: Number(event.target.value) })}
                />
                <Button variant="danger" size="sm" onClick={removeSelected}>Delete element</Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
