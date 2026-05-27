import { useState } from 'react';
import * as XLSX from 'xlsx';
import { api } from '../lib/api';
import PageTour from '../components/PageTour';
import Button from '../components/ui/Button';
import Select from '../components/ui/Select';
import Badge from '../components/ui/Badge';
import { Upload, FileSpreadsheet, Check, AlertTriangle, Download, Zap, Sparkles } from 'lucide-react';

const TIPOS_IMPORT = [
  { value: 'maxirest_recetas_pdf', label: 'Maxirest — Recetas (PDF) ★', desc: 'Subí el PDF "Recetas de artículos" que exporta Maxirest pro7.3 desde Listados. Detecta automáticamente artículos, ingredientes, cantidades, unidades y precios. Crea las recetas y da de alta los insumos que falten.' },
  { value: 'maxirest_recetas_full', label: 'Maxirest — Recetas con ingredientes (Excel)', desc: 'El export EXCEL de Maxirest: cada fila es un ingrediente de un plato (ARTICULO, INSUMO, CANTIDAD, UNIDAD, PUNIT…). Crea las recetas COMPLETAS con su escandallo y da de alta los insumos que falten.' },
  { value: 'maxirest_ventas_full', label: 'Maxirest — Ventas (resumen) ★', desc: 'El export real de ventas de Maxirest (CODIGO, NOMBRE, UNIDADES, VENTA). Descuenta stock por receta según lo vendido. No necesita fecha por línea — usa el período del reporte.' },
  { value: 'maxirest_insumos', label: 'Maxirest — Insumos', desc: 'Importar insumos desde el archivo INSUMO.XLSX exportado por Maxirest. Las columnas se mapean automáticamente.' },
  { value: 'maxirest_carta', label: 'Maxirest — Carta / Platos (sin ingredientes)', desc: 'Solo cabecera de platos (precio + categoría), sin escandallo. Usá "Recetas con ingredientes" si tu export trae los insumos.' },
  { value: 'maxirest_proveedores', label: 'Maxirest — Proveedores (catálogo)', desc: 'Sube el export de proveedores de Maxirest (CODIGO, NOMBRE, RAZON, CONTACTO, TELEFONO, CELULAR, CUIT…). Limpia padding de whitespace y mapea automático al schema.' },
  { value: 'productos', label: 'Productos (CSV)', desc: 'Importar maestro de productos con código, nombre, rubro, unidad y stock mínimo.' },
  { value: 'recetas', label: 'Recetas (CSV)', desc: 'Importar lista de platos/recetas con nombre, precio y categoría. Útil si exportás la carta de otro sistema.' },
  { value: 'proveedores', label: 'Proveedores (CSV)', desc: 'Importar proveedores con razón social, CUIT, contacto y condiciones.' },
  { value: 'ventas', label: 'Ventas (CSV simple)', desc: 'Ventas con recetaCodigo, cantidad, fecha, hora. Para Maxirest usá "Ventas (resumen)".' },
  { value: 'codigos_barras', label: 'Códigos de barras (multipack)', desc: 'Lista de packs por producto: cuando una bodega te manda el catálogo con "Caja x6 = código 7790…" cargás todo de un saque. Columnas: codigoProducto, codigo, factor, descripcion.' },
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

// Lista las sheets de un buffer xlsx/xls. Útil para que el usuario elija
// cuál importar cuando el archivo trae múltiples hojas (típico de exports
// que mezclan pivot tables + datos crudos).
function listSheets(buffer: ArrayBuffer): string[] {
  try {
    const wb = XLSX.read(buffer, { type: 'array' });
    return wb.SheetNames;
  } catch {
    return [];
  }
}

// Lee una sheet específica con detección robusta de header row:
// - Salta filas vacías o con basura ([image], null, headers tipo "Column1")
// - Encuentra la primera fila donde hay >=2 strings que parezcan nombres
//   de columna (no números, longitud razonable)
// - Si nada matchea bien, cae a fila 0 como fallback
function parseXLSX(
  buffer: ArrayBuffer,
  sheetName?: string,
): { headers: string[]; rows: string[][]; sheetUsed: string; sheets: string[] } {
  const wb = XLSX.read(buffer, { type: 'array' });
  const sheets = wb.SheetNames;
  const sheetUsed = sheetName && sheets.includes(sheetName) ? sheetName : sheets[0];
  const ws = wb.Sheets[sheetUsed];
  const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', blankrows: false });
  if (data.length === 0) return { headers: [], rows: [], sheetUsed, sheets };

  // Limpiar celdas: quitar [image] tokens, trim, normalizar a string
  const clean = (c: any): string => {
    if (c === null || c === undefined) return '';
    let s = String(c);
    // Tokens basura que mete pdf-to-excel cuando convierte imágenes
    s = s.replace(/\[image\]/gi, '').trim();
    return s.replace(/\s+/g, ' ');
  };

  const matrix: string[][] = data.map(r => r.map(clean));

  // Score de una fila como "headerness": cuenta cuántas celdas parecen nombres
  // (string corto, sin solo dígitos, no vacío)
  const scoreHeader = (row: string[]): number => {
    let s = 0;
    for (const c of row) {
      if (!c) continue;
      if (/^[\d.,\-$%]+$/.test(c)) continue;       // solo número/moneda → no es header
      if (c.length > 60) continue;                  // demasiado largo
      if (/^column\d+$/i.test(c)) { s += 0.3; continue; } // header genérico bajo peso
      s += 1;
    }
    return s;
  };

  // Buscar la mejor fila en las primeras 15 — empate gana la más alta (primera)
  let bestIdx = 0;
  let bestScore = scoreHeader(matrix[0]);
  for (let i = 1; i < Math.min(matrix.length, 15); i++) {
    const sc = scoreHeader(matrix[i]);
    if (sc > bestScore) { bestScore = sc; bestIdx = i; }
  }

  // Si la mejor fila tiene < 2 columnas válidas, fallback a fila 0
  if (bestScore < 2) bestIdx = 0;

  const rawHeaders = matrix[bestIdx];
  // Asegurar headers únicos: si vienen "Column1, Column2..." o vacíos, dejarlos
  const headers = rawHeaders.map((h, i) => h || `Col${i + 1}`);

  const rows = matrix.slice(bestIdx + 1)
    // Saltar filas totalmente vacías
    .filter(r => r.some(c => c && c.trim()));

  return { headers, rows, sheetUsed, sheets };
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
  const [iaCargando, setIaCargando] = useState(false);
  const [iaNotas, setIaNotas] = useState('');
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<{ insertados: number; actualizados: number; errores: string[] } | null>(null);
  const [error, setError] = useState('');
  // Multi-sheet: cuando el xlsx tiene varias hojas, ofrecemos un picker.
  // Guardamos el buffer original para re-parsear con sheet distinta sin
  // hacer al usuario re-cargar el archivo.
  const [sheetList, setSheetList] = useState<string[]>([]);
  const [sheetSelected, setSheetSelected] = useState<string>('');
  const [fileBuffer, setFileBuffer] = useState<ArrayBuffer | null>(null);
  // Resumen de recetas detectadas desde PDF (solo informativo en preview)
  const [pdfPreview, setPdfPreview] = useState<Array<{ codigo: string; nombre: string; ingredientes: number }> | null>(null);

  const tipoInfo = TIPOS_IMPORT.find(t => t.value === tipo);

  const seleccionarTipo = async (value: string) => {
    setTipo(value);
    setError('');
    // Para los tipos que NO requieren mapping manual saltamos el paso 3
    setIsMaxirest(
      value === 'maxirest_insumos' ||
      value === 'maxirest_carta' ||
      value === 'maxirest_recetas_pdf' ||
      value === 'maxirest_recetas_full' ||
      value === 'maxirest_ventas_full' ||
      value === 'maxirest_proveedores'
    );
    if (!value) { setPlantilla(null); return; }

    if (value === 'maxirest_recetas_pdf') {
      setPlantilla({
        columnas: ['Archivo PDF', 'Recetas de artículos', 'maxirest pro7.3'],
        ejemplo: { 'Archivo PDF': 'RECETASABRIL.PDF', 'Recetas de artículos': '40 platos', 'maxirest pro7.3': 'Jolugia SRL' },
      });
      return;
    }

    if (value === 'maxirest_proveedores') {
      setPlantilla({
        columnas: ['CODIGO', 'NOMBRE', 'RAZON', 'CONTACTO', 'TELEFONO', 'CELULAR', 'CUIT'],
        ejemplo: { CODIGO: '1377', NOMBRE: 'DANTA', RAZON: 'PAPELERA DANTA', CONTACTO: 'ANA', TELEFONO: '42235696', CELULAR: '1565613183', CUIT: '20-17739211-2' },
      });
      return;
    }

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

    // Formato real de Maxirest — el backend normaliza los nombres de columna
    // solo (función col()), así que el mapeo es identidad. Mostramos las
    // columnas esperadas para que el usuario confirme que su export las trae.
    if (value === 'maxirest_recetas_full') {
      setPlantilla({
        columnas: ['COD_ART', 'ARTICULO', 'PORCIONES', 'RUBROART', 'COD_INS', 'INSUMO', 'RUBROINS', 'CANTIDAD', 'UNIDAD_MET', 'PUNIT', 'MARG'],
        ejemplo: { COD_ART: '110', ARTICULO: 'SELECCION DE CARNES', PORCIONES: '1', RUBROART: 'ENTRADAS', COD_INS: '718', INSUMO: 'LANGOSTINO', RUBROINS: 'PESCADOS', CANTIDAD: '0,05', UNIDAD_MET: 'KILO', PUNIT: '13500', MARG: '88,46' },
      });
      return;
    }
    if (value === 'maxirest_ventas_full') {
      setPlantilla({
        columnas: ['CODIGO', 'NOMBRE', 'UNIDADES', 'PRECIO', 'VENTA'],
        ejemplo: { CODIGO: '36', NOMBRE: 'RED BULL', UNIDADES: '1', PRECIO: '0', VENTA: '9500' },
      });
      return;
    }

    if (value === 'codigos_barras') {
      setPlantilla({
        columnas: ['codigoProducto', 'codigo', 'factor', 'descripcion'],
        ejemplo: { codigoProducto: 'MAX-1382', codigo: '7790000000018', factor: '6', descripcion: 'Caja x6' },
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

  // ── Helpers de mapeo automático ──────────────────────────────────────────
  // Identidad: la columna existe igual en el archivo y en el destino.
  const armarMapeoIdentidad = (headers: string[]) => {
    const m: Record<string, string> = {};
    headers.forEach(h => { m[h] = h; });
    setMapping(m);
  };

  // Mapeo automático contra una plantilla (lowercase exact match)
  const armarMapeoPorPlantilla = (headers: string[], cols: string[]) => {
    const m: Record<string, string> = {};
    headers.forEach(h => {
      const norm = h.toLowerCase().trim();
      const hit = cols.find(c => c.toLowerCase() === norm);
      if (hit) m[h] = hit;
    });
    setMapping(m);
  };

  // Aplica el mapeo correcto al terminar de parsear, según el tipo elegido
  const aplicarMapeoSegunTipo = (headers: string[]) => {
    // Identidad: el backend matchea fuzzy las columnas (función col() server-side)
    if (tipo === 'maxirest_recetas_full' || tipo === 'maxirest_ventas_full' ||
        tipo === 'maxirest_recetas_pdf'   || tipo === 'maxirest_proveedores') {
      armarMapeoIdentidad(headers);
    } else if (plantilla) {
      armarMapeoPorPlantilla(headers, plantilla.columnas);
    }
  };

  // Re-parsear cuando el usuario cambia de sheet en el picker
  const cambiarSheet = (nuevoNombre: string) => {
    if (!fileBuffer) return;
    setSheetSelected(nuevoNombre);
    try {
      const { headers, rows, sheets } = parseXLSX(fileBuffer, nuevoNombre);
      setSheetList(sheets);
      if (headers.length === 0) {
        setError('Esa hoja está vacía o no se pudo leer.');
        return;
      }
      setParsedHeaders(headers);
      setParsedRows(rows);
      aplicarMapeoSegunTipo(headers);
      setError('');
    } catch {
      setError('No se pudo leer la hoja seleccionada.');
    }
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError('');
    setPdfPreview(null);
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);

    const ext = file.name.toLowerCase().split('.').pop() || '';
    const reader = new FileReader();

    // ── Caso PDF — sólo soportado por tipo Recetas-PDF ──────────────────
    if (ext === 'pdf') {
      if (tipo !== 'maxirest_recetas_pdf') {
        setError('Este tipo no acepta PDF. Elegí "Maxirest — Recetas (PDF)" o subí un Excel/CSV.');
        return;
      }
      (async () => {
        try {
          const r = await api.parsearRecetasPDF(file);
          if (!r.ok || r.ingredientesDetectados === 0) {
            setError(`No se detectaron recetas en el PDF. ¿Es un export de Maxirest "Recetas de artículos"?`);
            return;
          }
          // Convertir las filas planas a la matriz que ya espera el flow:
          // parsedHeaders = headers del backend, parsedRows = string[][] alineadas
          const headers = r.headers;
          const rows = r.datos.map(d => headers.map(h => String((d as any)[h] ?? '')));
          setParsedHeaders(headers);
          setParsedRows(rows);
          armarMapeoIdentidad(headers);
          setPdfPreview(r.preview);
          setSheetList([]);
          setSheetSelected('');
          setFileBuffer(null);
          setStep(2);
        } catch (err: any) {
          setError(err?.message || 'Error parseando PDF');
        }
      })();
      return;
    }

    // ── Caso XLSX / XLS ────────────────────────────────────────────────
    if (ext === 'xlsx' || ext === 'xls') {
      reader.onload = (ev) => {
        try {
          const buffer = ev.target?.result as ArrayBuffer;
          setFileBuffer(buffer);

          // Camino legacy: insumos / carta de Maxirest tienen procesadores
          // ad-hoc que se quedan con sheet [0]. No usan sheet picker.
          if (isMaxirest) {
            const wb = XLSX.read(buffer, { type: 'array' });
            const ws = wb.Sheets[wb.SheetNames[0]];
            const rawData: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
            const { headers, rows } = tipo === 'maxirest_carta'
              ? procesarMaxirestCarta(rawData)
              : procesarMaxirestInsumos(rawData);
            if (headers.length === 0 || rows.length === 0) {
              setError('No se encontraron datos válidos en el archivo. Revisá el formato del export.');
              return;
            }
            setParsedHeaders(headers);
            setParsedRows(rows);
            armarMapeoIdentidad(headers);
            setSheetList(wb.SheetNames);
            setSheetSelected(wb.SheetNames[0]);
            setStep(2);
            return;
          }

          // Camino moderno: cualquier tipo, sheet seleccionable
          const sheets = listSheets(buffer);
          const sheetToUse = sheets[0];
          const { headers, rows } = parseXLSX(buffer, sheetToUse);
          if (headers.length === 0) {
            setError('El archivo está vacío o no se pudo leer.');
            return;
          }
          setSheetList(sheets);
          setSheetSelected(sheetToUse);
          setParsedHeaders(headers);
          setParsedRows(rows);
          aplicarMapeoSegunTipo(headers);
          setStep(2);
        } catch {
          setError('No se pudo leer el archivo Excel.');
        }
      };
      reader.readAsArrayBuffer(file);
      return;
    }

    // ── Caso CSV / TSV / TXT ────────────────────────────────────────────
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const { headers, rows } = parseCSV(text);
      if (headers.length === 0) {
        setError('El archivo está vacío o no se pudo leer.');
        return;
      }
      setParsedHeaders(headers);
      setParsedRows(rows);
      aplicarMapeoSegunTipo(headers);
      setSheetList([]);
      setSheetSelected('');
      setFileBuffer(null);
      setStep(2);
    };
    reader.readAsText(file);
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

      // Códigos de barras: usa endpoint dedicado en vez de /importar/csv
      if (tipo === 'codigos_barras') {
        const items = mappedRows
          .filter(r => r.codigoProducto && r.codigo)
          .map(r => ({
            codigoProducto: String(r.codigoProducto).trim(),
            codigo: String(r.codigo).trim(),
            factor: r.factor ? Number(String(r.factor).replace(',', '.')) : 1,
            descripcion: r.descripcion ? String(r.descripcion).trim() : undefined,
          }));
        const res = await api.bulkCodigosBarras(items);
        setResults({
          insertados: res.insertados,
          actualizados: res.actualizados,
          errores: res.errores,
        });
        return;
      }

      // Mapear el tipo del wizard al tipo que entiende el backend.
      // maxirest_insumos → productos (carga insumos)
      // maxirest_carta   → recetas  (carga platos del menú)
      const tipoBackend =
        tipo === 'maxirest_insumos' ? 'productos' :
        tipo === 'maxirest_carta' ? 'recetas' :
        tipo === 'maxirest_recetas_full' ? 'recetas-maxirest' :
        tipo === 'maxirest_recetas_pdf'  ? 'recetas-maxirest' :   // mismo handler
        tipo === 'maxirest_proveedores'  ? 'proveedores' :        // mismo handler
        tipo === 'maxirest_ventas_full' ? 'ventas-maxirest' :
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
    setSheetList([]);
    setSheetSelected('');
    setFileBuffer(null);
    setPdfPreview(null);
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
                  {tipo === 'maxirest_recetas_pdf' ? 'Seleccionar RECETAS.PDF' :
                   isMaxirest ? 'Seleccionar archivo de Maxirest' : 'Seleccionar archivo'}
                </span>
                <span className="text-[10px] text-on-surface-variant uppercase tracking-widest">
                  {tipo === 'maxirest_recetas_pdf' ? '.pdf' :
                   isMaxirest ? '.xlsx, .xls' : '.csv, .xlsx, .xls, .tsv, .txt'}
                </span>
                <input
                  type="file"
                  accept={
                    tipo === 'maxirest_recetas_pdf' ? '.pdf' :
                    isMaxirest ? '.xlsx,.xls' :
                    '.csv,.xlsx,.xls,.tsv,.txt'
                  }
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
            {pdfPreview && (
              <Badge variant="success">PDF parseado · {pdfPreview.length === 5 ? '5+ recetas' : `${pdfPreview.length} recetas`}</Badge>
            )}
          </div>

          {/* Sheet picker: aparece sólo si el archivo trae >1 hoja */}
          {sheetList.length > 1 && (
            <div className="bg-surface rounded-xl border border-border p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Sparkles size={14} className="text-primary" />
                <p className="text-[11px] font-bold text-foreground uppercase tracking-widest">
                  El archivo tiene {sheetList.length} hojas
                </p>
              </div>
              <p className="text-xs text-on-surface-variant">
                Elegí cuál importar. Por defecto tomamos la primera.
              </p>
              <Select
                value={sheetSelected}
                onChange={e => cambiarSheet(e.target.value)}
                options={sheetList.map(s => ({ value: s, label: s }))}
              />
            </div>
          )}

          {/* PDF preview: muestra primeras recetas detectadas */}
          {pdfPreview && pdfPreview.length > 0 && (
            <div className="bg-surface rounded-xl border border-border p-4 space-y-2">
              <p className="text-[11px] font-bold text-foreground uppercase tracking-widest">
                Recetas detectadas (primeras 5)
              </p>
              <ul className="text-xs text-on-surface-variant space-y-1">
                {pdfPreview.map(p => (
                  <li key={p.codigo}>
                    <span className="font-mono text-primary">{p.codigo}</span>
                    {' · '}
                    <span className="text-foreground">{p.nombre}</span>
                    {' · '}
                    <span>{p.ingredientes} ingredientes</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

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
            Asocia cada columna del archivo con un campo del sistema. Si la
            mayoría está sin mapear, probá <strong>"Analizar con IA"</strong>:
            la IA mira los headers y las primeras filas y completa el mapeo
            automáticamente.
          </p>

          {/* Botón IA — siempre disponible en el paso 3 */}
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 flex items-center gap-3">
            <Sparkles size={16} className="text-primary shrink-0" />
            <div className="flex-1 text-xs text-on-surface-variant">
              ¿La app no reconoce los nombres de columna de tu Maxirest? La IA
              puede mapearlos automáticamente leyendo el contenido.
            </div>
            <Button
              size="sm"
              variant="secondary"
              loading={iaCargando}
              loadingText="Analizando…"
              onClick={async () => {
                setIaCargando(true);
                try {
                  const tipoBackend =
                    tipo === 'maxirest_insumos' ? 'productos' :
                    tipo === 'maxirest_carta' ? 'recetas' :
                    tipo === 'maxirest_recetas_full' ? 'recetas-maxirest' :
                    tipo === 'maxirest_recetas_pdf'  ? 'recetas-maxirest' :
                    tipo === 'maxirest_proveedores'  ? 'proveedores' :
                    tipo === 'maxirest_ventas_full' ? 'ventas-maxirest' :
                    tipo;
                  const r = await api.analizarConIA({
                    tipo: tipoBackend,
                    headers: parsedHeaders,
                    sampleRows: parsedRows.slice(0, 5),
                  });
                  // Combinar con mapping existente (lo del usuario tiene
                  // prioridad sobre el de la IA si ya tocó algo)
                  setMapping(prev => ({ ...r.mapeo, ...prev }));
                  setIaNotas(`Confianza ${r.confianza}: ${r.notas}`);
                } catch (e: any) {
                  setIaNotas(`Error: ${e?.message || 'no se pudo analizar'}`);
                } finally {
                  setIaCargando(false);
                }
              }}
            >
              🤖 Analizar con IA
            </Button>
          </div>
          {iaNotas && (
            <p className="text-[11px] text-on-surface-variant italic">{iaNotas}</p>
          )}

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
