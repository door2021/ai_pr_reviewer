import { InputHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, icon, type = "text", ...props }, ref) => {
    return (
      <div className="space-y-2">
        {label && (
          <label className="text-sm font-medium text-text">
            {label}
          </label>
        )}
        <div className="relative">
          {icon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
              {icon}
            </div>
          )}
          <input
            type={type}
            className={cn(
              "w-full px-4 py-3 bg-background/50 border border-border rounded-lg",
              "text-text placeholder:text-text-muted/60",
              "focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary",
              "transition-all duration-200",
              icon && "pl-11",
              error && "border-danger focus:ring-danger/50 focus:border-danger",
              className
            )}
            ref={ref}
            {...props}
          />
        </div>
        {error && (
          <p className="text-sm text-danger">{error}</p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";