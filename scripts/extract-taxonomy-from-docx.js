/**
 * Extract articles + atom rules taxonomy from the methodology docx.
 * Output: JSON + validation summary.
 * Excludes "منهجية التعامل في منصة راوي" (we only capture article/atom titles, not methodology text).
 */
const fs = require('fs');
const path = require('path');

const docxPath = path.join(__dirname, '..', '_docx_extract', 'word', 'document.xml');
const xml = fs.readFileSync(docxPath, 'utf8');

const texts = [];
const re = /<w:t[^>]*>([^<]*)<\/w:t>/g;
let m;
while ((m = re.exec(xml)) !== null) texts.push(m[1]);
const full = texts.join('');

// Articles: المادة (N): Title — title until الهدف or next المادة ( or القاعدة (
const artRe = /المادة\s*\(\s*(\d+)\s*\)\s*:\s*([^]+?)(?=الهدف|المادة\s*\(|القاعدة\s*\(|$)/g;
const arts = [];
let a;
while ((a = artRe.exec(full)) !== null) {
  let title = a[2].replace(/\s+/g, ' ').trim();
  if (title.length > 0 && title.length < 200) {
    arts.push({ id: parseInt(a[1], 10), title_ar: title });
  }
}

// Atoms: القاعدة (X-Y): Title — until الشرح or مؤشرات or next القاعدة ( or المادة (
const atomRe = /القاعدة\s*\(\s*(\d+-\d+)\s*\)\s*:\s*([^]+?)(?=الشرح|مؤشرات|المادة\s*\(|القاعدة\s*\(|$)/g;
const ats = [];
let b;
while ((b = atomRe.exec(full)) !== null) {
  let title = b[2].replace(/\s+/g, ' ').trim();
  if (title.length > 0 && title.length < 250) {
    ats.push({ id: b[1], title_ar: title });
  }
}

// Build articles array with nested atoms (by article id from X in X-Y)
const articleIds = new Set(arts.map((x) => x.id));
const atomsByArticle = {};
ats.forEach((atom) => {
  const artId = parseInt(atom.id.split('-')[0], 10);
  if (!atomsByArticle[artId]) atomsByArticle[artId] = [];
  atomsByArticle[artId].push({ id: atom.id, title_ar: atom.title_ar });
});

const articles = arts.map((art) => ({
  id: art.id,
  title_ar: art.title_ar,
  atoms: (atomsByArticle[art.id] || []).sort((x, y) => x.id.localeCompare(y.id, 'en')),
}));

const json = { articles };
const outPath = path.join(__dirname, '..', 'docs', 'taxonomy-from-docx.json');
fs.writeFileSync(outPath, JSON.stringify(json, null, 2), 'utf8');
console.log('Wrote', outPath);

// Validation summary
console.log('\n--- Validation summary ---');
console.log('Articles found:', articles.length);
articles.forEach((art) => {
  const atoms = art.atoms || [];
  console.log('  Article', art.id, ':', atoms.length, 'atoms');
  if (atoms.length > 0) {
    const nums = atoms.map((x) => parseInt(x.id.split('-')[1], 10)).sort((a, b) => a - b);
    const maxN = Math.max(...nums);
    const missing = [];
    for (let i = 1; i <= maxN; i++) if (!nums.includes(i)) missing.push(art.id + '-' + i);
    if (missing.length) console.log('    Missing atom numbering:', missing.join(', '));
  }
});
const allArtIds = articles.map((x) => x.id).sort((a, b) => a - b);
const artGaps = [];
for (let i = 1; i <= Math.max(...allArtIds); i++) {
  if (!allArtIds.includes(i)) artGaps.push(i);
}
if (artGaps.length) console.log('Missing article numbers:', artGaps.join(', '));
