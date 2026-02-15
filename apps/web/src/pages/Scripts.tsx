import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLangStore } from '@/store/langStore';
import { useDataStore } from '@/store/dataStore';
import { useAuthStore } from '@/store/authStore';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import {
    FileText,
    Search,
    CheckCircle,
    XCircle,
    Clock,
    Filter,
    ArrowUpDown
} from 'lucide-react';
import { cn } from '@/utils/cn';

type StatusFilter = 'all' | 'approved' | 'rejected' | 'pending';

export function Scripts() {
    const { lang } = useLangStore();
    const navigate = useNavigate();
    const { user } = useAuthStore();
    const { scripts, companies, isLoading } = useDataStore();
    const [searchParams, setSearchParams] = useSearchParams();

    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>(
        (searchParams.get('status') as StatusFilter) || 'all'
    );
    const [sortBy, setSortBy] = useState<'date' | 'title' | 'client'>('date');

    // Update URL when filter changes
    useEffect(() => {
        if (statusFilter !== 'all') {
            setSearchParams({ status: statusFilter });
        } else {
            setSearchParams({});
        }
    }, [statusFilter, setSearchParams]);

    // Filter scripts by status
    const getFilteredScripts = () => {
        let filtered = scripts;

        // Status filter
        if (statusFilter === 'approved') {
            filtered = filtered.filter(s => s.status === 'approved');
        } else if (statusFilter === 'rejected') {
            filtered = filtered.filter(s => s.status === 'rejected');
        } else if (statusFilter === 'pending') {
            filtered = filtered.filter(s =>
                s.status === 'review_required' || s.status === 'in_review'
            );
        }

        // Search filter
        if (search.trim()) {
            filtered = filtered.filter(s =>
                s.title?.toLowerCase().includes(search.toLowerCase()) ||
                companies.find(c => c.id === s.clientId)?.nameEn?.toLowerCase().includes(search.toLowerCase()) ||
                companies.find(c => c.id === s.clientId)?.nameAr?.includes(search)
            );
        }

        // Sorting
        filtered = [...filtered].sort((a, b) => {
            if (sortBy === 'date') {
                return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
            } else if (sortBy === 'title') {
                return (a.title || '').localeCompare(b.title || '');
            } else if (sortBy === 'client') {
                const clientA = companies.find(c => c.id === a.clientId)?.nameEn || '';
                const clientB = companies.find(c => c.id === b.clientId)?.nameEn || '';
                return clientA.localeCompare(clientB);
            }
            return 0;
        });

        return filtered;
    };

    const filteredScripts = getFilteredScripts();

    // Count by status
    const counts = {
        all: scripts.length,
        approved: scripts.filter(s => s.status === 'approved').length,
        rejected: scripts.filter(s => s.status === 'rejected').length,
        pending: scripts.filter(s => s.status === 'review_required' || s.status === 'in_review').length
    };

    const tabs: Array<{ key: StatusFilter; label: string; icon: any; color: string }> = [
        { key: 'all', label: lang === 'ar' ? 'الكل' : 'All', icon: FileText, color: 'text-text-main' },
        { key: 'approved', label: lang === 'ar' ? 'مقبول' : 'Approved', icon: CheckCircle, color: 'text-success' },
        { key: 'rejected', label: lang === 'ar' ? 'مرفوض' : 'Rejected', icon: XCircle, color: 'text-error' },
        { key: 'pending', label: lang === 'ar' ? 'قيد المراجعة' : 'Pending', icon: Clock, color: 'text-warning' }
    ];

    const getStatusBadge = (status: string) => {
        if (status === 'approved') {
            return <Badge variant="outline" className="bg-success/10 text-success border-success/30">{lang === 'ar' ? 'مقبول' : 'Approved'}</Badge>;
        } else if (status === 'rejected') {
            return <Badge variant="outline" className="bg-error/10 text-error border-error/30">{lang === 'ar' ? 'مرفوض' : 'Rejected'}</Badge>;
        } else if (status === 'review_required' || status === 'in_review') {
            return <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30">{lang === 'ar' ? 'قيد المراجعة' : 'Pending'}</Badge>;
        } else if (status === 'draft') {
            return <Badge variant="outline">{lang === 'ar' ? 'مسودة' : 'Draft'}</Badge>;
        } else {
            return <Badge variant="outline">{status}</Badge>;
        }
    };

    if (isLoading) {
        return (
            <div className="space-y-6">
                <div className="h-8 w-48 bg-surface-hover rounded animate-pulse" />
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {[1, 2, 3, 4, 5, 6].map(i => (
                        <div key={i} className="h-40 bg-surface-main rounded-lg animate-pulse" />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 pb-8">
            {/* Header */}
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-text-main">
                    {lang === 'ar' ? 'إدارة النصوص' : 'Scripts Management'}
                </h1>
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-border">
                {tabs.map(tab => {
                    const Icon = tab.icon;
                    const isActive = statusFilter === tab.key;
                    return (
                        <button
                            key={tab.key}
                            onClick={() => setStatusFilter(tab.key)}
                            className={cn(
                                "flex items-center gap-2 px-4 py-2 rounded-lg whitespace-nowrap transition-colors",
                                isActive
                                    ? "bg-primary text-white"
                                    : "bg-surface hover:bg-surface-hover text-text-muted"
                            )}
                        >
                            <Icon className="w-4 h-4" />
                            <span className="font-medium">{tab.label}</span>
                            <Badge variant="outline" className={cn("ml-1", isActive ? "bg-white/20 text-white border-white/30" : "")}>
                                {counts[tab.key]}
                            </Badge>
                        </button>
                    );
                })}
            </div>

            {/* Search and Sort */}
            <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                    <Input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder={lang === 'ar' ? 'بحث عن نص أو عميل...' : 'Search scripts or clients...'}
                        className="pl-10"
                    />
                </div>
                <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-text-muted" />
                    <select
                        value={sortBy}
                        onChange={e => setSortBy(e.target.value as any)}
                        className="px-4 py-2 rounded-lg bg-surface border border-border text-text-main focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                        <option value="date">{lang === 'ar' ? 'الأحدث' : 'Newest'}</option>
                        <option value="title">{lang === 'ar' ? 'العنوان' : 'Title'}</option>
                        <option value="client">{lang === 'ar' ? 'العميل' : 'Client'}</option>
                    </select>
                </div>
            </div>

            {/* Results Count */}
            <div className="text-sm text-text-muted">
                {lang === 'ar' ? `عرض ${filteredScripts.length} من ${counts[statusFilter]} نص` :
                    `Showing ${filteredScripts.length} of ${counts[statusFilter]} scripts`}
            </div>

            {/* Scripts Grid */}
            {filteredScripts.length === 0 ? (
                <Card>
                    <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                        <FileText className="w-12 h-12 text-text-muted mb-4" />
                        <h3 className="text-lg font-semibold text-text-main mb-2">
                            {lang === 'ar' ? 'لا توجد نصوص' : 'No Scripts Found'}
                        </h3>
                        <p className="text-text-muted max-w-md">
                            {statusFilter === 'all'
                                ? lang === 'ar' ? 'لم يتم العثور على نصوص مطابقة لبحثك' : 'No scripts match your search'
                                : lang === 'ar' ? `لا توجد نصوص ${tabs.find(t => t.key === statusFilter)?.label}` : `No ${tabs.find(t => t.key === statusFilter)?.label} scripts`}
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredScripts.map(script => {
                        const client = companies.find(c => c.id === script.clientId);
                        return (
                            <Card
                                key={script.id}
                                className="hover:shadow-lg transition-shadow cursor-pointer"
                                onClick={() => navigate(`/scripts/${script.id}/workspace`)}
                            >
                                <CardContent className="p-6 space-y-4">
                                    {/* Header */}
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex-1 min-w-0">
                                            <h3 className="font-semibold text-text-main truncate">
                                                {script.title || (lang === 'ar' ? 'بدون عنوان' : 'Untitled')}
                                            </h3>
                                            <p className="text-sm text-text-muted truncate">
                                                {client ? (lang === 'ar' ? client.nameAr : client.nameEn) : '—'}
                                            </p>
                                        </div>
                                        {getStatusBadge(script.status || 'draft')}
                                    </div>

                                    {/* Metadata */}
                                    <div className="space-y-2 text-xs text-text-muted">
                                        <div className="flex items-center justify-between">
                                            <span>{lang === 'ar' ? 'تاريخ الإنشاء' : 'Created'}</span>
                                            <span>{new Date(script.createdAt || Date.now()).toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-GB')}</span>
                                        </div>
                                        {script.assigneeId && (
                                            <div className="flex items-center justify-between">
                                                <span>{lang === 'ar' ? 'المعين' : 'Assigned'}</span>
                                                <span>{lang === 'ar' ? 'تم التعيين' : 'Assigned'}</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Actions */}
                                    <div className="pt-2 border-t border-border">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="w-full"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                navigate(`/scripts/${script.id}/workspace`);
                                            }}
                                        >
                                            {lang === 'ar' ? 'فتح النص' : 'Open Script'}
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
