/**
 * Run: npx tsx src/utils/documentExtract.pdf-arabic.test.ts
 */
import { normalizePdfTextRun } from './documentExtract';

const presentation = 'ﺷﺎرع اﻷﻋﺸﻰ';
const normalized = normalizePdfTextRun(presentation);

if (normalized !== 'شارع الأعشى') {
  throw new Error(`expected Arabic presentation forms to normalize, got: ${normalized}`);
}

const hidden = normalizePdfTextRun('ق\u200dذ\u200cر');
if (hidden !== 'قذر') {
  throw new Error(`expected hidden chars to be removed, got: ${hidden}`);
}

console.log('documentExtract.pdf-arabic.test.ts: ok');
