import type { ReactNode } from 'react';
import { Button } from '@/components/ui/Button';

interface AdminTableFiltersProps {
  children: ReactNode;
  onReset?: () => void;
  resetLabel?: string;
  className?: string;
}

export function AdminTableFilters({ children, onReset, resetLabel, className }: AdminTableFiltersProps) {
  return (
    <div
      className={[
        'dashboard-panel rounded-[calc(var(--radius)+0.55rem)] border border-border/70 p-4 shadow-[0_16px_40px_rgba(31,23,36,0.04)]',
        'space-y-3',
        className ?? '',
      ].join(' ').trim()}
    >
      <div className="grid gap-3">{children}</div>
      {onReset && (
        <div>
          <Button size="sm" variant="outline" onClick={onReset}>
            {resetLabel ?? 'Reset Filters'}
          </Button>
        </div>
      )}
    </div>
  );
}

