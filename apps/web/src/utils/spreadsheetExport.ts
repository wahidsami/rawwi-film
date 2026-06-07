import JSZip from 'jszip';

export type SpreadsheetCell = string | number | boolean | null | undefined;

export interface SpreadsheetSheet {
  name: string;
  rows: SpreadsheetCell[][];
}

function sanitizeXmlText(value: string): string {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uD800-\uDFFF\uFFFE\uFFFF]/g, '');
}

function escapeXml(value: string): string {
  return sanitizeXmlText(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function columnLetter(index: number): string {
  let n = index + 1;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function sheetDimension(rows: SpreadsheetCell[][]): string {
  const rowCount = rows.length || 1;
  const colCount = Math.max(1, ...rows.map((row) => row.length || 0));
  return `A1:${columnLetter(colCount - 1)}${rowCount}`;
}

function inlineStringCellXml(cell: SpreadsheetCell, ref: string): string {
  if (cell === null || cell === undefined || cell === '') return '';
  if (typeof cell === 'number') {
    return `<c r="${ref}" t="n"><v>${Number.isFinite(cell) ? cell : 0}</v></c>`;
  }
  if (typeof cell === 'boolean') {
    return `<c r="${ref}" t="b"><v>${cell ? 1 : 0}</v></c>`;
  }
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(String(cell))}</t></is></c>`;
}

function buildSheetXml(sheet: SpreadsheetSheet): string {
  const dimension = sheetDimension(sheet.rows);
  const frozenPane = [
    '<sheetViews>',
    '<sheetView workbookViewId="0">',
    '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>',
    '<selection pane="bottomLeft" activeCell="A2" sqref="A2"/>',
    '</sheetView>',
    '</sheetViews>',
  ].join('');

  const rowsXml = sheet.rows.map((row, rowIndex) => {
    const cells = row
      .map((cell, colIndex) => inlineStringCellXml(cell, `${columnLetter(colIndex)}${rowIndex + 1}`))
      .filter(Boolean)
      .join('');
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
           xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <dimension ref="${dimension}"/>
  ${frozenPane}
  <sheetFormatPr defaultRowHeight="18"/>
  <sheetData>${rowsXml}</sheetData>
  <autoFilter ref="${dimension}"/>
</worksheet>`;
}

function buildWorkbookXml(sheets: SpreadsheetSheet[]): string {
  const sheetNodes = sheets.map((sheet, index) => `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>${sheetNodes}</sheets>
</workbook>`;
}

function buildWorkbookRelsXml(sheets: SpreadsheetSheet[]): string {
  const rels = sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`;
}

function buildRootRelsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;
}

function buildContentTypesXml(sheetCount: number): string {
  const sheetOverrides = Array.from({ length: sheetCount }, (_, index) =>
    `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
  ).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  ${sheetOverrides}
</Types>`;
}

function buildStylesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="1"><font><sz val="11"/><name val="Aptos"/></font></fonts>
  <fills count="1"><fill><patternFill patternType="none"/></fill></fills>
  <borders count="1"><border/></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>
</styleSheet>`;
}

function buildCorePropsXml(title: string): string {
  const now = new Date().toISOString();
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
    xmlns:dc="http://purl.org/dc/elements/1.1/"
    xmlns:dcterms="http://purl.org/dc/terms/"
    xmlns:dcmitype="http://purl.org/dc/dcmitype/"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${escapeXml(title)}</dc:title>
  <dc:creator>Raawi</dc:creator>
  <cp:lastModifiedBy>Raawi</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>
</cp:coreProperties>`;
}

function buildAppPropsXml(sheetNames: string[]): string {
  const headings = sheetNames.map((name) => `<vt:lpstr>${escapeXml(name)}</vt:lpstr>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"
    xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Raawi</Application>
  <DocSecurity>0</DocSecurity>
  <ScaleCrop>false</ScaleCrop>
  <HeadingPairs>
    <vt:vector size="2" baseType="variant">
      <vt:variant><vt:lpstr>Worksheets</vt:lpstr></vt:variant>
      <vt:variant><vt:i4>${sheetNames.length}</vt:i4></vt:variant>
    </vt:vector>
  </HeadingPairs>
  <TitlesOfParts>
    <vt:vector size="${sheetNames.length}" baseType="lpstr">${headings}</vt:vector>
  </TitlesOfParts>
</Properties>`;
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function buildCsvContent(headers: string[], rows: Array<Array<string | number | boolean | null | undefined>>): string {
  const encode = (value: unknown) => {
    if (value === null || value === undefined) return '';
    const text = String(value);
    if (/[,"\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  };
  const lines = [headers.map(encode).join(',')];
  rows.forEach((row) => lines.push(row.map(encode).join(',')));
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

export function downloadCsvFile(params: {
  fileName: string;
  headers: string[];
  rows: Array<Array<string | number | boolean | null | undefined>>;
}): void {
  const blob = new Blob([buildCsvContent(params.headers, params.rows)], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, params.fileName);
}

export async function downloadXlsxFile(params: {
  fileName: string;
  sheets: SpreadsheetSheet[];
}): Promise<void> {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', buildContentTypesXml(params.sheets.length));
  zip.folder('_rels')?.file('.rels', buildRootRelsXml());
  zip.folder('docProps')?.file('core.xml', buildCorePropsXml(params.fileName));
  zip.folder('docProps')?.file('app.xml', buildAppPropsXml(params.sheets.map((sheet) => sheet.name)));

  const xl = zip.folder('xl');
  if (!xl) return;
  xl.file('workbook.xml', buildWorkbookXml(params.sheets));
  xl.file('styles.xml', buildStylesXml());
  const rels = xl.folder('_rels');
  rels?.file('workbook.xml.rels', buildWorkbookRelsXml(params.sheets));
  const worksheets = xl.folder('worksheets');
  params.sheets.forEach((sheet, index) => {
    worksheets?.file(`sheet${index + 1}.xml`, buildSheetXml(sheet));
  });

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  downloadBlob(blob, params.fileName);
}
