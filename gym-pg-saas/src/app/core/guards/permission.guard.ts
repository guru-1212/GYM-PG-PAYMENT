import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { SupervisorPermissions } from '../models/supervisor.model';
import { AuthService } from '../services/auth.service';

/**
 * Wait until AuthService finishes loading the current profile so guards do
 * not race against a half-hydrated state right after sign-in (the prior
 * version returned synchronously and bounced supervisors to /dashboard
 * before their permissions had been read from Firestore).
 */
async function awaitAuthReady(auth: AuthService): Promise<void> {
  if (!auth.loading()) return;
  await new Promise<void>((resolve) => {
    const timer = setInterval(() => {
      if (!auth.loading()) {
        clearInterval(timer);
        resolve();
      }
    }, 50);
  });
}

/** Role-appropriate landing page when a guard rejects the requested route. */
function landingFor(auth: AuthService, router: Router): UrlTree {
  const role = auth.profile()?.role;
  if (role === 'supervisor') return router.createUrlTree(['/supervisor/dashboard']);
  if (role === 'admin') return router.createUrlTree(['/admin/dashboard']);
  return router.createUrlTree(['/dashboard']);
}

/**
 * Route guard factory that enforces a supervisor permission key.
 *
 * - Owners and admins always pass through (their existing flows are
 *   unaffected by this guard).
 * - Supervisors must have the named permission set to `true` on their
 *   profile or they're redirected back to their dashboard.
 *
 * Usage in routes:
 *
 *   { path: 'payments', canActivate: [permissionGuard('canViewPayments')], ... }
 */
export const permissionGuard = (key: keyof SupervisorPermissions): CanActivateFn => {
  return async () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    await awaitAuthReady(auth);
    if (auth.hasPermission(key)) return true;
    return landingFor(auth, router);
  };
};

/**
 * Route guard for owner-managed routes that are NOT visible to supervisors
 * (e.g. the /supervisors page itself is owner-only). Also gates on the
 * admin-controlled `featureFlags.supervisorEnabled` for the supervisor
 * management page specifically.
 */
export const supervisorFeatureGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await awaitAuthReady(auth);
  const profile = auth.profile();
  if (!profile) return router.createUrlTree(['/login']);
  if (profile.role !== 'owner') {
    return landingFor(auth, router);
  }
  if (profile.featureFlags?.supervisorEnabled !== true) {
    return router.createUrlTree(['/dashboard']);
  }
  return true;
};

/**
 * Route guard for the owner-only `/audit-log` page.
 * Blocks the route unless:
 *   - the signed-in user is an approved owner (supervisors are bounced), AND
 *   - admin has enabled `featureFlags.auditLogEnabled` on their owner doc.
 * Audit log entries are still written for everyone — this guard only gates
 * the *owner-facing view* of them.
 */
export const auditLogFeatureGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await awaitAuthReady(auth);
  const profile = auth.profile();
  if (!profile) return router.createUrlTree(['/login']);
  if (profile.role !== 'owner') {
    return landingFor(auth, router);
  }
  if (profile.featureFlags?.auditLogEnabled !== true) {
    return router.createUrlTree(['/dashboard']);
  }
  return true;
};

/**
 * Hard-blocks supervisors from a route regardless of permissions.
 * Used for /monthly-earnings (per product rule), /analytics, and any other
 * owner-business-only screens.
 */
export const noSupervisorGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await awaitAuthReady(auth);
  if (auth.isSupervisor()) {
    return router.createUrlTree(['/supervisor/dashboard']);
  }
  return true;
};

/**
 * Owner-only routes for the tenant PWA (QR + broadcast hub).
 * Blocked when admin has set `featureFlags.tenantMemberAppEnabled` to `false`.
 * Absence of the flag still allows (legacy approved owners).
 */
export const tenantMemberAppFeatureGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await awaitAuthReady(auth);
  const profile = auth.profile();
  if (!profile) return router.createUrlTree(['/login']);
  if (profile.role !== 'owner') {
    return landingFor(auth, router);
  }
  if (profile.featureFlags?.tenantMemberAppEnabled === false) {
    return router.createUrlTree(['/dashboard']);
  }
  return true;
};
