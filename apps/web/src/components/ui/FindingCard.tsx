import { useLangStore } from '@/store/langStore';
import { Finding } from '@/store/dataStore';
import { useAuthStore } from '@/store/authStore';
import { useNavigate } from 'react-router-dom';
import { Badge } from './Badge';
import { Button } from './Button';
import { cn } from '@/utils/cn';
import { ShieldAlert, AlertTriangle, AlertCircle, Edit2, RotateCcw, MapPin, EyeOff, CheckCircle, ExternalLink } from 'lucide-react';

interface FindingCardProps {
  finding: Finding;
  onOverrideClick?: (finding: Finding) => void;
  onRestoreClick?: (finding: Finding) => void;
}

const severityConfig: Record<string, { icon: any, color: string, bg: string, strip: string }> = {
  Critical: { icon: ShieldAlert, color: 'text-error-700', bg: 'bg-error-50', strip: 'bg-error-700' },
  High: { icon: ShieldAlert, color: 'text-error', bg: 'bg-error-50', strip: 'bg-error' },
  Medium: { icon: AlertTriangle, color: 'text-warning-700', bg: 'bg-warning-50', strip: 'bg-warning' },
  Low: { icon: AlertCircle, color: 'text-info', bg: 'bg-info-50', strip: 'bg-info' },
};

export function FindingCard({ finding, onOverrideClick, onRestoreClick }: FindingCardProps) {
  const { lang, t } = useLangStore();
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const isAdminOrRegulator = user?.role === 'Super Admin' || user?.role === 'Regulator' || user?.role === 'Admin';
  
  // Visibility Logic: Owner/Reviewer should not see 'hidden_from_owner'
  if (!isAdminOrRegulator && finding.override?.eventType === 'hidden_from_owner') {
    return null;
  }

  const isOverriddenNotViolation = finding.override?.eventType === 'not_violation';
  const isHiddenFromOwner = finding.override?.eventType === 'hidden_from_owner';
  
  // Strip Color Logic
  let stripColor = severityConfig[finding.severity].strip;
  if (isOverriddenNotViolation) stripColor = 'bg-success';
  if (isHiddenFromOwner) stripColor = 'bg-text-muted';

  const SevIcon = severityConfig[finding.severity].icon;

  const getLocationString = () => {
    if (!finding.location) return t('unknownLocation');
    const parts = [];
    const page = finding.location.page;
    const scene = finding.location.scene;
    if (page != null && Number.isFinite(Number(page))) parts.push(`${t('page')} ${page}`);
    if (scene != null && Number.isFinite(Number(scene))) parts.push(`${t('scene')} ${scene}`);
    if (finding.location.lineChunk) parts.push(finding.location.lineChunk);
    return parts.length > 0 ? parts.join(' • ') : t('unknownLocation');
  };

  return (
    <div className={cn(
      "relative bg-surface rounded-xl shadow-sm border border-border overflow-hidden mb-4 print:break-inside-avoid print:shadow-none print:border-border/50",
      isHiddenFromOwner && "opacity-75 grayscale-[20%]"
    )}>
      {/* Left Strip */}
      <div className={cn("absolute top-0 bottom-0 w-1.5 start-0", stripColor)} />
      
      <div className="p-5 ps-6">
        {/* Header Row */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-xs font-bold px-1.5 py-0.5 rounded bg-background border border-border text-text-muted">
                {lang === 'ar' ? 'مادة' : 'Art'} {finding.articleId}{finding.subAtomId ? `.${finding.subAtomId}` : ''}
              </span>
              <h4 className="font-bold text-lg text-text-main">
                {lang === 'ar' ? finding.titleAr || 'ملاحظة' : finding.titleEn || 'Finding'}
              </h4>
            </div>
            
            <div className="flex flex-wrap items-center gap-2 mt-2">
              {/* Severity Badge */}
              <div className={cn(
                "flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-semibold border",
                severityConfig[finding.severity].bg,
                severityConfig[finding.severity].color,
                "border-current/20",
                isOverriddenNotViolation && "opacity-60"
              )}>
                <SevIcon className="w-3.5 h-3.5" />
                <span className={cn(isOverriddenNotViolation && "line-through")}>
                  {finding.severity}
                </span>
              </div>
              
              {/* Source Badge */}
              <Badge variant={finding.source === 'ai' ? 'default' : finding.source === 'lexicon_mandatory' ? 'error' : 'outline'} className="text-[10px]">
                {finding.source === 'ai' ? 'AI' : finding.source === 'lexicon_mandatory' ? (lang === 'ar' ? 'مخالفة قاموس' : 'Lexicon') : t('manualFinding')}
              </Badge>

              {/* Override Badges */}
              {isOverriddenNotViolation && (
                <Badge variant="success" className="text-xs flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" />
                  {t('overriddenOk')}
                </Badge>
              )}
              {isHiddenFromOwner && (
                <Badge variant="outline" className="text-xs flex items-center gap-1 text-text-muted">
                  <EyeOff className="w-3 h-3" />
                  {t('hiddenOwner')}
                </Badge>
              )}
            </div>
          </div>

          {/* Admin Controls (Hidden in Print) */}
          {isAdminOrRegulator && (
            <div className="flex gap-2 print:hidden">
              {!finding.override ? (
                <Button variant="outline" size="sm" onClick={() => onOverrideClick?.(finding)} className="h-8 text-xs">
                  <Edit2 className="w-3 h-3 me-1.5" />
                  {t('editStatus')}
                </Button>
              ) : (
                <>
                  <Button variant="ghost" size="sm" onClick={() => onRestoreClick?.(finding)} className="h-8 text-xs text-error hover:bg-error-50 hover:text-error-700">
                    <RotateCcw className="w-3 h-3 me-1.5" />
                    {t('restoreOriginal')}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => onOverrideClick?.(finding)} className="h-8 text-xs">
                    <Edit2 className="w-3 h-3 me-1.5" />
                    {t('updateOverride')}
                  </Button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Override Reason Block */}
        {finding.override && (
          <div className="mb-4 bg-background rounded-lg p-3 border border-border text-sm">
            <div className="flex justify-between items-start mb-1">
              <span className="font-semibold text-text-main">{t('overrideReason')}</span>
              <div className="text-xs text-text-muted flex gap-3">
                <span><span className="font-medium">{t('byUser')}</span> {finding.override.byUser}</span>
                <span>{new Date(finding.override.createdAt).toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-US')}</span>
              </div>
            </div>
            <p className="text-text-muted">{finding.override.reason}</p>
          </div>
        )}

        {/* Description */}
        <div className="mb-4">
          <span className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-1 block">
            {t('findingDescription')}
          </span>
          <p className="text-sm text-text-main leading-relaxed">
            {lang === 'ar' ? finding.descriptionAr : (finding.descriptionEn || finding.descriptionAr)}
          </p>
        </div>

        {/* Evidence & Location */}
        <div className="bg-background rounded-lg border border-border overflow-hidden">
          <div className="px-3 py-2 bg-surface/50 border-b border-border flex items-center justify-between text-xs text-text-muted">
            <div className="flex items-center gap-2">
              <MapPin className="w-3.5 h-3.5" />
              <span className="font-medium">{getLocationString()}</span>
            </div>
            <button 
              onClick={() => navigate(`/workspace/${finding.scriptId}#highlight-${finding.id}`)}
              className="flex items-center gap-1 hover:text-primary transition-colors font-medium print:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 rounded-md px-1"
              aria-label={lang === 'ar' ? 'الذهاب للموقع' : 'Jump to location'}
            >
              <ExternalLink className="w-3.5 h-3.5" />
              {lang === 'ar' ? 'الذهاب للموقع' : 'Jump to location'}
            </button>
          </div>
          <div className="p-4">
            <blockquote className="border-s-2 border-primary/50 ps-4 text-sm font-medium text-text-main italic leading-relaxed" dir="rtl">
              "{finding.evidenceSnippet || finding.excerpt}"
            </blockquote>
          </div>
        </div>
      </div>
    </div>
  );
}
