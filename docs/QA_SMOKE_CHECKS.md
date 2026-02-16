# QA Smoke Checks — RBAC & Status Refresh

Run these after deploying RBAC and data-refresh fixes to confirm behavior in staging/prod.

---

## 1. Regulator cannot access Access Control

- Log in as a **Regulator** user.
- **Expect:** Access Control is **not** in the sidebar.
- Navigate directly to `/access-control` (e.g. paste URL).
- **Expect:** “Access denied” (or “No access”) screen; **no** error toast.

---

## 2. Regulator sees correct role label

- Log in as a **Regulator** user (or create one via invite with role Regulator, set password, then log in).
- **Expect:** Top-left user label shows **“Regulator”**, not “Admin”.

---

## 3. Assignee can open task & script

- As a user who has an **assigned** task (or as Admin opening a task assigned to someone else), go to **Tasks**.
- Click a task row to open it.
- **Expect:** Script workspace opens for that script (no blank/fail). Works for assignee and for Admin viewing others’ tasks.

---

## 4. Approve/reject buttons stable

- Log in as **Regulator** or **Admin**.
- Open a script in the workspace that is **not** yet approved/rejected.
- **Expect:** Decision bar (Approve / Reject) appears after load and **does not flicker or disappear**.
- Click Approve or Reject, complete the flow.
- **Expect:** Bar updates (e.g. shows “Approved” or “Rejected”); **no** full page reload.

---

## 5. Status refresh after decision

- Approve or reject a script in the workspace.
- Without reloading the page, go to **Clients** → open the client that owns that script.
- **Expect:** Script status is **Approved** or **Rejected** (not stale “draft”).
- Go to **Scripts** and use status filters (e.g. Approved).
- **Expect:** The script appears in the correct filter.
- Open **Reports** and open the relevant report if applicable.
- **Expect:** Report/script status is updated (no stale state).

---

## 6. Glossary re-add after soft delete

- In **Glossary**, add a new term (e.g. “test-term”).
- Delete (deactivate) that term.
- Add the **same** term again (same normalized text).
- **Expect:** Term is added successfully (reactivated), **no** “already exists” error.
- Add the same term again while it is still active.
- **Expect:** “Already exists” or 409 (duplicate) behavior as designed.

---

## Optional: Script upload when assigning user

- As **Admin**, go to a **Client** → “Add new script”.
- Assign the script to another user and upload a document (PDF/DOCX).
- **Expect:** Script is created, document uploads, and text extraction runs (versionId returned and used); no “script upload failed” when backend and role are correct.
