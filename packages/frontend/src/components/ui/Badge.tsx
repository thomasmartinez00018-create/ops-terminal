import { cn } from '../../lib/utils';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'primary';
}

export default function Badge({ children, variant = 'default' }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider',
        {
          'bg-surface-high text-on-surface-variant': variant === 'default',
          'bg-success/10 text-success': variant === 'success',
          'bg-warning/10 text-warning': variant === 'warning',
          'bg-destructive/10 text-destructive': variant === 'danger',
          'bg-blue-500/10 text-blue-400': variant === 'info',
          'bg-primary/10 text-primary': variant === 'primary',
        }
      )}
    >
      {children}
    </span>
  );
}
