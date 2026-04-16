import { environment } from '../../../environments/environment';

/** Digits-only from a string (strips +, spaces, etc.). */
export function digitsOnly(input: string): string {
  return String(input ?? '').replace(/\D/g, '');
}

/**
 * Owner-entered mobile to E.164. Accepts +country or, for India, 10-digit mobile starting 6-9 as +91.
 * Returns null if the value cannot be interpreted safely.
 */
export function normalizeOwnerPhone(input: string): string | null {
  const raw = String(input ?? '').trim();
  if (!raw) return null;
  if (raw.startsWith('+')) {
    const d = digitsOnly(raw.slice(1));
    if (d.length < 10 || d.length > 15) return null;
    return `+${d}`;
  }
  const d = digitsOnly(raw);
  if (d.length === 10 && /^[6-9]/.test(d)) {
    return `+91${d}`;
  }
  if (d.length >= 10 && d.length <= 15) {
    return `+${d}`;
  }
  return null;
}

/**
 * Firebase Auth email for password sign-in for phone-first owners.
 * Deterministic from E.164 so login and password reset work without a public Firestore phone lookup.
 */
export function ownerAuthEmailFromPhone(phoneE164: string): string {
  const d = digitsOnly(phoneE164);
  const host = environment.firebase.authDomain || 'gym-pg-saas.firebaseapp.com';
  return `${d}@${host}`;
}

/** Firestore collection: normalized contact email → synthetic Auth email for password sign-in (phone-first owners). */
export const OWNER_LOGIN_ALIASES_COLLECTION = 'ownerLoginAliases' as const;

/** Digits-only E.164 → real Auth email for password sign-in (email/password sign-ups). */
export const OWNER_PHONE_LOGIN_ALIASES_COLLECTION = 'ownerPhoneLoginAliases' as const;

/** Lowercase trimmed email for `ownerLoginAliases` document id and lookups. */
export function normalizeOwnerLoginEmailKey(email: string): string {
  return String(email ?? '').trim().toLowerCase();
}