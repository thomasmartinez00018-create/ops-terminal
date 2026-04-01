import { useState, useRef, useEffect } from 'react';
import { cn } from '../../lib/utils';
import { ChevronDown, Search, X } from 'lucide-react';

interface Option {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  label?: string;
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  id?: string;
  error?: string;
  pinnedValues?: string[]; // IDs que aparecen arriba como "Recientes"
}

export default function SearchableSelect({
  label, options, value, onChange, placeholder = 'Seleccionar...', id, error, pinnedValues = []
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find(o => o.value === value);

  const filtered = search.trim()
    ? options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))
    : options;

  // Recientes: solo cuando no hay búsqueda activa
  const pinned = !search.trim()
    ? pinnedValues
        .map(v => options.find(o => o.value === v))
        .filter(Boolean) as Option[]
    : [];

  // Cerrar al hacer click afuera
  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  // Focus en el input al abrir
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const handleSelect = (opt: Option) => {
    onChange(opt.value);
    setOpen(false);
    setSearch('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setSearch('');
  };

  return (
    <div className="space-y-2" ref={containerRef}>
      {label && (
        <label htmlFor={id} className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-widest ml-1">
          {label}
        </label>
      )}

      {/* Trigger */}
      <button
        type="button"
        id={id}
        onClick={() => setOpen(o => !o)}
        className={cn(
          'w-full bg-surface-high text-sm font-bold py-3.5 px-4 rounded-lg',
          'flex items-center justify-between gap-2',
          'focus:outline-none focus:ring-2 focus:ring-primary/50',
          error && 'ring-2 ring-destructive/50'
        )}
      >
        <span className={selected ? 'text-foreground' : 'text-on-surface-variant/50'}>
          {selected ? selected.label : placeholder}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {value && (
            <span onClick={handleClear} className="p-0.5 rounded hover:bg-surface text-on-surface-variant hover:text-destructive">
              <X size={12} />
            </span>
          )}
          <ChevronDown size={14} className={cn('text-on-surface-variant transition-transform', open && 'rotate-180')} />
        </div>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full max-w-sm bg-surface border border-border rounded-xl shadow-xl overflow-hidden"
          style={{ minWidth: containerRef.current?.offsetWidth }}>
          {/* Search input */}
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
            <Search size={14} className="text-on-surface-variant shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar..."
              className="flex-1 bg-transparent text-sm text-foreground font-semibold placeholder:text-on-surface-variant/50 focus:outline-none"
            />
            {search && (
              <button onClick={() => setSearch('')} className="text-on-surface-variant hover:text-foreground">
                <X size={12} />
              </button>
            )}
          </div>
          {/* Options list */}
          <div className="overflow-y-auto max-h-56">
            {/* Recientes */}
            {pinned.length > 0 && (
              <>
                <p className="px-4 pt-2 pb-1 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Recientes</p>
                {pinned.map(opt => (
                  <button
                    key={`pin-${opt.value}`}
                    type="button"
                    onClick={() => handleSelect(opt)}
                    className={cn(
                      'w-full text-left px-4 py-2 text-sm font-semibold hover:bg-surface-high transition-colors',
                      opt.value === value ? 'text-primary bg-primary/5' : 'text-foreground'
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
                <div className="mx-4 my-1 border-t border-border/50" />
                <p className="px-4 pt-1 pb-1 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Todos</p>
              </>
            )}
            {filtered.length === 0 ? (
              <p className="px-4 py-3 text-sm text-on-surface-variant font-medium">Sin resultados</p>
            ) : (
              filtered.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleSelect(opt)}
                  className={cn(
                    'w-full text-left px-4 py-2.5 text-sm font-semibold hover:bg-surface-high transition-colors',
                    opt.value === value ? 'text-primary bg-primary/5' : 'text-foreground'
                  )}
                >
                  {opt.label}
                </button>
              ))
            )}
          </div>
          {filtered.length > 0 && (
            <div className="px-3 py-1.5 border-t border-border">
              <p className="text-[10px] text-on-surface-variant font-medium">
                {filtered.length} resultado{filtered.length !== 1 ? 's' : ''}
                {search && ` para "${search}"`}
              </p>
            </div>
          )}
        </div>
      )}

      {error && <p className="text-[10px] text-destructive font-medium ml-1">{error}</p>}
    </div>
  );
}
