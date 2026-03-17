# Glossary CSV import / export

Columns (header row, UTF-8). **Export** matches **Add term** + DB fields.

| Column | Required | Description |
|--------|----------|-------------|
| `canonical_atom` | *Yes* (unless `gcam_article_id` set) | e.g. `INSULT`, `VIOLENCE`, `SEXUAL`, `SUBSTANCES`, … (same as Glossary dropdown). |
| `term` | **Yes** | Main term to match. |
| `term_variants` | No | Extra forms, **pipe-separated**: `يضرب|تضرب|ضربا` |
| `term_type` | No | `word` (default), `phrase`, `regex` |
| `category` | No | e.g. `violence`, `profanity`, `other` |
| `severity_floor` | No | `low`, `medium`, `high`, `critical` |
| `enforcement_mode` | No | `soft_signal`, `mandatory_finding` |
| `gcam_article_id` | If no `canonical_atom` | Article number 1–26 |
| `gcam_atom_id` | No | e.g. `4-1` |
| `gcam_article_title_ar` | No | Filled from policy if empty when using `canonical_atom` |
| `description` | No | |
| `example_usage` | No | |

**Import:** Glossary → **Import CSV**. Use **CSV template** for an example row.

**Export:** Exports current **filtered** list (respects search/filters).
