/**
 * Run: npx tsx src/utils/documentExtract.pdf-arabic.test.ts
 */
import { normalizePdfTextRun, postprocessPdfExtractedLine } from './documentExtract';

const presentation = 'ﺷﺎرع اﻷﻋﺸﻰ';
const normalized = normalizePdfTextRun(presentation);

if (normalized !== 'شارع الأعشى') {
  throw new Error(`expected Arabic presentation forms to normalize, got: ${normalized}`);
}

const hidden = normalizePdfTextRun('ق\u200dذ\u200cر');
if (hidden !== 'قذر') {
  throw new Error(`expected hidden chars to be removed, got: ${hidden}`);
}

const sceneHeader = postprocessPdfExtractedLine('2.اﻟﻄﺮﯾﻖ-ﺧﺎرﺟﻲ/ﻟﯿﻠﻲ');
if (sceneHeader !== '2. الطريق - خارجي / ليلي') {
  throw new Error(`expected scene header cleanup, got: ${sceneHeader}`);
}

const bidiVoiceOver = postprocessPdfExtractedLine('ﻋﺰﯾﺰة) V.O(');
if (bidiVoiceOver !== 'عزيزة (V.O)') {
  throw new Error(`expected voice-over marker cleanup, got: ${bidiVoiceOver}`);
}

const strayLatin = postprocessPdfExtractedLine('sﯾﺮﺣﻤﮫوﯾﻌﻔﻲﻋﻨﮫ.');
if (strayLatin !== 'يرحمهويعفيعنه.') {
  throw new Error(`expected stray latin cleanup, got: ${strayLatin}`);
}

const collapsedTitle = postprocessPdfExtractedLine('شارعالأعشى');
if (collapsedTitle !== 'شارع الأعشى') {
  throw new Error(`expected collapsed title spacing recovery, got: ${collapsedTitle}`);
}

const collapsedSeason = postprocessPdfExtractedLine('الموسمالثاني');
if (collapsedSeason !== 'الموسم الثاني') {
  throw new Error(`expected collapsed season spacing recovery, got: ${collapsedSeason}`);
}

const digitSpacing = postprocessPdfExtractedLine('الحلقة1');
if (digitSpacing !== 'الحلقة 1') {
  throw new Error(`expected digit spacing recovery, got: ${digitSpacing}`);
}

console.log('documentExtract.pdf-arabic.test.ts: ok');
