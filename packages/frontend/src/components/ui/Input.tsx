import { cn } from '../../lib/utils';
import type { InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export default function Input({ label, error, className, id, ...props }: InputProps) {
  return (
    <div className="space-y-2">
      {label && (
        <label htmlFor={id} className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-widest ml-1">
          {label}
        </label>
      )}
      <input
        id={id}
        className={cn(
          'w-full bg-surface-high border-0 text-foreground font-bold py-3.5 px-4 rounded-lg',
          'focus:outline-none focus:ring-2 focus:ring-primary/50',
          'placeholder:text-on-surface-variant/50 text-sm',
          error && 'ring-2 ring-destructive/50',
          className
        )}
        {...props}
      />
      {error && <p className="text-[10px] text-destructive font-medium ml-1">{error}</p>}
    </div>
  );
}
