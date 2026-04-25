import { Timestamp } from 'firebase/firestore';

export type MemberStatus = 'active' | 'inactive';
export type Gender = 'male' | 'female' | 'other';
export type SubscriptionType = 'monthly' | 'quarterly' | 'yearly';

/**
 * Tracks whether the member has completed self-service onboarding via a shared link.
 * - 'completed' = either owner uploaded all data, or member submitted via share link.
 * - 'pending'   = there is at least one piece of self-fill info still missing.
 * Field is optional so legacy member docs continue to render correctly.
 */
export type SelfOnboardingStatus = 'pending' | 'completed';

export interface Member {
  memberId: string;
  ownerId: string;
  businessType: 'gym' | 'pg';
  firstName: string;
  lastName?: string;
  mobile?: string;
  email?: string;
  gender?: Gender;
  /** Legacy field — historically held only the last 4 digits, may now contain full 12-digit Aadhaar. */
  aadhaarLast4?: string;
  /** Full Aadhaar number (12 digits) submitted by the member or owner. Optional. */
  aadhaarNumber?: string;
  address?: string;
  floorNumber?: string;
  roomNumber?: string;
  bedNumber?: string;
  notes?: string;
  joinDate: Timestamp;
  amount: number;
  dueDate: Timestamp;
  status: MemberStatus;
  /** Defaults to monthly when missing (legacy). */
  subscriptionType?: SubscriptionType;
  /** Remaining balance when a partial payment is recorded. */
  pendingAmount?: number;
  /** Advance held from member (kept separate from earnings). */
  advancePaid?: number;
  /** Internal lifecycle status for advance amount. */
  advanceStatus?: 'held' | 'returned';
  createdAt: Timestamp;

  /* ---------- Self-onboarding (member-uploaded photos & docs) ---------- */
  /** Public download URL of the member's profile photo (Firebase Storage). */
  profilePhotoUrl?: string;
  /** Public download URL of the Aadhaar card front image (Firebase Storage). */
  aadhaarFrontUrl?: string;
  /** Public download URL of the Aadhaar card back image (Firebase Storage). */
  aadhaarBackUrl?: string;
  /** Lifecycle of the share-link onboarding flow for this member. */
  selfOnboardingStatus?: SelfOnboardingStatus;
  /** Set when a self-onboarding submission completes. */
  selfOnboardingCompletedAt?: Timestamp;
  /** Token id of the last successful self-onboarding submission (audit). */
  selfOnboardingTokenUsed?: string;
}
