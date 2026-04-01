import { cn } from '../../lib/utils';
import type { ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'destructive' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg';
}

export default function Button({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-bold transition-all disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98]',
        {
          'bg-primary text-primary-foreground hover:brightness-110 shadow-[0_10px_20px_-10px_rgba(212,175,55,0.3)]': variant === 'primary',
          'bg-surface-high text-foreground hover:bg-[#333] border border-border': variant === 'secondary',
          'bg-destructive/10 text-destructive hover:bg-destructive hover:text-primary-foreground border border-destructive/20': variant === 'destructive',
          'hover:bg-surface-high text-on-surface-variant': variant === 'ghost',
          'border border-border text-foreground hover:bg-surface-high hover:border-primary/40': variant === 'outline',
        },
        {
          'px-3 py-1.5 text-[10px] uppercase tracking-widest': size === 'sm',
          'px-5 py-2.5 text-xs uppercase tracking-widest': size === 'md',
          'px-6 py-4 text-xs uppercase tracking-widest': size === 'lg',
        },
        className
      )}
      {...props}
    />
  );
}
