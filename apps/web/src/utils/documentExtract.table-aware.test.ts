/**
 * Run: npx tsx src/utils/documentExtract.table-aware.test.ts
 */
import { htmlToTextPreserveTables } from '../../../../supabase/functions/_shared/utils';

const source = `
<p>مقدمة</p>
<table>
  <tr><th>العنوان</th><th>القيمة</th></tr>
  <tr><td>الاسم</td><td>سعود</td></tr>
  <tr><td>النوع</td><td>فيلم</td></tr>
</table>
<p>خاتمة</p>
`;

const text = htmlToTextPreserveTables(source);

if (!text.includes('العنوان | القيمة')) {
  throw new Error(`expected table header row to be preserved, got: ${text}`);
}

if (!text.includes('الاسم | سعود')) {
  throw new Error(`expected table body row to be preserved, got: ${text}`);
}

if (!text.includes('مقدمة') || !text.includes('خاتمة')) {
  throw new Error(`expected surrounding text to remain, got: ${text}`);
}

const noTable = htmlToTextPreserveTables('<div>سطر <strong>مهم</strong></div>');
if (noTable !== 'سطر مهم') {
  throw new Error(`expected normal HTML stripping to remain intact, got: ${noTable}`);
}

console.log('documentExtract.table-aware.test.ts: ok');
