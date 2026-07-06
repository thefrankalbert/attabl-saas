import type { Column, Worksheet } from 'exceljs';

/**
 * Shared styled-Excel helper (exceljs). One premium visual language for every
 * exported / template workbook: branded title band, dark header row, hairline
 * neutral borders, subtle zebra, frozen header. SheetJS (xlsx) is kept for
 * READING uploads; exceljs is used here because the free xlsx build strips all
 * cell styling on write.
 */

// Neutral document palette (ARGB), matching the print document tokens.
const INK = 'FF18181B';
const WHITE = 'FFFFFFFF';
const LINE = 'FFE4E4E7';
const SUBTLE = 'FFFAFAFA';
const MUTED = 'FF71717A';

export interface StyledColumn {
  header: string;
  /** Column width in Excel character units (default 18). */
  width?: number;
  /** Right-align the column (numbers). */
  numeric?: boolean;
}

export interface StyledSheetInput {
  sheetName: string;
  /** Brand / document title shown in the top band. */
  title: string;
  /** Optional subtitle line under the title. */
  subtitle?: string;
  columns: StyledColumn[];
  rows: Array<Array<string | number | null | undefined>>;
}

const thinBorder = { style: 'thin' as const, color: { argb: LINE } };

function styleHeaderRow(ws: Worksheet, rowNumber: number, columns: StyledColumn[]): void {
  const row = ws.getRow(rowNumber);
  row.height = 22;
  columns.forEach((col, i) => {
    const cell = row.getCell(i + 1);
    cell.value = col.header;
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: WHITE } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK } };
    cell.alignment = { vertical: 'middle', horizontal: col.numeric ? 'right' : 'left' };
    cell.border = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };
  });
}

/**
 * Build a styled single-sheet workbook and return it as a Buffer ready for
 * download. Title band -> subtitle -> header -> data rows (zebra + borders).
 */
export async function buildStyledWorkbook(input: StyledSheetInput): Promise<Buffer> {
  const { Workbook } = await import('exceljs');
  const wb = new Workbook();
  wb.creator = 'ATTABL';
  const ws = wb.addWorksheet(input.sheetName, {
    views: [{ state: 'frozen', ySplit: input.subtitle ? 4 : 3 }],
  });

  const colCount = input.columns.length;
  const lastCol = String.fromCharCode(64 + Math.min(colCount, 26));

  // Column widths
  ws.columns = input.columns.map(
    (c): Partial<Column> => ({ width: c.width ?? 18 }),
  ) as Partial<Column>[];

  // --- Title band ---
  ws.mergeCells(`A1:${lastCol}1`);
  const titleCell = ws.getCell('A1');
  titleCell.value = input.title;
  titleCell.font = { name: 'Calibri', size: 15, bold: true, color: { argb: INK } };
  ws.getRow(1).height = 26;

  let headerRowNumber = 3;
  if (input.subtitle) {
    ws.mergeCells(`A2:${lastCol}2`);
    const subCell = ws.getCell('A2');
    subCell.value = input.subtitle;
    subCell.font = { name: 'Calibri', size: 10, color: { argb: MUTED } };
    headerRowNumber = 4;
  }

  // --- Header row ---
  styleHeaderRow(ws, headerRowNumber, input.columns);

  // --- Data rows ---
  input.rows.forEach((row, ri) => {
    const excelRow = ws.getRow(headerRowNumber + 1 + ri);
    const zebra = ri % 2 === 1;
    input.columns.forEach((col, ci) => {
      const cell = excelRow.getCell(ci + 1);
      cell.value = row[ci] ?? '';
      cell.font = { name: 'Calibri', size: 10, color: { argb: INK } };
      cell.alignment = { vertical: 'middle', horizontal: col.numeric ? 'right' : 'left' };
      cell.border = { bottom: thinBorder };
      if (zebra) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SUBTLE } };
    });
  });

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
