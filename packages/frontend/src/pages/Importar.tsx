import { useState } from 'react';
import * as XLSX from 'xlsx';
import { api } from '../lib/api';
import PageTour from '../components/PageTour';
import Button from '../components/ui/Button';
import Select from '../components/ui/Select';
import Badge from '../components/ui/Badge';
import { Upload, FileSpreadsheet, Check, AlertTriangle, Download, Zap } from 'lucide-react';

const TIPOS_IMPORT = [
  { value: 'maxirest_insumos', label: 'Maxirest — Insumos', desc: 'Importar insumos desde el archivo INSUMO.XLSX exportado por Maxirest. Las columnas se mapean automáticamente.' },
  { value: 'maxirest_carta', label: 'Maxirest — Carta / Platos', desc: 'Importar la carta del restaurante (platos con precio de venta) desde el export de Maxirest. Crea recetas vacías para que el chef complete los ingredientes después.' },
  { value: 'productos', label: 'Productos (CSV)', desc: 'Importar maestro de productos con código, nombre, rubro, unidad y stock mínimo.' },
  { value: 'recetas', label: 'Recetas (CSV)', desc: 'Importar lista de platos/recetas con nombre, precio y categoría. Útil si exportás la carta de otro sistema.' },
  { value: 'proveedores', label: 'Proveedores (CSV)', desc: 'Importar proveedores con razón social, CUIT, contacto y condiciones.' },
  { value: 'ventas', label: 'Ventas (Maxirest)', desc: 'Importar ventas exportadas desde Maxirest para descontar stock automáticamente.' },
];

// Normaliza las unidades de Maxirest al formato interno
function normalizarUnidad(u: string): string {
  const raw = (u || '').trim().toUpperCase();
  if (raw === 'KILO' || raw === 'KG' || raw === 'KILOGRA' || raw === 'KILOGRAMO') return 'kg';
  if (raw === 'LITRO' || raw === 'LT' || raw === 'LITROS' || raw === 'LTS') return 'lt';
  if (raw === 'UNI' || raw === 'UNIDA' || raw === 'UNIDAD' || raw === 'UNIDADES' || raw === 'UN') return 'unidad';
  if (raw === 'CAJA' || raw === 'CAJAS') return 'caja';
  if (raw === 'BALDE' || raw === 'BALDES') return 'unidad';
  if (raw === 'GRAMO' || raw === 'GR' || raw === 'GRS') return 'gr';
  if (raw === 'CC' || raw === 'ML') return 'ml';
  return raw.toLowerCase() || 'unidad';
}

// Normaliza un rubro a partir del COD_RUI de Maxirest
function rubroDesdeCategoria(codRui: number | string): string {
  const cod = Number(codRui);
  const mapa: Record<number, string> = {
    1: 'Carnes',
    2: 'Verduras',
    3: 'Lácteos',
    4: 'Bebidas',
    5: 'Almacén',
    6: 'Panificados',
    7: 'Limpieza',
    8: 'Descartables',
    9: 'Condimentos',
  };
  return mapa[cod] || 'General';
}

// Procesa el XLSX de Maxirest INSUMO.XLSX y retorna filas normalizadas listas para importar
function procesarMaxirestInsumos(rows: any[][]): { headers: string[]; rows: string[][] } {
  // Buscar la fila de encabezados (primera fila con COD_RUI o CODIGO)
  let headerIdx = 0;
  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    const r = rows[i].map(c => String(c || '').toUpperCase().trim());
    if (r.includes('COD_RUI') || r.includes('CODIGO') || r.includes('NOMBRE')) {
      headerIdx = i;
      break;
    }
  }

  const rawHeaders = rows[headerIdx].map(c => String(c || '').toUpperCase().trim());
  const colCodRui = rawHeaders.indexOf('COD_RUI');
  const colCodigo = rawHeaders.indexOf('CODIGO');
  const colNombre = rawHeaders.indexOf('NOMBRE');
  const colUnidad = rawHeaders.indexOf('UNIDAD_MED');
  const colPrecio = rawHeaders.indexOf('PRECIO');

  const outHeaders = ['codigo', 'nombre', 'rubro', 'tipo', 'unidad_compra', 'unidad_uso', 'precio'];
  const outRows: string[][] = [];

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const nombre = String(row[colNombre] || '').trim();
    if (!nombre) continue; // skip blank rows

    const precio = parseFloat(String(row[colPrecio] || '0').replace(',', '.')) || 0;
    if (precio < 0) continue; // skip descuentos/negativos

    const maxCodigo = String(row[colCodigo] || '').trim();
    const codigo = maxCodigo ? `MAX-${maxCodigo}` : '';
    const rubro = rubroDesdeCategoria(row[colCodRui]);
    const unidad = normalizarUnidad(String(row[colUnidad] || ''));

    outRows.push([
      codigo,
      nombre,
      rubro,
      'insumo',
      unidad,
      unidad,
      precio > 0 ? String(precio) : '',
    ]);
  }

  return { headers: outHeaders, rows: outRows };
}

// Procesa el XLSX de Maxirest exportado de la carta/platos. Maxirest exporta
// con encabezados típicos: COD_PLA, NOMBRE_PLATO, PRECIO, CATEGORIA, SECTOR.
// Tomamos los más comunes; si el cliente tiene otro layout, el flujo de
// CSV genérico permite mapear manualmente.
function procesarMaxirestCarta(rows: any[][]): { headers: string[]; rows: string[][] } {
  let headerIdx = 0;
  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    const r = rows[i].map(c => String(c || '').toUpperCase().trim());
    const matches = r.filter(c =>
      c === 'COD_PLA' || c === 'CODIGO' || c === 'COD_PLATO' ||
      c === 'NOMBRE' || c === 'NOMBRE_PLATO' || c === 'DESCRIPCION' ||
      c === 'PRECIO' || c === 'PRECIO_V' || c === 'PRECIO_VENTA'
    ).length;
    if (matches >= 2) { headerIdx = i; break; }
  }

  const rawHeaders = rows[headerIdx].map(c => String(c || '').toUpperCase().trim());
  const findCol = (...keys: string[]) => {
    for (const k of keys) {
      const i = rawHeaders.indexOf(k);
      if (i >= 0) return i;
    }
    return -1;
  };
  const colCodigo   = findCol('COD_PLA', 'CODIGO', 'COD_PLATO', 'COD');
  const colNombre   = findCol('NOMBRE_PLATO', 'NOMBRE', 'DESCRIPCION', 'PLATO');
  const colPrecio   = findCol('PRECIO_V', 'PRECIO_VENTA', 'PRECIO', 'PRE_VTA');
  const colCategoria = findCol('CATEGORIA', 'TIPO', 'CAT');
  const colSector   = findCol('SECTOR', 'AREA', 'COD_SEC');

  const outHeaders = ['codigo', 'nombre', 'categoria', 'sector', 'precioVenta', 'porciones'];
  const outRows: string[][] = [];

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const nombre = colNombre >= 0 ? String(row[colNombre] || '').trim() : '';
    if (!nombre) continue;

    const maxCodigo = colCodigo >= 0 ? String(row[colCodigo] || '').trim() : '';
    const codigo = maxCodigo ? `MAX-${maxCodigo}` : '';
    const precio = colPrecio >= 0 ? parseFloat(String(row[colPrecio] || '0').replace(',', '.')) || 0 : 0;
    const categoria = colCategoria >= 0 ? String(row[colCategoria] || '').trim() : '';
    const sector = colSector >= 0 ? String(row[colSector] || '').trim() : '';

    outRows.push([
      codigo,
      nombre,
      categoria,
      sector,
      precio > 0 ? String(precio) : '',
      '1',
    ]);
  }

  return { headers: outHeaders, rows: outRows };
}

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
  if (lines.length === 0) return { headers: [], rows: [] };

  const firstLine = lines[0];
  const tabCount = (firstLine.match(/\t/g) || []).length;
  const semicolonCount = (firstLine.match(/;/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;

  let delimiter = ',';
  if (tabCount > commaCount && tabCount > semicolonCount) delimiter = '\t';
  else if (semicolonCount > commaCount) delimiter = ';';

  const parseLine = (line: string): string[] => {
    const fields: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (inQuotes) {
        if (char === '"') {
          if (i + 1 < line.length && line[i + 1] === '"') { current += '"'; i++; }
          else inQuotes = false;
        } else {
          current += char;
        }
      } else {
        if (char === '"') inQuotes = true;
        else if (char === delimiter) { fields.push(current.trim()); current = ''; }
        else current += char;
      }
    }
    fields.push(current.trim());
    return fields;
  };

  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).map(parseLine);
  return { headers, rows };
}

function parseXLSX(buffer: ArrayBuffer): { headers: string[]; rows: string[][] } {
  const wb = XLSX.read(buffer, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  if (data.length === 0) return { headers: [], rows: [] };
  const headers = data[0].map((c: any) => String(c || '').trim());
  const rows = data.slice(1).map((r: any[]) => r.map((c: any) => String(c ?? '').trim()));
  return { headers, rows };
}

export default function Importar() {
  const [step, setStep] = useState(1);
  const [tipo, setTipo] = useState('');
  const [plantilla, setPlantilla] = useState<{ columnas: string[]; ejemplo: Record<string, string> } | null>(null);
  const [fileName, setFileName] = useState('');
  const [parsedHeaders, setParsedHeaders] = useState<string[]>([]);
  const [parsedRows, setParsedRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [isMaxirest, setIsMaxirest] = useState(false);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<{ insertados: number; actualizados: number; errores: string[] } | null>(null);
  const [error, setError] = useState('');

  const tipoInfo = TIPOS_IMPORT.find(t => t.value === tipo);

  const seleccionarTipo = async (value: string) => {
    setTipo(value);
    setError('');
    setIsMaxirest(value === 'maxirest_insumos' || value === 'maxirest_carta');
    if (!value) { setPlantilla(null); return; }

    if (value === 'maxirest_insumos') {
      setPlantilla({
        columnas: ['codigo', 'nombre', 'rubro', 'tipo', 'unidad_compra', 'unidad_uso', 'precio'],
        ejemplo: { codigo: 'MAX-175', nombre: 'Papa negra', rubro: 'Verduras', tipo: 'insumo', unidad_compra: 'kg', unidad_uso: 'kg', precio: '1250' },
      });
      return;
    }

    if (value === 'maxirest_carta') {
      setPlantilla({
        columnas: ['codigo', 'nombre', 'categoria', 'sector', 'precioVenta', 'porciones'],
        ejemplo: { codigo: 'MAX-101', nombre: 'Milanesa con papas', categoria: 'plato', sector: 'cocina', precioVenta: '8500', porciones: '1' },
      });
      return;
    }

    try {
      const data = await api.getPlantilla(value);
      setPlantilla(data);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const downloadTemplate = () => {
    if (!plantilla || !tipo) return;
    const header = plantilla.columnas.join(',');
    const row = plantilla.columnas.map(c => plantilla.ejemplo[c] || '').join(',');
    const blob = new Blob([header + '\n' + row], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `plantilla_${tipo}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError('');
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);

    const isXlsx = /\.(xlsx|xls)$/i.test(file.name);

    const reader = new FileReader();

    if (isXlsx) {
      reader.onload = (ev) => {
        try {
          const buffer = ev.target?.result as ArrayBuffer;

          if (isMaxirest) {
            // Parsear con sheet_to_json raw para mantener tipos y procesar Maxirest
            const wb = XLSX.read(buffer, { type: 'array' });
            const ws = wb.Sheets[wb.SheetNames[0]];
            const rawData: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
            const { headers, rows } = tipo === 'maxirest_carta'
              ? procesarMaxirestCarta(rawData)
              : procesarMaxirestInsumos(rawData);
            if (headers.length === 0 || rows.length === 0) {
              setError('No se encontraron datos válidos en el archivo. Revisá el formato del export de Maxirest.');
              return;
            }
            setParsedHeaders(headers);
            setParsedRows(rows);
            // Para Maxirest el mapeo es identidad (columnas ya tienen los nombres correctos)
            const autoMap: Record<string, string> = {};
            headers.forEach(h => { autoMap[h] = h; });
            setMapping(autoMap);
            setStep(2);
          } else {
            const { headers, rows } = parseXLSX(buffer);
            if (headers.length === 0) {
              setError('El archivo está vacío o no se pudo leer.');
              return;
            }
            setParsedHeaders(headers);
            setParsedRows(rows);
            if (plantilla) {
              const autoMap: Record<string, string> = {};
              headers.forEach(h => {
                const normalized = h.toLowerCase().trim();
                const match = plantilla.columnas.find(c => c.toLowerCase() === normalized);
                if (match) autoMap[h] = match;
              });
              setMapping(autoMap);
            }
            setStep(2);
          }
        } catch {
          setError('No se pudo leer el archivo XLSX.');
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      reader.onload = (ev) => {
        const text = ev.target?.result as string;
        const { headers, rows } = parseCSV(text);
        if (headers.length === 0) {
          setError('El archivo está vacío o no se pudo leer.');
          return;
        }
        setParsedHeaders(headers);
        setParsedRows(rows);
        if (plantilla) {
          const autoMap: Record<string, string> = {};
          headers.forEach(h => {
            const normalized = h.toLowerCase().trim();
            const match = plantilla.columnas.find(c => c.toLowerCase() === normalized);
            if (match) autoMap[h] = match;
          });
          setMapping(autoMap);
        }
        setStep(2);
      };
      reader.readAsText(file);
    }
  };

  const mappedColumnsCount = Object.values(mapping).filter(v => v).length;

  const ejecutarImport = async () => {
    setImporting(true);
    setError('');
    try {
      const mappedRows = parsedRows.map(row => {
        const obj: Record<string, string> = {};
        parsedHeaders.forEach((h, i) => {
          const target = mapping[h];
          if (target) obj[target] = row[i] || '';
        });
        return obj;
      });

      // Mapear el tipo del wizard al tipo que entiende el backend.
      // maxirest_insumos → productos (carga insumos)
      // maxirest_carta   → recetas  (carga platos del menú)
      const tipoBackend =
        tipo === 'maxirest_insumos' ? 'productos' :
        tipo === 'maxirest_carta' ? 'recetas' :
        tipo;
      const res = await api.importarCSV({ tipo: tipoBackend, datos: mappedRows, mapeo: mapping });
      setResults(res);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setImporting(false);
    }
  };

  const reset = () => {
    setStep(1);
    setTipo('');
    setPlantilla(null);
    setFileName('');
    setParsedHeaders([]);
    setParsedRows([]);
    setMapping({});
    setIsMaxirest(false);
    setResults(null);
    setError('');
  };

  return (
    <div>
      <PageTour pageKey="importar" />
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <p className="text-[10px] font-bold text-primary uppercase tracking-[0.15em]">Integracion</p>
          <h1 className="text-xl font-extrabold text-foreground mt-1">Importar Datos</h1>
        </div>
        {step > 1 && !results && (
          <Button variant="ghost" onClick={reset}>
            Empezar de nuevo
          </Button>
        )}
      </div>

      {/* Steps indicator */}
      <div className="flex items-center gap-2 mb-6">
        {[1, 2, 3, 4].map(s => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold uppercase tracking-widest ${
              step > s ? 'bg-success/20 text-success' :
              step === s ? 'bg-primary text-primary-foreground' :
              'bg-surface-high text-on-surface-variant'
            }`}>
              {step > s ? <Check size={14} /> : s}
            </div>
            {s < 4 && <div className={`w-8 h-0.5 ${step > s ? 'bg-success/40' : 'bg-border'}`} />}
          </div>
        ))}
      </div>

      {/* Step 1: Select type */}
      {step === 1 && (
        <div className="glass rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <FileSpreadsheet size={18} className="text-primary" />
            <h2 className="text-sm font-extrabold text-foreground uppercase tracking-widest">Tipo de importacion</h2>
          </div>

          <Select
            id="tipo"
            value={tipo}
            onChange={e => seleccionarTipo(e.target.value)}
            options={TIPOS_IMPORT.map(t => ({ value: t.value, label: t.label }))}
            placeholder="Seleccionar tipo de datos..."
          />

          {tipoInfo && (
            <p className="text-sm text-on-surface-variant">{tipoInfo.desc}</p>
          )}

          {isMaxirest && (
            <div className="flex items-center gap-2 bg-primary/10 border border-primary/30 rounded-lg px-4 py-3">
              <Zap size={14} className="text-primary flex-shrink-0" />
              <p className="text-xs font-bold text-primary">
                Mapeo automatico activado — las columnas de Maxirest se normalizan al importar
              </p>
            </div>
          )}

          {plantilla && !isMaxirest && (
            <div className="space-y-3">
              <div className="bg-surface rounded-xl border border-border p-4">
                <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-2">
                  Columnas esperadas
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {plantilla.columnas.map(c => (
                    <Badge key={c} variant="primary">{c}</Badge>
                  ))}
                </div>
              </div>

              <Button variant="outline" onClick={downloadTemplate} size="sm">
                <Download size={14} /> Descargar plantilla
              </Button>
            </div>
          )}

          {error && <p className="text-sm text-destructive font-semibold">{error}</p>}

          {tipo && plantilla && (
            <div className="pt-2">
              <label className="glass rounded-xl p-5 border-2 border-dashed border-border hover:border-primary/50 transition-colors cursor-pointer flex flex-col items-center gap-3">
                <Upload size={28} className="text-on-surface-variant" />
                <span className="text-sm font-bold text-foreground">
                  {isMaxirest ? 'Seleccionar INSUMO.XLSX' : 'Seleccionar archivo'}
                </span>
                <span className="text-[10px] text-on-surface-variant uppercase tracking-widest">
                  {isMaxirest ? '.xlsx, .xls' : '.csv, .xlsx, .xls, .tsv, .txt'}
                </span>
                <input
                  type="file"
                  accept={isMaxirest ? '.xlsx,.xls' : '.csv,.xlsx,.xls,.tsv,.txt'}
                  onChange={handleFile}
                  className="hidden"
                />
              </label>
            </div>
          )}
        </div>
      )}

      {/* Step 2: Preview parsed data */}
      {step === 2 && (
        <div className="glass rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <FileSpreadsheet size={18} className="text-primary" />
            <h2 className="text-sm font-extrabold text-foreground uppercase tracking-widest">Vista previa</h2>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <Badge variant="info">{fileName}</Badge>
            <span className="text-sm text-on-surface-variant">
              {parsedRows.length} filas &middot; {parsedHeaders.length} columnas
            </span>
            {isMaxirest && (
              <Badge variant="success">Normalizado Maxirest</Badge>
            )}
          </div>

          <div className="bg-surface rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    {parsedHeaders.map((h, i) => (
                      <th key={i} className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {parsedRows.slice(0, 5).map((row, ri) => (
                    <tr key={ri} className="hover:bg-surface-high/50 transition-colors">
                      {parsedHeaders.map((_, ci) => (
                        <td key={ci} className="p-3 text-foreground whitespace-nowrap max-w-[200px] truncate">
                          {row[ci] || ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {parsedRows.length > 5 && (
            <p className="text-[10px] text-on-surface-variant uppercase tracking-widest">
              Mostrando 5 de {parsedRows.length} filas
            </p>
          )}

          {error && <p className="text-sm text-destructive font-semibold">{error}</p>}

          <div className="flex gap-2 pt-2">
            <Button onClick={() => isMaxirest ? setStep(4) : setStep(3)}>
              {isMaxirest ? 'Confirmar importacion' : 'Continuar al mapeo'}
            </Button>
            <Button variant="secondary" onClick={() => { setStep(1); setFileName(''); setParsedHeaders([]); setParsedRows([]); }}>
              Cambiar archivo
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Column mapping (solo para CSV) */}
      {step === 3 && (
        <div className="glass rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <FileSpreadsheet size={18} className="text-primary" />
            <h2 className="text-sm font-extrabold text-foreground uppercase tracking-widest">Mapeo de columnas</h2>
          </div>

          <p className="text-sm text-on-surface-variant">
            Asocia cada columna del archivo con un campo del sistema.
          </p>

          <div className="space-y-3">
            {parsedHeaders.map(h => (
              <div key={h} className="flex items-center gap-3">
                <div className="flex-1 bg-surface rounded-lg border border-border px-4 py-3">
                  <span className="text-sm font-bold text-foreground">{h}</span>
                </div>
                <span className="text-on-surface-variant text-sm">&rarr;</span>
                <div className="flex-1">
                  <Select
                    id={`map-${h}`}
                    value={mapping[h] || ''}
                    onChange={e => setMapping(prev => ({ ...prev, [h]: e.target.value }))}
                    options={(plantilla?.columnas || []).map(c => ({ value: c, label: c }))}
                    placeholder="No importar"
                  />
                </div>
                {mapping[h] && (
                  <Check size={16} className="text-success flex-shrink-0" />
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Badge variant={mappedColumnsCount > 0 ? 'success' : 'warning'}>
              {mappedColumnsCount} / {plantilla?.columnas.length || 0}
            </Badge>
            <span className="text-sm text-on-surface-variant">columnas mapeadas</span>
          </div>

          {error && <p className="text-sm text-destructive font-semibold">{error}</p>}

          <div className="flex gap-2 pt-2">
            <Button onClick={() => setStep(4)} disabled={mappedColumnsCount === 0}>
              Vista previa final
            </Button>
            <Button variant="secondary" onClick={() => setStep(2)}>
              Volver
            </Button>
          </div>
        </div>
      )}

      {/* Step 4: Confirm and import */}
      {step === 4 && !results && (
        <div className="glass rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Upload size={18} className="text-primary" />
            <h2 className="text-sm font-extrabold text-foreground uppercase tracking-widest">Confirmar importacion</h2>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="bg-surface rounded-xl border border-border p-4 text-center">
              <p className="text-2xl font-extrabold text-foreground">{parsedRows.length}</p>
              <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mt-1">Filas a importar</p>
            </div>
            <div className="bg-surface rounded-xl border border-border p-4 text-center">
              <p className="text-2xl font-extrabold text-primary">{mappedColumnsCount}</p>
              <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mt-1">Columnas mapeadas</p>
            </div>
            <div className="bg-surface rounded-xl border border-border p-4 text-center">
              <p className="text-lg font-extrabold text-foreground capitalize">{isMaxirest ? 'Maxirest' : tipo}</p>
              <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mt-1">Origen</p>
            </div>
          </div>

          {isMaxirest && (
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
              <p className="text-[10px] font-bold text-primary uppercase tracking-widest mb-2">Transformaciones aplicadas</p>
              <ul className="space-y-1 text-sm text-on-surface-variant">
                <li>• Unidades normalizadas (KILO→kg, LITRO→lt, UNI→unidad…)</li>
                <li>• Códigos generados (ej: MAX-175)</li>
                <li>• Filas vacías y precios negativos eliminados</li>
                <li>• Espacios en blanco removidos de nombres</li>
              </ul>
            </div>
          )}

          {!isMaxirest && (
            <div className="bg-surface rounded-xl border border-border p-4">
              <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-2">
                Mapeo configurado
              </p>
              <div className="space-y-1">
                {Object.entries(mapping).filter(([, v]) => v).map(([from, to]) => (
                  <div key={from} className="flex items-center gap-2 text-sm">
                    <span className="text-on-surface-variant">{from}</span>
                    <span className="text-on-surface-variant">&rarr;</span>
                    <span className="font-bold text-foreground">{to}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && <p className="text-sm text-destructive font-semibold">{error}</p>}

          <div className="flex gap-2 pt-2">
            <Button onClick={ejecutarImport} disabled={importing}>
              <Upload size={14} /> {importing ? 'Importando...' : 'Importar'}
            </Button>
            <Button variant="secondary" onClick={() => setStep(isMaxirest ? 2 : 3)}>
              Volver
            </Button>
          </div>
        </div>
      )}

      {/* Results */}
      {results && (
        <div className="glass rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Check size={18} className="text-success" />
            <h2 className="text-sm font-extrabold text-foreground uppercase tracking-widest">Importacion completada</h2>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="bg-surface rounded-xl border border-border p-4 text-center">
              <p className="text-2xl font-extrabold text-success">{results.insertados}</p>
              <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mt-1">Insertados</p>
            </div>
            <div className="bg-surface rounded-xl border border-border p-4 text-center">
              <p className="text-2xl font-extrabold text-primary">{results.actualizados}</p>
              <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mt-1">Actualizados</p>
            </div>
            <div className="bg-surface rounded-xl border border-border p-4 text-center">
              <p className="text-2xl font-extrabold text-destructive">{results.errores.length}</p>
              <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mt-1">Errores</p>
            </div>
          </div>

          {results.errores.length > 0 && (
            <div className="bg-surface rounded-xl border border-border p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle size={14} className="text-warning" />
                <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">
                  Detalle de errores
                </p>
              </div>
              <div className="max-h-48 overflow-y-auto space-y-1">
                {results.errores.map((err, i) => (
                  <p key={i} className="text-sm text-destructive font-medium">{err}</p>
                ))}
              </div>
            </div>
          )}

          <Button onClick={reset}>
            Nueva importacion
          </Button>
        </div>
      )}
    </div>
  );
}
