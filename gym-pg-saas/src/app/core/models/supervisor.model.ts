import { Timestamp } from 'firebase/firestore';

/**
 * Granular permissions an owner can grant to a supervisor.
 *
 * Defaults are intentionally conservative (`false` = denied). The owner ticks
 * the boxes they want during creation / edit. The dashboard's "monthly
 * earnings" card is **always** hidden for supervisors and is not represented
 * here — that is a hard product rule, not a permission.
 *
 * Member-mutation perms are split into Add / Edit / Delete so the owner can,
 * for example, allow a supervisor to ADD walk-ins and EDIT contact info but
 * never DELETE a member without their approval.
 */
export interface SupervisorPermissions {
  canViewMembers: boolean;
  /** Add a new member (create flow). */
  canAddMembers: boolean;
  /** Edit existing member fields and approve self-onboarding submissions. */
  canEditMembers: boolean;
  /** Delete a member from the active list. */
  canDeleteMembers: boolean;
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
  canAddMembers: false,
  canEditMembers: false,
  canDeleteMembers: false,
  canViewPayments: true,
  canRecordPayments: false,
  canViewRooms: true,
  canEditRooms: false,
  canViewInactiveMembers: false,
  canShareOnboardingLink: false,
};

export type SupervisorPermissionKey = keyof SupervisorPermissions;

/**
 * Backwards-compatible normaliser.
 *
 * Older supervisor docs only have a single `canEditMembers` flag covering
 * add/edit/delete. When we read those, we project the legacy boolean into
 * the new triplet so existing supervisors don't suddenly lose access. New
 * writes always include the granular trio explicitly.
 */
export function normalizeSupervisorPermissions(
  raw: Partial<SupervisorPermissions> | null | undefined,
): SupervisorPermissions {
  const src = (raw ?? {}) as Record<string, unknown>;
  const legacyEdit = src['canEditMembers'] === true;
  const hasGranular =
    'canAddMembers' in src || 'canDeleteMembers' in src;
  return {
    canViewMembers: src['canViewMembers'] === true,
    canAddMembers:
      'canAddMembers' in src
        ? src['canAddMembers'] === true
        : hasGranular
          ? false
          : legacyEdit,
    canEditMembers: src['canEditMembers'] === true,
    canDeleteMembers:
      'canDeleteMembers' in src
        ? src['canDeleteMembers'] === true
        : hasGranular
          ? false
          : legacyEdit,
    canViewPayments: src['canViewPayments'] === true,
    canRecordPayments: src['canRecordPayments'] === true,
    canViewRooms: src['canViewRooms'] === true,
    canEditRooms: src['canEditRooms'] === true,
    canViewInactiveMembers: src['canViewInactiveMembers'] === true,
    canShareOnboardingLink: src['canShareOnboardingLink'] === true,
  };
}

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

  /**
   * When true, this supervisor can only sign in from one of the IPs in
   * `supervisors/{uid}/allowedIps`. When false (or absent), no IP restriction
   * is enforced. Owner toggles this from the supervisor edit modal.
   */
  ipRestrictionEnabled?: boolean;

  // ---- Single-device login enforcement ----
  /**
   * The currently active session id (UUID generated on each successful
   * login). The supervisor's signed-in device stores the same id locally;
   * if `activeSessionId` ever differs from the local copy, that device
   * signs itself out (a newer login on another device has taken over).
   */
  activeSessionId?: string;
  /** Best-effort device label captured on login (`Chrome on iPhone`, etc.). */
  activeSessionDevice?: string;
  /** Server timestamp of the most recent login that claimed the session. */
  activeSessionLoginAt?: Timestamp;
  /** Public IP captured at login time (audit trail; never trusted alone). */
  activeSessionIp?: string;
}

/**
 * Allowed IP entry stored at `supervisors/{uid}/allowedIps/{autoId}`.
 * Owners add named IPs (e.g. "PG WiFi", "Home") so the supervisor login
 * can match the public IP at login time.
 */
export interface SupervisorAllowedIp {
  /** Friendly name shown in the owner UI ("PG WiFi", "Home", "Backup hotspot"). */
  label: string;
  /** Either an IPv4 string (`49.207.10.42`) or an IPv6 string. Never both. */
  ip: string;
  /** Owner UID who added this entry — for audit. */
  addedBy: string;
  addedAt: Timestamp;
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
