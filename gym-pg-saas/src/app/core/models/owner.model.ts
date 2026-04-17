import { Timestamp } from 'firebase/firestore';
import { OwnerFeatures } from './feture.model';

export type OwnerRole = 'admin' | 'owner';
export type OwnerStatus = 'pending' | 'approved' | 'rejected' | 'inactive';
export type BusinessType = 'gym' | 'pg';



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
  features?: OwnerFeatures;
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
