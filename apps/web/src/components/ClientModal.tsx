import { useState, useEffect, useRef } from 'react';
import { useLangStore } from '@/store/langStore';
import { useDataStore, Company } from '@/store/dataStore';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { CompanyAvatar } from '@/components/ui/CompanyAvatar';
import { companiesApi } from '@/api';
import toast from 'react-hot-toast';

const LOGO_MAX_BYTES = 2 * 1024 * 1024; // 2MB
const LOGO_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp']);

interface ClientModalProps {
  isOpen: boolean;
  onClose: () => void;
  companyId?: string | null;
}

export function ClientModal({ isOpen, onClose, companyId }: ClientModalProps) {
  const { t, lang } = useLangStore();
  const { companies, addCompany, updateCompany } = useDataStore();

  const existingCompany = companyId ? companies.find(c => c.companyId === companyId) : null;

  const [formData, setFormData] = useState({
    nameAr: '',
    nameEn: '',
    repName: '',
    repTitle: '',
    phone: '',
    email: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      if (existingCompany) {
        const [repName, repTitle] = (existingCompany.representativeName || '').split(' (').map(s => s.replace(')', ''));
        setFormData({
          nameAr: existingCompany.nameAr,
          nameEn: existingCompany.nameEn,
          repName: repName || '',
          repTitle: repTitle || '',
          phone: existingCompany.phone ?? existingCompany.mobile ?? '',
          email: existingCompany.email || '',
        });
      } else {
        setFormData({ nameAr: '', nameEn: '', repName: '', repTitle: '', phone: '', email: '' });
      }
      setErrors({});
      setLogoFile(null);
      setLogoPreviewUrl(null);
      setLogoError(null);
    }
  }, [isOpen, existingCompany]);

  useEffect(() => {
    return () => {
      if (logoPreviewUrl) URL.revokeObjectURL(logoPreviewUrl);
    };
  }, [logoPreviewUrl]);

  const validateLogo = (file: File): string | null => {
    if (!LOGO_MIMES.has(file.type)) {
      return lang === 'ar' ? 'نوع الملف غير مدعوم (PNG، JPEG، WebP فقط)' : 'Invalid file type (only PNG, JPEG, WebP)';
    }
    if (file.size > LOGO_MAX_BYTES) {
      return lang === 'ar' ? 'حجم الملف كبير جداً (الحد 2 ميجا)' : 'File too large (max 2MB)';
    }
    return null;
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLogoError(null);
    const file = e.target.files?.[0];
    if (!file) {
      setLogoFile(null);
      if (logoPreviewUrl) {
        URL.revokeObjectURL(logoPreviewUrl);
        setLogoPreviewUrl(null);
      }
      return;
    }
    const err = validateLogo(file);
    if (err) {
      setLogoError(err);
      setLogoFile(null);
      setLogoPreviewUrl(null);
      return;
    }
    if (logoPreviewUrl) URL.revokeObjectURL(logoPreviewUrl);
    setLogoFile(file);
    setLogoPreviewUrl(URL.createObjectURL(file));
  };

  const handleRemoveLogo = async () => {
    if (!existingCompany?.companyId) return;
    setIsSaving(true);
    try {
      const updated = await companiesApi.removeCompanyLogo(existingCompany.companyId);
      updateCompany(existingCompany.companyId, { logoUrl: updated.logoUrl ?? null });
      setLogoFile(null);
      if (logoPreviewUrl) {
        URL.revokeObjectURL(logoPreviewUrl);
        setLogoPreviewUrl(null);
      }
      toast.success(lang === 'ar' ? 'تم إزالة الشعار' : 'Logo removed');
    } catch (err: any) {
      toast.error(err?.message ?? (lang === 'ar' ? 'فشل الحذف' : 'Failed to remove logo'));
    } finally {
      setIsSaving(false);
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!formData.nameAr.trim()) newErrors.nameAr = lang === 'ar' ? 'الاسم بالعربية مطلوب' : 'Arabic name is required';
    if (!formData.nameEn.trim()) newErrors.nameEn = lang === 'ar' ? 'الاسم بالإنجليزية مطلوب' : 'English name is required';
    if (!formData.repName.trim()) newErrors.repName = lang === 'ar' ? 'اسم الممثل مطلوب' : 'Representative name is required';
    if (!formData.phone.trim()) newErrors.phone = lang === 'ar' ? 'الجوال مطلوب' : 'Mobile is required';
    if (!formData.email.trim()) {
      newErrors.email = lang === 'ar' ? 'البريد الإلكتروني مطلوب' : 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
      newErrors.email = lang === 'ar' ? 'أدخل بريداً إلكترونياً صالحاً' : 'Enter a valid email address';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    setIsSaving(true);

    try {
      if (existingCompany) {
        await updateCompany(existingCompany.companyId, {
          nameAr: formData.nameAr,
          nameEn: formData.nameEn,
          representativeName: formData.repTitle.trim() ? `${formData.repName} (${formData.repTitle})` : formData.repName,
          email: formData.email.trim(),
          phone: formData.phone.trim(),
        });
        if (logoFile) {
          const updated = await companiesApi.uploadCompanyLogo(existingCompany.companyId, logoFile);
          updateCompany(existingCompany.companyId, { logoUrl: updated.logoUrl ?? null });
        }
      } else {
        const newCompany: Company = {
          companyId: '',
          nameAr: formData.nameAr.trim(),
          nameEn: formData.nameEn.trim(),
          representativeName: formData.repTitle.trim() ? `${formData.repName} (${formData.repTitle})` : formData.repName.trim(),
          representativeTitle: formData.repTitle.trim() || null,
          email: formData.email.trim(),
          phone: formData.phone.trim(),
          mobile: formData.phone.trim(),
          createdAt: new Date().toISOString().split('T')[0],
          scriptsCount: 0,
        };
        const saved = await addCompany(newCompany);
        const id = saved?.companyId;
        if (id && logoFile) {
          const updated = await companiesApi.uploadCompanyLogo(id, logoFile);
          updateCompany(id, { logoUrl: updated.logoUrl ?? null });
        }
      }
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? (lang === 'ar' ? 'فشل الحفظ' : 'Save failed'));
    } finally {
      setIsSaving(false);
    }
  };

  const displayName = formData.nameEn || formData.nameAr || (existingCompany ? (lang === 'ar' ? existingCompany.nameAr : existingCompany.nameEn) : '');
  const currentLogoUrl = logoPreviewUrl ?? (existingCompany ? (existingCompany.logoUrl ?? existingCompany.avatarUrl ?? null) : null);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={existingCompany ? t('editClient' as any) : t('addNewClient')}
    >
      <div className="space-y-4">
        <div className="flex items-start gap-4">
          <CompanyAvatar
            name={displayName}
            logoUrl={currentLogoUrl ?? undefined}
            size={64}
            className="rounded-xl border border-border"
          />
          <div className="flex-1 space-y-2">
            <p className="text-sm font-medium text-text-main">
              {lang === 'ar' ? 'شعار الشركة (اختياري)' : 'Company logo (optional)'}
            </p>
            <div className="flex flex-wrap gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={handleLogoChange}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isSaving}
              >
                {existingCompany ? (lang === 'ar' ? 'تغيير الشعار' : 'Change logo') : (lang === 'ar' ? 'رفع شعار' : 'Upload logo')}
              </Button>
              {existingCompany && (existingCompany.logoUrl ?? existingCompany.avatarUrl) && !logoPreviewUrl && (
                <Button type="button" variant="outline" size="sm" onClick={handleRemoveLogo} disabled={isSaving}>
                  {lang === 'ar' ? 'إزالة الشعار' : 'Remove logo'}
                </Button>
              )}
            </div>
            {logoError && <p className="text-sm text-red-500">{logoError}</p>}
          </div>
        </div>

        <Input
          label={lang === 'ar' ? 'الاسم بالعربية *' : 'Arabic Name *'}
          value={formData.nameAr}
          onChange={e => { setFormData({ ...formData, nameAr: e.target.value }); setErrors(prev => ({ ...prev, nameAr: '' })); }}
          error={errors.nameAr}
          dir="rtl"
        />
        <Input
          label={lang === 'ar' ? 'الاسم بالانجليزية *' : 'English Name *'}
          value={formData.nameEn}
          onChange={e => { setFormData({ ...formData, nameEn: e.target.value }); setErrors(prev => ({ ...prev, nameEn: '' })); }}
          error={errors.nameEn}
          dir="ltr"
        />
        <div className="grid grid-cols-2 gap-4">
          <Input
            label={lang === 'ar' ? 'اسم الممثل *' : 'Rep Name *'}
            value={formData.repName}
            onChange={e => { setFormData({ ...formData, repName: e.target.value }); setErrors(prev => ({ ...prev, repName: '' })); }}
            error={errors.repName}
          />
          <Input
            label={lang === 'ar' ? 'المسمى الوظيفي' : 'Rep Title'}
            value={formData.repTitle}
            onChange={e => setFormData({ ...formData, repTitle: e.target.value })}
          />
        </div>
        <Input
          label={lang === 'ar' ? 'الجوال *' : 'Mobile *'}
          value={formData.phone}
          onChange={e => { setFormData({ ...formData, phone: e.target.value }); setErrors(prev => ({ ...prev, phone: '' })); }}
          error={errors.phone}
          dir="ltr"
        />
        <Input
          label={lang === 'ar' ? 'البريد الإلكتروني *' : 'Email *'}
          type="email"
          value={formData.email}
          onChange={e => { setFormData({ ...formData, email: e.target.value }); setErrors(prev => ({ ...prev, email: '' })); }}
          error={errors.email}
          dir="ltr"
        />
        <div className="flex justify-end gap-3 pt-4 border-t border-border mt-6">
          <Button variant="outline" onClick={onClose} disabled={isSaving}>{t('cancel')}</Button>
          <Button onClick={handleSave} isLoading={isSaving}>{t('save')}</Button>
        </div>
      </div>
    </Modal>
  );
}
