import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLangStore } from '@/store/langStore';
import { useDataStore, Script, Task, User as UserModel } from '@/store/dataStore';
import { useAuthStore } from '@/store/authStore';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { Textarea } from '@/components/ui/Textarea';
import { Select } from '@/components/ui/Select';
import { CompanyAvatar } from '@/components/ui/CompanyAvatar';
import { ClientModal } from '@/components/ClientModal';
import { FileUpload } from '@/components/ui/FileUpload';
import { scriptsApi, reportsApi } from '@/api';
import toast from 'react-hot-toast';
import { API_BASE_URL } from '@/lib/env';
import { supabase } from '@/lib/supabaseClient';
import { ArrowLeft, Trash2, FileText, Edit, Upload, User } from 'lucide-react';

import { usersApi } from '@/api';
import { useSettingsStore } from '@/store/settingsStore';
import { formatDate } from '@/utils/dateFormat';
import { escapeHtmlSafe } from '@/utils/escapeHtml';
import { normalizeScriptStatusForDisplay, normalizeScriptStatusForFilter } from '@/utils/scriptStatus';

export function ClientDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t, lang } = useLangStore();
  const { settings } = useSettingsStore();
  const { companies, scripts, addScript, addTask } = useDataStore();
  const { user, hasPermission } = useAuthStore();

  const company = companies.find(c => c.companyId === id);
  const companyScripts = scripts.filter(s => s.companyId === id);

  const [isEditScriptOpen, setIsEditScriptOpen] = useState<Script | null>(null);
  const [editScriptForm, setEditScriptForm] = useState<Partial<Script>>({});

  const handleUpdateScript = async () => {
    if (!isEditScriptOpen) return;
    setIsSaving(true);
    try {
      await scriptsApi.updateScript(isEditScriptOpen.id, {
        title: editScriptForm.title,
        synopsis: editScriptForm.synopsis,
        assigneeId: editScriptForm.assigneeId
      });
      toast.success(lang === 'ar' ? 'تم تحديث النص' : 'Script updated');
      await fetchInitialData();
      setIsEditScriptOpen(null);
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to update script');
    } finally {
      setIsSaving(false);
    }
  };

  const openEditScriptModal = (script: Script, e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditScriptOpen(script);
    setEditScriptForm({
      title: script.title,
      synopsis: script.synopsis,
      assigneeId: script.assigneeId || ''
    });
  };

  const [isUploadOpen, setIsUploadOpen] = useState(false); // Restored
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const isAdmin = user?.role === 'Super Admin' || user?.role === 'Admin';
  const canAddScript = hasPermission('upload_scripts');
  const [formData, setFormData] = useState({
    title: '',
    type: 'Film' as 'Film' | 'Series',
    synopsis: '',
    assigneeId: user?.id || '',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [reportCountByScriptId, setReportCountByScriptId] = useState<Record<string, number>>({});
  const [exportingPdf, setExportingPdf] = useState(false);

  const { fetchInitialData } = useDataStore();

  const [availableUsers, setAvailableUsers] = useState<UserModel[]>([]);


  useEffect(() => {
    usersApi
      .getUsers()
      .then(users => {
        setAvailableUsers(users.map(u => ({ ...u, role: u.roleKey || 'user', permissions: [] })));
      })
      .catch(err => {
        // Regulators (and others without manage_users) get 403 on /users — use only current user for assignee dropdown
        if (err?.message?.includes('403') || err?.message?.includes('Forbidden')) {
          setAvailableUsers(
            user ? [{ id: user.id, name: user.name, email: user.email, role: user.role, permissions: [] }] : []
          );
          return;
        }
        console.error('Failed to load users', err);
      });
  }, [user]);

  const loadReportCounts = useCallback(async () => {
    if (companyScripts.length === 0) return;
    const counts: Record<string, number> = {};
    await Promise.all(
      companyScripts.map(async (script) => {
        try {
          const list = await reportsApi.listByScript(script.id);
          counts[script.id] = list.length;
        } catch {
          counts[script.id] = 0;
        }
      })
    );
    setReportCountByScriptId((prev) => ({ ...prev, ...counts }));
  }, [companyScripts]);

  useEffect(() => {
    loadReportCounts();
  }, [loadReportCounts]);

  const handleDeleteScript = async (scriptId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const yes = confirm(lang === 'ar' ? 'هل أنت متأكد من حذف هذا النص؟ سيتم حذف جميع التقارير والنتائج المرتبطة.' : 'Are you sure you want to delete this script? All associated reports and findings will be deleted.');
    if (!yes) return;
    setDeletingId(scriptId);
    try {
      await scriptsApi.deleteScript(scriptId);
      toast.success(lang === 'ar' ? 'تم حذف النص' : 'Script deleted');
      await fetchInitialData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : (lang === 'ar' ? 'فشل الحذف' : 'Delete failed'));
    } finally {
      setDeletingId(null);
    }
  };

  if (!company) {
    return <div className="p-8 text-center text-text-muted">Company not found.</div>;
  }


  const uploadScriptDocument = async (scriptId: string, file: File) => {
    try {
      // Use singleton supabase client (same auth state as app). Get access_token only (never refresh_token or anon key).
      let { data: { session } } = await supabase.auth.getSession();
      let token = session?.access_token ?? null;
      if (!token) {
        await supabase.auth.refreshSession();
        ({ data: { session } } = await supabase.auth.getSession());
        token = session?.access_token ?? null;
      }
      if (!token) {
        await new Promise((r) => setTimeout(r, 200));
        ({ data: { session } } = await supabase.auth.getSession());
        token = session?.access_token ?? null;
      }
      if (!token) {
        throw new Error('No auth token available');
      }

      const formData = new FormData();
      formData.append('file', file);
      formData.append('scriptId', scriptId);
      formData.append('companyId', company.companyId);
      formData.append('createVersion', settings?.platform?.createVersionOnFileReplace !== false ? 'true' : 'false');

      const tokenPrefix = token.substring(0, 10) + '...';
      if (import.meta.env.DEV) console.log(`🔍 DEBUG: Starting upload. Token prefix: ${tokenPrefix}, Expires at: ${session?.expires_at}`);

      const response = await fetch(`${API_BASE_URL}/raawi-script-upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'apikey': (import.meta as any).env.VITE_SUPABASE_ANON_KEY,
        },
        body: formData,
      });

      if (import.meta.env.DEV) console.log('🔍 DEBUG: Upload response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        if (import.meta.env.DEV) console.error('🔍 DEBUG: Upload failed with response:', errorText);
        throw new Error(`Upload failed: ${response.status} ${errorText}`);
      }

      const result = await response.json();
      if (import.meta.env.DEV) console.log('🔍 DEBUG: Upload successful, result:', result);
      return result;
    } catch (error) {
      if (import.meta.env.DEV) console.error('Upload error:', error);
      throw new Error(error instanceof Error ? error.message : 'Failed to upload document');
    }
  };

  const handleSaveNewScript = async () => {
    if (!formData.title) return;

    const isAssigning = formData.assigneeId && formData.assigneeId !== user?.id;

    // Validate file upload for assignments
    if (isAssigning && !uploadFile) {
      toast.error(lang === 'ar'
        ? 'يجب رفع مستند عند إسناد النص لمستخدم آخر'
        : 'Document upload required when assigning to another user');
      return;
    }

    setIsSaving(true);
    try {
      if (import.meta.env.DEV) {
        console.log('🔍 DEBUG: formData.assigneeId =', formData.assigneeId);
        console.log('🔍 DEBUG: current user.id =', user?.id);
        console.log('🔍 DEBUG: isAssigning =', isAssigning);
      }
      const scriptPayload: Script = {
        id: '',
        companyId: company.companyId,
        title: formData.title,
        type: formData.type,
        synopsis: formData.synopsis,
        status: isAssigning ? 'Draft' : 'Draft',
        createdAt: new Date().toISOString().split('T')[0],
        assigneeId: formData.assigneeId,
      };
      if (import.meta.env.DEV) console.log('🔍 DEBUG: scriptPayload =', scriptPayload);

      const saved = await addScript(scriptPayload);
      if (import.meta.env.DEV) console.log('🔍 DEBUG: saved script returned from API =', saved);
      if (!saved) {
        setIsSaving(false);
        return;
      }

      // 2. If assigning with document, upload and extract text
      if (isAssigning && uploadFile) {
        toast.loading(lang === 'ar' ? 'جاري رفع المستند...' : 'Uploading document...', { id: 'upload-toast' });
        try {
          if (import.meta.env.DEV) console.log('🔍 DEBUG: Starting document upload for script', saved.id, 'file:', uploadFile.name);
          const uploadResult = await uploadScriptDocument(saved.id, uploadFile);
          if (import.meta.env.DEV) console.log('🔍 DEBUG: Upload result =', uploadResult);

          // Extract text client-side
          if (uploadResult.versionId) {
            toast.loading(lang === 'ar' ? 'جاري استخراج النص...' : 'Extracting text...', { id: 'upload-toast' });

            const ext = uploadFile.name.toLowerCase().split('.').pop() || '';
            let extractedText = '';
            let contentHtml: string | null = null;

            try {
              if (ext === 'docx') {
                const { extractDocx } = await import('@/utils/documentExtract');
                const { plain, html } = await extractDocx(uploadFile);
                extractedText = plain || '';
                contentHtml = html && html.trim() ? html.trim() : null;
              } else if (ext === 'pdf') {
                const { extractTextFromPdf } = await import('@/utils/documentExtract');
                extractedText = await extractTextFromPdf(uploadFile);
              } else if (ext === 'txt') {
                extractedText = await uploadFile.text();
              }

              if (!extractedText || !extractedText.trim()) {
                throw new Error('No text found in document');
              }

              // Send extracted text to server
              const { scriptsApi } = await import('@/api');
              await scriptsApi.extractText(uploadResult.versionId, extractedText, {
                enqueueAnalysis: false,
                contentHtml,
              });

              toast.success(lang === 'ar' ? 'تم رفع وتحميل المستند بنجاح' : 'Document uploaded and loaded successfully', { id: 'upload-toast' });
            } catch (extractErr) {
              if (import.meta.env.DEV) console.error('🔍 DEBUG: Extraction error =', extractErr);
              toast.error(lang === 'ar' ? 'تم رفع الملف لكن فشل استخراج النص' : 'File uploaded but text extraction failed', { id: 'upload-toast' });
            }
          } else {
            toast.success(lang === 'ar' ? 'تم رفع المستند بنجاح' : 'Document uploaded successfully', { id: 'upload-toast' });
          }
        } catch (err) {
          if (import.meta.env.DEV) console.error('🔍 DEBUG: Upload error =', err);
          toast.error(lang === 'ar' ? 'فشل رفع المستند' : 'Failed to upload document', { id: 'upload-toast' });
        }
      }

      if (hasPermission('assign_tasks') && formData.assigneeId !== user?.id) {
        const newTask: Task = {
          id: `TSK-${Math.floor(1000 + Math.random() * 9000)}`,
          scriptId: saved.id,
          companyName: lang === 'ar' ? company.nameAr : company.nameEn,
          scriptTitle: formData.title,
          status: uploadFile ? 'Ready' : 'Draft', // Ready if document uploaded
          assignedBy: user?.name || 'System',
          assignedTo: formData.assigneeId,
          assignedAt: new Date().toISOString().split('T')[0],
        };
        addTask(newTask);
      }

      setIsUploadOpen(false);
      setFormData({ ...formData, title: '', synopsis: '', assigneeId: user?.id || '' }); // Reset assignee too
      setUploadFile(null); // Reset file

      // Navigate to workspace only if not assigning to others
      if (!isAssigning) {
        navigate(`/workspace/${saved.id}`);
      } else {
        const assignedUser = availableUsers.find(u => u.id === formData.assigneeId);
        toast.success(lang === 'ar'
          ? `تم إسناد النص إلى ${assignedUser?.name || 'User'}`
          : `Script assigned to ${assignedUser?.name || 'User'}`);
      }
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to save script');
    } finally {
      setIsSaving(false);
    }
  };


  const handleExportClientReport = async () => {
    if (!company) return;
    setExportingPdf(true);
    try {
      // 1. Fetch Template
      const response = await fetch('/templates/client-detail-report-template.html');
      const template = await response.text();

      const isAr = lang === 'ar';
      const baseUrl = window.location.origin;

      // Images
      const loginLogo = `${baseUrl}/loginlogo.png`;
      const footerImg = `${baseUrl}/footer.png`;
      const dashLogo = `${baseUrl}/loginlogo.png`;

      // Client Logo (handle absolute/relative paths)
      let clientLogo = company.logoUrl ?? company.avatarUrl ?? '';
      if (clientLogo && !clientLogo.startsWith('http')) {
        // If it's a relative path or storage path, we might need a placeholder or handle it.
        // For now assume if it's not http, it might be a relative path from public?
        // Actually, if it comes from storage it's usually a full URL. 
        // If empty, template handles it.
      }
      const clientLogoVisible = !!clientLogo;

      // 2. Prepare Scripts Data
      const scriptsData = companyScripts.map(s => {
        const norm = normalizeScriptStatusForFilter(s.status);
        let statusClass = 'badge-outline';
        if (norm === 'approved') statusClass = 'badge-success';
        if (norm === 'in_review' || norm === 'review_required') statusClass = 'badge-warning';
        if (norm === 'rejected') statusClass = 'badge-danger';

        return {
          title: s.title,
          type: s.type,
          date: s.createdAt,
          assignee: availableUsers.find(u => u.id === s.assigneeId)?.name || (isAr ? 'غير مسند' : 'Unassigned'),
          reportsCount: reportCountByScriptId[s.id] ?? 0,
          status: normalizeScriptStatusForDisplay(s.status),
          statusClass
        };
      });

      // Stats (normalized so API casing doesn't matter)
      const total = companyScripts.length;
      const approved = companyScripts.filter(s => normalizeScriptStatusForFilter(s.status) === 'approved').length;
      const inReview = companyScripts.filter(s => ['in_review', 'review_required'].includes(normalizeScriptStatusForFilter(s.status))).length;
      const draft = companyScripts.filter(s => normalizeScriptStatusForFilter(s.status) === 'draft').length;

      // 3. Replacements
      let html = template;
      const replacements: Record<string, string> = {
        '{{lang}}': isAr ? 'ar' : 'en',
        '{{dir}}': isAr ? 'rtl' : 'ltr',
        '{{clientName}}': isAr ? company.nameAr : company.nameEn,
        '{{formattedDate}}': formatDate(new Date(), { lang: isAr ? 'ar' : 'en', format: settings?.platform?.dateFormat }),
        '{{generationTimestamp}}': new Date().toLocaleString(),
        '{{loginLogoBase64}}': loginLogo,
        '{{footerImageBase64}}': footerImg,
        '{{dashboardLogoBase64}}': dashLogo,
        '{{clientLogoBase64}}': clientLogo,

        // Labels
        '{{labels.reportTitle}}': isAr ? 'تقرير العميل التفصيلي' : 'Client Detailed Report',
        '{{labels.clientProfile}}': isAr ? 'ملف العميل' : 'Client Profile',
        '{{labels.scriptsOverview}}': isAr ? 'ملخص النصوص' : 'Scripts Overview',
        '{{labels.scriptsList}}': isAr ? 'قائمة النصوص' : 'Scripts List',
        '{{labels.totalScripts}}': isAr ? 'إجمالي النصوص' : 'Total Scripts',
        '{{labels.generatedOn}}': isAr ? 'تاريخ التقرير' : 'Generated On',
        '{{labels.clientName}}': isAr ? 'اسم العميل' : 'Client Name',
        '{{labels.representative}}': isAr ? 'المندوب' : 'Representative',
        '{{labels.email}}': isAr ? 'البريد الإلكتروني' : 'Email',
        '{{labels.phone}}': isAr ? 'الهاتف' : 'Phone',
        '{{labels.registrationDate}}': isAr ? 'تاريخ التسجيل' : 'Registration Date',
        '{{labels.status}}': isAr ? 'الحالة' : 'Status',
        '{{labels.approved}}': isAr ? 'تمت الموافقة' : 'Approved',
        '{{labels.inReview}}': isAr ? 'قيد المراجعة' : 'In Review',
        '{{labels.draft}}': isAr ? 'مسودة' : 'Draft',
        '{{labels.scriptTitle}}': isAr ? 'عنوان النص' : 'Script Title',
        '{{labels.type}}': isAr ? 'النوع' : 'Type',
        '{{labels.date}}': isAr ? 'التاريخ' : 'Date',
        '{{labels.assignee}}': isAr ? 'المسند إليه' : 'Assignee',
        '{{labels.reports}}': isAr ? 'التقارير' : 'Reports',

        // Client Data
        '{{client.representative}}': company.representativeName,
        '{{client.email}}': company.email,
        '{{client.phone}}': company.phone || company.mobile || '—',
        '{{client.registrationDate}}': company.createdAt,
        '{{client.status}}': total > 0 ? (isAr ? 'نشط' : 'Active') : (isAr ? 'غير نشط' : 'Inactive'),

        // Stats Values
        '{{stats.totalScripts}}': String(total),
        '{{stats.approvedScripts}}': String(approved),
        '{{stats.inReviewScripts}}': String(inReview),
        '{{stats.draftScripts}}': String(draft),
      };

      Object.entries(replacements).forEach(([key, val]) => {
        html = html.split(key).join(val);
      });

      // Conditional Logo
      if (clientLogoVisible) {
        html = html.replace('{{#if clientLogoVisible}}', '').replace('{{/if}}', '').replace('{{#if clientLogoVisible}}', '').replace('{{/if}}', '');
      } else {
        // Remove blocks
        html = html.replace(/{{#if clientLogoVisible}}[\s\S]*?{{\/if}}/g, '');
      }

      // 4. Generate Rows
      const rowsHtml = scriptsData.map(item => `
        <tr>
            <td><div class="font-bold">${escapeHtmlSafe(item.title)}</div></td>
            <td>${escapeHtmlSafe(item.type)}</td>
            <td>${escapeHtmlSafe(item.date)}</td>
            <td><div style="font-size: 10px;">${escapeHtmlSafe(item.assignee)}</div></td>
            <td style="text-align: center;"><span style="font-weight: 600;">${item.reportsCount}</span></td>
            <td><span class="badge ${item.statusClass}">${escapeHtmlSafe(String(item.status))}</span></td>
        </tr>
      `).join('');

      const loopRegex = /{{#each scripts}}([\s\S]*?){{\/each}}/m;
      html = html.replace(loopRegex, rowsHtml);

      // 5. Open Window
      const win = window.open('', '_blank');
      if (!win) {
        toast.error(isAr ? 'تم حظر النافذة المنبثقة' : 'Popup blocked');
        return;
      }

      setTimeout(() => {
        win.document.write(html);
        win.document.close();
        setTimeout(() => win.print(), 500);
      }, 100);

    } catch (err: unknown) {
      if (import.meta.env.DEV) console.error(err);
      toast.error(err instanceof Error ? err.message : 'Report generation failed');
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" className="px-2" onClick={() => navigate('/clients')} aria-label="Back to clients">
          <ArrowLeft className="w-5 h-5 rtl:rotate-180" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight text-text-main flex items-center gap-3">
            {lang === 'ar' ? company.nameAr : company.nameEn}
            {isAdmin && (
              <Button variant="outline" size="sm" onClick={() => setIsEditModalOpen(true)} className="h-8 text-xs font-normal">
                <Edit className="w-3.5 h-3.5 mr-1" />
                {t('editData' as any)}
              </Button>
            )}
          </h1>
          <p className="text-text-muted mt-1">{t('clientDetails')}</p>
        </div>
        <Button
          variant="outline"
          onClick={handleExportClientReport}
          disabled={exportingPdf}
          className="gap-2"
        >
          <FileText className="w-4 h-4" />
          {lang === 'ar' ? 'تصدير التقرير' : 'Export Report'}
        </Button>
      </div>

      <Card>
        <CardContent className="p-6">
          <div className="flex items-start gap-6">
            <CompanyAvatar
              name={lang === 'ar' ? company.nameAr : company.nameEn}
              logoUrl={company.logoUrl ?? company.avatarUrl ?? undefined}
              size={80}
              className="rounded-xl border border-border"
            />
            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div>
                <p className="text-xs text-text-muted uppercase mb-1">{t('representative')}</p>
                <p className="font-medium text-text-main">{company.representativeName}</p>
                <p className="text-sm text-text-muted">{company.email}</p>
                <p className="text-sm text-text-muted" dir="ltr">{company.phone ?? company.mobile ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs text-text-muted uppercase mb-1">{t('registrationDate')}</p>
                <p className="font-medium text-text-main">{company.createdAt}</p>
              </div>
              <div>
                <p className="text-xs text-text-muted uppercase mb-1">{t('scriptsCount')}</p>
                <p className="font-medium text-text-main">{companyScripts.length}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-between items-center pt-4">
        <h2 className="text-lg font-bold text-text-main">{lang === 'ar' ? 'النصوص' : 'Company Scripts'}</h2>
        {canAddScript && (
          <Button onClick={() => setIsUploadOpen(true)} className="flex items-center gap-2">
            <Upload className="w-4 h-4" />
            {lang === 'ar' ? 'رفع نص جديد' : 'Upload New Script'}
          </Button>
        )}
      </div>

      {companyScripts.length === 0 ? (
        <Card className="border-dashed border-2 bg-background/50">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 bg-surface border border-border rounded-2xl flex items-center justify-center mb-4 shadow-sm">
              <FileText className="w-8 h-8 text-text-muted" />
            </div>
            <h3 className="text-lg font-medium text-text-main mb-2">
              {lang === 'ar' ? 'لا يوجد نصوص' : 'No scripts yet'}
            </h3>
            <p className="text-text-muted max-w-sm mb-6">
              {lang === 'ar' ? 'قم برفع أول نص للبدء في عملية التحليل.' : 'Upload the first script to start the analysis process.'}
            </p>
            {canAddScript && (
              <Button onClick={() => setIsUploadOpen(true)}>
                {lang === 'ar' ? 'رفع أول نص' : 'Upload First Script'}
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left rtl:text-right">
              <thead className="text-xs text-text-muted uppercase bg-background border-b border-border">
                <tr>
                  <th className="px-6 py-4 font-medium">{lang === 'ar' ? 'العنوان' : 'Title'}</th>
                  <th className="px-6 py-4 font-medium">{lang === 'ar' ? 'النوع' : 'Type'}</th>
                  <th className="px-6 py-4 font-medium">{lang === 'ar' ? 'التاريخ' : 'Date'}</th>
                  <th className="px-6 py-4 font-medium">{lang === 'ar' ? 'الحالة' : 'Status'}</th>
                  <th className="px-6 py-4 font-medium">{lang === 'ar' ? 'التقارير' : 'Reports'}</th>
                  <th className="px-6 py-4 font-medium">{lang === 'ar' ? 'المعين' : 'Assignee'}</th>
                  <th className="px-6 py-4 font-medium">{lang === 'ar' ? 'المعين' : 'Assignee'}</th>
                  {isAdmin && (
                    <th className="px-6 py-4 font-medium">{lang === 'ar' ? 'أنشأ بواسطة' : 'Created By'}</th>
                  )}
                  <th className="px-6 py-4 font-medium text-end"></th>
                </tr>
              </thead>
              <tbody>
                {companyScripts.map((script) => (
                  <tr
                    key={script.id}
                    className="bg-surface border-b border-border hover:bg-background/50 transition-colors cursor-pointer group"
                    onClick={() => navigate(`/workspace/${script.id}`)}
                  >
                    <td className="px-6 py-4 font-medium text-text-main group-hover:text-primary transition-colors">
                      {script.title}
                    </td>
                    <td className="px-6 py-4">{script.type}</td>
                    <td className="px-6 py-4 text-text-muted">{script.createdAt}</td>
                    <td className="px-6 py-4">
                      <Badge variant={script.status === 'Draft' ? 'outline' : script.status === 'Approved' ? 'success' : 'warning'}>
                        {normalizeScriptStatusForDisplay(script.status)}
                      </Badge>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-text-muted flex-shrink-0" />
                        <span className="font-medium text-text-main tabular-nums">
                          {reportCountByScriptId[script.id] ?? '—'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-text-muted" />
                        <span className="text-text-muted text-xs">
                          {availableUsers.find(u => u.id === script.assigneeId)?.name || 'Unassigned'}
                        </span>
                      </div>
                    </td>
                    {isAdmin && (
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className="text-text-muted text-xs">
                            {availableUsers.find(u => u.id === script.created_by)?.name || '—'}
                          </span>
                        </div>
                      </td>
                    )}
                    <td className="px-6 py-4 text-end">
                      {isAdmin && (
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={(e) => openEditScriptModal(script, e)}
                            className="p-1.5 text-text-muted hover:text-primary hover:bg-primary/10 rounded-md transition-colors"
                            title={lang === 'ar' ? 'تعديل النص' : 'Edit script'}
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => handleDeleteScript(script.id, e)}
                            disabled={deletingId === script.id}
                            className="p-1.5 text-text-muted hover:text-error hover:bg-error/10 rounded-md transition-colors disabled:opacity-50"
                            title={lang === 'ar' ? 'حذف النص' : 'Delete script'}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* NEW: Edit Script Modal */}
      <Modal isOpen={!!isEditScriptOpen} onClose={() => { setIsEditScriptOpen(null); setEditScriptForm({}); }} title={lang === 'ar' ? 'تعديل النص' : 'Edit Script'}>
        {isEditScriptOpen && (
          <div className="space-y-4">
            <Input
              label={lang === 'ar' ? 'العنوان' : 'Title'}
              value={editScriptForm.title || ''}
              onChange={e => setEditScriptForm({ ...editScriptForm, title: e.target.value })}
            />
            <Textarea
              label={lang === 'ar' ? 'ملخص' : 'Synopsis'}
              value={editScriptForm.synopsis || ''}
              onChange={e => setEditScriptForm({ ...editScriptForm, synopsis: e.target.value })}
            />
            {hasPermission('assign_tasks') && (
              <Select
                label={lang === 'ar' ? 'إسناد إلى' : 'Assign To'}
                value={editScriptForm.assigneeId || ''}
                onChange={e => setEditScriptForm({ ...editScriptForm, assigneeId: e.target.value })}
                options={[
                  { value: '', label: lang === 'ar' ? 'غير مسند' : 'Unassigned' },
                  { value: user?.id || '', label: lang === 'ar' ? 'أنا (المستخدم الحالي)' : 'Me (Current User)' },
                  ...availableUsers
                    .filter(u => u.id !== (user?.id || ''))
                    .map(u => ({ value: u.id, label: u.name }))
                ]}
              />
            )}

            <div className="flex justify-end gap-3 pt-4 border-t border-border">
              <Button variant="outline" onClick={() => { setIsEditScriptOpen(null); setEditScriptForm({}); }}>{t('cancel')}</Button>
              <Button onClick={handleUpdateScript} disabled={isSaving}>
                {isSaving ? (lang === 'ar' ? 'جاري الحفظ…' : 'Saving…') : (lang === 'ar' ? 'حفظ' : 'Save')}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={isUploadOpen} onClose={() => setIsUploadOpen(false)} title={lang === 'ar' ? `إضافة نص جديد – ${company.nameAr}` : `Add New Script – ${company.nameEn}`}>
        <div className="space-y-4">
          <Input
            label={lang === 'ar' ? 'عنوان النص *' : 'Script Title *'}
            value={formData.title}
            onChange={e => setFormData({ ...formData, title: e.target.value })}
          />
          <Select
            label={lang === 'ar' ? 'نوع الإنتاج' : 'Production Type'}
            value={formData.type}
            onChange={e => setFormData({ ...formData, type: e.target.value as 'Film' | 'Series' })}
            options={[
              { label: 'Film', value: 'Film' },
              { label: 'Series', value: 'Series' }
            ]}
          />
          {hasPermission('assign_tasks') && (
            <Select
              label={lang === 'ar' ? 'إسناد إلى' : 'Assign To'}
              value={formData.assigneeId}
              onChange={e => setFormData({ ...formData, assigneeId: e.target.value })}
              options={[
                { value: user?.id || '', label: lang === 'ar' ? 'أنا (المستخدم الحالي)' : 'Me (Current User)' },
                ...availableUsers
                  .filter(u => u.id !== (user?.id || ''))
                  .map(u => ({ value: u.id, label: u.name }))
              ]}
            />
          )}

          {hasPermission('assign_tasks') && formData.assigneeId && formData.assigneeId !== (user?.id || '') && (
            <FileUpload
              label={lang === 'ar' ? 'رفع مستند النص *' : 'Upload Script Document *'}
              accept=".pdf,.docx"
              onChange={(file: File | null) => setUploadFile(file)}
              helperText={lang === 'ar'
                ? 'رفع مستند PDF أو DOCX للمستخدم المعيَّن'
                : 'Upload PDF or DOCX document for the assigned user'}
            />
          )}
          <Textarea
            label={lang === 'ar' ? 'ملخص النص (اختياري)' : 'Synopsis (Optional)'}
            value={formData.synopsis}
            onChange={e => setFormData({ ...formData, synopsis: e.target.value })}
          />
          <p className="text-xs text-text-muted">
            {lang === 'ar' ? 'سيتم فتح مساحة العمل بعد الحفظ؛ يمكنك استيراد المستند من هناك.' : 'Workspace will open after save; you can import the document there.'}
          </p>
          <div className="flex justify-end gap-3 pt-4 border-t border-border mt-6">
            <Button variant="outline" onClick={() => setIsUploadOpen(false)} disabled={isSaving}>{t('cancel')}</Button>
            <Button onClick={handleSaveNewScript} disabled={isSaving || !formData.title.trim()}>
              {isSaving ? (lang === 'ar' ? 'جاري الحفظ…' : 'Saving…') : (lang === 'ar' ? 'حفظ' : 'Save')}
            </Button>
          </div>
        </div>
      </Modal>

      <ClientModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        companyId={company.companyId}
      />
    </div>
  );
}
