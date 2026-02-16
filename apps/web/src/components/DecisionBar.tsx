import { useState } from 'react';
import { Button } from './ui/Button';
import { Textarea } from './ui/Textarea';
import { CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { useLangStore } from '../store/langStore';
import { useAuthStore } from '../store/authStore';
import toast from 'react-hot-toast';
import type { ScriptDecisionCapabilities } from '../utils/scriptDecisionCapabilities';

interface DecisionBarProps {
    scriptId: string;
    scriptTitle: string;
    currentStatus: string;
    relatedReportId?: string;
    onDecisionMade?: (newStatus: string) => void;
    compact?: boolean;
    /** When provided, buttons are gated by backend-aligned capabilities (assignee/creator/role). */
    capabilities?: ScriptDecisionCapabilities | null;
}

export function DecisionBar({
    scriptId,
    scriptTitle,
    currentStatus,
    relatedReportId,
    onDecisionMade,
    compact = false,
    capabilities: capabilitiesProp = null,
}: DecisionBarProps) {
    const { lang } = useLangStore();
    const { hasPermission } = useAuthStore();
    const [reason, setReason] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showReasonInput, setShowReasonInput] = useState(false);
    const [pendingDecision, setPendingDecision] = useState<'approve' | 'reject' | null>(null);

    const isAr = lang === 'ar';

    const canApprove = capabilitiesProp != null
        ? capabilitiesProp.canApprove
        : (hasPermission('approve_scripts') || hasPermission('manage_script_status'));
    const canReject = capabilitiesProp != null
        ? capabilitiesProp.canReject
        : (hasPermission('reject_scripts') || hasPermission('manage_script_status'));
    const reasonIfDisabled = capabilitiesProp?.reasonIfDisabled ?? null;

    if (!canApprove && !canReject) {
        if (reasonIfDisabled) {
            return (
                <div
                    className="flex items-center gap-2 px-4 py-2 bg-surface-elevated rounded-lg border border-border text-sm text-text-muted"
                    title={reasonIfDisabled}
                >
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{reasonIfDisabled}</span>
                </div>
            );
        }
        return null;
    }

    // Don't show if already approved/rejected
    if (currentStatus === 'approved' || currentStatus === 'rejected') {
        return (
            <div className="flex items-center gap-2 px-4 py-2 bg-surface-elevated rounded-lg border border-border">
                {currentStatus === 'approved' ? (
                    <>
                        <CheckCircle className="w-5 h-5 text-success" />
                        <span className="text-sm text-text-primary font-medium">
                            {isAr ? 'تمت الموافقة على هذا النص' : 'This script has been approved'}
                        </span>
                    </>
                ) : (
                    <>
                        <XCircle className="w-5 h-5 text-error" />
                        <span className="text-sm text-text-primary font-medium">
                            {isAr ? 'تم رفض هذا النص' : 'This script has been rejected'}
                        </span>
                    </>
                )}
            </div>
        );
    }

    const handleDecisionClick = (decision: 'approve' | 'reject') => {
        setPendingDecision(decision);
        setShowReasonInput(true);
    };

    const handleSubmitDecision = async () => {
        if (!pendingDecision) return;

        if (!reason.trim()) {
            toast.error(isAr ? 'يرجى إدخال سبب القرار' : 'Please enter a reason for your decision');
            return;
        }

        setIsSubmitting(true);
        try {
            const { scriptsApi } = await import('../api');
            await scriptsApi.makeDecision(
                scriptId,
                pendingDecision,
                reason.trim(),
                relatedReportId
            );

            toast.success(
                pendingDecision === 'approve'
                    ? isAr ? 'تمت الموافقة على النص بنجاح' : 'Script approved successfully'
                    : isAr ? 'تم رفض النص' : 'Script rejected'
            );

            // Reset state
            setReason('');
            setShowReasonInput(false);
            setPendingDecision(null);

            // Notify parent (can refetch scripts / update state)
            if (onDecisionMade) {
                onDecisionMade(pendingDecision === 'approve' ? 'approved' : 'rejected');
            }
        } catch (error: any) {
            console.error('Decision error:', error);
            toast.error(error.message || (isAr ? 'فشل في تنفيذ القرار' : 'Failed to execute decision'));
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleCancel = () => {
        setShowReasonInput(false);
        setPendingDecision(null);
        setReason('');
    };

    if (compact) {
        return (
            <div className="flex flex-col gap-3 p-4 bg-surface-elevated rounded-lg border border-border">
                <div className="flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-warning" />
                    <span className="text-sm font-medium text-text-primary">
                        {isAr ? 'قرار المراجعة' : 'Review Decision'}
                    </span>
                </div>

                {!showReasonInput ? (
                    <div className="flex gap-2">
                        {canApprove && (
                            <Button
                                onClick={() => handleDecisionClick('approve')}
                                variant="primary"
                                size="sm"
                                className="flex-1 bg-success hover:bg-success/90"
                            >
                                <CheckCircle className="w-4 h-4 mr-2" />
                                {isAr ? 'موافقة' : 'Approve'}
                            </Button>
                        )}
                        {canReject && (
                            <Button
                                onClick={() => handleDecisionClick('reject')}
                                variant="danger"
                                size="sm"
                                className="flex-1"
                            >
                                <XCircle className="w-4 h-4 mr-2" />
                                {isAr ? 'رفض' : 'Reject'}
                            </Button>
                        )}
                    </div>
                ) : (
                    <div className="flex flex-col gap-2">
                        <Textarea
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder={
                                pendingDecision === 'approve'
                                    ? isAr ? 'أدخل سبب الموافقة...' : 'Enter reason for approval...'
                                    : isAr ? 'أدخل سبب الرفض...' : 'Enter reason for rejection...'
                            }
                            rows={2}
                            className="text-sm"
                        />
                        <div className="flex gap-2">
                            <Button
                                onClick={handleSubmitDecision}
                                variant={pendingDecision === 'approve' ? 'primary' : 'danger'}
                                size="sm"
                                disabled={isSubmitting}
                                className={pendingDecision === 'approve' ? 'flex-1 bg-success hover:bg-success/90' : 'flex-1'}
                            >
                                {isSubmitting
                                    ? isAr ? 'جاري الإرسال...' : 'Submitting...'
                                    : isAr ? 'تأكيد' : 'Confirm'}
                            </Button>
                            <Button
                                onClick={handleCancel}
                                variant="outline"
                                size="sm"
                                disabled={isSubmitting}
                            >
                                {isAr ? 'إلغاء' : 'Cancel'}
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // Full version for ScriptWorkspace
    return (
        <div className="bg-surface-elevated rounded-lg border border-border p-6">
            <div className="flex items-center gap-3 mb-4">
                <AlertCircle className="w-6 h-6 text-warning" />
                <div>
                    <h3 className="text-lg font-semibold text-text-primary">
                        {isAr ? 'قرار المراجعة' : 'Review Decision'}
                    </h3>
                    <p className="text-sm text-text-muted">
                        {isAr ? `النص: ${scriptTitle}` : `Script: ${scriptTitle}`}
                    </p>
                </div>
            </div>

            {!showReasonInput ? (
                <div className="flex gap-3">
                    {canApprove && (
                        <Button
                            onClick={() => handleDecisionClick('approve')}
                            variant="primary"
                            className="flex-1 bg-success hover:bg-success/90"
                        >
                            <CheckCircle className="w-5 h-5 mr-2" />
                            {isAr ? 'الموافقة على النص' : 'Approve Script'}
                        </Button>
                    )}
                    {canReject && (
                        <Button
                            onClick={() => handleDecisionClick('reject')}
                            variant="danger"
                            className="flex-1"
                        >
                            <XCircle className="w-5 h-5 mr-2" />
                            {isAr ? 'رفض النص' : 'Reject Script'}
                        </Button>
                    )}
                </div>
            ) : (
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-text-primary mb-2">
                            {pendingDecision === 'approve'
                                ? isAr ? 'سبب الموافقة' : 'Reason for Approval'
                                : isAr ? 'سبب الرفض' : 'Reason for Rejection'}
                            <span className="text-error ml-1">*</span>
                        </label>
                        <Textarea
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder={
                                pendingDecision === 'approve'
                                    ? isAr
                                        ? 'مثال: النص يتوافق مع جميع معايير GCAM...'
                                        : 'e.g., Script complies with all GCAM standards...'
                                    : isAr
                                        ? 'مثال: النص يحتوي على محتوى عنيف غير مقبول...'
                                        : 'e.g., Script contains unacceptable violent content...'
                            }
                            rows={4}
                        />
                    </div>
                    <div className="flex gap-3">
                        <Button
                            onClick={handleSubmitDecision}
                            variant={pendingDecision === 'approve' ? 'primary' : 'danger'}
                            disabled={isSubmitting}
                            className={pendingDecision === 'approve' ? 'flex-1 bg-success hover:bg-success/90' : 'flex-1'}
                        >
                            {isSubmitting
                                ? isAr ? 'جاري الإرسال...' : 'Submitting...'
                                : pendingDecision === 'approve'
                                    ? isAr ? 'تأكيد الموافقة' : 'Confirm Approval'
                                    : isAr ? 'تأكيد الرفض' : 'Confirm Rejection'}
                        </Button>
                        <Button
                            onClick={handleCancel}
                            variant="outline"
                            disabled={isSubmitting}
                        >
                            {isAr ? 'إلغاء' : 'Cancel'}
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
