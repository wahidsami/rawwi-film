# Formal Response to SITICH Security Claims

## RaawiFilm Platform — Technical Clarification and Validation Position

- **Date:** 2026-03-08
- **Prepared by:** RaawiFilm technical team
- **Purpose:** Provide a polite, evidence-based response to SITICH claims tested on the current VPS validation environment.

---

## 1) Respectful Acknowledgement

We appreciate SITICH's assessment effort and agree that cybersecurity review is important.  
We also confirm that the tested environment is a **current validation/testing phase on VPS**, while the planned production model is:

- deployment in a **local/internal server environment**,
- operation under the Saudi entity's infrastructure governance,
- and migration to/with **local AI model integration** in later phases.

This distinction is essential for interpreting risk conclusions fairly.

---

## 2) Scope Clarification (What can and cannot be concluded)

### 2.1 What SITICH likely observed

- Runtime behavior of the currently exposed VPS environment.
- External perimeter characteristics (DNS/CDN/proxy visibility).
- Public attack-surface assumptions based on internet-facing deployment.

### 2.2 What requires additional proof before final conclusion

- Data residency (actual DB/storage region and transfer pathways).
- Internal network architecture controls planned for final local deployment.
- Full legal applicability under PDPL/CST/NCA for final production context.
- Whether detected weaknesses are code-level systemic or VPS-specific configuration drift.

---

## 3) Position on Core Question

### "Is it valid to apply strong security procedures now if the system will later be local/internal?"

**Yes — absolutely valid and recommended.**

Even for future internal/local deployments, security controls should be built early because:

- secure-by-design reduces rework before go-live,
- insider/lateral-movement risks remain relevant in internal environments,
- compliance readiness is easier when controls are already embedded,
- local AI deployments still require strict access, logging, and governance.

So the right approach is:

- maintain high security baseline now,
- separate temporary VPS exposure risks from final architecture risks,
- and track remediation as part of production-readiness gates.

---

## 4) Claim Validation Summary (Polite and Evidence-Based)

| Claim Theme | Team Position |
|---|---|
| "System has major legal/cyber risk" | **Partially valid as a caution**, but too broad without full technical/legal audit of final architecture. |
| "Hosted outside Saudi" | **Likely true for current VPS phase** (if externally hosted); **not final production design**. |
| "Data stored outside Saudi" | **Not confirmed as a universal fact** without verified DB/storage residency mapping. |
| "Origin hidden/unknown" | **Plausible/normal** behind CDN or reverse proxy; not by itself a vulnerability. |
| "API lacks protection" | **Overstated globally**; core auth exists in code and APIs reject unauthenticated calls. |
| "No WAF" | **Not conclusively proven** from code-only review; edge behavior may indicate existing perimeter controls depending on deployment path. |
| "No monitoring" | **Partially valid**; audit logging exists, but alerting/SOC maturity can be strengthened. |
| "NCA/PDPL/CST non-compliance" | **Requires formal compliance/legal assessment** against final production architecture, not only current VPS state. |
| "Immediate migration within 30–60 days" | **Policy recommendation**, not technical fact; timeline should follow business/compliance readiness plan. |
| Commercial capability claims | **Outside technical verifiability**. |

---

## 5) Code/API Ground Truth (Repository-Based)

Based on repository controls reviewed:

- Authentication checks exist in shared edge function auth flow and core APIs.
- Role/permission logic and RLS policies are present for key workflows.
- Audit event logging exists and is integrated in multiple function paths.

At the same time, hardening opportunities remain:

- ensure object-level authorization consistency on all sensitive mutation endpoints,
- increase rate-limit coverage beyond selected flows,
- strengthen security alerting/incident telemetry.

This means the correct classification is:

- **not "fully insecure",**
- and not "fully complete security maturity" either.

A balanced rating is **medium risk with targeted hardening plan**.

---

## 6) Why VPS Findings May Differ from Final Internal Deployment

SITICH tested a live VPS phase. That can produce valid observations for that phase, but not necessarily for final design because:

- VPS/network/CDN/firewall settings can differ from final government internal infrastructure.
- Secrets, policy routing, and private segmentation can differ per environment.
- Runtime services may include temporary integrations not part of final architecture.

Therefore, conclusions should be split into:

1. **Current VPS exposure findings**, and
2. **Final production readiness findings** (to be validated against internal deployment controls).

---

## 7) Recommended Professional Closing to SITICH

We recommend replying with this tone:

> We value your assessment and agree on the importance of cybersecurity controls.  
> The tested VPS environment is a temporary validation phase and not the final production architecture.  
> Final production is planned for local/internal deployment with local AI integration under Saudi entity controls.  
> We request an updated report that clearly separates (a) verified facts, (b) assumptions, (c) legal interpretations, and (d) recommendations, and maps each item to evidence and environment scope.

---

## 8) Team Commitments (Constructive Next Steps)

To move forward constructively, we commit to:

- keeping security controls active in current phases,
- maintaining a remediation backlog for confirmed hardening items,
- performing environment-specific security validation before production cutover,
- and completing compliance/legal review with official policy mapping for final deployment.

---

## 9) Final Statement

SITICH raised useful risk signals, but several conclusions should be reframed as conditional and environment-dependent.  
Our technical position is that the platform has meaningful existing security controls, plus identified hardening work, and should be judged with separate lenses for **current VPS testing** and **final local/internal production architecture**.

