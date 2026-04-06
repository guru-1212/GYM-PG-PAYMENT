import { Timestamp } from 'firebase/firestore';

export type MemberStatus = 'active' | 'inactive';
export type Gender = 'male' | 'female' | 'other';
export type SubscriptionType = 'monthly' | 'quarterly' | 'yearly';

export interface Member {
  memberId: string;
  ownerId: string;
  businessType: 'gym' | 'pg';
  firstName: string;
  lastName?: string;
  mobile?: string;
  gender?: Gender;
  aadhaarLast4?: string;
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
  createdAt: Timestamp;
}
