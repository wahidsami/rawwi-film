/**
 * Shared password validation (used by ResetPassword and SetPassword).
 * Rules: length >= 8, at least one letter, at least one number.
 */
export function validatePassword(password: string): { ok: boolean; message?: string } {
  if (password.length < 8) {
    return { ok: false, message: 'Password must be at least 8 characters' };
  }
  if (!/[a-zA-Z]/.test(password)) {
    return { ok: false, message: 'Password must contain at least one letter' };
  }
  if (!/\d/.test(password)) {
    return { ok: false, message: 'Password must contain at least one number' };
  }
  return { ok: true };
}
