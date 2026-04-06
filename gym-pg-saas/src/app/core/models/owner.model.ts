import { Timestamp } from 'firebase/firestore';

export type OwnerRole = 'admin' | 'owner';
export type OwnerStatus = 'pending' | 'approved' | 'rejected';
export type BusinessType = 'gym' | 'pg';

export interface Owner {
  ownerId: string;
  name: string;
  businessName?: string;
  email: string;
  businessType: BusinessType;
  role: OwnerRole;
  status: OwnerStatus;
  createdAt: Timestamp;
}
