import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLangStore } from '@/store/langStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { CheckCircle, XCircle, ArrowRight, ArrowLeft } from 'lucide-react';
import { cn } from '@/utils/cn';

interface Decision {
    id: string;
    scriptId: string;
    scriptTitle: string;
    decision: 'approved' | 'rejected';
    reason: string;
    actorName?: string;
    timestamp: string;
    clientName?: string;
}

export function RecentDecisionsWidget() {
    const { lang } = useLangStore();
    const navigate = useNavigate();
    const [decisions, setDecisions] = useState<Decision[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchDecisions = async () => {
            try {
                setLoading(true);
                // For now, we'll use the script_status_history data
                // In production, this would call an API endpoint
                const { httpClient } = await import('@/api/httpClient');
                const data = await httpClient.get('/dashboard/recent-decisions') as Decision[];
                setDecisions(data.slice(0, 10)); // Limit to 10
            } catch (error) {
                console.error('Failed to fetch recent decisions:', error);
                setDecisions([]);
            } finally {
                setLoading(false);
            }
        };

        fetchDecisions();
    }, []);

    const formatTimestamp = (timestamp: string) => {
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 60) {
            return lang === 'ar' ? `منذ ${diffMins} دقيقة` : `${diffMins} mins ago`;
        } else if (diffHours < 24) {
            return lang === 'ar' ? `منذ ${diffHours} ساعة` : `${diffHours} hours ago`;
        } else if (diffDays < 7) {
            return lang === 'ar' ? `منذ ${diffDays} يوم` : `${diffDays} days ago`;
        } else {
            return date.toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-GB');
        }
    };

    const ArrowIcon = lang === 'ar' ? ArrowLeft : ArrowRight;

    if (loading) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>{lang === 'ar' ? 'القرارات الأخيرة' : 'Recent Decisions'}</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-3">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="h-16 bg-surface-hover rounded animate-pulse" />
                        ))}
                    </div>
                </CardContent>
            </Card>
        );
    }

    if (decisions.length === 0) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>{lang === 'ar' ? 'القرارات الأخيرة' : 'Recent Decisions'}</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="text-center py-8 text-text-muted text-sm">
                        {lang === 'ar' ? 'لا توجد قرارات حتى الآن' : 'No decisions yet'}
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between">
                    <span>{lang === 'ar' ? 'القرارات الأخيرة' : 'Recent Decisions'}</span>
                    <button
                        onClick={() => navigate('/scripts')}
                        className="text-xs text-primary hover:underline flex items-center gap-1"
                    >
                        {lang === 'ar' ? 'عرض الكل' : 'View All'}
                        <ArrowIcon className="w-3 h-3" />
                    </button>
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                {decisions.map((decision) => (
                    <div
                        key={decision.id}
                        onClick={() => navigate(`/scripts/${decision.scriptId}/workspace`)}
                        className={cn(
                            "p-3 rounded-lg border cursor-pointer transition-all hover:shadow-md",
                            decision.decision === 'approved'
                                ? "bg-success/5 border-success/20 hover:border-success/40"
                                : "bg-error/5 border-error/20 hover:border-error/40"
                        )}
                    >
                        <div className="flex items-start gap-3">
                            {decision.decision === 'approved' ? (
                                <CheckCircle className="w-5 h-5 text-success flex-shrink-0 mt-0.5" />
                            ) : (
                                <XCircle className="w-5 h-5 text-error flex-shrink-0 mt-0.5" />
                            )}
                            <div className="flex-1 min-w-0">
                                <h4 className="font-medium text-text-main text-sm truncate">
                                    {decision.scriptTitle || (lang === 'ar' ? 'بدون عنوان' : 'Untitled')}
                                </h4>
                                {decision.clientName && (
                                    <p className="text-xs text-text-muted truncate">{decision.clientName}</p>
                                )}
                                <div className="flex items-center gap-2 mt-1 text-xs text-text-muted">
                                    <span>
                                        {decision.decision === 'approved'
                                            ? lang === 'ar' ? 'تمت الموافقة' : 'Approved'
                                            : lang === 'ar' ? 'تم الرفض' : 'Rejected'}
                                    </span>
                                    {decision.actorName && (
                                        <>
                                            <span>•</span>
                                            <span className="truncate">{decision.actorName}</span>
                                        </>
                                    )}
                                </div>
                                <p className="text-xs text-text-muted mt-1">
                                    {formatTimestamp(decision.timestamp)}
                                </p>
                            </div>
                        </div>
                    </div>
                ))}
            </CardContent>
        </Card>
    );
}
