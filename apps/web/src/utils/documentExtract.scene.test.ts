/**
 * Run: npx tsx src/utils/documentExtract.scene.test.ts
 */
import { trySplitDocxPagesBySceneHeadings } from './documentExtract';

const plain = `عنوان المسلسل

المشهد 1 — داخلي
فهد يدخل.

المشهد 2 — خارجي
مها تمشي.`;
const html = `<p>عنوان المسلسل</p><p>المشهد 1 — داخلي<br/>فهد يدخل.</p><p>المشهد 2 — خارجي<br/>مها تمشي.</p>`;
const pages = trySplitDocxPagesBySceneHeadings(plain, html);
if (pages.length < 2) throw new Error(`expected >=2 scene pages, got ${pages.length}`);
if (!pages[0]!.text.includes('عنوان')) throw new Error('first page should have title');
if (!pages.some((p) => p.text.includes('المشهد 2'))) throw new Error('missing scene 2');
console.log('documentExtract.scene.test.ts: ok');
