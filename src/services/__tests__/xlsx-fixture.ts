import ExcelJS from 'exceljs';

/**
 * Fabrique un classeur .xlsx en memoire a partir d'un tableau de lignes.
 *
 * Ecrit avec exceljs, comme le reste du projet. SheetJS (`xlsx`) a ete retire:
 * sa derniere version publiee sur npm porte deux failles hautes non corrigees, et
 * la garder pour les seuls tests l'aurait laissee dans l'arbre de dependances.
 */
export async function buildXlsx(aoa: unknown[][]): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Sheet1');
  for (const row of aoa) {
    sheet.addRow(row as ExcelJS.CellValue[]);
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}
