// NOTA: exceljs (~500KB) y jspdf (~350KB) se importan DINÁMICAMENTE dentro
// de cada función de export. Así Vite los separa en chunks aparte que solo
// se descargan cuando el usuario realmente exporta — no penalizan la carga
// inicial de la app (que es lo que más importa en cocina con wifi lento).

// ============================================================================
// EXPORT UTILS — Excel (exceljs, con estilos reales) + PDF (impresión-ready)
// ----------------------------------------------------------------------------
// Antes:
//  - XLSX salía con SheetJS community → SIN colores, SIN bold, SIN bordes.
//    Un Excel blanco y plano que el contador miraba con cara rara.
//  - PDF con fondo NEGRO → lindo en pantalla, pésimo para imprimir (gasta
//    toda la tinta, ilegible en papel barato). El dueño imprime para el
//    contador y sale un mamarracho oscuro.
//
// Ahora:
//  - Excel con exceljs: header con fondo dorado, título mergeado, bloque de
//    resumen, filas zebra, formato moneda en celdas, totales en negrita,
//    freeze de la fila de encabezado, autofiltro, columnas autoajustadas.
//  - PDF sobre BLANCO, tipografía clara, barra dorada fina, tarjetas de
//    resumen con borde, tabla zebra gris muy suave, fila de totales
//    destacada, pie con fecha + paginación. Pensado para imprimir y firmar.
//
// La interfaz ExportConfig se mantiene 100% compatible (las 8 páginas que
// ya exportan siguen andando). Los campos nuevos son opcionales.
// ============================================================================

export interface ExportConfig {
  title: string;
  filename: string;
  headers: string[];
  rows: (string | number)[][];
  subtitle?: string;
  summary?: { label: string; value: string | number }[];
  columnWidths?: Record<number, number>;
  numberColumns?: number[];
  currencyColumns?: number[];
  /** Fila de totales que se renderiza destacada al pie de la tabla. */
  totalRow?: (string | number)[];
  /** Forzar orientación del PDF (default: auto según nº de columnas). */
  orientation?: 'portrait' | 'landscape';
  /** Nombre de la empresa/cuenta para el encabezado (default: OPS Terminal). */
  empresa?: string;
}

type ExportFormat = 'csv' | 'xlsx' | 'pdf';

export function exportData(config: ExportConfig, format: ExportFormat) {
  switch (format) {
    case 'csv': return exportCSV(config);
    case 'xlsx': return exportXLSX(config);
    case 'pdf': return exportPDF(config);
  }
}

// ============================================================================
// CSV (sin cambios — formato de intercambio, no de presentación)
// ============================================================================
function exportCSV(config: ExportConfig) {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [
    config.headers.map(esc).join(','),
    ...config.rows.map(r => r.map(esc).join(',')),
  ];
  if (config.totalRow) lines.push(config.totalRow.map(esc).join(','));
  downloadBlob(
    new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' }),
    `${config.filename}.csv`,
  );
}

// ============================================================================
// XLSX — exceljs con estilos reales
// ============================================================================
const XLS = {
  gold: 'FFD4AF37',
  goldSoft: 'FFF6ECC8',
  darkText: 'FF1A1A1A',
  zebra: 'FFF7F7F5',
  border: 'FFD9D9D9',
  summaryBg: 'FFFBF6E6',
};

async function exportXLSX(config: ExportConfig) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = config.empresa || 'OPS Terminal';
  wb.created = new Date();
  const ws = wb.addWorksheet('Datos', {
    views: [{ state: 'frozen', ySplit: 0 }], // se reajusta abajo
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  const nCols = config.headers.length;
  const lastColLetter = colLetter(nCols);

  let r = 1;

  // --- Título ---
  ws.mergeCells(`A${r}:${lastColLetter}${r}`);
  const titleCell = ws.getCell(`A${r}`);
  titleCell.value = config.title.toUpperCase();
  titleCell.font = { bold: true, size: 16, color: { argb: XLS.darkText } };
  titleCell.alignment = { vertical: 'middle' };
  ws.getRow(r).height = 26;
  r++;

  // --- Subtítulo / fecha ---
  ws.mergeCells(`A${r}:${lastColLetter}${r}`);
  const subCell = ws.getCell(`A${r}`);
  subCell.value = config.subtitle ||
    `Generado el ${new Date().toLocaleString('es-AR')} · ${config.empresa || 'OPS Terminal'}`;
  subCell.font = { size: 9, italic: true, color: { argb: 'FF888888' } };
  r++;
  r++; // blank

  // --- Resumen ---
  if (config.summary?.length) {
    for (const s of config.summary) {
      const labelCell = ws.getCell(`A${r}`);
      labelCell.value = s.label;
      labelCell.font = { bold: true, size: 10, color: { argb: XLS.darkText } };
      labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XLS.summaryBg } };
      const valCell = ws.getCell(`B${r}`);
      valCell.value = s.value;
      valCell.font = { bold: true, size: 10, color: { argb: XLS.darkText } };
      valCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XLS.summaryBg } };
      r++;
    }
    r++; // blank
  }

  // --- Encabezado de tabla ---
  const headerRowIdx = r;
  const headerRow = ws.getRow(r);
  config.headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, size: 10, color: { argb: XLS.darkText } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XLS.gold } };
    cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: XLS.border } },
      bottom: { style: 'medium', color: { argb: XLS.gold } },
      left: { style: 'thin', color: { argb: XLS.border } },
      right: { style: 'thin', color: { argb: XLS.border } },
    };
  });
  headerRow.height = 22;
  r++;

  // --- Filas ---
  const currencySet = new Set(config.currencyColumns || []);
  const numberSet = new Set(config.numberColumns || []);
  config.rows.forEach((row, ri) => {
    const dataRow = ws.getRow(r);
    row.forEach((val, ci) => {
      const cell = dataRow.getCell(ci + 1);
      cell.value = val;
      cell.font = { size: 9, color: { argb: XLS.darkText } };
      if (ri % 2 === 1) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XLS.zebra } };
      }
      if (currencySet.has(ci)) {
        cell.numFmt = '"$"#,##0.00';
        cell.alignment = { horizontal: 'right' };
      } else if (numberSet.has(ci)) {
        cell.numFmt = '#,##0.##';
        cell.alignment = { horizontal: 'right' };
      }
      cell.border = {
        bottom: { style: 'hair', color: { argb: XLS.border } },
      };
    });
    r++;
  });

  // --- Fila de totales ---
  if (config.totalRow) {
    const totRow = ws.getRow(r);
    config.totalRow.forEach((val, ci) => {
      const cell = totRow.getCell(ci + 1);
      cell.value = val;
      cell.font = { bold: true, size: 10, color: { argb: XLS.darkText } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XLS.goldSoft } };
      if (currencySet.has(ci)) { cell.numFmt = '"$"#,##0.00'; cell.alignment = { horizontal: 'right' }; }
      else if (numberSet.has(ci)) { cell.numFmt = '#,##0.##'; cell.alignment = { horizontal: 'right' }; }
      cell.border = { top: { style: 'medium', color: { argb: XLS.gold } } };
    });
    totRow.height = 20;
    r++;
  }

  // --- Anchos de columna autoajustados ---
  config.headers.forEach((h, i) => {
    const explicit = config.columnWidths?.[i];
    if (explicit) { ws.getColumn(i + 1).width = explicit; return; }
    const maxLen = Math.max(
      h.length,
      ...config.rows.map(row => String(row[i] ?? '').length),
    );
    ws.getColumn(i + 1).width = Math.min(Math.max(maxLen + 3, 11), 45);
  });

  // Freeze: todo lo de arriba + la fila de encabezado queda fija al scrollear
  ws.views = [{ state: 'frozen', ySplit: headerRowIdx }];
  // Autofiltro sobre el rango de datos
  ws.autoFilter = {
    from: { row: headerRowIdx, column: 1 },
    to: { row: headerRowIdx + config.rows.length, column: nCols },
  };

  const buf = await wb.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `${config.filename}.xlsx`,
  );
}

// ============================================================================
// PDF — listo para imprimir (fondo BLANCO, tinta económica)
// ============================================================================
const PDF = {
  gold: [196, 154, 32] as [number, number, number],
  ink: [26, 26, 26] as [number, number, number],
  muted: [120, 120, 120] as [number, number, number],
  hairline: [220, 220, 220] as [number, number, number],
  zebra: [247, 247, 245] as [number, number, number],
  summaryBg: [251, 246, 230] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
};

async function exportPDF(config: ExportConfig) {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const isLandscape = config.orientation
    ? config.orientation === 'landscape'
    : config.headers.length > 5;
  const doc = new jsPDF({ orientation: isLandscape ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;
  const empresa = config.empresa || 'OPS Terminal';
  const dateStr = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' });

  // --- Encabezado (sobre blanco) ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.setTextColor(...PDF.ink);
  doc.text(config.title, margin, 16);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...PDF.muted);
  doc.text(config.subtitle || dateStr, margin, 22);

  // Empresa, alineada a la derecha
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...PDF.gold);
  doc.text(empresa.toUpperCase(), pageW - margin, 16, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...PDF.muted);
  doc.text(`${config.rows.length} registro${config.rows.length === 1 ? '' : 's'}`, pageW - margin, 22, { align: 'right' });

  // Línea dorada fina bajo el header
  doc.setDrawColor(...PDF.gold);
  doc.setLineWidth(0.6);
  doc.line(margin, 26, pageW - margin, 26);

  let startY = 32;

  // --- Tarjetas de resumen (borde, sin relleno oscuro) ---
  if (config.summary?.length) {
    const gap = 4;
    const cardW = (pageW - margin * 2 - (config.summary.length - 1) * gap) / config.summary.length;
    const cardH = 17;
    let x = margin;
    for (const s of config.summary) {
      doc.setFillColor(...PDF.summaryBg);
      doc.setDrawColor(...PDF.hairline);
      doc.setLineWidth(0.2);
      doc.roundedRect(x, startY, cardW, cardH, 1.5, 1.5, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(...PDF.ink);
      doc.text(String(s.value), x + cardW / 2, startY + 8, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(...PDF.muted);
      doc.text(s.label.toUpperCase(), x + cardW / 2, startY + 13.5, { align: 'center' });
      x += cardW + gap;
    }
    startY += cardH + 7;
  }

  // --- Tabla ---
  const body = config.rows.map(r => r.map(v => String(v)));
  if (config.totalRow) body.push(config.totalRow.map(v => String(v)));
  const totalRowIdx = config.totalRow ? body.length - 1 : -1;

  autoTable(doc, {
    startY,
    head: [config.headers],
    body,
    margin: { left: margin, right: margin, top: 32 },
    styles: {
      font: 'helvetica',
      fontSize: 7.5,
      cellPadding: 2.5,
      textColor: PDF.ink,
      lineColor: PDF.hairline,
      lineWidth: 0.1,
    },
    headStyles: {
      fillColor: PDF.gold,
      textColor: PDF.white,
      fontStyle: 'bold',
      fontSize: 7,
      cellPadding: 3,
    },
    alternateRowStyles: { fillColor: PDF.zebra },
    bodyStyles: { fillColor: PDF.white },
    columnStyles: buildColumnStyles(config),
    didParseCell: (data: any) => {
      // Fila de totales: negrita + fondo dorado suave
      if (data.section === 'body' && data.row.index === totalRowIdx) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = PDF.summaryBg;
        data.cell.styles.lineWidth = { top: 0.4, bottom: 0, left: 0, right: 0 };
        data.cell.styles.lineColor = PDF.gold;
      }
    },
    didDrawPage: () => {
      const pageNum = doc.getNumberOfPages();
      // Pie discreto
      doc.setDrawColor(...PDF.hairline);
      doc.setLineWidth(0.2);
      doc.line(margin, pageH - 10, pageW - margin, pageH - 10);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(...PDF.muted);
      doc.text(`${empresa} · ${dateStr}`, margin, pageH - 5);
      doc.text(`Página ${pageNum}`, pageW - margin, pageH - 5, { align: 'right' });
    },
  });

  doc.save(`${config.filename}.pdf`);
}

function buildColumnStyles(config: ExportConfig): Record<number, any> {
  const styles: Record<number, any> = {};
  for (const ci of (config.currencyColumns || [])) {
    styles[ci] = { halign: 'right', fontStyle: 'bold' };
  }
  for (const ci of (config.numberColumns || [])) {
    styles[ci] = { halign: 'right' };
  }
  return styles;
}

// ============================================================================
// HELPERS
// ============================================================================
function colLetter(n: number): string {
  // 1 → A, 26 → Z, 27 → AA …
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s || 'A';
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

export function formatCurrency(n: number): string {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);
}
