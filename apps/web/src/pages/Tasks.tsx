import { useNavigate } from 'react-router-dom';
import { useLangStore } from '@/store/langStore';
import { useSettingsStore } from '@/store/settingsStore';
import { formatDate } from '@/utils/dateFormat';
import { useDataStore } from '@/store/dataStore';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { ArrowRight, FileText, Calendar, CheckCircle2 } from 'lucide-react';
import type { AnalysisJob, Task } from '@/api/models';

export function Tasks() {
  const { lang } = useLangStore();
  const { settings } = useSettingsStore();
  const navigate = useNavigate();
  const { tasks, scripts } = useDataStore();

  /** Resolve script display name: assignment Task has scriptTitle; AnalysisJob has only scriptId — resolve from scripts list when possible. */
  const getScriptDisplayName = (task: AnalysisJob | Task): string => {
    if ('scriptTitle' in task && typeof (task as Task).scriptTitle === 'string' && (task as Task).scriptTitle.trim()) {
      return (task as Task).scriptTitle.trim();
    }
    const script = scripts.find((s) => s.id === task.scriptId);
    return script?.title?.trim() ?? task.scriptId;
  };

  return (
    <div className="space-y-6">
      <div className="dashboard-page-header p-5 md:p-6">
        <h1 className="text-2xl font-bold tracking-tight text-text-main">
          {lang === 'ar' ? 'مهام التحليل' : 'Analysis Tasks'}
        </h1>
        <p className="text-text-muted mt-1">
          {lang === 'ar' ? 'قائمة مهام التحليل الخاصة بك' : 'Your analysis jobs (queue and progress)'}
        </p>
      </div>

      {tasks.length === 0 ? (
        <Card className="dashboard-table-card border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 bg-surface border border-border rounded-2xl flex items-center justify-center mb-4 shadow-sm">
              <FileText className="w-8 h-8 text-text-muted" />
            </div>
            <h3 className="text-lg font-medium text-text-main mb-2">
              {lang === 'ar' ? 'لا توجد مهام تحليل' : 'No analysis tasks'}
            </h3>
            <p className="text-text-muted max-w-sm">
              {lang === 'ar' ? 'لم تبدأ أي تحليلات بعد.' : 'You have not started any analysis jobs yet.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="dashboard-table-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left rtl:text-right">
              <thead className="border-b border-border text-xs uppercase text-text-muted">
                <tr>
                  <th className="px-6 py-4 font-medium">{lang === 'ar' ? 'النص' : 'Script'}</th>
                  <th className="px-6 py-4 font-medium">{lang === 'ar' ? 'الإصدار' : 'Version'}</th>
                  <th className="px-6 py-4 font-medium">{lang === 'ar' ? 'الحالة' : 'Status'}</th>
                  <th className="px-6 py-4 font-medium">{lang === 'ar' ? 'التقدم' : 'Progress'}</th>
                  <th className="px-6 py-4 font-medium">{lang === 'ar' ? 'تاريخ الإنشاء' : 'Created'}</th>
                  <th className="px-6 py-4 font-medium text-end"></th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => (
                  <tr
                    key={task.id}
                    className="group cursor-pointer border-b border-border bg-transparent transition-colors"
                    onClick={() => navigate(`/workspace/${task.scriptId}`)}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <FileText className="w-5 h-5 text-primary/70 shrink-0" />
                        <span className="font-medium text-text-main group-hover:text-primary transition-colors" title={task.scriptId}>
                          {getScriptDisplayName(task)}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-text-muted text-xs">
                      {'versionId' in task ? task.versionId : <span className="text-muted-foreground/50 italic">{lang === 'ar' ? 'مسند يدوياً' : 'Manually Assigned'}</span>}
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant={
                        task.status === 'Ready' ? 'success' :
                          task.status === 'failed' ? 'error' :
                            task.status === 'completed' ? 'default' :
                              'warning'
                      }>
                        {task.status === 'Ready' && (
                          <CheckCircle2 className="w-3 h-3 me-1 inline" />
                        )}
                        {task.status}
                      </Badge>
                      {task.status === 'Ready' && (
                        <p className="text-xs text-success mt-1">
                          {lang === 'ar' ? 'المستند جاهز' : 'Document ready'}
                        </p>
                      )}
                    </td>
                    <td className="px-6 py-4 text-text-muted">
                      {'progressDone' in task ? (
                        `${task.progressDone}/${task.progressTotal} (${task.progressPercent}%)`
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-text-muted">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-text-muted" />
                        <span>{formatDate(new Date('createdAt' in task ? task.createdAt : (task as { assignedAt?: string }).assignedAt ?? ''), { lang, format: settings?.platform?.dateFormat })}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-end">
                      <span className="text-primary hover:underline text-sm font-medium flex items-center justify-end gap-1">
                        {lang === 'ar' ? 'فتح' : 'Open'}
                        <ArrowRight className="w-3 h-3 rtl:rotate-180" />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
