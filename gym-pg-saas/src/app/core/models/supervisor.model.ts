import { Timestamp } from 'firebase/firestore';

/**
 * Granular permissions an owner can grant to a supervisor.
 *
 * Defaults are intentionally conservative (`false` = denied). The owner ticks
 * the boxes they want during creation / edit. The dashboard's "monthly
 * earnings" card is **always** hidden for supervisors and is not represented
 * here — that is a hard product rule, not a permission.
 */
export interface SupervisorPermissions {
  canViewMembers: boolean;
  canEditMembers: boolean;
  canViewPayments: boolean;
  canRecordPayments: boolean;
  /** PG-only; ignored on gym tenants. */
  canViewRooms: boolean;
  /** PG-only; ignored on gym tenants. */
  canEditRooms: boolean;
  canViewInactiveMembers: boolean;
  canShareOnboardingLink: boolean;
}

export const DEFAULT_SUPERVISOR_PERMISSIONS: SupervisorPermissions = {
  canViewMembers: true,
  canEditMembers: false,
  canViewPayments: true,
  canRecordPayments: false,
  canViewRooms: true,
  canEditRooms: false,
  canViewInactiveMembers: false,
  canShareOnboardingLink: false,
};

export type SupervisorPermissionKey = keyof SupervisorPermissions;

export type SupervisorStatus = 'active' | 'disabled';

/**
 * Supervisor sub-account doc stored at `supervisors/{firebaseAuthUid}`.
 * The Firebase Auth user is created via a secondary app instance so the
 * parent owner stays signed in (see SupervisorService).
 */
export interface Supervisor {
  /** Firebase Auth UID — same as the doc id. */
  supervisorId: string;
  /** Parent owner this supervisor belongs to. */
  ownerId: string;
  /** Login handle picked by the owner (lowercased, e.g. `aurora_sup1`). */
  userId: string;
  /** Display name shown in the supervisor list. */
  name: string;
  role: 'supervisor';
  status: SupervisorStatus;
  permissions: SupervisorPermissions;
  createdAt: Timestamp;
}

/** Default per-owner cap. Admin can override via `owners/{ownerId}.supervisorQuota`. */
export const DEFAULT_SUPERVISOR_QUOTA = 2;

/**
 * Public lookup doc at `supervisorLoginAliases/{loginKey}`.
 * Allows the unauthenticated /login screen to map a userId → synthetic
 * Firebase Auth email so the existing email/password sign-in keeps working.
 *
 * `loginKey` = lowercased userId (uniqueness enforced by doc-id collision).
 */
export interface SupervisorLoginAlias {
  email: string;
  ownerId: string;
}

/**
 * Counter doc at `supervisorCounters/{ownerId}` used to enforce the cap in
 * Firestore rules (rules can't `list`). Maintained by SupervisorService.
 */
export interface SupervisorCounter {
  ownerId: string;
  count: number;
}
