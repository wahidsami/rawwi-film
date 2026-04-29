import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Award, CheckCircle2, Clock3, CreditCard, FileCheck2, Loader2, Plus, RotateCw } from 'lucide-react';
import { certificatesApi, type AdminCertificatesResponse, type CertificateDashboardItem, type CertificateTemplate } from '@/api';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Textarea } from '@/components/ui/Textarea';
import { useLangStore } from '@/store/langStore';

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

function statusLabel(status: CertificateStatus, lang: 'ar' | 'en') {
  if (status === 'issued') return lang === 'ar' ? 'صادرة' : 'Issued';
  if (status === 'payment_failed') return lang === 'ar' ? 'الدفع فشل' : 'Payment Failed';
  return lang === 'ar' ? 'بانتظار الدفع' : 'Awaiting Payment';
}

function statusVariant(status: CertificateStatus): 'success' | 'warning' | 'error' {
  if (status === 'issued') return 'success';
  if (status === 'payment_failed') return 'error';
  return 'warning';
}

export function Certificates() {
  const { t, lang } = useLangStore();
  const navigate = useNavigate();
  const [data, setData] = useState<AdminCertificatesResponse | null>(null);
  const [templates, setTemplates] = useState<CertificateTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isTemplatesLoading, setIsTemplatesLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [actionKey, setActionKey] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateDescription, setNewTemplateDescription] = useState('');
  const [isCreatingTemplate, setIsCreatingTemplate] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const response = await certificatesApi.getAdminDashboard();
      setData(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : (lang === 'ar' ? 'تعذر تحميل بيانات الشهادات' : 'Unable to load certificates data'));
    } finally {
      setIsLoading(false);
    }
  }, [lang]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadTemplates = useCallback(async () => {
    setIsTemplatesLoading(true);
    try {
      const response = await certificatesApi.getTemplates();
      setTemplates(response.templates);
    } catch (err) {
      setError(err instanceof Error ? err.message : (lang === 'ar' ? 'تعذر تحميل قوالب الشهادات' : 'Unable to load certificate templates'));
    } finally {
      setIsTemplatesLoading(false);
    }
  }, [lang]);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  const runAdminAction = async (
    item: CertificateDashboardItem,
    action: 'confirm-payment' | 'issue' | 'regenerate',
  ) => {
    setError('');
    setSuccess('');
    setActionKey(`${action}:${item.scriptId}`);
    try {
      if (action === 'confirm-payment') {
        await certificatesApi.confirmAdminPayment(item.scriptId);
        setSuccess(lang === 'ar' ? 'تم تأكيد الدفعة التجريبية.' : 'Demo payment confirmed.');
      } else {
        await certificatesApi.issueAdminCertificate(item.scriptId, action === 'regenerate');
        setSuccess(
          action === 'regenerate'
            ? (lang === 'ar' ? 'تمت إعادة إصدار الشهادة.' : 'Certificate regenerated.')
            : (lang === 'ar' ? 'تم إصدار الشهادة.' : 'Certificate issued.'),
        );
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : (lang === 'ar' ? 'تعذر تنفيذ الإجراء' : 'Unable to complete action'));
    } finally {
      setActionKey('');
    }
  };

  const createTemplate = async () => {
    if (!newTemplateName.trim()) {
      setError(lang === 'ar' ? 'اسم القالب مطلوب' : 'Template name is required');
      return;
    }
    setIsCreatingTemplate(true);
    setError('');
    try {
      const response = await certificatesApi.createTemplate({
        name: newTemplateName.trim(),
        description: newTemplateDescription.trim(),
      });
      setIsCreateOpen(false);
      setNewTemplateName('');
      setNewTemplateDescription('');
      navigate(`/app/certificates/templates/${response.template.id}/designer`);
    } catch (err) {
      setError(err instanceof Error ? err.message : (lang === 'ar' ? 'تعذر إنشاء القالب' : 'Unable to create template'));
    } finally {
      setIsCreatingTemplate(false);
    }
  };

  const setDefaultTemplate = async (templateId: string) => {
    setActionKey(`template-default:${templateId}`);
    setError('');
    try {
      await certificatesApi.setDefaultTemplate(templateId);
      await loadTemplates();
      setSuccess(lang === 'ar' ? 'تم تعيين القالب الافتراضي.' : 'Default template updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : (lang === 'ar' ? 'تعذر تعيين القالب الافتراضي' : 'Unable to set default template'));
    } finally {
      setActionKey('');
    }
  };

  const summary = useMemo(
    () => data?.summary ?? {
      approvedScripts: 0,
      completedPayments: 0,
      issuedCertificates: 0,
      pendingPayments: 0,
    },
    [data],
  );

  return (
    <div className="space-y-6">
      <div className="dashboard-page-header p-5 md:p-6">
        <h1 className="text-2xl font-bold text-text-main">{t('certificates')}</h1>
        <p className="mt-1 text-text-muted">
          {lang === 'ar'
            ? 'لوحة أولية لمتابعة حالة الشهادات والدفعات التجريبية للنصوص المعتمدة.'
            : 'Initial dashboard to monitor certificate and demo payment status for approved scripts.'}
        </p>
      </div>

      {error && (
        <div className="rounded-[calc(var(--radius)+0.35rem)] border border-error/20 bg-error/10 p-3 text-sm text-error">{error}</div>
      )}

      {success && (
        <div className="rounded-[calc(var(--radius)+0.35rem)] border border-success/20 bg-success/10 p-3 text-sm text-success">{success}</div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-sm text-text-muted">{lang === 'ar' ? 'النصوص المعتمدة' : 'Approved Scripts'}</p>
              <p className="mt-2 text-3xl font-bold">{summary.approvedScripts}</p>
            </div>
            <Award className="h-8 w-8 text-primary" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-sm text-text-muted">{lang === 'ar' ? 'دفعات مكتملة' : 'Completed Payments'}</p>
              <p className="mt-2 text-3xl font-bold text-success">{summary.completedPayments}</p>
            </div>
            <CreditCard className="h-8 w-8 text-success" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-sm text-text-muted">{lang === 'ar' ? 'شهادات صادرة' : 'Issued Certificates'}</p>
              <p className="mt-2 text-3xl font-bold text-success">{summary.issuedCertificates}</p>
            </div>
            <CheckCircle2 className="h-8 w-8 text-success" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-sm text-text-muted">{lang === 'ar' ? 'بانتظار الدفع' : 'Awaiting Payment'}</p>
              <p className="mt-2 text-3xl font-bold text-warning">{summary.pendingPayments}</p>
            </div>
            <Clock3 className="h-8 w-8 text-warning" />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>{lang === 'ar' ? 'قوالب الشهادات' : 'Certificate Templates'}</CardTitle>
            <Button size="sm" onClick={() => setIsCreateOpen(true)}>
              <Plus className="me-2 h-4 w-4" />
              {lang === 'ar' ? 'إضافة جديد' : 'Add New'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isTemplatesLoading ? (
            <div className="flex items-center gap-2 text-sm text-text-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              {lang === 'ar' ? 'جاري تحميل القوالب...' : 'Loading templates...'}
            </div>
          ) : templates.length === 0 ? (
            <p className="text-sm text-text-muted">
              {lang === 'ar' ? 'لا توجد قوالب بعد. أنشئ أول قالب للشهادات.' : 'No templates yet. Create the first certificate template.'}
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
              {templates.map((template) => (
                <div key={template.id} className="dashboard-item-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold">{template.name}</p>
                        {template.isDefault && <Badge variant="success">{lang === 'ar' ? 'افتراضي' : 'Default'}</Badge>}
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm text-text-muted">
                        {template.description || (lang === 'ar' ? 'بدون وصف' : 'No description')}
                      </p>
                      <p className="mt-2 text-xs text-text-muted">
                        {template.pageSize} / {template.orientation}
                      </p>
                    </div>
                    <label className="flex shrink-0 items-center gap-2 text-xs text-text-muted">
                      <input
                        type="checkbox"
                        checked={template.isDefault}
                        onChange={() => void setDefaultTemplate(template.id)}
                        disabled={template.isDefault || actionKey === `template-default:${template.id}`}
                      />
                      {lang === 'ar' ? 'استخدام كافتراضي' : 'Use as default'}
                    </label>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => navigate(`/app/certificates/templates/${template.id}/designer`)}>
                      {lang === 'ar' ? 'تعديل' : 'Edit'}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => navigate(`/app/certificates/templates/${template.id}/designer`)}>
                      {lang === 'ar' ? 'معاينة' : 'Preview'}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{lang === 'ar' ? 'حالة الشهادات للنصوص المعتمدة' : 'Certificate Status For Approved Scripts'}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-text-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              {lang === 'ar' ? 'جاري تحميل البيانات...' : 'Loading data...'}
            </div>
          ) : !data || data.items.length === 0 ? (
            <p className="text-sm text-text-muted">
              {lang === 'ar'
                ? 'لا توجد نصوص معتمدة مرتبطة بالشهادات حتى الآن.'
                : 'There are no approved scripts tied to certificates yet.'}
            </p>
          ) : (
            <div className="space-y-3">
              {data.items.map((item) => (
                <div key={item.scriptId} className="dashboard-item-card p-4">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-lg font-semibold">{item.scriptTitle}</p>
                        <Badge variant={statusVariant(item.certificateStatus)}>{statusLabel(item.certificateStatus, lang)}</Badge>
                      </div>
                      <p className="text-sm text-text-muted">
                        {(lang === 'ar' ? item.companyNameAr : item.companyNameEn) || item.companyNameAr || item.companyNameEn || (lang === 'ar' ? 'شركة غير معروفة' : 'Unknown company')}
                      </p>
                      <div className="flex flex-wrap gap-3 text-sm text-text-muted">
                        <span>{lang === 'ar' ? 'تاريخ الاعتماد' : 'Approved on'}: {formatDate(item.approvedAt, lang)}</span>
                        <span>{lang === 'ar' ? 'رسوم الشهادة' : 'Certificate fee'}: {formatCurrency(item.certificateFee.totalAmount, item.certificateFee.currency, lang)}</span>
                      </div>
                    </div>

                    <div className="space-y-3 text-sm text-text-muted xl:text-end">
                      {item.latestPayment ? (
                        <div>
                          <p>{lang === 'ar' ? 'مرجع الدفع' : 'Payment reference'}: {item.latestPayment.paymentReference}</p>
                          <p>{lang === 'ar' ? 'حالة الدفع' : 'Payment status'}: {item.latestPayment.paymentStatus}</p>
                        </div>
                      ) : (
                        <p>{lang === 'ar' ? 'لا توجد دفعة بعد' : 'No payment yet'}</p>
                      )}
                      {item.certificate ? (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <p className="text-success">
                            {lang === 'ar' ? 'رقم الشهادة' : 'Certificate number'}: {item.certificate.certificateNumber}
                          </p>
                          {item.certificateStatus !== 'issued' ? (
                            <Badge variant="warning" className="text-[11px]">
                              {lang === 'ar' ? 'مولدة - بانتظار الدفع' : 'Generated - Pending Payment'}
                            </Badge>
                          ) : null}
                        </div>
                      ) : null}
                      <div className="flex flex-wrap gap-2 xl:justify-end">
                        {item.latestPayment?.paymentStatus !== 'completed' ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void runAdminAction(item, 'confirm-payment')}
                            isLoading={actionKey === `confirm-payment:${item.scriptId}`}
                          >
                            <CreditCard className="me-2 h-4 w-4" />
                            {lang === 'ar' ? 'تأكيد الدفع' : 'Confirm Payment'}
                          </Button>
                        ) : null}
                        {item.latestPayment?.paymentStatus === 'completed' && !item.certificate ? (
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => void runAdminAction(item, 'issue')}
                            isLoading={actionKey === `issue:${item.scriptId}`}
                          >
                            <FileCheck2 className="me-2 h-4 w-4" />
                            {lang === 'ar' ? 'إصدار الشهادة' : 'Issue Certificate'}
                          </Button>
                        ) : null}
                        {item.certificate ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void runAdminAction(item, 'regenerate')}
                            isLoading={actionKey === `regenerate:${item.scriptId}`}
                          >
                            <RotateCw className="me-2 h-4 w-4" />
                            {lang === 'ar' ? 'إعادة إصدار' : 'Regenerate'}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title={lang === 'ar' ? 'قالب شهادة جديد' : 'New Certificate Template'}
      >
        <div className="space-y-4">
          <Input
            label={lang === 'ar' ? 'اسم الشهادة' : 'Certificate name'}
            value={newTemplateName}
            onChange={(event) => setNewTemplateName(event.target.value)}
          />
          <Textarea
            label={lang === 'ar' ? 'الوصف' : 'Description'}
            value={newTemplateDescription}
            onChange={(event) => setNewTemplateDescription(event.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              {lang === 'ar' ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button onClick={() => void createTemplate()} isLoading={isCreatingTemplate}>
              {lang === 'ar' ? 'إنشاء' : 'Create'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
