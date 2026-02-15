# Invite flow — Security and “no surprises” notes (Phase 7)

## 1. Never store invite token in DB — only hash

- The **raw token** (sent in the email link) is **never** written to the database.
- Only **token_hash** = SHA-256(token) in hex is stored in `user_invites.token_hash`.
- On consume, the client sends the token; we hash it and look up by `token_hash`. This prevents token leakage from DB dumps or logs.

## 2. Crypto-safe token generator

- Tokens are generated with **crypto.getRandomValues()** (32 bytes).
- Encoded as **base64url** (URL-safe, no padding) for the link.
- Do **not** use `Math.random()` or non-crypto PRNGs for tokens.

## 3. Invite creation: requireAuth() + permission check

- **POST /invites** (create invite) **requires**:
  - **requireAuth()** — valid Bearer JWT; returns 401 if missing/invalid.
  - **Permission check** — caller must have `manage_users` or `access_control:manage` (via RBAC); returns 403 otherwise.
- Only admins can create invites; non-admins receive 403.

## 4. Consume endpoint: no auth, but rate-limited and strongly validated

- **POST /invites-consume** **does not** require auth (the user is not logged in yet).
- **Rate limiting:**
  - Attempts are tracked per **client IP** in `invite_consume_attempts`.
  - Limit: **15 attempts per 5 minutes** per IP. Over limit → **429** “Too many attempts.”
  - Apply at gateway/reverse proxy as well if you need stricter limits.
  - **Pruning:** Periodically delete old rows so the table doesn’t grow unbounded, e.g. `DELETE FROM invite_consume_attempts WHERE attempted_at < now() - interval '1 hour';` (run via cron or Supabase pg_cron).
- **Strong validation:**
  - **token** required; hashed and looked up (single row, `used_at` null, `expires_at` > now).
  - **password** required; min length 8, at least one letter and one number.
  - Generic error “Invalid or expired invite” for not-found/expired/used (no info leak).
  - No token or password in logs.

## 5. Audit logging

- **Invite creation:** After a successful create and email send, an **audit event** is written:
  - `entity_type`: `user_invite`
  - `action`: `invite.create`
  - `actor_user_id`: admin who created the invite
  - `entity_id`: invite row id
  - `after_state`: `{ email, role_key, expires_at }` (no token or token_hash)
  - `meta`: `{ auth_user_id }` (for correlation)
- **Invite consumption:** After a successful set-password and profile/role setup, an **audit event** is written:
  - `entity_type`: `user_invite`
  - `action`: `invite.consume`
  - `actor_user_id`: null (user not logged in)
  - `entity_id`: invite row id
  - `meta`: `{ auth_user_id, email }` (who was activated)
- Use `audit_events` for compliance and debugging; never log the raw token.

## Quick checklist

| Item | Implementation |
|------|----------------|
| Token in DB | Only `token_hash` (SHA-256 hex); never raw token |
| Token generation | `crypto.getRandomValues(32)` + base64url |
| POST /invites | requireAuth() + manage_users or access_control:manage |
| POST /invites-consume | No auth; rate limit by IP (15 / 5 min); strong token + password validation |
| Audit | invite.create and invite.consume written to audit_events |
