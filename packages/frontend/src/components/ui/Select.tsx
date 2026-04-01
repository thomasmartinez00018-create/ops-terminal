import { cn } from '../../lib/utils';
import type { SelectHTMLAttributes } from 'react';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
}

export default function Select({
  label, error, options, placeholder, className, id, ...props
}: SelectProps) {
  return (
    <div className="space-y-2">
      {label && (
        <label htmlFor={id} className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-widest ml-1">
          {label}
        </label>
      )}
      <select
        id={id}
        className={cn(
          'w-full bg-surface-high border-0 text-foreground font-bold py-3.5 px-4 rounded-lg',
          'focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm',
          error && 'ring-2 ring-destructive/50',
          className
        )}
        {...props}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      {error && <p className="text-[10px] text-destructive font-medium ml-1">{error}</p>}
    </div>
  );
}
