import { Loader2, AlertCircle } from 'lucide-react';
import { Button } from './Button';

export function LoadingState({ message = 'Loading...' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-text-muted">
      <Loader2 className="w-8 h-8 animate-spin mb-4 text-primary" />
      <p className="text-sm font-medium">{message}</p>
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center max-w-sm mx-auto">
      <div className="w-16 h-16 bg-error/10 text-error rounded-2xl flex items-center justify-center mb-4">
        <AlertCircle className="w-8 h-8" />
      </div>
      <h3 className="text-lg font-bold text-text-main mb-2">Something went wrong</h3>
      <p className="text-sm text-text-muted mb-6">{error}</p>
      {onRetry && <Button onClick={onRetry}>Try Again</Button>}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action }: { icon: any, title: string, description: string, action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center border-2 border-dashed border-border rounded-2xl bg-surface/50">
      <div className="w-16 h-16 bg-surface border border-border rounded-2xl flex items-center justify-center mb-4 shadow-sm text-text-muted">
        <Icon className="w-8 h-8" />
      </div>
      <h3 className="text-lg font-bold text-text-main mb-2">{title}</h3>
      <p className="text-sm text-text-muted max-w-sm mb-6">{description}</p>
      {action}
    </div>
  );
}
