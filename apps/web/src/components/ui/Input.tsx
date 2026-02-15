import { forwardRef } from 'react';
import { cn } from '@/utils/cn';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, icon, ...props }, ref) => {
    return (
      <div className="space-y-1.5 w-full">
        {label && (
          <label className="block text-sm font-medium text-text-main">
            {label}
          </label>
        )}
        <div className="relative">
          {icon && (
            <div className="absolute inset-y-0 start-0 flex items-center ps-3 pointer-events-none text-text-muted">
              {icon}
            </div>
          )}
          <input
          ref={ref}
          className={cn(
            "flex h-10 w-full rounded-[var(--radius)] border border-border bg-surface px-3 py-2 text-sm text-text-main",
            "transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium",
            "placeholder:text-text-muted",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:border-primary",
            "disabled:cursor-not-allowed disabled:opacity-50",
            icon && "ps-10",
            error && "border-error focus-visible:border-error focus-visible:ring-error/20",
            className
          )}
          {...props}
        />
        </div>
        {error && (
          <p className="text-xs text-error">{error}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
