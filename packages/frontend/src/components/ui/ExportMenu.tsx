import { useState, useRef, useEffect } from 'react';
import { Download, FileText, FileSpreadsheet, File } from 'lucide-react';
import type { ExportConfig } from '../../lib/exportUtils';
import { exportData } from '../../lib/exportUtils';

interface ExportMenuProps {
  getConfig: () => ExportConfig;
  disabled?: boolean;
  size?: 'sm' | 'md';
}

const FORMATS = [
  { key: 'pdf' as const, label: 'PDF', desc: 'Con formato y branding', icon: FileText, color: 'text-red-400' },
  { key: 'xlsx' as const, label: 'Excel', desc: 'Hoja de calculo editable', icon: FileSpreadsheet, color: 'text-green-400' },
  { key: 'csv' as const, label: 'CSV', desc: 'Texto plano universal', icon: File, color: 'text-blue-400' },
];

export default function ExportMenu({ getConfig, disabled, size = 'md' }: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleExport = (format: 'csv' | 'xlsx' | 'pdf') => {
    setOpen(false);
    const config = getConfig();
    exportData(config, format);
  };

  const btnClass = size === 'sm'
    ? 'px-3 py-1.5 text-xs gap-1.5'
    : 'px-4 py-2.5 text-sm gap-2';

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        disabled={disabled}
        className={`inline-flex items-center font-bold rounded-lg border border-border bg-surface hover:bg-surface-high text-foreground transition-colors disabled:opacity-40 ${btnClass}`}
      >
        <Download size={size === 'sm' ? 14 : 16} />
        Exportar
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-56 bg-surface border border-border rounded-xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="px-3 py-2 border-b border-border">
            <p className="text-[9px] font-bold text-on-surface-variant uppercase tracking-[0.15em]">Formato de exportacion</p>
          </div>
          {FORMATS.map(f => (
            <button
              key={f.key}
              onClick={() => handleExport(f.key)}
              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-surface-high transition-colors text-left"
            >
              <f.icon size={16} className={f.color} />
              <div>
                <p className="text-sm font-bold text-foreground">{f.label}</p>
                <p className="text-[10px] text-on-surface-variant">{f.desc}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
