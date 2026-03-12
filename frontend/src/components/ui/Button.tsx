import { ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, children, disabled, ...props }, ref) => {
    const baseStyles = "inline-flex items-center justify-center font-medium rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50 disabled:cursor-not-allowed";
    
    const variants = {
      primary: "bg-gradient-to-br from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white shadow-lg shadow-blue-500/25 focus:ring-blue-500",
      secondary: "bg-surface hover:bg-surface/80 text-text border border-border focus:ring-surface",
      outline: "border-2 border-border hover:border-primary hover:text-primary text-text-muted bg-transparent focus:ring-primary",
      ghost: "hover:bg-surface/50 text-text-muted hover:text-text focus:ring-surface",
      danger: "bg-gradient-to-br from-red-500 to-pink-600 hover:from-red-600 hover:to-pink-700 text-white shadow-lg shadow-red-500/25 focus:ring-red-500",
      success: "bg-gradient-to-br from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-lg shadow-emerald-500/25 focus:ring-emerald-500",
    };

    const sizes = {
      sm: "h-9 px-4 text-sm",
      md: "h-11 px-6 text-sm",
      lg: "h-12 px-8 text-base",
    };

    return (
      <button
        ref={ref}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        disabled={disabled || loading}
        {...props}
      >
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";