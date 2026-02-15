/**
 * Validate PolicyMap.json against the official methodology DOCX.
 * 1) Parse DOCX → extract articles + atoms (المادة N, N-X patterns).
 * 2) Compare vs PolicyMap: missing, extra, title mismatches, numbering gaps.
 * 3) Output: docs/bible_taxonomy.json, docs/policy_diff.md
 */
const fs = require('fs');
const path = require('path');

const docxPath = path.join(__dirname, '..', '_docx_extract', 'word', 'document.xml');
const policyPath = path.join(__dirname, '..', 'PolicyMap.json');
const outBible = path.join(__dirname, '..', 'docs', 'bible_taxonomy.json');
const outDiff = path.join(__dirname, '..', 'docs', 'policy_diff.md');

if (!fs.existsSync(docxPath)) {
  console.error('DOCX not extracted. Unzip the .docx to _docx_extract/ first.');
  process.exit(1);
}

const xml = fs.readFileSync(docxPath, 'utf8');
const texts = [];
const re = /<w:t[^>]*>([^<]*)<\/w:t>/g;
let m;
while ((m = re.exec(xml)) !== null) texts.push(m[1]);
const full = texts.join('');

// --- 1) Extract articles: المادة (N): Title (title stops at الهدف or \d+-\d+ or next المادة/القاعدة)
const artRe = /المادة\s*\(\s*(\d+)\s*\)\s*:\s*([^]+?)(?=الهدف|\d+-\d+\s|\s*المادة\s*\(|\s*القاعدة\s*\()/g;
const arts = [];
let a;
while ((a = artRe.exec(full)) !== null) {
  let title = a[2].replace(/\s+/g, ' ').trim();
  if (title.length > 0 && title.length < 300) {
    arts.push({ id: parseInt(a[1], 10), title_ar: title });
  }
}

// --- 2) Extract atoms: two patterns
// A) القاعدة (N-X): Title
const ruleRe = /القاعدة\s*\(\s*(\d+-\d+)\s*\)\s*:\s*([^]+?)(?=الشرح|مؤشرات|المادة\s*\(|القاعدة\s*\(|$)/g;
const atomsA = [];
let r;
while ((r = ruleRe.exec(full)) !== null) {
  let title = r[2].replace(/\s+/g, ' ').trim();
  if (title.length > 0 && title.length < 280) atomsA.push({ id: r[1], title_ar: title });
}

// B) Standalone N-X Title (e.g. article 4: "4-1 الإخلال...") — title until المقصود or الشرح or next N-X
const standaloneRe = /(\d+)-(\d+)\s+([^]+?)(?=المقصود|الشرح|مؤشرات|\d+-\d+\s|المادة\s*\(|القاعدة\s*\()/g;
const atomsB = [];
let b;
while ((b = standaloneRe.exec(full)) !== null) {
  const id = b[1] + '-' + b[2];
  let title = b[3].replace(/\s+/g, ' ').trim();
  if (title.length > 0 && title.length < 280) atomsB.push({ id, title_ar: title });
}

// Merge atoms: prefer A (القاعدة) when same id exists in both; add B-only ids
const atomMap = new Map();
atomsA.forEach((x) => atomMap.set(x.id, x));
atomsB.forEach((x) => {
  if (!atomMap.has(x.id)) atomMap.set(x.id, x);
});

// Build articles with nested atoms (by first number in id)
const atomsByArticle = {};
for (const [id, obj] of atomMap) {
  const artId = parseInt(id.split('-')[0], 10);
  if (!atomsByArticle[artId]) atomsByArticle[artId] = [];
  atomsByArticle[artId].push({ id: obj.id, title_ar: obj.title_ar });
}
for (const k of Object.keys(atomsByArticle)) {
  atomsByArticle[k].sort((x, y) => x.id.localeCompare(y.id, 'en'));
}

// Ensure all article ids from arts have an entry; add article 4 if we have atoms but no article (doc might list 4 after 3)
const articleIds = new Set(arts.map((x) => x.id));
const allAtomArtIds = new Set(Object.keys(atomsByArticle).map(Number));
for (const aid of allAtomArtIds) {
  if (!articleIds.has(aid)) {
    const artTitle = aid === 4 ? 'ضوابط المحتوى الإعلامي — تفصيل القواعد الفرعية' : `المادة ${aid}`;
    arts.push({ id: aid, title_ar: artTitle });
  }
}
arts.sort((x, y) => x.id - y.id);

const bibleArticles = arts.map((art) => ({
  id: art.id,
  title_ar: art.title_ar,
  atoms: (atomsByArticle[art.id] || []).map((x) => ({ id: x.id, title_ar: x.title_ar })),
}));

const bible = { source: 'docx', articles: bibleArticles };
fs.writeFileSync(outBible, JSON.stringify(bible, null, 2), 'utf8');
console.log('Wrote', outBible);

// --- 3) Load PolicyMap and compare
const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
const policyArticles = policy.articles || [];

const policyByArt = new Map(policyArticles.map((a) => [a.articleId, a]));
const bibleByArt = new Map(bibleArticles.map((a) => [a.id, a]));

const lines = [];
lines.push('# PolicyMap vs DOCX (bible) taxonomy diff');
lines.push('');
lines.push('## 1. Missing in PolicyMap (in DOCX only)');
const missingArts = bibleArticles.filter((a) => !policyByArt.has(a.id));
if (missingArts.length) {
  missingArts.forEach((a) => lines.push(`- **Article ${a.id}**: ${a.title_ar}`));
} else lines.push('- None.');
lines.push('');

lines.push('## 2. Extra in PolicyMap (not in DOCX)');
const extraArts = policyArticles.filter((a) => a.articleId !== 25 && a.articleId !== 26 && !bibleByArt.has(a.articleId));
if (extraArts.length) {
  extraArts.forEach((a) => lines.push(`- **Article ${a.articleId}**: ${a.title_ar}`));
} else lines.push('- None (excluding Art 25/26).');
lines.push('');

lines.push('## 3. Article title mismatches');
for (const art of bibleArticles) {
  const p = policyByArt.get(art.id);
  if (p && p.title_ar !== art.title_ar) {
    lines.push(`- **Article ${art.id}**`);
    lines.push(`  - DOCX: ${art.title_ar}`);
    lines.push(`  - PolicyMap: ${p.title_ar}`);
  }
}
lines.push('');

lines.push('## 4. Missing atoms in PolicyMap (in DOCX only)');
for (const art of bibleArticles) {
  const p = policyByArt.get(art.id);
  if (!p) continue;
  const bibleIds = new Set((art.atoms || []).map((x) => x.id));
  const policyIds = new Set((p.atoms || []).map((x) => x.atomId));
  const missing = [...bibleIds].filter((id) => !policyIds.has(id));
  if (missing.length) {
    lines.push(`- **Article ${art.id}**: ${missing.join(', ')}`);
    (art.atoms || []).filter((x) => missing.includes(x.id)).forEach((x) => {
      lines.push(`  - ${x.id}: ${x.title_ar}`);
    });
  }
}
lines.push('');

lines.push('## 5. Extra atoms in PolicyMap (not in DOCX)');
for (const p of policyArticles) {
  if (p.articleId === 25 || p.articleId === 26) continue;
  const art = bibleByArt.get(p.articleId);
  const policyIds = new Set((p.atoms || []).map((x) => x.atomId));
  const bibleIds = new Set((art?.atoms || []).map((x) => x.id));
  const extra = [...policyIds].filter((id) => !bibleIds.has(id));
  if (extra.length) {
    lines.push(`- **Article ${p.articleId}**: ${extra.join(', ')}`);
    (p.atoms || []).filter((x) => extra.includes(x.atomId)).forEach((x) => {
      lines.push(`  - ${x.atomId}: ${x.title_ar}`);
    });
  }
}
lines.push('');

lines.push('## 6. Atom title mismatches (same id, different title)');
for (const art of bibleArticles) {
  const p = policyByArt.get(art.id);
  if (!p) continue;
  const bibleAtoms = new Map((art.atoms || []).map((x) => [x.id, x.title_ar]));
  (p.atoms || []).forEach((pa) => {
    const docTitle = bibleAtoms.get(pa.atomId);
    if (docTitle != null && docTitle !== pa.title_ar) {
      lines.push(`- **${pa.atomId}**`);
      lines.push(`  - DOCX: ${docTitle}`);
      lines.push(`  - PolicyMap: ${pa.title_ar}`);
    }
  });
}
lines.push('');

lines.push('## 7. Numbering gaps (DOCX)');
for (const art of bibleArticles) {
  const atoms = art.atoms || [];
  if (atoms.length === 0) continue;
  const nums = atoms.map((x) => parseInt(x.id.split('-')[1], 10)).sort((a, b) => a - b);
  const maxN = Math.max(...nums);
  const gaps = [];
  for (let i = 1; i <= maxN; i++) if (!nums.includes(i)) gaps.push(art.id + '-' + i);
  if (gaps.length) lines.push(`- **Article ${art.id}**: missing ${gaps.join(', ')}`);
}
lines.push('');

lines.push('## 8. Recommended fixes');
lines.push('Apply to PolicyMap.json as needed:');
lines.push('- Add any missing articles/atoms from DOCX.');
lines.push('- Align atom titles to DOCX where wording differs (keep PolicyMap wording if intentional paraphrase).');
lines.push('- Remove or comment extra atoms only if confirmed not in methodology.');
lines.push('- Article 25/26: keep as admin/out-of-scope; not required in DOCX taxonomy.');

fs.writeFileSync(outDiff, lines.join('\n'), 'utf8');
console.log('Wrote', outDiff);
