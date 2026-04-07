import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ============================
// TYPES
// ============================

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
}

type ExportFormat = 'csv' | 'xlsx' | 'pdf';

// ============================
// MAIN EXPORT DISPATCHER
// ============================

export function exportData(config: ExportConfig, format: ExportFormat) {
  switch (format) {
    case 'csv': return exportCSV(config);
    case 'xlsx': return exportXLSX(config);
    case 'pdf': return exportPDF(config);
  }
}

// ============================
// CSV EXPORT
// ============================

function exportCSV(config: ExportConfig) {
  const escapeCSV = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [
    config.headers.map(escapeCSV).join(','),
    ...config.rows.map(r => r.map(escapeCSV).join(','))
  ];
  const csv = lines.join('\n');
  downloadBlob(
    new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }),
    `${config.filename}.csv`
  );
}

// ============================
// XLSX EXPORT (styled)
// ============================

function exportXLSX(config: ExportConfig) {
  const wb = XLSX.utils.book_new();

  // Build data array: title row, blank, headers, data rows
  const data: any[][] = [];

  // Title row
  data.push([config.title.toUpperCase()]);
  if (config.subtitle) {
    data.push([config.subtitle]);
  }
  data.push([]); // blank separator

  // Summary section
  if (config.summary && config.summary.length > 0) {
    for (const s of config.summary) {
      data.push([s.label, s.value]);
    }
    data.push([]); // blank separator
  }

  const headerRowIdx = data.length;
  data.push(config.headers);

  for (const row of config.rows) {
    data.push(row);
  }

  // Footer
  data.push([]);
  data.push([`Generado: ${new Date().toLocaleString('es-AR')} — OPS Terminal`]);

  const ws = XLSX.utils.aoa_to_sheet(data);

  // Column widths
  const colWidths: XLSX.ColInfo[] = config.headers.map((h, i) => {
    if (config.columnWidths?.[i]) return { wch: config.columnWidths[i] };
    const maxLen = Math.max(
      h.length,
      ...config.rows.map(r => String(r[i] || '').length)
    );
    return { wch: Math.min(Math.max(maxLen + 2, 10), 40) };
  });
  ws['!cols'] = colWidths;

  // Merge title row across all columns
  const lastCol = config.headers.length - 1;
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: lastCol } },
  ];
  if (config.subtitle) {
    ws['!merges'].push({ s: { r: 1, c: 0 }, e: { r: 1, c: lastCol } });
  }

  // Number formatting for currency/number columns
  for (let ri = 0; ri < config.rows.length; ri++) {
    const excelRow = headerRowIdx + 1 + ri;
    for (const ci of (config.currencyColumns || [])) {
      const cell = ws[XLSX.utils.encode_cell({ r: excelRow, c: ci })];
      if (cell) cell.z = '$#,##0.00';
    }
    for (const ci of (config.numberColumns || [])) {
      const cell = ws[XLSX.utils.encode_cell({ r: excelRow, c: ci })];
      if (cell) cell.z = '#,##0.00';
    }
  }

  XLSX.utils.book_append_sheet(wb, ws, 'Datos');
  XLSX.writeFile(wb, `${config.filename}.xlsx`);
}

// ============================
// PDF EXPORT (branded)
// ============================

const BRAND = {
  gold: [212, 175, 55] as [number, number, number],
  dark: [18, 18, 20] as [number, number, number],
  surface: [30, 30, 32] as [number, number, number],
  text: [240, 240, 240] as [number, number, number],
  textMuted: [160, 160, 165] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
};

function exportPDF(config: ExportConfig) {
  const isLandscape = config.headers.length > 5;
  const doc = new jsPDF({
    orientation: isLandscape ? 'landscape' : 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;

  // --- Background ---
  doc.setFillColor(...BRAND.dark);
  doc.rect(0, 0, pageW, pageH, 'F');

  // --- Header bar ---
  doc.setFillColor(...BRAND.surface);
  doc.rect(0, 0, pageW, 28, 'F');

  // Gold accent line
  doc.setFillColor(...BRAND.gold);
  doc.rect(0, 28, pageW, 0.8, 'F');

  // Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...BRAND.white);
  doc.text(config.title.toUpperCase(), margin, 12);

  // Subtitle / date
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...BRAND.textMuted);
  const dateStr = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' });
  doc.text(config.subtitle || dateStr, margin, 19);

  // Brand name right-aligned
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...BRAND.gold);
  doc.text('OPS TERMINAL', pageW - margin, 12, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...BRAND.textMuted);
  doc.text(`${config.rows.length} registros`, pageW - margin, 19, { align: 'right' });

  let startY = 34;

  // --- Summary cards ---
  if (config.summary && config.summary.length > 0) {
    const cardW = Math.min(50, (pageW - margin * 2 - (config.summary.length - 1) * 4) / config.summary.length);
    const cardH = 16;
    let x = margin;

    for (const s of config.summary) {
      // Card bg
      doc.setFillColor(...BRAND.surface);
      doc.roundedRect(x, startY, cardW, cardH, 2, 2, 'F');

      // Value
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(...BRAND.white);
      doc.text(String(s.value), x + cardW / 2, startY + 7, { align: 'center' });

      // Label
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      doc.setTextColor(...BRAND.textMuted);
      doc.text(s.label.toUpperCase(), x + cardW / 2, startY + 12.5, { align: 'center' });

      x += cardW + 4;
    }

    startY += cardH + 6;
  }

  // --- Table ---
  autoTable(doc, {
    startY,
    head: [config.headers],
    body: config.rows.map(r => r.map(v => String(v))),
    margin: { left: margin, right: margin },
    styles: {
      font: 'helvetica',
      fontSize: 7,
      cellPadding: 2.5,
      textColor: BRAND.text,
      lineColor: [50, 50, 55],
      lineWidth: 0.1,
    },
    headStyles: {
      fillColor: BRAND.surface,
      textColor: BRAND.gold,
      fontStyle: 'bold',
      fontSize: 6.5,
      cellPadding: 3,
    },
    alternateRowStyles: {
      fillColor: [24, 24, 26],
    },
    bodyStyles: {
      fillColor: BRAND.dark,
    },
    columnStyles: buildColumnStyles(config),
    didDrawPage: (data: any) => {
      // Re-draw background on new pages
      doc.setFillColor(...BRAND.dark);
      doc.rect(0, 0, pageW, data.settings.startY || 0, 'F');

      // Footer on every page
      const pageNum = doc.getNumberOfPages();
      doc.setFillColor(...BRAND.surface);
      doc.rect(0, pageH - 10, pageW, 10, 'F');
      doc.setFillColor(...BRAND.gold);
      doc.rect(0, pageH - 10, pageW, 0.3, 'F');

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      doc.setTextColor(...BRAND.textMuted);
      doc.text(`OPS Terminal — ${dateStr}`, margin, pageH - 4);
      doc.text(`Pagina ${pageNum}`, pageW - margin, pageH - 4, { align: 'right' });
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

// ============================
// HELPERS
// ============================

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
