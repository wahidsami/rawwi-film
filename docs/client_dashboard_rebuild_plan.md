# Client Dashboard Rebuild Plan

## Goal

Rebuild the current client dashboard so it matches the stronger structure of the old `FilmSaudi` production-company dashboard, while staying fully wired to the current Raawi Film backend and admin workflows.

This rebuild must:

- preserve current script/report/admin wiring
- avoid creating a parallel client-only data model
- remove client-side AI analysis access for now
- support DOCX import and manual editor input
- prepare shared script section parsing for future use in both client and admin flows

## Core Principles

1. One script backbone
   - Client and admin must use the same `scripts`, versions, reports, findings, and notifications backbone.

2. One normalized content source
   - Imported or pasted content should end up in one canonical editor-backed text source.

3. One parsed sections dataset
   - Chapter/scene detection should be shared and persisted, not reimplemented separately in UI.

4. Section-by-section rollout
   - We should not try to clone the old dashboard in one jump.

## Old Dashboard Areas To Replicate

From the old `FilmSaudi` producer dashboard, the relevant sections are:

- Overview
- My Scripts
- Script Details
- Add Script
- Certificates
- Notifications
- Settings

We will not expose client-side AI analysis for now.

## Out Of Scope For First Rebuild

- Client-triggered AI analysis
- Client-side policy findings review
- Client access to internal admin-only review controls
- Parallel script storage model

## Phase 1: Client Shell And Theme Foundation

### Goal

Create a proper client dashboard shell similar to the old producer dashboard, and centralize theme colors in one place.

### Deliverables

- New client dashboard layout
- Sidebar navigation
- Top header area
- Shared client theme tokens
- Route structure ready for section-based expansion

### Proposed Files

- `apps/web/src/theme/clientPortalTheme.ts`
- `apps/web/src/styles/client-portal.css`
- `apps/web/src/components/client-portal/ClientPortalLayout.tsx`
- `apps/web/src/components/client-portal/ClientPortalSidebar.tsx`
- `apps/web/src/components/client-portal/ClientPortalHeader.tsx`

### Notes

- Colors must be controlled from one source only.
- All client pages should consume shared theme tokens instead of embedding custom colors.

### Status

- [x] Completed

## Phase 2: Overview And Navigation Parity

### Goal

Replace the current narrow portal landing experience with a real client dashboard overview.

### Deliverables

- Overview page
- Summary cards
- Recent scripts block
- Quick actions
- Navigation to scripts, certificates, notifications, settings

### Notes

- This should visually resemble the old dashboard behavior, but use current live Raawi data.

### Status

- [x] Completed

## Phase 3: Script List Experience

### Goal

Bring the client script area closer to the old dashboard structure.

### Deliverables

- Script list page
- Search and filter support
- Script status badges
- Row actions
- Certificate access where available

### Notes

- This should reuse current script/report APIs.
- We should not fork script listing logic from admin unnecessarily.

### Status

- [x] Completed

## Phase 4: New Script Creation With Editor And Import

### Goal

Let clients create scripts using either:

- DOCX import
- direct copy/paste into editor
- manual editing in editor

### Deliverables

- New add-script page for clients
- Metadata form
- Rich text or structured editor
- DOCX import path
- Paste text path
- Save draft support
- Submit for review flow

### Rules

- No client AI analysis button
- Editor becomes the canonical content surface
- Upload and pasted text must normalize into the same content path

### Status

- [~] In progress

## Phase 5: Shared Chapter And Scene Parsing Foundation

### Goal

Recreate the old section-splitting behavior in a way that is reusable across the whole system.

### Deliverables

- Shared parsing utility/service
- Detection for:
  - chapter markers
  - scene markers
  - screenplay heading patterns
  - `داخلي / خارجي` style scene headers
- Persisted parsed sections

### Proposed Database Addition

Suggested table:

- `script_sections`

Suggested columns:

- `id`
- `script_id`
- `script_version_id`
- `section_type`
- `section_order`
- `title`
- `header_text`
- `content_text`
- `start_offset`
- `end_offset`
- `start_line`
- `end_line`
- `page_number`
- `metadata_json`
- timestamps

### Notes

- This parsing layer should be shared by client and admin.
- Do not leave parsing as UI-only behavior.

### Status

- [ ] Not started

## Phase 6: Script Details And Version-Aware Editing

### Goal

Give clients a richer script details page similar to the old producer dashboard, but connected to the current system.

### Deliverables

- Script details page
- Metadata display
- Editor view/edit mode
- Parsed sections view
- Version-aware content handling
- Resubmit flow if applicable

### Notes

- This phase depends on Phase 4 and Phase 5.

### Status

- [ ] Not started

## Phase 7: Certificates, Notifications, Settings

### Goal

Bring the rest of the old dashboard parity into the new client area.

### Deliverables

- Certificates page
- Notifications page
- Client settings page
- Company/profile settings alignment

### Notes

- Must stay aligned with current auth and company-account model.

### Status

- [ ] Not started

## Phase 8: Wiring Audit And Hardening

### Goal

Verify that the rebuilt client dashboard is safely connected to the current Raawi system.

### Checklist

- [ ] Client can only access its own company data
- [ ] Script versions stay aligned between client and admin
- [ ] Imported text and edited text land in the same canonical source
- [ ] Parsed sections remain linked to the right script version
- [ ] Reports/certificates/notifications reflect current backend behavior
- [ ] No hidden dependency on client-side AI analysis

### Status

- [ ] Not started

## Recommended Build Order

1. Phase 1: Client shell and theme foundation
2. Phase 2: Overview and navigation parity
3. Phase 3: Script list experience
4. Phase 4: New script creation with editor and import
5. Phase 5: Shared chapter and scene parsing foundation
6. Phase 6: Script details and version-aware editing
7. Phase 7: Certificates, notifications, settings
8. Phase 8: Wiring audit and hardening

## Current Decision Log

- Client-side AI analysis is intentionally disabled for now.
- DOCX import and editor input must both be supported.
- Rebuild should follow the old dashboard structure, but not copy old backend assumptions blindly.
- Shared parsing must be reusable by admin and client flows.
