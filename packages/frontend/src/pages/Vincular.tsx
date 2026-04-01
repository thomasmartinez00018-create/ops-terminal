import { useState } from 'react';
import { api } from '../lib/api';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import { Link2, Download, Upload, Check, AlertTriangle, RefreshCw, Zap } from 'lucide-react';

type SyncResult = {
  ok: boolean;
  source?: string;
  productosInsertados: number;
  productosActualizados: number;
  proveedoresInsertados: number;
  proveedoresActualizados: number;
  preciosUpserted: number;
  errores: string[];
};

export default function Vincular() {
  const [exportLoading, setExportLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState('');

  // ── Exportar ────────────────────────────────────────────────────────────────
  const handleExport = async () => {
    setExportLoading(true);
    setError('');
    try {
      const data = await api.syncExport();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const fecha = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `ops-terminal-sync-${fecha}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setExportLoading(false);
    }
  };

  // ── Importar desde archivo JSON ─────────────────────────────────────────────
  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError('');
    setImportResult(null);
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        if (!data.version || (!data.productos && !data.proveedores)) {
          setError('El archivo no es un paquete de sincronización válido.');
          return;
        }
        setImportLoading(true);
        const result = await api.syncImport(data);
        setImportResult(result);
      } catch (e: any) {
        setError('No se pudo leer el archivo: ' + e.message);
      } finally {
        setImportLoading(false);
      }
    };
    reader.readAsText(file);
    // Reset input so same file can be re-selected
    e.target.value = '';
  };

  return (
    <div>
      <div className="mb-6">
        <p className="text-[10px] font-bold text-primary uppercase tracking-[0.15em]">Integracion</p>
        <h1 className="text-xl font-extrabold text-foreground mt-1">Vincular Apps</h1>
        <p className="text-sm text-on-surface-variant mt-1">
          Sincronizá el catálogo de productos y proveedores con <span className="font-bold text-foreground">Gestión de Proveedores</span>.
        </p>
      </div>

      {/* Info banner */}
      <div className="glass rounded-xl p-4 mb-6 flex items-start gap-3">
        <Link2 size={18} className="text-primary flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-bold text-foreground mb-1">¿Cómo funciona la vinculación?</p>
          <ul className="text-xs text-on-surface-variant space-y-1">
            <li>• <span className="font-bold text-foreground">Exportar →</span> descargá un archivo <code className="text-primary">.json</code> con todo el catálogo de esta app</li>
            <li>• Abrí <span className="font-bold text-foreground">Gestión de Proveedores</span> → Vincular → importá ese archivo</li>
            <li>• Para el sentido inverso: exportá desde GP e importá el <code className="text-primary">.json</code> acá abajo</li>
            <li>• Los códigos de producto/proveedor se usan para identificar registros; los duplicados se actualizan</li>
          </ul>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Exportar */}
        <div className="glass rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Download size={16} className="text-primary" />
            <h2 className="text-sm font-extrabold text-foreground uppercase tracking-widest">Exportar</h2>
          </div>
          <p className="text-xs text-on-surface-variant mb-4">
            Descargá el catálogo de productos, proveedores y precios de esta app para importar en Gestión de Proveedores.
          </p>
          <Button onClick={handleExport} disabled={exportLoading} className="w-full">
            <Download size={14} />
            {exportLoading ? 'Exportando...' : 'Descargar sync.json'}
          </Button>
        </div>

        {/* Importar */}
        <div className="glass rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Upload size={16} className="text-primary" />
            <h2 className="text-sm font-extrabold text-foreground uppercase tracking-widest">Importar</h2>
          </div>
          <p className="text-xs text-on-surface-variant mb-4">
            Seleccioná un archivo <code className="text-primary">.json</code> exportado desde Gestión de Proveedores para sincronizar hacia acá.
          </p>
          <label className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition-all cursor-pointer
            ${importLoading ? 'opacity-50 pointer-events-none' : ''}
            bg-surface-high hover:bg-border text-foreground border border-border`}>
            <Upload size={14} />
            {importLoading ? 'Importando...' : 'Seleccionar archivo...'}
            <input type="file" accept=".json" onChange={handleImportFile} className="hidden" disabled={importLoading} />
          </label>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mt-4 flex items-center gap-2 bg-destructive/10 border border-destructive/30 rounded-lg px-4 py-3">
          <AlertTriangle size={14} className="text-destructive flex-shrink-0" />
          <p className="text-sm text-destructive font-semibold">{error}</p>
        </div>
      )}

      {/* Import result */}
      {importResult && (
        <div className="mt-4 glass rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Check size={16} className="text-success" />
            <h2 className="text-sm font-extrabold text-foreground uppercase tracking-widest">Sincronización completada</h2>
            {importResult.source && (
              <Badge variant="info">{importResult.source}</Badge>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="bg-surface rounded-xl border border-border p-3 text-center">
              <p className="text-xl font-extrabold text-success">{importResult.productosInsertados}</p>
              <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mt-1">Productos nuevos</p>
            </div>
            <div className="bg-surface rounded-xl border border-border p-3 text-center">
              <p className="text-xl font-extrabold text-primary">{importResult.productosActualizados}</p>
              <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mt-1">Productos actualizados</p>
            </div>
            <div className="bg-surface rounded-xl border border-border p-3 text-center">
              <p className="text-xl font-extrabold text-success">{importResult.proveedoresInsertados}</p>
              <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mt-1">Prov. nuevos</p>
            </div>
            <div className="bg-surface rounded-xl border border-border p-3 text-center">
              <p className="text-xl font-extrabold text-primary">{importResult.proveedoresActualizados}</p>
              <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mt-1">Prov. actualizados</p>
            </div>
            <div className="bg-surface rounded-xl border border-border p-3 text-center">
              <p className="text-xl font-extrabold text-foreground">{importResult.preciosUpserted}</p>
              <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mt-1">Precios sync</p>
            </div>
            {importResult.errores.length > 0 && (
              <div className="bg-surface rounded-xl border border-destructive/30 p-3 text-center">
                <p className="text-xl font-extrabold text-destructive">{importResult.errores.length}</p>
                <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mt-1">Errores</p>
              </div>
            )}
          </div>

          {importResult.errores.length > 0 && (
            <div className="bg-surface rounded-xl border border-border p-4 max-h-40 overflow-y-auto">
              <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-2">Detalle de errores</p>
              {importResult.errores.map((e, i) => (
                <p key={i} className="text-xs text-destructive">{e}</p>
              ))}
            </div>
          )}

          <Button variant="ghost" onClick={() => setImportResult(null)}>
            <RefreshCw size={14} /> Nueva sincronización
          </Button>
        </div>
      )}

      {/* Sync format info */}
      <div className="mt-6 glass rounded-xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <Zap size={16} className="text-primary" />
          <h2 className="text-sm font-extrabold text-foreground uppercase tracking-widest">Formato de sincronización</h2>
        </div>
        <p className="text-xs text-on-surface-variant mb-2">
          El archivo <code className="text-primary">.json</code> contiene tres secciones:
        </p>
        <div className="space-y-2">
          {[
            { label: 'productos', desc: 'Maestro de insumos: código, nombre, rubro, unidad' },
            { label: 'proveedores', desc: 'Directorio de proveedores: código, nombre, contacto, email' },
            { label: 'precios', desc: 'Mapeos producto-proveedor con último precio informado' },
          ].map(s => (
            <div key={s.label} className="flex items-start gap-3">
              <Badge variant="primary">{s.label}</Badge>
              <span className="text-xs text-on-surface-variant">{s.desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
