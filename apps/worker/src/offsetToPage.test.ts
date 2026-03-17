/**
 * Regression: page_number on findings must match offsetToPage(script_pages, start_offset_global).
 * Run: npx tsx src/offsetToPage.test.ts
 */
import { offsetToPageNumber, SCRIPT_PAGE_SEP_LEN } from './offsetToPage.js';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const pages = [
  { page_number: 1, content: 'aaa' },
  { page_number: 2, content: 'bbbb' },
  { page_number: 3, content: 'c' },
];

assert(offsetToPageNumber(0, pages) === 1, 'start page 1');
assert(offsetToPageNumber(2, pages) === 1, 'end of page1 content');
assert(offsetToPageNumber(3 + SCRIPT_PAGE_SEP_LEN - 1, pages) === 1, 'separator belongs to page1 range');
assert(offsetToPageNumber(3 + SCRIPT_PAGE_SEP_LEN, pages) === 2, 'start page 2');
// aaa(3)+\n\n+bbbb(4)+\n\n+c → page3 char 'c' at global 11
assert(offsetToPageNumber(11, pages) === 3, 'last page content');

console.log('offsetToPage.test.ts: ok');
