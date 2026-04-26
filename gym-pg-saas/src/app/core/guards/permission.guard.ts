import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SupervisorPermissions } from '../models/supervisor.model';
import { AuthService } from '../services/auth.service';

/**
 * Route guard factory that enforces a supervisor permission key.
 *
 * - Owners and admins always pass through (their existing flows are
 *   unaffected by this guard).
 * - Supervisors must have the named permission set to `true` on their
 *   profile or they're redirected back to `/dashboard`.
 *
 * Usage in routes:
 *
 *   { path: 'payments', canActivate: [permissionGuard('canViewPayments')], ... }
 */
export const permissionGuard = (key: keyof SupervisorPermissions): CanActivateFn => {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    if (auth.hasPermission(key)) return true;
    return router.createUrlTree(['/dashboard']);
  };
};

/**
 * Route guard for supervisor-only routes that should be inaccessible to
 * supervisors themselves (e.g. /supervisors page is owner-only). Also
 * gates on the admin-controlled `featureFlags.supervisorEnabled`.
 */
export const supervisorFeatureGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const profile = auth.profile();
  if (!profile) return router.createUrlTree(['/login']);
  if (profile.role !== 'owner') {
    return router.createUrlTree(['/dashboard']);
  }
  if (profile.featureFlags?.supervisorEnabled !== true) {
    return router.createUrlTree(['/dashboard']);
  }
  return true;
};

/**
 * Hard-blocks supervisors from a route regardless of permissions.
 * Used for `/monthly-earnings` (per product rule) and similar.
 */
export const noSupervisorGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isSupervisor()) {
    return router.createUrlTree(['/dashboard']);
  }
  return true;
};
