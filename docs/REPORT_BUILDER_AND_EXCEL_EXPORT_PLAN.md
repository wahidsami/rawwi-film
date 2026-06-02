# Report Builder And Excel Export Plan

## Status
- Phase 1 delivered: builder page, CSV export, Excel export, saved templates, PDF export.
- Phase 2 delivered: Audit source with search, filters, PDF/Excel/CSV export, and template support.
- Next planned source expansion: findings / revision cycles.

## Goal
Create a dedicated admin section for building reports from the system data we already have, with the ability to export the result as:
- PDF for formal sharing
- Excel for analysis and offline filtering
- CSV as a lightweight fallback

The new section should separate:
- `Reports` for script/report documents
- `Performance` for user and team performance
- `Report Builder` for ad-hoc, admin-defined exports and custom data views

## Product Direction
The builder should let an admin:
1. Choose a data source.
2. Filter the dataset.
3. Pick which columns to include.
4. Preview the rows in a table.
5. Export the result in one or more formats.
6. Save the configuration later as a reusable template.

The first release should be practical and stable, not overly complex.

## Initial Data Sources
Use the data we already have in the frontend APIs:
- Scripts
- Reports
- Performance / internal users

Future sources can include:
- Audit events
- Findings
- Revision cycles
- Certificates
- Beneficiaries / clients

## Report Builder UX
### Entry Points
- Admin sidebar item: `Report Builder`
- Optional overview shortcut card later

### Builder Screen
The page should include:
- Source selector
- Search box
- Date range filter
- Status filter
- Role filter when relevant
- Column selector
- Live preview table
- Summary cards for totals
- Export buttons

### Detail Page
If the admin clicks a row in a user/performance-style source:
- Open a detail page
- Show summary cards
- Show filtered rows
- Provide a `Back` button
- Allow PDF / Excel / CSV export from the detail view

## Export Modes
### PDF
- Best for executive sharing
- Branded
- Print friendly

### Excel
- Best for analysis
- One workbook per export
- Multiple sheets where useful
- Use readable headers, filters, and date formatting

### CSV
- Fallback export
- Fast and lightweight

## Excel Workbook Design
The workbook should be generated from the same normalized report model used for the preview.

Recommended workbook structure:
- `Summary`
- `Rows`
- `Timeline` or `Cycles` when available

Basic formatting:
- frozen header row
- auto-filter
- readable date/time values
- simple column widths

## Technical Approach
### Frontend-First Builder
The first version can run entirely from the admin UI using existing APIs:
- `scriptsApi.getScripts()`
- `reportsApi.listAll()`
- `usersApi.getUsers()`
- `reportsApi.getRegulatorPerformance()`

This avoids a new backend contract while proving the UX.

### Export Helpers
Add reusable helpers for:
- CSV generation
- XLSX generation
- optional PDF export reuse later

### XLSX Generation
Use the existing `jszip` dependency to generate a valid `.xlsx` workbook without adding a new package.

## Permissions
The builder should be visible only to internal admins:
- `Super Admin`
- `Admin`

Recommended gating:
- sidebar visibility: admin roles only
- route protection: `manage_users` or a dedicated builder permission later

## Phase Plan
### Phase 1 - Foundation
- Add the `Report Builder` page
- Add sidebar and route
- Add source selector and filters
- Add preview table
- Add CSV and Excel exports

### Phase 2 - Presets
- Add saved templates
- Add quick presets for common reports
- Add export naming conventions

### Phase 3 - Deeper Sources
- Add audit/finding/revision-cycle sources
- Add grouped summaries
- Add chart views

### Phase 4 - PDF Parity
- Add a polished PDF export for builder-generated reports
- Reuse the same normalized data contract

## Acceptance Criteria
- Admin can open a new `Report Builder` section.
- Admin can choose at least one source and filter it.
- Admin can preview the result in a table.
- Admin can export the same result as CSV and Excel.
- Excel export opens correctly in spreadsheet software.
- The existing `Reports` and `Performance` sections remain intact.

## Notes
- The first version should be useful even without saved templates.
- Keep the UI simple enough that admins can understand it without training.
- Prefer a few strong built-in sources over a noisy “everything at once” screen.
