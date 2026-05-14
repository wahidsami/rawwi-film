# Individual Beneficiary Rollout Plan

## Goal
Add a second beneficiary type (`individual`) alongside the existing company flow, while preserving the current company registration and dashboard behavior.

## Scope
- Registration entry split: choose `Company` or `Individual`.
- New individual registration flow (2 steps).
- Persist `beneficiary_type` (`company` / `individual`) and individual profile fields.
- Reuse same beneficiary dashboard for both types.
- Settings page adapts fields by beneficiary type.
- Admin beneficiaries list/details show beneficiary type and support filtering by type.
- Keep current approval/review/certification flow behavior unchanged.

## Assumptions
- SQL migration already applied successfully.
- Required edge functions already deployed.
- Existing company onboarding must remain backward compatible.

## Functional Requirements

### 1) Registration Entry
- On "Don't have an account? Register", show two cards/buttons:
  - Register as Company
  - Register as Individual
- Selecting Company routes to existing 3-step company form.
- Selecting Individual routes to new individual form.

### 2) Individual Registration (2 Steps)

#### Step 1: Personal Data
Required fields:
- Full name
- Date of birth
- Nationality (all countries dropdown)
- Email
- Mobile number
- City

Conditional national identifier:
- If nationality = Saudi Arabia:
  - Field label: `National ID No.`
  - Must be exactly 10 digits
  - Must start with `1`
- Else:
  - Field label: `Iqama No.`
  - Must be exactly 10 digits
  - Must start with `2`

Validation:
- All required fields enforced client-side and server-side.
- Arabic/English i18n labels and validation messages.

#### Step 2: Documents & Declarations
Required uploads:
- CV (PDF)
- National ID / Iqama document (based on nationality)

Required confirmations:
- Terms and Conditions checkbox
- General Regulations for Dramatic and Documentary Works checkbox

Submit behavior:
- Same post-submit workflow as company registration (pending review etc.).

### 3) Beneficiary Type in System
- Add/consume `beneficiary_type` everywhere relevant:
  - `company` (existing)
  - `individual` (new)
- Preserve existing records as `company` by default where needed.

### 4) Beneficiary Dashboard
- Individual users access the same dashboard sections as company users.
- Settings page must render and save the correct profile fields per type.
- Contact person email / login email remains non-editable for both flows where required.

### 5) Admin Dashboard
- Beneficiaries table shows beneficiary type.
- Type available in relevant filters.
- Beneficiary details page renders correct profile block for company vs individual.

## Implementation Phases

### Phase 1: Data Contracts & API Mapping
- Extend frontend models/types for `beneficiary_type` and individual fields.
- Update API adapters for registration payloads and profile reads/writes.
- Keep backward compatibility for company payloads.

### Phase 2: Registration UI
- Add registration chooser screen.
- Keep existing company form unchanged in behavior.
- Implement new individual 2-step form with conditional ID/Iqama field + validation.
- Wire document uploads and consent checkboxes.

### Phase 3: Dashboard Settings Adaptation
- Detect beneficiary type from profile.
- Render editable fields per type.
- Keep login email non-editable.
- Ensure updates persist through existing profile update endpoints.

### Phase 4: Admin Beneficiaries Visibility
- Add type badge/column in list.
- Add type filter in beneficiaries-related filters.
- Show correct fields in details view.

### Phase 5: QA & Regression
- Company registration still works end-to-end.
- Individual registration works end-to-end.
- ID/Iqama validations enforced both UI and backend.
- Dashboard settings save correctly for both types.
- Admin filters and details work for mixed beneficiary types.

## Test Checklist
- Register company: success path + validation failures.
- Register individual Saudi: valid `1xxxxxxxxx` accepted, invalid prefix/length rejected.
- Register individual non-Saudi: valid `2xxxxxxxxx` accepted, invalid prefix/length rejected.
- Required uploads missing => blocked submission.
- Missing checkbox consent => blocked submission.
- Admin list shows both beneficiary types.
- Admin type filter returns correct subsets.
- Individual settings shows personal fields and persists updates.

## Rollback Strategy
- UI rollback by reverting registration entry switch and individual form routes.
- API contract rollback by disabling individual payload path while preserving company path.
- Data rollback not required if schema is additive and non-breaking.

## Deployment Notes
- SQL migration: already applied (as confirmed).
- Edge functions: already deployed (as confirmed).
- Required now: web app rebuild/deploy only after code merge.

## Post-Deploy Smoke
- New registration entry displays correctly in both languages.
- New individual signup appears in admin as pending beneficiary.
- Existing company users can still login and edit settings without regression.
