import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/utils';
import { ChevronDown, Search, X } from 'lucide-react';

// ============================================================================
// SearchableSelect
// ============================================================================
// Select con buscador integrado, custom dropdown. El dropdown se renderiza
// via createPortal() al <body> para ESCAPAR cualquier ancestro con
// `overflow: hidden | auto | scroll`, lo cual era un problema grave en dos
// escenarios reales:
//
//   1. MatchListaIAModal — el SearchableSelect vive dentro de una tabla
//      con `overflow-y-auto max-h-[50vh]`. Sin portal, el dropdown quedaba
//      clipeado por el scroll del contenedor padre: el usuario veía "un
//      listado sin buscador" porque el input de búsqueda (que está arriba
//      del dropdown) estaba literalmente fuera del viewport visible del
//      contenedor. Mismo efecto dentro de cualquier Modal / drawer / panel
//      con scroll interno.
//
//   2. Formularios dentro de DrawerModal fullscreen en mobile — ídem, el
//      drawer tiene scroll vertical propio que corta cualquier dropdown
//      hijo posicionado con absolute.
//
// La solución es portal-al-body + position:fixed anclada al viewport, con
// la posición calculada desde getBoundingClientRect() del trigger. Eso
// también requiere reposicionar en scroll/resize para que siga pegado al
// botón si el usuario scrollea la tabla mientras el dropdown está abierto.
// ============================================================================

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
  disabled?: boolean;
}

export default function SearchableSelect({
  label, options, value, onChange, placeholder = 'Seleccionar...', id, error, pinnedValues = [], disabled,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  // Posición calculada del dropdown (fixed al viewport, top/left/width).
  // null mientras está cerrado o antes del primer layout.
  const [pos, setPos] = useState<{ top: number; left: number; width: number; openUp: boolean } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
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

  // Calcula la posición del dropdown relativa al viewport a partir del
  // rect del trigger. Si no hay espacio suficiente debajo, abre hacia arriba.
  const computePosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const DROPDOWN_HEIGHT_ESTIMATE = 320; // max aprox del dropdown
    const GAP = 4;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const openUp = spaceBelow < DROPDOWN_HEIGHT_ESTIMATE && spaceAbove > spaceBelow;
    const top = openUp
      ? Math.max(8, rect.top - GAP)
      : rect.bottom + GAP;
    // Mantener el dropdown dentro del viewport horizontal con un margen chico.
    // Usamos el width del trigger como mínimo, pero permitimos hasta 420px.
    const width = Math.max(rect.width, 260);
    const maxLeft = window.innerWidth - width - 8;
    const left = Math.max(8, Math.min(rect.left, maxLeft));
    setPos({ top, left, width, openUp });
  }, []);

  // Recalcula posición en cada apertura + escucha scroll/resize mientras
  // está abierto para seguir el trigger si la página se mueve.
  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    computePosition();
    // Captura todos los scrolls (incluyendo los de ancestros con overflow),
    // por eso `true` en el tercer argumento = captura.
    const onScrollOrResize = () => computePosition();
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open, computePosition]);

  // Cerrar al hacer click afuera — incluyendo el dropdown portalizado.
  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      setOpen(false);
      setSearch('');
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open]);

  // Cerrar con ESC (UX estándar para selects/modales)
  useEffect(() => {
    if (!open) return;
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        setSearch('');
      }
    }
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [open]);

  // Focus en el input al abrir
  useEffect(() => {
    if (open) {
      // Pequeño delay para que el portal termine de mountar antes del focus.
      const t = setTimeout(() => inputRef.current?.focus(), 10);
      return () => clearTimeout(t);
    }
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

  // El dropdown se renderiza en un portal separado del árbol del componente.
  // Eso significa que NO es afectado por overflow, transform, z-index o
  // position relative de ancestros — siempre se ve completo y por encima.
  const dropdown = open && pos ? createPortal(
    <div
      ref={dropdownRef}
      className="fixed z-[100] bg-surface border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col"
      style={{
        top: pos.openUp ? undefined : pos.top,
        bottom: pos.openUp ? window.innerHeight - pos.top : undefined,
        left: pos.left,
        width: pos.width,
        maxHeight: 'min(380px, 60vh)',
        animation: 'fadeIn 0.1s ease-out',
      }}
      onMouseDown={(e) => {
        // Prevenir que el click en el dropdown dispare el handleOutside
        // (puede pasar en algunos browsers con focus/blur rápido).
        e.stopPropagation();
      }}
    >
      {/* Search input — SIEMPRE visible arriba del todo */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border shrink-0">
        <Search size={14} className="text-on-surface-variant shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar..."
          className="flex-1 bg-transparent text-sm text-foreground font-semibold placeholder:text-on-surface-variant/50 focus:outline-none"
          // Evitar que el foco del input cierre el dropdown por handleOutside
          onMouseDown={e => e.stopPropagation()}
        />
        {search && (
          <button
            type="button"
            onClick={() => { setSearch(''); inputRef.current?.focus(); }}
            className="text-on-surface-variant hover:text-foreground shrink-0"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* Options list */}
      <div className="overflow-y-auto flex-1">
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

      {/* Footer con contador */}
      {filtered.length > 0 && (
        <div className="px-3 py-1.5 border-t border-border shrink-0">
          <p className="text-[10px] text-on-surface-variant font-medium">
            {filtered.length} resultado{filtered.length !== 1 ? 's' : ''}
            {search && ` para "${search}"`}
          </p>
        </div>
      )}
    </div>,
    document.body,
  ) : null;

  return (
    <div className="relative space-y-2" ref={containerRef}>
      {label && (
        <label htmlFor={id} className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-widest ml-1">
          {label}
        </label>
      )}

      {/* Trigger */}
      <button
        ref={triggerRef}
        type="button"
        id={id}
        disabled={disabled}
        onClick={() => !disabled && setOpen(o => !o)}
        className={cn(
          'w-full bg-surface-high text-sm font-bold py-3.5 px-4 rounded-lg',
          'flex items-center justify-between gap-2',
          'focus:outline-none focus:ring-2 focus:ring-primary/50',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          error && 'ring-2 ring-destructive/50'
        )}
      >
        <span className={cn('truncate text-left', selected ? 'text-foreground' : 'text-on-surface-variant/50')}>
          {selected ? selected.label : placeholder}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {value && !disabled && (
            <span onClick={handleClear} className="p-0.5 rounded hover:bg-surface text-on-surface-variant hover:text-destructive cursor-pointer">
              <X size={12} />
            </span>
          )}
          <ChevronDown size={14} className={cn('text-on-surface-variant transition-transform', open && 'rotate-180')} />
        </div>
      </button>

      {dropdown}

      {error && <p className="text-[10px] text-destructive font-medium ml-1">{error}</p>}
    </div>
  );
}
