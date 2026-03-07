# Glossary Section – Audit

Audit of the Glossary (Lexicon Management) section: issues found and fixes applied.

---

## Summary

- **Access:** Super Admin, Admin, Regulator only (role check + `manage_glossary` on route).
- **Data:** `lexiconTerms` and add/update/deactivate via `dataStore` and `lexiconApi`; history is fetched per term when opening the History modal.
- **Settings:** CSV Import/Export buttons are gated by `settings?.features?.enableLexiconCsv !== false` (Phase 3). PDF export uses `settings?.platform?.dateFormat` and locale.

---

## Issues Found and Fixed

### 1. HistoryModal: `settings` undefined (bug)

- **Issue:** `HistoryModal` used `settings?.platform?.dateFormat` in `formatDate()` but did not call `useSettingsStore()`, so `settings` was undefined and could cause a ReferenceError when the modal had entries.
- **Fix:** Added `const { settings } = useSettingsStore();` inside `HistoryModal`.

### 2. HistoryModal: History never loaded

- **Issue:** History was read from `useDataStore().lexiconHistory`, which is never populated (initial data only loads `lexiconTerms`, not history). The History modal always showed “No history found”.
- **Fix:** `HistoryModal` now fetches history when opened: `useEffect` calls `lexiconApi.getHistory(termId)` and keeps the result in local state. Added a loading state and error handling (fallback to empty list).

### 3. TermModal: Duplicate check on edit

- **Issue:** When editing an existing term, the duplicate check did not exclude the current term. Saving without changing the term text could trigger “Term already exists”.
- **Fix:** Duplicate check now excludes the current term: `lexiconTerms.some(t => t.id !== termId && t.is_active && t.normalized_term === normalized)`.

### 4. Localization

- **Article column:** The table cell used hardcoded “المادة” for the article label. Replaced with `t('article')` so it respects locale.
- **History modal “by” label:** The “بواسطة:” label was hardcoded. Replaced with `t('byUser')`. Also escaped the change reason quotes as `&quot;` for safe HTML.

### 5. Category filter incomplete

- **Issue:** The category filter dropdown had only: all, profanity, sexual, drugs, violence. The Add/Edit form also has “discrimination” and “other”, so terms in those categories could not be filtered by category.
- **Fix:** Added “discrimination” and “other” to the category filter options.

---

## Not Changed (by design or deferred)

- **Import CSV / Export CSV:** Buttons are visible when `enableLexiconCsv !== false` but have no `onClick` handlers. Left as placeholders for future implementation.
- **PDF export template:** Fetches `/templates/glossary-report-template.html` from `public/`; no change.
- **Escape:** PDF export already uses `escapeHtmlSafe()` from `@/utils/escapeHtml` for user content.
- **LexiconTerm categories:** Model allows more categories (e.g. gambling, blasphemy, misogyny); form and filter only expose a subset. No change in this audit.

---

## Files Touched

- `apps/web/src/pages/Glossary.tsx`: HistoryModal (settings, fetch history, loading, `t('byUser')`), TermModal duplicate check, article cell `t('article')`, category filter options, `lexiconApi` and `LexiconHistoryEntry` import.

---

## How to Verify

1. **History:** As Admin/Regulator, open Glossary → click “History” on a term. Dates should use platform date format; “By:” should be localized; list should load from API (or show “No history found” if none).
2. **Edit duplicate:** Edit a term and save without changing the term text; it should save without “Term already exists”.
3. **Article column:** Switch language; article column header and cell label should follow locale.
4. **Category filter:** Add a term with category “discrimination” or “other”; filter by that category and confirm the term appears.
