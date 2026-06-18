// Жинхэнэ .xlsx экспорт — exceljs (динамик импорт, эхний ачааллыг хөнгөлнө).
// Бүх тайлан энэ нэг туслахаар Excel рүү гарна (CLAUDE.md §7.4 "Excel файл").

export interface XlsxColumn {
  header: string;
  key: string;
  width?: number;
  /** Мөнгөн багана — тоон формат `#,##0`, баруун зэрэгцүүлэлт. Утга нь string(MNT). */
  money?: boolean;
  /** Тоон (литр/тоо хэмжээ) багана — баруун зэрэгцүүлэлт. */
  numeric?: boolean;
}

export interface XlsxSheet {
  name: string;
  /** Хүснэгтийн дээд гарчиг (нэгтгэсэн мөр). */
  title?: string;
  /** Гарчгийн доорх мета мөрүүд (компани, муж, шүүлт). */
  meta?: string[];
  columns: XlsxColumn[];
  rows: Array<Record<string, unknown>>;
  /** Хүснэгтийн доод нийт мөр (баганы key → утга). */
  totals?: Record<string, unknown>;
}

/** MNT string-ийг аюулгүй бол тоо болгоно (Excel-д форматлахын тулд), эс бөгөөс string. */
function moneyCell(value: unknown): number | string {
  if (value === null || value === undefined || value === '') return '';
  const n = Number(value);
  return Number.isSafeInteger(n) ? n : String(value);
}

export async function exportXlsx(filename: string, sheets: XlsxSheet[]): Promise<void> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Fuel Retail System';

  for (const sheet of sheets) {
    const ws = wb.addWorksheet(sheet.name.slice(0, 31) || 'Sheet');
    const colCount = sheet.columns.length;

    if (sheet.title) {
      const r = ws.addRow([sheet.title]);
      ws.mergeCells(r.number, 1, r.number, Math.max(1, colCount));
      r.font = { bold: true, size: 14 };
      r.alignment = { horizontal: 'center' };
    }
    for (const m of sheet.meta ?? []) {
      const r = ws.addRow([m]);
      ws.mergeCells(r.number, 1, r.number, Math.max(1, colCount));
      r.font = { size: 10, color: { argb: 'FF666666' } };
    }
    if (sheet.title || (sheet.meta && sheet.meta.length)) ws.addRow([]);

    // Толгой
    const headerRow = ws.addRow(sheet.columns.map((c) => c.header));
    headerRow.font = { bold: true };
    headerRow.alignment = { vertical: 'middle' };
    headerRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF3F8' } };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } } };
    });

    // Мөрүүд
    for (const row of sheet.rows) {
      const values = sheet.columns.map((c) => (c.money ? moneyCell(row[c.key]) : (row[c.key] ?? '')));
      const r = ws.addRow(values);
      sheet.columns.forEach((c, i) => {
        const cell = r.getCell(i + 1);
        if (c.money) {
          cell.numFmt = '#,##0';
          cell.alignment = { horizontal: 'right' };
        } else if (c.numeric) {
          cell.alignment = { horizontal: 'right' };
        }
      });
    }

    // Нийт
    if (sheet.totals) {
      const values = sheet.columns.map((c) =>
        c.money ? moneyCell(sheet.totals?.[c.key]) : (sheet.totals?.[c.key] ?? ''),
      );
      const r = ws.addRow(values);
      r.font = { bold: true };
      r.eachCell((cell) => {
        cell.border = { top: { style: 'thin', color: { argb: 'FFCBD5E1' } } };
      });
      sheet.columns.forEach((c, i) => {
        if (c.money) {
          r.getCell(i + 1).numFmt = '#,##0';
          r.getCell(i + 1).alignment = { horizontal: 'right' };
        } else if (c.numeric) {
          r.getCell(i + 1).alignment = { horizontal: 'right' };
        }
      });
    }

    sheet.columns.forEach((c, i) => {
      ws.getColumn(i + 1).width = c.width ?? Math.max(10, c.header.length + 2);
    });
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
