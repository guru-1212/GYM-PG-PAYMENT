import { Timestamp } from 'firebase/firestore';

export type OwnerRole = 'admin' | 'owner';
export type OwnerStatus = 'pending' | 'approved' | 'rejected' | 'inactive';
export type BusinessType = 'gym' | 'pg';

export interface Owner {
  ownerId: string;
  name: string;
  businessName?: string;
  email: string;
  /** E.164 when the account was verified with Firebase Phone Auth at sign-up. */
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
