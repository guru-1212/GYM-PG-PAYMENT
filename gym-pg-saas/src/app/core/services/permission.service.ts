import { Injectable } from '@angular/core';
import { OwnerFeatures } from '../models/feture.model';

@Injectable({ providedIn: 'root' })
export class PermissionService {

  private ownerFeatures: OwnerFeatures = {};
  private workerPermissions: OwnerFeatures = {};
  private role: 'admin' | 'owner' | 'worker' = 'owner';

  setRole(role: 'admin' | 'owner' | 'worker') {
    this.role = role;
  }

  setOwnerFeatures(features?: OwnerFeatures) {
    this.ownerFeatures = features || {};
  }

  setWorkerPermissions(permissions?: OwnerFeatures) {
    this.workerPermissions = permissions || {};
  }

  hasAccess(feature: keyof OwnerFeatures): boolean {

    if (this.role === 'admin') return true;

    if (this.role === 'owner') {
      return !!this.ownerFeatures?.[feature];
    }

    if (this.role === 'worker') {
      return (
        !!this.ownerFeatures?.[feature] &&
        !!this.workerPermissions?.[feature]
      );
    }

    return false;
  }
}