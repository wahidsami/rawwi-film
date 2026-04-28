# Client Dashboard Rebuild Plan

## Goal

Rebuild the current client dashboard so it matches the stronger structure of the old `FilmSaudi` production-company dashboard, while staying fully wired to the current Raawi Film backend and admin workflows.

This rebuild must:

- preserve current script/report/admin wiring
- avoid creating a parallel client-only data model
- remove client-side AI analysis access for now
- support DOCX import and manual editor input
- introduce certificate/payment lifecycle safely before touching workspace-heavy areas
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

5. Workspace stability first
   - We should delay admin/client workspace-heavy refactors until later, so the current review flow remains stable.

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
- Real payment gateway integration

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
- DOCX import path
- Paste text path
- Submit for review flow
- Safe version creation path shared with current system

### Rules

- No client AI analysis button
- Keep current import flow intact
- Upload and pasted text must normalize into the same content path
- Rich editor overhaul can be deferred

### Status

- [~] In progress

## Phase 5: Certificate And Fake Payment Foundation

### Goal

Implement the certificate business flow safely without disturbing the current admin workspace.

### Deliverables

- Certificate lifecycle states:
  - approved
  - payment pending
  - payment completed
  - certificate issued
  - certificate downloaded
- Fake/test payment experience for clients
- Payment status storage
- Certificate eligibility gating based on payment
- Client-side certificate list and pay-now entry point

### Notes

- Approval must not automatically issue the certificate.
- Fake payment should be clearly marked as test/demo.
- This phase should avoid changing admin workspace review behavior.

### Status

- [x] Completed

## Phase 6: Admin Certificate Management

### Goal

Give admin the operational tools to manage certificate issuance after approval and payment.

### Deliverables

- Admin view for certificate/payment state per approved script
- Ability to verify or confirm fake payment state
- Ability to issue/regenerate certificate
- Clear linkage between approved script and certificate record

### Notes

- This should be wired to current script approval outcomes, not to workspace findings logic.

### Status

- [x] Completed

## Phase 7: Certificate Designer Editor

### Goal

Add an admin-side certificate builder/editor after the lifecycle itself is working.

### Deliverables

- Editable certificate template system
- Admin preview flow
- Template fields/slots tied to live script/client/certificate data
- [x] Client certificate download generates a real PDF directly, not browser print/save-as-PDF.

### Important Collaboration Note

Stop here and realign with the system owner before implementation details are finalized.
At this phase, we need product direction on exactly how the certificate designer should behave and what editing controls it should expose.

### Status

- [~] In progress

## Phase 8: Shared Chapter And Scene Parsing Foundation

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
- Delay any workspace UX refactor until after parsing is safely in place.

### Status

- [ ] Not started

## Phase 9: Script Details, Notifications, And Settings Parity

### Goal

Bring the remaining old-dashboard parity into the new client area after certificate flow and parsing are stable.

### Deliverables

- Script details page
- Parsed sections view
- Notifications page
- Client settings page
- Company/profile settings alignment
- Version-aware script detail improvements where safe

### Notes

- Must stay aligned with current auth and company-account model.
- Keep deep editor/workspace enhancements out of this phase if they would destabilize review flow.

### Status

- [ ] Not started

## Phase 10: Wiring Audit And Hardening

### Goal

Verify that the rebuilt client dashboard is safely connected to the current Raawi system.

### Checklist

- [ ] Client can only access its own company data
- [ ] Script versions stay aligned between client and admin
- [ ] Imported text and edited text land in the same canonical source
- [ ] Certificate eligibility respects approval + payment state
- [ ] Client certificate downloads match admin-issued records
- [ ] Parsed sections remain linked to the right script version
- [ ] Reports/certificates/notifications reflect current backend behavior
- [ ] No hidden dependency on client-side AI analysis
- [ ] Workspace behavior remains unchanged unless explicitly enhanced later

### Status

- [ ] Not started

## Recommended Build Order

1. Phase 1: Client shell and theme foundation
2. Phase 2: Overview and navigation parity
3. Phase 3: Script list experience
4. Phase 4: New script creation with editor and import
5. Phase 5: Certificate and fake payment foundation
6. Phase 6: Admin certificate management
7. Phase 7: Certificate designer editor
8. Phase 8: Shared chapter and scene parsing foundation
9. Phase 9: Script details, notifications, and settings parity
10. Phase 10: Wiring audit and hardening

## Current Decision Log

- Client-side AI analysis is intentionally disabled for now.
- DOCX import and editor input must both be supported.
- The current import-to-admin-workspace flow must remain stable.
- Rich text editor improvements are intentionally deferred for now.
- Certificate/payment lifecycle now takes priority over parser/editor polish.
- Fake/test payment is acceptable until a real gateway is integrated.
- Certificate/payment foundation now includes:
  - client eligibility listing after admin approval
  - demo payment cards
  - payment state persistence
  - automatic certificate issuance after successful demo payment
  - client download of issued demo certificate
- Before implementing the certificate designer editor, we must stop and get product direction on its desired behavior.
- Rebuild should follow the old dashboard structure, but not copy old backend assumptions blindly.
- Shared parsing must be reusable by admin and client flows.
