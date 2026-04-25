import type { Supervisor, SupervisorPermissions } from '../models/supervisor.model';
import { DEFAULT_SUPERVISOR_PERMISSIONS } from '../models/supervisor.model';

export type { Supervisor, SupervisorPermissions };

export const SUPERVISORS_COLLECTION = 'supervisors';
export const SUPERVISOR_LOGIN_ALIASES_COLLECTION = 'supervisorLoginAliases';
export const SUPERVISOR_COUNTERS_COLLECTION = 'supervisorCounters';

/**
 * Domain used for synthetic supervisor login emails. Never delivered to a
 * real mailbox — purely a stable identifier so we can reuse Firebase Auth's
 * email/password sign-in without asking the owner for the supervisor's email.
 */
export const SUPERVISOR_EMAIL_DOMAIN = 'supervisor.local';

/**
 * Normalise the userId an owner types (e.g. " Aurora_Sup1 ") to a stable
 * Firestore-friendly key: lowercase, trimmed, only [a-z0-9_-], collapsed.
 *
 * Returns empty string for invalid input so callers can short-circuit.
 */
export function sanitizeSupervisorUserId(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const cleaned = raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32);
  return cleaned;
}

/**
 * Build the synthetic Firebase Auth email for a supervisor.
 * Scoped per-owner so two owners can each have a `manager` userId without colliding.
 */
export function buildSupervisorAuthEmail(userId: string, ownerId: string): string {
  const u = sanitizeSupervisorUserId(userId);
  // ownerId is already a Firebase Auth UID (alphanumeric). Lowercase it for safety.
  const o = String(ownerId || '').toLowerCase().slice(0, 28);
  return `${u}__${o}@${SUPERVISOR_EMAIL_DOMAIN}`;
}

/** Doc id for the public alias lookup. Owner-scoped to prevent cross-tenant collisions. */
export function buildSupervisorLoginAliasKey(userId: string, ownerId: string): string {
  return `${sanitizeSupervisorUserId(userId)}__${String(ownerId || '').toLowerCase()}`;
}

/** Reasonable default permissions for a brand-new supervisor (read-only-ish). */
export function defaultSupervisorPermissions(): SupervisorPermissions {
  return { ...DEFAULT_SUPERVISOR_PERMISSIONS };
}
