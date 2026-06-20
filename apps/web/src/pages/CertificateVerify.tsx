import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Award, CheckCircle2, Download, Loader2, ShieldCheck, XCircle } from 'lucide-react';
import { certificatesApi, type CertificateVerificationResponse } from '@/api';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { useLangStore } from '@/store/langStore';

function formatDate(value: string | null | undefined, lang: 'ar' | 'en') {
  if (!value) return lang === 'ar' ? 'غير متوفر' : 'Not available';
  return new Date(value).toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function CertificateVerify() {
  const { certificateNumber = '' } = useParams();
  const { lang } = useLangStore();
  const [data, setData] = useState<CertificateVerificationResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      setError('');
      try {
        const response = await certificatesApi.verifyCertificate(certificateNumber);
        setData(response);
      } catch (err) {
        setError(err instanceof Error ? err.message : (lang === 'ar' ? 'تعذر التحقق من الشهادة' : 'Unable to verify certificate'));
      } finally {
        setIsLoading(false);
      }
    };
    if (certificateNumber) void load();
  }, [certificateNumber, lang]);

  const certificate = data?.certificate ?? null;
  const companyName = useMemo(() => {
    if (!certificate) return '';
    return (lang === 'ar' ? certificate.companyNameAr : certificate.companyNameEn)
      || certificate.companyNameAr
      || certificate.companyNameEn
      || (lang === 'ar' ? 'غير محدد' : 'Not specified');
  }, [certificate, lang]);

  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-[var(--radius)] bg-primary/10">
              <Award className="h-6 w-6 text-primary" />
            </div>
            <h1 className="text-3xl font-bold text-text-main">
              {lang === 'ar' ? 'التحقق من الشهادة والنص المعتمد' : 'Certificate and Approved Script Verification'}
            </h1>
            <p className="mt-2 text-text-muted">
              {lang === 'ar'
                ? 'هذه الصفحة تعرض بيانات التحقق العامة، ويمكن من خلالها تنزيل النص المعتمد إذا كان متاحاً.'
                : 'This page shows the public verification data and allows downloading the approved script if available.'}
            </p>
          </div>
          <Link
            to="/"
            className="inline-flex h-10 items-center justify-center rounded-[var(--radius)] border border-border px-4 text-sm font-medium text-text-main transition-colors hover:bg-surface"
          >
            {lang === 'ar' ? 'الرئيسية' : 'Home'}
          </Link>
        </div>

        {isLoading ? (
          <Card>
            <CardContent className="flex items-center gap-2 p-6 text-text-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              {lang === 'ar' ? 'جاري التحقق...' : 'Verifying...'}
            </CardContent>
          </Card>
        ) : error || !certificate ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center p-10 text-center">
              <XCircle className="mb-4 h-12 w-12 text-error" />
              <h2 className="text-xl font-semibold text-text-main">
                {lang === 'ar' ? 'الشهادة غير موجودة' : 'Certificate not found'}
              </h2>
              <p className="mt-2 max-w-xl text-text-muted">
                {error || (lang === 'ar' ? 'لم نتمكن من العثور على شهادة بهذا الرقم.' : 'We could not find a certificate with this number.')}
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-text-muted">{lang === 'ar' ? 'رقم الشهادة' : 'Certificate Number'}</p>
                  <p className="mt-1 text-2xl font-bold text-text-main">{certificate.certificateNumber}</p>
                </div>
                <Badge variant={certificate.verification.verified ? 'success' : 'warning'} className="w-fit">
                  {certificate.verification.verified ? <CheckCircle2 className="me-1 h-4 w-4" /> : <ShieldCheck className="me-1 h-4 w-4" />}
                  {certificate.verification.verified
                    ? (lang === 'ar' ? 'تم التحقق' : 'Verified')
                    : (lang === 'ar' ? 'غير مكتملة' : 'Not fully verified')}
                </Badge>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{lang === 'ar' ? 'بيانات الشهادة' : 'Certificate Details'}</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {[
                  [lang === 'ar' ? 'اسم النص' : 'Script Title', certificate.scriptTitle],
                  [lang === 'ar' ? 'نوع النص' : 'Script Type', certificate.scriptType],
                  [lang === 'ar' ? 'الشركة' : 'Company', companyName],
                  [lang === 'ar' ? 'حالة الشهادة' : 'Certificate Status', certificate.certificateStatus],
                  [lang === 'ar' ? 'تاريخ التقديم' : 'Submitted Date', formatDate(certificate.submittedAt, lang)],
                  [lang === 'ar' ? 'تاريخ الاعتماد' : 'Approved Date', formatDate(certificate.approvedAt, lang)],
                  [lang === 'ar' ? 'تاريخ الإصدار' : 'Issued Date', formatDate(certificate.issuedAt, lang)],
                  [lang === 'ar' ? 'حالة الدفع' : 'Payment Status', certificate.payment?.status ?? (lang === 'ar' ? 'غير متوفر' : 'Not available')],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-[var(--radius)] border border-border bg-surface p-4">
                    <p className="text-sm text-text-muted">{label}</p>
                    <p className="mt-2 font-semibold text-text-main">{value}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            {certificate.approvedScript?.downloadUrl && (
              <Card>
                <CardHeader>
                  <CardTitle>{lang === 'ar' ? 'نسخة النص المعتمدة' : 'Approved Script Copy'}</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-sm text-text-muted">
                      {lang === 'ar'
                        ? 'يمكنك تنزيل نسخة النص التي تم اعتمادها من خلال هذا الرابط الآمن.'
                        : 'You can download the approved script version through this secure link.'}
                    </p>
                    <p className="mt-1 font-semibold text-text-main">
                      {certificate.approvedScript.fileName}
                    </p>
                  </div>
                  <a
                    href={certificate.approvedScript.downloadUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-10 items-center justify-center rounded-[var(--radius)] bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90"
                  >
                    <Download className="me-2 h-4 w-4" />
                    {lang === 'ar' ? 'تنزيل النص المعتمد' : 'Download approved script'}
                  </a>
                </CardContent>
              </Card>
            )}

            <div className="rounded-[var(--radius)] border border-warning/20 bg-warning/10 p-4 text-sm leading-7 text-warning">
              {lang === 'ar'
                ? 'يفتح رمز QR صفحة التحقق العامة، ومنها يمكنك تنزيل النص المعتمد إذا كان متاحاً.'
                : 'The QR opens the public verification page, where you can download the approved script if available.'}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
