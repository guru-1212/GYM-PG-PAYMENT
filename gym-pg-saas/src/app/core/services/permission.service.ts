import { Injectable } from '@angular/core';
import { OwnerFeatures } from '../models/feture.model';
import { WorkerPermissions } from '../models/worker.model';

@Injectable({ providedIn: 'root' })
export class PermissionService {

  private ownerFeatures: OwnerFeatures = {};
  private workerPermissions: WorkerPermissions = {};
  private role: 'admin' | 'owner' | 'worker' = 'owner';

  setRole(role: 'admin' | 'owner' | 'worker') {
    this.role = role;
  }

  setOwnerFeatures(features?: OwnerFeatures) {
    this.ownerFeatures = features || {};
  }

  setWorkerPermissions(permissions?: WorkerPermissions) {
    this.workerPermissions = permissions || {};
  }

  hasAccess(feature: keyof OwnerFeatures): boolean {

    if (this.role === 'admin') return true;

    if (this.role === 'owner') {
      return !!this.ownerFeatures?.[feature];
    }

    if (this.role === 'worker') return this.workerHasFeatureAccess(feature);

    return false;
  }

  canAccessRoute(path: string): boolean {
    const normalizedPath = String(path || '')
      .split('?')[0]
      .split('#')[0]
      .replace(/^\//, '')
      .trim()
      .toLowerCase();

    if (!normalizedPath || normalizedPath === 'dashboard') return this.hasModuleAccess('dashboard');
    if (normalizedPath === 'members' || normalizedPath === 'inactive-members') return this.hasModuleAccess('members');
    if (normalizedPath === 'payments') return this.hasModuleAccess('payments');
    if (normalizedPath === 'rooms') return this.hasModuleAccess('rooms');
    if (normalizedPath === 'monthly-earnings') return this.hasModuleAccess('monthly-earnings');
    if (normalizedPath === 'workers') return this.hasModuleAccess('workers');
    return true;
  }

  firstAccessibleRoute(): string {
    const priority: Array<{ path: string; module: WorkerModule }> = [
      { path: '/dashboard', module: 'dashboard' },
      { path: '/members', module: 'members' },
      { path: '/payments', module: 'payments' },
      { path: '/rooms', module: 'rooms' },
      { path: '/monthly-earnings', module: 'monthly-earnings' },
      { path: '/workers', module: 'workers' },
    ];
    for (const item of priority) {
      if (this.hasModuleAccess(item.module)) return item.path;
    }
    return '/login';
  }

  hasModuleAccess(module: WorkerModule): boolean {
    if (this.role === 'admin') return true;
    if (this.role === 'owner') return this.ownerHasModuleAccess(module);
    if (this.role === 'worker') return this.workerHasModuleAccess(module);
    return false;
  }

  private ownerHasModuleAccess(module: WorkerModule): boolean {
    // Backward compatibility: older owner docs may not have `features` set.
    // In that case owners should retain full module access instead of being blocked.
    if (!this.hasExplicitOwnerFeatureConfig()) return true;

    switch (module) {
      case 'dashboard':
      case 'members':
      case 'monthly-earnings':
        return !!this.ownerFeatures?.monthly_view;
      case 'payments':
        return !!this.ownerFeatures?.payment_edit;
      case 'rooms':
      case 'workers':
        return !!this.ownerFeatures?.worker_management;
      default:
        return false;
    }
  }

  private hasExplicitOwnerFeatureConfig(): boolean {
    const f = this.ownerFeatures || {};
    return (
      typeof f.monthly_view === 'boolean' ||
      typeof f.payment_edit === 'boolean' ||
      typeof f.worker_management === 'boolean'
    );
  }

  private workerHasModuleAccess(module: WorkerModule): boolean {
    switch (module) {
      case 'dashboard':
        return !!this.ownerFeatures?.monthly_view && this.hasWorkerPermission('dashboard_view_basic');
      case 'members':
        return !!this.ownerFeatures?.monthly_view && this.hasWorkerPermission('members_view_list', 'view_members');
      case 'payments':
        return !!this.ownerFeatures?.payment_edit && this.hasWorkerPermission('payments_view', 'view_payments');
      case 'rooms':
        return !!this.ownerFeatures?.worker_management && this.hasWorkerPermission('rooms_view', 'view_rooms');
      case 'monthly-earnings':
        return !!this.ownerFeatures?.monthly_view && this.hasWorkerPermission('monthly_earnings_view', 'view_monthly_earnings');
      case 'workers':
        return !!this.ownerFeatures?.worker_management && this.hasWorkerPermission('workers_view');
      default:
        return false;
    }
  }

  private workerHasFeatureAccess(feature: keyof OwnerFeatures): boolean {
    if (!this.ownerFeatures?.[feature]) return false;
    switch (feature) {
      case 'monthly_view':
        return this.hasWorkerPermission(
          'dashboard_view_basic',
          'dashboard_view_member_count',
          'dashboard_view_earnings',
          'members_view_list',
          'members_view_history',
          'monthly_earnings_view',
          'reports_download',
          'view_members',
          'view_monthly_earnings',
          'view_dashboard_earnings',
        );
      case 'payment_edit':
        return this.hasWorkerPermission('payments_view', 'payments_collect', 'payments_export_pdf', 'view_payments', 'collect_payment');
      case 'worker_management':
        return this.hasWorkerPermission(
          'members_add',
          'members_edit',
          'members_activate_deactivate',
          'members_delete',
          'rooms_view',
          'rooms_edit_layout',
          'workers_view',
          'workers_manage',
          'add_member',
          'view_rooms',
        );
      case 'whatsapp_automation':
        return false;
      default:
        return false;
    }
  }

  private hasWorkerPermission(...keys: Array<keyof WorkerPermissions>): boolean {
    return keys.some((key) => !!this.workerPermissions?.[key]);
  }
}

type WorkerModule = 'dashboard' | 'members' | 'payments' | 'rooms' | 'monthly-earnings' | 'workers';