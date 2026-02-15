/**
 * Patch PolicyMap.json using bible_taxonomy.json as authority for Arabic titles.
 * Keeps article/atom IDs unchanged; articles 25/26 keep adminOnly/outOfScope.
 * Outputs: updated PolicyMap.json + diff report.
 */
const fs = require('fs');
const path = require('path');

const biblePath = path.join(__dirname, '..', 'docs', 'bible_taxonomy.json');
const policyPath = path.join(__dirname, '..', 'PolicyMap.json');
const reportPath = path.join(__dirname, '..', 'docs', 'policy_patch_report.md');

const bible = JSON.parse(fs.readFileSync(biblePath, 'utf8'));
const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));

const bibleByArt = new Map((bible.articles || []).map((a) => [a.id, a]));
const bibleAtomTitle = new Map();
for (const a of bible.articles || []) {
  for (const atom of a.atoms || []) {
    bibleAtomTitle.set(atom.id, atom.title_ar);
  }
}

const policyAtomIds = new Set();
const bibleAtomIds = new Set();
for (const a of bible.articles || []) {
  for (const atom of a.atoms || []) bibleAtomIds.add(atom.id);
}
for (const a of policy.articles || []) {
  for (const atom of a.atoms || []) policyAtomIds.add(atom.atomId);
}
const onlyInBible = [...bibleAtomIds].filter((id) => !policyAtomIds.has(id));
const onlyInPolicy = [...policyAtomIds].filter((id) => !bibleAtomIds.has(id));

let articleTitlesChanged = 0;
let atomTitlesChanged = 0;

const out = {
  version: policy.version,
  articles: policy.articles.map((p) => {
    const b = bibleByArt.get(p.articleId);
    let title_ar = p.title_ar;
    if (b && p.articleId >= 1 && p.articleId <= 25) {
      if (p.title_ar !== b.title_ar) {
        articleTitlesChanged++;
        title_ar = b.title_ar;
      } else {
        title_ar = b.title_ar;
      }
    }

    let atoms = p.atoms;
    if (p.atoms && p.articleId >= 4 && p.articleId <= 24) {
      atoms = p.atoms.map((pa) => {
        const bibleTitle = bibleAtomTitle.get(pa.atomId);
        const newTitle = bibleTitle != null ? bibleTitle : pa.title_ar;
        if (pa.title_ar !== newTitle) atomTitlesChanged++;
        return { atomId: pa.atomId, title_ar: newTitle };
      });
    }

    const art = { articleId: p.articleId, title_ar, atoms: atoms || [] };
    if (p.adminOnly) art.adminOnly = true;
    if (p.outOfScope) art.outOfScope = true;
    return art;
  }),
};

fs.writeFileSync(policyPath, JSON.stringify(out, null, 2), 'utf8');
console.log('Wrote', policyPath);

const report = [
  '# PolicyMap patch from bible_taxonomy.json',
  '',
  '## Diff summary',
  `- **Article titles changed:** ${articleTitlesChanged}`,
  `- **Atom titles changed:** ${atomTitlesChanged}`,
  '',
  '## Atoms in one file but not the other',
  onlyInBible.length === 0 && onlyInPolicy.length === 0
    ? '- None.'
    : [
        onlyInBible.length ? `- In bible only: ${onlyInBible.join(', ')}` : null,
        onlyInPolicy.length ? `- In PolicyMap only: ${onlyInPolicy.join(', ')}` : null,
      ]
        .filter(Boolean)
        .join('\n'),
];
fs.writeFileSync(reportPath, report.join('\n'), 'utf8');
console.log('Wrote', reportPath);
console.log('Article title changes:', articleTitlesChanged);
console.log('Atom title changes:', atomTitlesChanged);
console.log('Atoms only in bible:', onlyInBible.length ? onlyInBible.join(', ') : 'none');
console.log('Atoms only in PolicyMap:', onlyInPolicy.length ? onlyInPolicy.join(', ') : 'none');
