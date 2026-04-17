import { Timestamp } from 'firebase/firestore';
import { OwnerFeatures } from './feture.model';

export interface WorkerPermissions {
  view_members?: boolean;
  view_payments?: boolean;
  view_rooms?: boolean;
  view_monthly_earnings?: boolean;
  view_dashboard_earnings?: boolean;
  add_member?: boolean;
  collect_payment?: boolean;
}

export interface Worker {
  workerId: string;
  ownerId: string;
  name: string;
  email: string;
  password: string;
  role: 'worker';
  status: 'active' | 'inactive';
  createdAt: Timestamp;
  permissions: WorkerPermissions;
  features?: OwnerFeatures;
}