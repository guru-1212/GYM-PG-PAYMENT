import { Timestamp } from 'firebase/firestore';
import { OwnerFeatures } from './feture.model';

export interface WorkerPermissions {
  dashboard_view_basic?: boolean;
  dashboard_view_member_count?: boolean;
  dashboard_view_earnings?: boolean;
  members_view_list?: boolean;
  members_add?: boolean;
  members_edit?: boolean;
  members_activate_deactivate?: boolean;
  members_delete?: boolean;
  members_view_history?: boolean;
  payments_view?: boolean;
  payments_collect?: boolean;
  payments_export_pdf?: boolean;
  monthly_earnings_view?: boolean;
  rooms_view?: boolean;
  rooms_edit_layout?: boolean;
  workers_view?: boolean;
  workers_manage?: boolean;
  reports_download?: boolean;

  // Legacy keys (kept for backward compatibility with existing workers)
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
  businessType?: 'gym' | 'pg';
  name: string;
  email: string;
  password: string;
  role: 'worker';
  status: 'active' | 'inactive';
  createdAt: Timestamp;
  permissions: WorkerPermissions;
  features?: OwnerFeatures;
}