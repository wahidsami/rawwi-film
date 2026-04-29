# Admin Theme Alignment Plan - 2026-04-29

## Goal

Apply the stronger client dashboard visual system to the admin dashboard across shell, navigation, shared controls, and all admin pages, while preserving current routes, permissions, workflows, and workspace stability.

## Current Client Dashboard Theme

The client portal theme is currently implemented mainly in:

- `apps/web/src/styles/client-portal.css`
- `apps/web/src/components/client-portal/ClientPortalLayout.tsx`
- `apps/web/src/pages/ClientPortal.tsx`
- `apps/web/src/components/client-portal/ClientCertificatesSection.tsx`

Key characteristics:

- Scoped theme wrapper: `.client-portal-theme`
- Palette:
  - primary `#672a55`
  - primary hover `#7d3566`
  - secondary `#76b6b7`
  - background `#f5f3f8`
  - surface `#ffffff`
  - border `#e6deea`
  - main text `#1f1724`
  - muted text `#74697a`
  - success `#1f9d69`
  - warning `#c68a17`
  - error `#cb4a59`
  - info `#4f6ef7`
- Shell background:
  - soft radial color fields
  - light vertical background gradient
  - warmer, more branded surface than the current admin dashboard
- Panels:
  - translucent white surfaces
  - blur/backdrop effect
  - soft borders
  - larger radius than admin cards
  - deeper but soft shadows
- Navigation:
  - collapsible sidebar
  - active item rail indicator
  - icon block per nav item
  - descriptive labels when expanded
  - horizontal mobile navigation
- Page style:
  - card-based operational sections
  - compact but polished metric cards
  - status badges using semantic colors
  - consistent spacing and page rhythm

## Current Admin Dashboard Theme

The admin shell is currently implemented mainly in:

- `apps/web/src/layout/AppLayout.tsx`
- `apps/web/src/index.css`
- shared primitives in `apps/web/src/components/ui/*`
- admin pages in `apps/web/src/pages/*`

Current characteristics:

- Global root theme is still green/yellow:
  - primary `#21945F`
  - primary hover `#0F4731`
  - secondary `#F4BE19`
- Shell is flatter:
  - solid background
  - plain white sidebar
  - plain topbar
  - smaller radius navigation items
  - no branded background treatment
- Shared UI primitives already use tokens (`--primary`, `--surface`, `--border`, etc.), which is good.
- Many admin pages use shared `Card`, `Button`, `Badge`, `Input`, `Select`, and `Modal`, but several pages also have local one-off classes for cards, tables, filters, icon buttons, status chips, and nested panels.
- Workspace-heavy pages (`ScriptWorkspace.tsx`, `Results.tsx`) are very large and should be handled carefully after the shell and shared primitives are stable.

## Main Design Decision

Use one shared Raawi Film dashboard identity for both client and admin, not two competing palettes.

Recommended shared palette should start from the client portal values because that is the newer, richer dashboard direction:

```css
--primary: #672a55;
--primary-hover: #7d3566;
--secondary: #76b6b7;
--background: #f5f3f8;
--surface: #ffffff;
--border: #e6deea;
--text-main: #1f1724;
--text-muted: #74697a;
--success: #1f9d69;
--warning: #c68a17;
--error: #cb4a59;
--info: #4f6ef7;
```

## Target Architecture

### 1. Shared Theme CSS

Create a shared dashboard theme file:

- `apps/web/src/styles/dashboard-theme.css`

Move reusable client portal tokens and shell helpers into shared classes:

- `.dashboard-theme`
- `.dashboard-shell`
- `.dashboard-panel`
- `.dashboard-sidebar-link`
- `.dashboard-hero`
- `.dashboard-stat-card`
- `.dashboard-page-header`
- `.dashboard-table`
- `.dashboard-toolbar`
- `.dashboard-empty-state`

Then keep client-specific aliases temporarily:

- `.client-portal-theme`
- `.client-portal-shell`
- `.client-portal-panel`

These can point to the shared classes or reuse the same token definitions until the client portal is refactored.

### 2. Global Font Strategy

Replace the external Google Fonts import in `apps/web/src/index.css` with local `@font-face` declarations from:

- `apps/web/public/fonts/Cairo-Regular.ttf`
- `apps/web/public/fonts/Cairo-Bold.ttf`
- `apps/web/public/fonts/Roboto-Regular.ttf`
- `apps/web/public/fonts/Roboto-Bold.ttf`

Recommended default:

- Arabic: Cairo
- English: Roboto

This keeps admin/client UI and certificates independent from external font CDNs.

### 3. Admin Shell Migration

Update `apps/web/src/layout/AppLayout.tsx` to match the client portal shell behavior:

- Wrap admin app with `.dashboard-theme.dashboard-shell`
- Convert the plain sidebar into a dashboard panel
- Add larger rounded sidebar container
- Add active rail indicator for nav items
- Add icon block styling like the client portal
- Add optional descriptive nav labels for expanded admin nav
- Keep existing permission and feature-toggle logic unchanged
- Keep collapsed sidebar behavior and localStorage key
- Convert topbar into a soft dashboard panel
- Preserve notifications, language toggle, user menu, and logout behavior
- Add mobile horizontal nav equivalent if needed

### 4. Shared UI Primitive Migration

Update shared components once, then pages inherit most of the new theme:

- `Button.tsx`
  - align radius, hover, and focus states with client portal
  - keep variants stable
  - use `me-2` for loading icon instead of `mr-2` for RTL correctness
- `Card.tsx`
  - use the softer panel border/shadow/radius
  - consider a `variant="panel" | "stat" | "plain"` only if needed
- `Badge.tsx`
  - keep semantic colors, align with client palette
- `Input.tsx` and `Select.tsx`
  - use updated border/focus/background
- `Modal.tsx`
  - replace heavy secondary overlay with neutral dark overlay
  - align modal radius and shadow with dashboard panels

### 5. Admin Page Migration Order

Use a phased rollout to avoid breaking complex workflows.

#### Phase A: Low-Risk Shell And Shared Components

Files:

- `apps/web/src/index.css`
- `apps/web/src/styles/dashboard-theme.css`
- `apps/web/src/styles/client-portal.css`
- `apps/web/src/layout/AppLayout.tsx`
- `apps/web/src/components/ui/Button.tsx`
- `apps/web/src/components/ui/Card.tsx`
- `apps/web/src/components/ui/Badge.tsx`
- `apps/web/src/components/ui/Input.tsx`
- `apps/web/src/components/ui/Select.tsx`
- `apps/web/src/components/ui/Modal.tsx`

Expected result:

- Admin shell immediately feels like the client dashboard.
- Most simple pages inherit better cards/buttons/forms without page rewrites.

#### Phase B: Standard Admin Pages

Files:

- `apps/web/src/pages/Overview.tsx`
- `apps/web/src/pages/Clients.tsx`
- `apps/web/src/pages/Scripts.tsx`
- `apps/web/src/pages/ClientSubmissions.tsx`
- `apps/web/src/pages/Reports.tsx`
- `apps/web/src/pages/Tasks.tsx`
- `apps/web/src/pages/Audit.tsx`
- `apps/web/src/pages/AccessControl.tsx`
- `apps/web/src/pages/Certificates.tsx`
- `apps/web/src/pages/CertificateDesigner.tsx`
- `apps/web/src/pages/Settings.tsx`

Tasks:

- Standardize page headers.
- Standardize stat cards.
- Standardize filter/toolbars.
- Standardize table containers.
- Replace local hard-coded green/red/amber utility colors with semantic tokens where possible.
- Remove nested-card appearances where they are only decorative.
- Ensure mobile wrapping and text overflow behave cleanly.

#### Phase C: Glossary And Dense Tables

Files:

- `apps/web/src/pages/Glossary.tsx`

Tasks:

- Convert custom table shell to shared dashboard table style.
- Align CSV/import/history modals with updated modal/form system.
- Keep glossary workflows unchanged.

#### Phase D: Workspace And Results

Files:

- `apps/web/src/pages/ScriptWorkspace.tsx`
- `apps/web/src/pages/Results.tsx`
- report download components if visible UI is affected

Tasks:

- Avoid broad refactors.
- Theme outer shell, headers, toolbars, tabs, cards, and side panels first.
- Leave document viewer/A4 rendering and highlight behavior untouched unless specifically tested.
- Use screenshots/manual testing before committing large visual changes.

## Specific Admin Issues To Address

- Admin dashboard currently does not use the client portal's radial background or panel treatment.
- Admin sidebar nav is functional but visually older and less descriptive.
- Admin topbar is plain and visually separated from the richer client portal.
- Global theme still points to the old green identity.
- Shared UI components use old radius/shadow values.
- Several admin pages manually style tables and panels instead of using a shared table/panel language.
- Some page sections use `bg-background` inside cards, which can feel flat after the new theme unless standardized.
- Modal overlay uses `bg-secondary/80`, which may become visually too strong under the client palette.
- Current Google Fonts import creates an external dependency; should be replaced with local font-face.

## Implementation Checklist

- [ ] Add local `@font-face` rules for Cairo and Roboto.
- [ ] Remove Google Fonts import from `index.css`.
- [ ] Add shared dashboard theme CSS.
- [ ] Update client portal CSS to share or mirror dashboard theme tokens.
- [ ] Update admin `AppLayout` shell.
- [ ] Update shared UI primitives.
- [ ] Run web build.
- [ ] Redeploy `web` in Coolify.
- [ ] Migrate standard admin pages.
- [ ] Run web build after each page family.
- [ ] Redeploy `web` after each merged step.
- [ ] Migrate glossary page.
- [ ] Migrate workspace/results carefully with focused visual checks.

## Verification Plan

For each phase:

- Run `npm run build --workspace=web`.
- Check admin routes:
  - `/app`
  - `/app/clients`
  - `/app/scripts`
  - `/app/client-submissions`
  - `/app/reports`
  - `/app/glossary`
  - `/app/certificates`
  - `/app/certificates/templates/:templateId/designer`
  - `/app/settings`
  - `/app/scripts/:id/workspace`
- Check client route:
  - `/client`
- Test both Arabic and English.
- Test collapsed and expanded sidebars.
- Test desktop and mobile widths.
- Test modal open/close behavior.
- Test tables with long Arabic text.
- Test certificate designer canvas after theme changes.

## Deployment Notes

Most changes in this plan are frontend-only.

Redeploy in Coolify:

- `web`

Supabase migrations or edge function redeploys are not needed unless a later phase changes certificate/template backend behavior.

