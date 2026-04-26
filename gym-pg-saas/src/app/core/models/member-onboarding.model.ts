import { Timestamp } from 'firebase/firestore';

/**
 * Lifecycle of an onboarding share link.
 * - active  : created by the owner, not yet used / not expired.
 * - used    : member submitted their details, link is now consumed.
 * - revoked : owner manually revoked.
 * - expired : passed expiresAt without being used.
 */
export type MemberOnboardingLinkStatus = 'active' | 'used' | 'revoked' | 'expired';

/**
 * Snapshot of the member's already-filled fields, copied onto the token doc
 * at link-creation time so the public onboarding page can show them
 * pre-populated without having to read the (private) member doc directly.
 *
 * Mobile is intentionally NOT included — the member already knows their own
 * mobile, and including it here would short-circuit the mobile-match step.
 */
export interface MemberOnboardingPrefill {
  firstName?: string;
  lastName?: string;
  email?: string;
  gender?: 'male' | 'female' | 'other';
  address?: string;
  aadhaarNumber?: string;
  profilePhotoUrl?: string;
  aadhaarFrontUrl?: string;
  aadhaarBackUrl?: string;
  businessName?: string;
}

/**
 * Public-readable token doc.
 *
 * NOTE: The mobileHash itself is NOT stored on this doc. It lives on a sibling
 * private doc at `memberOnboardingLinkSecrets/{token}`. That separation lets
 * Firestore Security Rules verify the hash via get() while keeping it unreadable
 * to the public client.
 */
export interface MemberOnboardingLink {
  token: string;
  memberId: string;
  ownerId: string;
  status: MemberOnboardingLinkStatus;
  attempts: number;
  createdAt: Timestamp;
  expiresAt: Timestamp;
  /** Set once the public client passes the rule-enforced mobile-hash check. */
  verifiedAt?: Timestamp;
  /** Set when the member completes the form via this link. */
  usedAt?: Timestamp;
  /** Pre-fill snapshot for the public form. */
  prefill?: MemberOnboardingPrefill;
}

/** Private companion doc — never publicly readable, used only by rules via get(). */
export interface MemberOnboardingLinkSecret {
  token: string;
  ownerId: string;
  memberId: string;
  mobileHash: string;
}
