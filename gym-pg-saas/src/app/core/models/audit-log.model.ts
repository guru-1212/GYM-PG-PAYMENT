import { Timestamp } from 'firebase/firestore';

/**
 * Stable, machine-readable action keys for audit-log rows.
 *
 * Naming convention is `entity.verb` (lowercase, dotted). Keep these
 * stable — UI labels, filters and reports reference them. To extend the
 * vocabulary add a new entry here AND a label in `AUDIT_ACTION_LABELS`.
 */
export type AuditAction =
  // Payments
  | 'payment.collected'
  | 'payment.partialCollected'
  | 'payment.pendingCollected'
  | 'payment.edited'
  // Member lifecycle
  | 'member.added'
  | 'member.updated'
  | 'member.removed'
  | 'member.statusChanged'
  | 'member.reminderSent'
  | 'member.profileLinkSent'
  | 'member.onboardingApproved'
  | 'member.onboardingRejected'
  // Rent / billing status (auto + manual transitions)
  | 'rent.markedPaid'
  | 'rent.markedPending'
  // Access / role events
  | 'auth.login'
  | 'supervisor.created'
  | 'supervisor.updated'
  | 'supervisor.removed'
  | 'supervisor.passwordReset';

export type AuditActorRole = 'owner' | 'supervisor' | 'admin';

export type AuditEntityType =
  | 'member'
  | 'payment'
  | 'supervisor'
  | 'auth'
  | 'system';

/**
 * Represents a single immutable audit-log row stored at
 * `owners/{ownerId}/auditLogs/{auditId}`.
 *
 * Documents are write-once: clients cannot edit or delete (enforced by
 * firestore.rules) — mirroring the payment audit-trail design.
 */
export interface AuditLog {
  id: string;

  /** Parent owner the activity belongs to (used for scoping reads). */
  ownerId: string;

  /** Stable action key (filter / analytics anchor). */
  action: AuditAction;

  /** Type of subject the action operated on. */
  entityType: AuditEntityType;

  /** Subject id (e.g. memberId, paymentId, supervisorId). Optional. */
  entityId?: string;

  /** Human-readable subject label (e.g. member full name). */
  entityLabel?: string;

  /** Short, human friendly explanation of what happened. */
  description: string;

  /** Money amount associated with the action (payments, edits). */
  amount?: number;

  /** Anything else worth surfacing in the row's "details" line. */
  meta?: Record<string, string>;

  /* ------------------------- Performed-by trail ------------------------- */
  /** Firebase Auth UID of whoever performed the action (immutable). */
  performedBy: string;
  /** Display name at the moment of the action (snapshot, not a live link). */
  performedByName: string;
  /** Role at the moment of the action — drives the "Done by" pill. */
  performedByRole: AuditActorRole;
  /** Friendly id (supervisor.userId for supervisors, ownerId for owners). */
  performedByLabel?: string;

  /** Server timestamp the row was committed at. */
  timestamp: Timestamp;
  /** Mirror of timestamp; kept for API symmetry with other models. */
  createdAt: Timestamp;
}

/**
 * Display label for each action key. Centralised here so the UI never
 * hard-codes copy that drifts from the audit row's action.
 */
export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  'payment.collected': 'Payment Collected',
  'payment.partialCollected': 'Partial Payment Collected',
  'payment.pendingCollected': 'Pending Amount Collected',
  'payment.edited': 'Payment Edited',
  'member.added': 'Member Added',
  'member.updated': 'Member Updated',
  'member.removed': 'Member Removed',
  'member.statusChanged': 'Member Status Changed',
  'member.reminderSent': 'Reminder Sent',
  'member.profileLinkSent': 'Profile Link Sent',
  'member.onboardingApproved': 'Onboarding Approved',
  'member.onboardingRejected': 'Onboarding Rejected',
  'rent.markedPaid': 'Rent Marked Paid',
  'rent.markedPending': 'Rent Marked Pending',
  'auth.login': 'User Login',
  'supervisor.created': 'Supervisor Added',
  'supervisor.updated': 'Supervisor Updated',
  'supervisor.removed': 'Supervisor Removed',
  'supervisor.passwordReset': 'Supervisor Password Reset',
};

/**
 * Tone classification used by the UI to colour-code rows. Kept here so
 * page components stay pure presentation.
 */
export type AuditTone = 'green' | 'blue' | 'amber' | 'red' | 'slate';

export const AUDIT_ACTION_TONES: Record<AuditAction, AuditTone> = {
  'payment.collected': 'green',
  'payment.partialCollected': 'green',
  'payment.pendingCollected': 'green',
  'payment.edited': 'amber',
  'member.added': 'blue',
  'member.updated': 'amber',
  'member.removed': 'red',
  'member.statusChanged': 'amber',
  'member.reminderSent': 'blue',
  'member.profileLinkSent': 'blue',
  'member.onboardingApproved': 'green',
  'member.onboardingRejected': 'red',
  'rent.markedPaid': 'green',
  'rent.markedPending': 'amber',
  'auth.login': 'slate',
  'supervisor.created': 'blue',
  'supervisor.updated': 'amber',
  'supervisor.removed': 'red',
  'supervisor.passwordReset': 'amber',
};

/** Material icon names used to render each action visually. */
export const AUDIT_ACTION_ICONS: Record<AuditAction, string> = {
  'payment.collected': 'payments',
  'payment.partialCollected': 'request_quote',
  'payment.pendingCollected': 'savings',
  'payment.edited': 'edit_note',
  'member.added': 'person_add',
  'member.updated': 'manage_accounts',
  'member.removed': 'person_remove',
  'member.statusChanged': 'toggle_on',
  'member.reminderSent': 'campaign',
  'member.profileLinkSent': 'link',
  'member.onboardingApproved': 'verified',
  'member.onboardingRejected': 'block',
  'rent.markedPaid': 'task_alt',
  'rent.markedPending': 'pending_actions',
  'auth.login': 'login',
  'supervisor.created': 'group_add',
  'supervisor.updated': 'admin_panel_settings',
  'supervisor.removed': 'group_remove',
  'supervisor.passwordReset': 'password',
};
