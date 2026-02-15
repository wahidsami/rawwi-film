# Invite flow — Testing checklist (Phase 6)

Use this checklist to verify the full invite flow and security behaviour.

---

## Prerequisites

- [ ] Supabase local: `supabase start` (or use hosted project)
- [ ] Edge functions running: `supabase functions serve` (loads root `.env`)
- [ ] Frontend running: `cd apps/web && npm run dev` (e.g. http://localhost:5173)
- [ ] `.env` has: `RESEND_API_KEY`, `APP_PUBLIC_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- [ ] At least one **admin** user exists (has `manage_users` or `access_control:manage`) and you can log in as them

---

## 1. Admin creates user in UI → Resend accepted

- [ ] Log in as an **admin** user
- [ ] Go to **Access Control** (or equivalent “users” page)
- [ ] Click **Add User** / **Send Invite**
- [ ] Fill: **Email** (valid address you can receive at), **Name** (optional), **Role**
- [ ] Click **Send Invite**
- [ ] UI shows toast: **“Invite sent to email”**
- [ ] **Check logs**: In the terminal where `supabase functions serve` is running, confirm there is **no** error from Resend (no 4xx/5xx). Optionally check Resend dashboard → Logs to see the email “accepted” or “delivered”

**Pass:** Invite request returns 200, toast appears, no Resend error in function logs.

---

## 2. User receives email → opens link → sets password

- [ ] Open the inbox for the **invited email** address
- [ ] Find the invite email from Raawi Film (or your `EMAIL_FROM` / default sender)
- [ ] Click the **“Set your password”** link (URL like `http://localhost:5173/set-password?token=...`)
- [ ] **Set password** page loads with token in the URL
- [ ] Enter **Password** and **Confirm password** (min 8 chars, at least one letter and one number)
- [ ] Optionally enter **Name**
- [ ] Click **Set password**
- [ ] UI shows **“Password set successfully”** and then redirects to **Login**

**Pass:** Email received, link works, form submits, success message and redirect to login.

---

## 3. User can login

- [ ] On the **Login** page, enter the **invited user’s email** and the **password** they just set
- [ ] Submit login
- [ ] User is signed in and reaches the app (e.g. dashboard or default route)

**Pass:** Invited user can sign in with the new password and access the app.

---

## 4. Invite token cannot be reused

- [ ] Use the **same** invite link again (same `?token=...`) in a new tab or after logging out
- [ ] Enter a **new** password and submit
- [ ] Backend should return an error (e.g. **“Invalid or expired invite”**)
- [ ] UI shows error toast; password is **not** changed

**Pass:** Second use of the same token is rejected; only first use succeeds.

---

## 5. Expired token fails

- [ ] In DB, set `expires_at` for a test invite row to a time in the **past**, or wait until an existing invite is past 48h
- [ ] Open the invite link for that token (or use a token you know is expired)
- [ ] Submit password (and optional name)
- [ ] Backend returns error (e.g. **“Invalid or expired invite”**)
- [ ] UI shows error; password is **not** set

**How to expire a token for testing (SQL):**

```sql
UPDATE user_invites
SET expires_at = now() - interval '1 hour'
WHERE email = 'test@example.com';
```

**Pass:** Expired invite is rejected with “Invalid or expired invite” (or equivalent).

---

## 6. Non-admin cannot call invite endpoint

- [ ] Log in as a **non-admin** user (e.g. regulator or a user **without** `manage_users` / `access_control:manage`)
- [ ] Call **POST** `/invites` (e.g. via browser devtools, Postman, or curl) with a valid body:
  - `{ "email": "someone@example.com", "role": "admin" }`
  - Use the same `Authorization: Bearer <that_user's_jwt>` as for other requests
- [ ] Response is **403 Forbidden** with a message like “Forbidden: manage_users or access_control:manage required”
- [ ] No invite is created; no email is sent

**Pass:** Only users with `manage_users` (or `access_control:manage`) can create invites; others get 403.

---

## Quick reference

| Check              | Expected result                                      |
|--------------------|------------------------------------------------------|
| Admin sends invite | 200, toast “Invite sent”, Resend accepts in logs     |
| Open link + set pwd| Success message, redirect to login                  |
| Login with new pwd | User signs in and enters app                         |
| Reuse same token   | Error “Invalid or expired invite”                    |
| Expired token      | Error “Invalid or expired invite”                    |
| Non-admin POST     | 403 “manage_users or access_control:manage required”|

---

## Optional: Resend dashboard

- In [Resend](https://resend.com) → **Emails** (or **Logs**), confirm:
  - Emails are sent when you click “Send Invite”
  - Status is “Delivered” or “Accepted” (not “Bounced” or “Failed”) for the test address
