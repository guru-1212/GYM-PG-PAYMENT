import { Timestamp } from 'firebase/firestore';

/**
 * Application user role.
 * - `admin` and `owner` exist as Firestore docs in `owners/{uid}`.
 * - `supervisor` is a sub-account under an owner; lives in `supervisors/{uid}`.
 *   AuthService projects supervisor docs into the same `Owner` shape so existing
 *   code (`auth.profile()`) keeps working for them too.
 */
export type OwnerRole = 'admin' | 'owner' | 'supervisor';
export type OwnerStatus = 'pending' | 'approved' | 'rejected' | 'inactive';
export type BusinessType = 'gym' | 'pg';

/**
 * Admin-controlled, per-owner feature flags.
 * Absence of a flag means the feature is disabled (default).
 */
export interface OwnerFeatureFlags {
  /** Owner can create supervisor sub-accounts under their org. */
  supervisorEnabled?: boolean;
  /** WhatsApp auto-integration (placeholder for now; real wiring later). */
  whatsappEnabled?: boolean;
}

export interface Owner {
  ownerId: string;
  name: string;
  businessName?: string;
  email: string;
  /** Mobile stored as digits only (e.g. 919876543210) for profile + alias key consistency. */
  phone?: string;
  phoneVerified?: boolean;
  businessType: BusinessType;
  role: OwnerRole;
  status: OwnerStatus;
  createdAt: Timestamp;
  // Subscription fields
  planStartDate?: Timestamp;
  planEndDate?: Timestamp;
  emailVerified?: boolean;
  complaintEnabled?: boolean;

  /** Admin-controlled feature flags. */
  featureFlags?: OwnerFeatureFlags;
  /** Maximum supervisors this owner can create. Default = 2. */
  supervisorQuota?: number;

  /**
   * Set on supervisor profiles (projected by AuthService from `supervisors/{uid}`).
   * Never present on actual owner docs. Used by guards / data services to scope reads.
   */
  parentOwnerId?: string;
}

export interface AdminPayment {
  id?: string;
  ownerId: string;
  ownerName: string;
  ownerEmail: string;
  amount: number;
  planDays: number;
  date: Timestamp;
  createdAt: Timestamp;
}
