import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, MessageSquare, XCircle } from 'lucide-react';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';
import { Textarea } from './ui/Textarea';
import { Badge } from './ui/Badge';
import { useLangStore } from '@/store/langStore';
import { useDataStore } from '@/store/dataStore';
import { scriptsApi } from '@/api';
import { formatDateTimeValue } from '@/utils/dateFormat';
import { cn } from '@/utils/cn';
import toast from 'react-hot-toast';

type RecommendationType = 'recommended_approval' | 'recommended_rejection';

interface ScriptRecommendationBarProps {
  scriptId: string;
  scriptTitle: string;
  currentStatus: string;
  recommendationStatus?: string | null;
  recommendationReason?: string | null;
  recommendedByName?: string | null;
  recommendedAt?: string | null;
  recommendationReportId?: string | null;
  className?: string;
  onSubmitted?: () => void;
}

function recommendationLabel(status: RecommendationType, lang: 'ar' | 'en'): string {
  if (status === 'recommended_approval') return lang === 'ar' ? 'توصية بالموافقة' : 'Recommended Approval';
  return lang === 'ar' ? 'توصية بالرفض' : 'Recommended Rejection';
}

function recommendationButtonLabel(status: RecommendationType, lang: 'ar' | 'en'): string {
  if (status === 'recommended_approval') return lang === 'ar' ? 'توصية بالموافقة' : 'Recommend Approval';
  return lang === 'ar' ? 'توصية بالرفض' : 'Recommend Rejection';
}

export function ScriptRecommendationBar({
  scriptId,
  scriptTitle,
  currentStatus,
  recommendationStatus,
  recommendationReason,
  recommendedByName,
  recommendedAt,
  recommendationReportId,
  className,
  onSubmitted,
}: ScriptRecommendationBarProps) {
  const { lang } = useLangStore();
  const { fetchInitialData } = useDataStore();
  const isAr = lang === 'ar';
  const [canRecommend, setCanRecommend] = useState(false);
  const [canReason, setCanReason] = useState<string | undefined>();
  const [loadingCan, setLoadingCan] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [pendingRecommendation, setPendingRecommendation] = useState<RecommendationType | null>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const currentStatusKey = String(currentStatus ?? '').toLowerCase();
  const isFinal = currentStatusKey === 'approved' || currentStatusKey === 'rejected';

  useEffect(() => {
    let cancelled = false;
    if (!scriptId) {
      setCanRecommend(false);
      setCanReason(undefined);
      return;
    }
    setLoadingCan(true);
    scriptsApi.getRecommendationCan(scriptId)
      .then((res) => {
        if (cancelled) return;
        setCanRecommend(Boolean(res.canRecommend));
        setCanReason(res.reason);
      })
      .catch((err) => {
        if (cancelled) return;
        setCanRecommend(false);
        setCanReason(err instanceof Error ? err.message : undefined);
      })
      .finally(() => {
        if (!cancelled) setLoadingCan(false);
      });
    return () => {
      cancelled = true;
    };
  }, [scriptId]);

  const hasRecommendation = Boolean(recommendationStatus);
  const recommendationType = useMemo(
    () => {
      const value = String(recommendationStatus ?? '').toLowerCase();
      if (value === 'recommended_approval' || value === 'recommended_rejection') return value as RecommendationType;
      return null;
    },
    [recommendationStatus],
  );

  const closeModal = () => {
    if (submitting) return;
    setModalOpen(false);
    setPendingRecommendation(null);
    setReason('');
  };

  const submitRecommendation = async () => {
    if (!pendingRecommendation) {
      toast.error(isAr ? 'اختر نوع التوصية أولاً' : 'Please choose a recommendation first');
      return;
    }
    const trimmed = reason.trim();
    if (!trimmed) {
      toast.error(isAr ? 'يرجى كتابة سبب التوصية' : 'Please enter a reason for the recommendation');
      return;
    }
    setSubmitting(true);
    try {
      await scriptsApi.makeRecommendation(scriptId, pendingRecommendation, trimmed, recommendationReportId ?? undefined);
      toast.success(isAr ? 'تم حفظ التوصية' : 'Recommendation saved');
      setModalOpen(false);
      setPendingRecommendation(null);
      setReason('');
      void fetchInitialData().catch(() => undefined);
      onSubmitted?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : (isAr ? 'تعذر حفظ التوصية' : 'Unable to save recommendation'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingCan && !hasRecommendation) {
    return null;
  }

  if (!canRecommend && !hasRecommendation) {
    return null;
  }

  return (
    <>
      <div className={cn('flex flex-wrap items-center gap-2', className)}>
        {hasRecommendation && recommendationType && (
          <div className="flex items-start gap-2 rounded-lg border border-border bg-surface px-3 py-2">
            <Badge
              variant={recommendationType === 'recommended_approval' ? 'success' : 'error'}
              className="text-[10px]"
            >
              {recommendationLabel(recommendationType, lang)}
            </Badge>
            <div className="text-[11px] leading-5 text-text-muted">
              <div className="font-medium text-text-main">
                {recommendedByName
                  ? (isAr ? `بواسطة: ${recommendedByName}` : `By: ${recommendedByName}`)
                  : (isAr ? 'توصية مسجلة' : 'Recommendation recorded')}
              </div>
              <div>
                {recommendedAt ? formatDateTimeValue(recommendedAt, { lang }) : '—'}
              </div>
              {recommendationReason && (
                <div className="max-w-[18rem] truncate" title={recommendationReason}>
                  {recommendationReason}
                </div>
              )}
            </div>
          </div>
        )}

        {canRecommend && !isFinal && (
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => setModalOpen(true)}
          >
            <MessageSquare className="w-4 h-4" />
            {isAr ? 'إرسال توصية' : 'Recommend'}
          </Button>
        )}

        {!canRecommend && !hasRecommendation && canReason && !isFinal && (
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <AlertCircle className="w-4 h-4" />
            <span>{canReason}</span>
          </div>
        )}
      </div>

      <Modal
        isOpen={modalOpen}
        onClose={closeModal}
        title={isAr ? 'توصية المراجع' : 'Reviewer Recommendation'}
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-surface p-3">
            <p className="text-sm font-semibold text-text-main">{scriptTitle}</p>
            <p className="mt-1 text-xs text-text-muted">
              {isAr ? 'اختر نوع التوصية ثم اكتب السبب حتى يراه المدير.' : 'Choose a recommendation and add the reason for the admin.'}
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              variant={pendingRecommendation === 'recommended_approval' ? 'primary' : 'outline'}
              className={cn('justify-start gap-2', pendingRecommendation === 'recommended_approval' && 'bg-success hover:bg-success/90')}
              onClick={() => setPendingRecommendation('recommended_approval')}
            >
              <CheckCircle2 className="w-4 h-4" />
              {recommendationButtonLabel('recommended_approval', lang)}
            </Button>
            <Button
              variant={pendingRecommendation === 'recommended_rejection' ? 'danger' : 'outline'}
              className="justify-start gap-2"
              onClick={() => setPendingRecommendation('recommended_rejection')}
            >
              <XCircle className="w-4 h-4" />
              {recommendationButtonLabel('recommended_rejection', lang)}
            </Button>
          </div>

          <Textarea
            label={isAr ? 'سبب التوصية' : 'Recommendation reason'}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            placeholder={
              pendingRecommendation === 'recommended_approval'
                ? (isAr ? 'لماذا توصي بالموافقة على النص؟' : 'Why do you recommend approval?')
                : pendingRecommendation === 'recommended_rejection'
                  ? (isAr ? 'لماذا توصي برفض النص؟' : 'Why do you recommend rejection?')
                  : (isAr ? 'اختر نوع التوصية أولاً…' : 'Choose a recommendation first...')
            }
          />

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <Button variant="outline" onClick={closeModal} disabled={submitting}>
              {isAr ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button
              onClick={() => void submitRecommendation()}
              isLoading={submitting}
              disabled={!pendingRecommendation || !reason.trim()}
              className={cn(pendingRecommendation === 'recommended_rejection' && 'bg-error hover:bg-error/90')}
            >
              {isAr ? 'حفظ التوصية' : 'Save Recommendation'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
