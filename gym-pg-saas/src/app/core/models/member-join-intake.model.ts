import type { Timestamp } from 'firebase/firestore';

export type MemberJoinIntakeStatus =
  | 'active'
  | 'submitted'
  | 'completed'
  | 'dismissed'
  | 'revoked';

export interface MemberJoinIntake {
  token: string;
  ownerId: string;
  businessName: string;
  status: MemberJoinIntakeStatus;
  createdAt: Timestamp;
  expiresAt: Timestamp;
  submittedAt?: Timestamp;
  submissionFirstName?: string;
  submissionLastName?: string;
  submissionMobile?: string;
  submissionAadhaarNumber?: string;
  submissionAddress?: string;
  linkedMemberId?: string;
  completedAt?: Timestamp;
  dismissedAt?: Timestamp;
}