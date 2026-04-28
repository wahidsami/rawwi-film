import { useEffect, useMemo, useState } from 'react';
import { Document, Image, Page, Text, View, pdf } from '@react-pdf/renderer';
import QRCode from 'qrcode';
import { AlertTriangle, Award, BadgeCheck, CreditCard, Download, Loader2, ShieldCheck } from 'lucide-react';
import {
  certificatesApi,
  type CertificateDashboardItem,
  type CertificateDemoCard,
  type CertificateTemplate,
  type CertificateTemplateElement,
  type ClientCertificatesResponse,
} from '@/api';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';

type ClientCertificatesSectionProps = {
  lang: 'ar' | 'en';
};

type CertificateStatus = CertificateDashboardItem['certificateStatus'];

function formatCurrency(amount: number, currency: string, lang: 'ar' | 'en') {
  return new Intl.NumberFormat(lang === 'ar' ? 'ar-SA' : 'en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(value: string, lang: 'ar' | 'en') {
  return new Date(value).toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-US');
}

function statusBadgeVariant(status: CertificateStatus): 'success' | 'warning' | 'error' {
  if (status === 'issued') return 'success';
  if (status === 'payment_failed') return 'error';
  return 'warning';
}

function statusLabel(status: CertificateStatus, lang: 'ar' | 'en') {
  if (status === 'issued') return lang === 'ar' ? 'صادرة' : 'Issued';
  if (status === 'payment_failed') return lang === 'ar' ? 'الدفع فشل' : 'Payment failed';
  return lang === 'ar' ? 'بانتظار الدفع' : 'Awaiting payment';
}

const PDF_PAGE_SIZE: Record<string, { width: number; height: number }> = {
  A4: { width: 595.28, height: 841.89 },
  A5: { width: 419.53, height: 595.28 },
  Letter: { width: 612, height: 792 },
};

function getCertificateValues(item: CertificateDashboardItem, lang: 'ar' | 'en') {
  const rawData = (item.certificate?.certificateData ?? {}) as Record<string, unknown>;
  const certificateNumber = item.certificate?.certificateNumber ?? String(rawData.certificate_number ?? '');
  const scriptTitle = String(rawData.script_title ?? item.scriptTitle);
  const companyName =
    String(rawData.company_name_ar ?? '').trim() ||
    String(rawData.company_name_en ?? '').trim() ||
    '';
  const issuedAt = item.certificate?.issuedAt ?? String(rawData.issued_at ?? item.approvedAt);
  const amountPaid = typeof rawData.amount_paid === 'number' ? rawData.amount_paid : item.certificateFee.totalAmount;
  const currency = String(rawData.currency ?? item.certificateFee.currency);
  return {
    certificateNumber,
    scriptTitle,
    companyName: companyName || (lang === 'ar' ? 'غير محدد' : 'Not specified'),
    scriptType: item.scriptType,
    issuedAt,
    approvedAt: item.approvedAt,
    amountPaid,
    currency,
    amountPaidFormatted: formatCurrency(amountPaid, currency, lang),
  };
}

function getCertificateVerificationUrl(item: CertificateDashboardItem) {
  const certificateNumber = item.certificate?.certificateNumber ?? 'certificate';
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/verify-certificate/${encodeURIComponent(certificateNumber)}`;
}

function resolveTemplateText(text: string | undefined, item: CertificateDashboardItem, lang: 'ar' | 'en') {
  const values = getCertificateValues(item, lang);
  return (text ?? '')
    .replaceAll('{{certificate_number}}', values.certificateNumber)
    .replaceAll('{{script_title}}', values.scriptTitle)
    .replaceAll('{{script_type}}', values.scriptType)
    .replaceAll('{{company_name}}', values.companyName)
    .replaceAll('{{issued_at}}', formatDate(values.issuedAt, lang))
    .replaceAll('{{approved_at}}', formatDate(values.approvedAt, lang))
    .replaceAll('{{amount_paid}}', values.amountPaidFormatted)
    .replaceAll('{{verification_url}}', getCertificateVerificationUrl(item));
}

function pageDimensions(template?: CertificateTemplate | null) {
  const base = PDF_PAGE_SIZE[template?.pageSize ?? 'A4'] ?? PDF_PAGE_SIZE.A4;
  const orientation = template?.orientation ?? 'landscape';
  return orientation === 'landscape'
    ? { width: Math.max(base.width, base.height), height: Math.min(base.width, base.height) }
    : { width: Math.min(base.width, base.height), height: Math.max(base.width, base.height) };
}

function elementStyle(element: CertificateTemplateElement, page: { width: number; height: number }, template?: CertificateTemplate | null) {
  const ratio = template
    ? ((template.orientation === 'portrait' ? 1 / ({ A4: 297 / 210, A5: 210 / 148, Letter: 11 / 8.5 }[template.pageSize] ?? 297 / 210) : ({ A4: 297 / 210, A5: 210 / 148, Letter: 11 / 8.5 }[template.pageSize] ?? 297 / 210)))
    : 16 / 9;
  const baseWidth = 1000;
  const baseHeight = baseWidth / ratio;
  return {
    position: 'absolute' as const,
    left: (element.x / baseWidth) * page.width,
    top: (element.y / baseHeight) * page.height,
    width: (element.width / baseWidth) * page.width,
    height: (element.height / baseHeight) * page.height,
    opacity: element.opacity ?? 1,
  };
}

function TemplateElementPdf({ element, item, lang, page, template }: {
  element: CertificateTemplateElement;
  item: CertificateDashboardItem;
  lang: 'ar' | 'en';
  page: { width: number; height: number };
  template: CertificateTemplate;
  qrDataUrl: string;
}) {
  const boxStyle = elementStyle(element, page, template);
  if ((element.type === 'image' || element.type === 'logo') && element.imageUrl) {
    return <Image src={element.imageUrl} style={[boxStyle, { objectFit: 'contain' }]} />;
  }
  if (element.type === 'qr') {
    return <Image src={qrDataUrl} style={[boxStyle, { objectFit: 'contain', backgroundColor: '#ffffff' }]} />;
  }
  if (element.type === 'logo' && element.logoSource === 'client') {
    return (
      <View style={[boxStyle, { borderWidth: 1, borderColor: '#d1d5db', alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ fontSize: 10, color: '#6b7280' }}>{lang === 'ar' ? 'شعار العميل' : 'Client Logo'}</Text>
      </View>
    );
  }
  return (
    <Text
      style={[
        boxStyle,
        {
          fontSize: element.fontSize ?? 18,
          fontFamily: 'Helvetica',
          fontWeight: element.bold ? 700 : 400,
          fontStyle: element.italic ? 'italic' : 'normal',
          color: element.color ?? '#111827',
          textAlign: element.align ?? 'center',
          lineHeight: 1.35,
        },
      ]}
    >
      {resolveTemplateText(element.text, item, lang)}
    </Text>
  );
}

function CertificatePdfDocument({ item, lang, template }: {
  item: CertificateDashboardItem;
  lang: 'ar' | 'en';
  template?: CertificateTemplate | null;
  qrDataUrl: string;
}) {
  const values = getCertificateValues(item, lang);
  const page = pageDimensions(template);
  if (template) {
    return (
      <Document>
        <Page size={[page.width, page.height]} style={{ position: 'relative', backgroundColor: template.backgroundColor }}>
          {template.backgroundImageUrl ? (
            <Image
              src={template.backgroundImageUrl}
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: page.width,
                height: page.height,
                opacity: template.backgroundImageOpacity,
                objectFit: template.backgroundImageFit === 'contain' ? 'contain' : 'cover',
              }}
            />
          ) : null}
          {(template.templateData.elements ?? []).map((element) => (
            <TemplateElementPdf key={element.id} element={element} item={item} lang={lang} page={page} template={template} qrDataUrl={qrDataUrl} />
          ))}
        </Page>
      </Document>
    );
  }
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={{ padding: 44, backgroundColor: '#fffdf8', color: '#1f2333' }}>
        <View style={{ borderWidth: 8, borderColor: '#d2ba6a', padding: 28, height: '100%' }}>
          <Text style={{ fontSize: 12, color: '#86652c', letterSpacing: 2 }}>{lang === 'ar' ? 'نظام راوي فيلم' : 'RAAWI FILM SYSTEM'}</Text>
          <Text style={{ marginTop: 10, fontSize: 34, color: '#3c2a63', fontWeight: 700 }}>{lang === 'ar' ? 'شهادة اعتماد النص' : 'Script Approval Certificate'}</Text>
          <Text style={{ marginTop: 18, fontSize: 15, lineHeight: 1.7 }}>
            {lang === 'ar'
              ? 'تشهد منصة راوي فيلم بأن النص التالي تم اعتماده ضمن دورة المراجعة الحالية، وأُنجزت رسوم الشهادة التجريبية الخاصة به بنجاح.'
              : 'Raawi Film certifies that this script has been approved in the current review cycle and its demo certificate fee has been completed successfully.'}
          </Text>
          <View style={{ marginTop: 26, flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            {[
              [lang === 'ar' ? 'رقم الشهادة' : 'Certificate Number', values.certificateNumber],
              [lang === 'ar' ? 'تاريخ الإصدار' : 'Issued Date', formatDate(values.issuedAt, lang)],
              [lang === 'ar' ? 'اسم النص' : 'Script Title', values.scriptTitle],
              [lang === 'ar' ? 'شركة الإنتاج' : 'Production Company', values.companyName],
              [lang === 'ar' ? 'نوع العمل' : 'Script Type', values.scriptType],
              [lang === 'ar' ? 'المبلغ المسدد' : 'Amount Paid', values.amountPaidFormatted],
            ].map(([label, value]) => (
              <View key={label} style={{ width: '31%', borderWidth: 1, borderColor: '#e9dec0', padding: 12 }}>
                <Text style={{ fontSize: 9, color: '#8b7f66' }}>{label}</Text>
                <Text style={{ marginTop: 6, fontSize: 13, fontWeight: 700 }}>{value}</Text>
              </View>
            ))}
          </View>
          <View style={{ position: 'absolute', right: 72, bottom: 72, width: 96, height: 96 }}>
            <Image src={qrDataUrl} style={{ width: 96, height: 96 }} />
          </View>
        </View>
      </Page>
    </Document>
  );
}

async function downloadCertificateDocument(item: CertificateDashboardItem, lang: 'ar' | 'en', template?: CertificateTemplate | null) {
  const certificateNumber = item.certificate?.certificateNumber ?? 'certificate';
  const qrDataUrl = await QRCode.toDataURL(getCertificateVerificationUrl(item), {
    errorCorrectionLevel: 'M',
    margin: 1,
    scale: 8,
  });
  const blob = await pdf(<CertificatePdfDocument item={item} lang={lang} template={template} qrDataUrl={qrDataUrl} />).toBlob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${certificateNumber}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
}

export function ClientCertificatesSection({ lang }: ClientCertificatesSectionProps) {
  const [data, setData] = useState<ClientCertificatesResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selectedItem, setSelectedItem] = useState<CertificateDashboardItem | null>(null);
  const [selectedCardId, setSelectedCardId] = useState('');
  const [isPaying, setIsPaying] = useState(false);
  const [downloadingId, setDownloadingId] = useState('');

  const loadData = async () => {
    setIsLoading(true);
    setError('');
    try {
      const response = await certificatesApi.getClientDashboard();
      setData(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : (lang === 'ar' ? 'تعذر تحميل بيانات الشهادات' : 'Unable to load certificates data'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    if (!selectedItem || !data?.demoCards?.length) {
      setSelectedCardId('');
      return;
    }
    setSelectedCardId((current) => current || data.demoCards[0].id);
  }, [selectedItem, data?.demoCards]);

  const summary = useMemo(() => {
    const items = data?.items ?? [];
    return {
      approved: items.length,
      pending: items.filter((item) => item.certificateStatus === 'payment_pending').length,
      failed: items.filter((item) => item.certificateStatus === 'payment_failed').length,
      issued: items.filter((item) => item.certificateStatus === 'issued').length,
    };
  }, [data]);

  const handlePay = async () => {
    if (!selectedItem || !selectedCardId) return;
    setIsPaying(true);
    setError('');
    setNotice('');
    try {
      const response = await certificatesApi.processDemoPayment(selectedItem.scriptId, selectedCardId);
      if (!response.ok && !response.alreadyIssued) {
        setError(response.error || (lang === 'ar' ? 'فشلت عملية الدفع التجريبية' : 'Demo payment failed'));
      } else {
        setNotice(
          response.alreadyIssued
            ? (lang === 'ar' ? 'هذه الشهادة صادرة بالفعل.' : 'This certificate has already been issued.')
            : (lang === 'ar' ? 'تم إتمام الدفع التجريبي وإصدار الشهادة.' : 'Demo payment completed and certificate issued.'),
        );
      }
      setSelectedItem(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : (lang === 'ar' ? 'تعذر إتمام الدفع التجريبي' : 'Unable to complete demo payment'));
    } finally {
      setIsPaying(false);
    }
  };

  const handleDownload = async (item: CertificateDashboardItem) => {
    setDownloadingId(item.scriptId);
    setError('');
    try {
      await downloadCertificateDocument(item, lang, data?.defaultTemplate ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : (lang === 'ar' ? 'تعذر إنشاء ملف PDF' : 'Unable to generate PDF'));
    } finally {
      setDownloadingId('');
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-[calc(var(--radius)+0.3rem)] border border-error/20 bg-error/10 p-3 text-sm text-error">{error}</div>
      )}
      {notice && (
        <div className="rounded-[calc(var(--radius)+0.3rem)] border border-success/20 bg-success/10 p-3 text-sm text-success">{notice}</div>
      )}

      <Card className="client-portal-panel overflow-hidden border-border/80 shadow-[0_18px_50px_rgba(31,23,36,0.06)]">
        <CardHeader>
          <CardTitle>{lang === 'ar' ? 'دورة الشهادة والرسوم' : 'Certificate and Fee Flow'}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-[calc(var(--radius)+0.35rem)] border border-warning/20 bg-warning/10 p-4 text-sm leading-7 text-warning">
            {lang === 'ar'
              ? 'هذه شاشة دفع تجريبية فقط. بمجرد اعتماد النص من الإدارة، يظهر هنا للدفع ثم تُصدر الشهادة تلقائياً بعد نجاح العملية.'
              : 'This is a demo payment screen. Once a script is approved by admin, it appears here for payment and the certificate is issued automatically after a successful transaction.'}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card className="border-border/70 bg-background/70">
              <CardContent className="flex items-center justify-between p-5">
                <div>
                  <p className="text-sm text-text-muted">{lang === 'ar' ? 'النصوص المعتمدة' : 'Approved Scripts'}</p>
                  <p className="mt-2 text-3xl font-bold">{summary.approved}</p>
                </div>
                <Award className="h-8 w-8 text-primary" />
              </CardContent>
            </Card>
            <Card className="border-border/70 bg-background/70">
              <CardContent className="flex items-center justify-between p-5">
                <div>
                  <p className="text-sm text-text-muted">{lang === 'ar' ? 'بانتظار الدفع' : 'Awaiting Payment'}</p>
                  <p className="mt-2 text-3xl font-bold text-warning">{summary.pending}</p>
                </div>
                <CreditCard className="h-8 w-8 text-warning" />
              </CardContent>
            </Card>
            <Card className="border-border/70 bg-background/70">
              <CardContent className="flex items-center justify-between p-5">
                <div>
                  <p className="text-sm text-text-muted">{lang === 'ar' ? 'دفعات فاشلة' : 'Failed Payments'}</p>
                  <p className="mt-2 text-3xl font-bold text-error">{summary.failed}</p>
                </div>
                <AlertTriangle className="h-8 w-8 text-error" />
              </CardContent>
            </Card>
            <Card className="border-border/70 bg-background/70">
              <CardContent className="flex items-center justify-between p-5">
                <div>
                  <p className="text-sm text-text-muted">{lang === 'ar' ? 'شهادات صادرة' : 'Issued Certificates'}</p>
                  <p className="mt-2 text-3xl font-bold text-success">{summary.issued}</p>
                </div>
                <BadgeCheck className="h-8 w-8 text-success" />
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>

      <Card className="client-portal-panel overflow-hidden border-border/80 shadow-[0_18px_50px_rgba(31,23,36,0.06)]">
        <CardHeader>
          <CardTitle>{lang === 'ar' ? 'النصوص المؤهلة للشهادة' : 'Certificate-Eligible Scripts'}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-text-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              {lang === 'ar' ? 'جاري تحميل الشهادات...' : 'Loading certificates...'}
            </div>
          ) : !data || data.items.length === 0 ? (
            <p className="text-sm text-text-muted">
              {lang === 'ar'
                ? 'لا توجد نصوص معتمدة مؤهلة للدفع حالياً. بمجرد اعتماد نص من الإدارة سيظهر هنا.'
                : 'There are no approved scripts ready for payment yet. Once admin approves a script, it will appear here.'}
            </p>
          ) : (
            <div className="space-y-3">
              {data.items.map((item) => (
                <div key={item.scriptId} className="rounded-[calc(var(--radius)+0.35rem)] border border-border bg-background/80 p-4">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-lg font-semibold">{item.scriptTitle}</p>
                        <Badge variant={statusBadgeVariant(item.certificateStatus)}>{statusLabel(item.certificateStatus, lang)}</Badge>
                      </div>
                      <p className="text-sm text-text-muted">
                        {item.scriptType} • {lang === 'ar' ? 'تاريخ الاعتماد' : 'Approved on'} {formatDate(item.approvedAt, lang)}
                      </p>
                      <div className="flex flex-wrap gap-3 text-sm text-text-muted">
                        <span>
                          {lang === 'ar' ? 'رسوم الشهادة:' : 'Certificate fee:'}{' '}
                          <strong className="text-text-main">
                            {formatCurrency(item.certificateFee.totalAmount, item.certificateFee.currency, lang)}
                          </strong>
                        </span>
                        <span>
                          {lang === 'ar' ? 'الأساس' : 'Base'} {formatCurrency(item.certificateFee.baseAmount, item.certificateFee.currency, lang)}
                        </span>
                        <span>
                          {lang === 'ar' ? 'الضريبة' : 'Tax'} {formatCurrency(item.certificateFee.taxAmount, item.certificateFee.currency, lang)}
                        </span>
                      </div>
                      {item.latestPayment ? (
                        <p className="text-xs text-text-muted">
                          {lang === 'ar' ? 'آخر دفعة:' : 'Latest payment:'} {item.latestPayment.paymentReference}
                          {item.latestPayment.cardLast4 ? ` • **** ${item.latestPayment.cardLast4}` : ''}
                        </p>
                      ) : null}
                      {item.certificate ? (
                        <p className="text-sm text-success">
                          {lang === 'ar' ? 'رقم الشهادة:' : 'Certificate number:'} {item.certificate.certificateNumber}
                        </p>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {item.certificateStatus === 'issued' ? (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void handleDownload(item)}
                            isLoading={downloadingId === item.scriptId}
                          >
                            <Download className="me-2 h-4 w-4" />
                            {lang === 'ar' ? 'تنزيل الشهادة' : 'Download Certificate'}
                          </Button>
                          <Badge variant="success">
                            <ShieldCheck className="me-1 h-3.5 w-3.5" />
                            {lang === 'ar' ? 'صادرة' : 'Issued'}
                          </Badge>
                        </>
                      ) : (
                        <Button size="sm" onClick={() => setSelectedItem(item)}>
                          <CreditCard className="me-2 h-4 w-4" />
                          {item.certificateStatus === 'payment_failed'
                            ? (lang === 'ar' ? 'إعادة المحاولة' : 'Retry payment')
                            : (lang === 'ar' ? 'ادفع الآن' : 'Pay now')}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Modal
        isOpen={Boolean(selectedItem)}
        onClose={() => !isPaying && setSelectedItem(null)}
        title={lang === 'ar' ? 'إتمام الدفع التجريبي للشهادة' : 'Complete Demo Certificate Payment'}
        className="max-w-2xl"
      >
        {!selectedItem ? null : (
          <div className="space-y-4">
            <div className="rounded-[calc(var(--radius)+0.35rem)] border border-border bg-background/80 p-4">
              <p className="font-semibold">{selectedItem.scriptTitle}</p>
              <p className="mt-1 text-sm text-text-muted">
                {lang === 'ar' ? 'إجمالي الرسوم:' : 'Total fee:'}{' '}
                {formatCurrency(selectedItem.certificateFee.totalAmount, selectedItem.certificateFee.currency, lang)}
              </p>
            </div>

            <div className="rounded-[calc(var(--radius)+0.35rem)] border border-warning/20 bg-warning/10 p-4 text-sm leading-7 text-warning">
              {lang === 'ar'
                ? 'اختر بطاقة تجريبية. البطاقات الناجحة ستصدر الشهادة مباشرة، بينما البطاقة المرفوضة ستعيد حالة الدفع الفاشل حتى نختبر الواجهة.'
                : 'Choose a demo card. Successful cards will issue the certificate immediately, while the declined card will keep the payment in a failed state for testing.'}
            </div>

            <div className="space-y-3">
              {(data?.demoCards ?? []).map((card) => (
                <label
                  key={card.id}
                  className={`flex cursor-pointer items-start gap-3 rounded-[calc(var(--radius)+0.35rem)] border p-4 transition ${
                    selectedCardId === card.id ? 'border-primary bg-primary/5' : 'border-border bg-background/70'
                  }`}
                >
                  <input
                    type="radio"
                    name="demo-card"
                    checked={selectedCardId === card.id}
                    onChange={() => setSelectedCardId(card.id)}
                    className="mt-1"
                  />
                  <div className="min-w-0">
                    <p className="font-semibold">{lang === 'ar' ? card.labelAr : card.labelEn}</p>
                    <p className="mt-1 text-sm text-text-muted">{card.maskedNumber}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.2em] text-text-muted">{card.brand}</p>
                  </div>
                </label>
              ))}
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setSelectedItem(null)} disabled={isPaying}>
                {lang === 'ar' ? 'إلغاء' : 'Cancel'}
              </Button>
              <Button onClick={() => void handlePay()} isLoading={isPaying} disabled={!selectedCardId}>
                {lang === 'ar' ? 'إتمام الدفع' : 'Complete payment'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
