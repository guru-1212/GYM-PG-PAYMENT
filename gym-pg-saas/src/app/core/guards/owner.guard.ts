import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * Guards the owner-shell routes. Supervisors share this shell (they need
 * member/payment views scoped to their parent owner), so we let them pass
 * the same way an approved owner does. Admins still get bounced to the
 * admin shell, and disabled supervisors are treated like inactive owners.
 */
export const ownerGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  let p = auth.profile();
  if (!p) p = await auth.refreshProfile();
  if (!p) {
    return router.createUrlTree(['/login']);
  }
  if (p.role === 'admin') {
    return router.createUrlTree(['/admin/dashboard']);
  }
  if (p.role === 'supervisor') {
    if (p.status === 'inactive') {
      return router.createUrlTree(['/account-rejected']);
    }
    return true;
  }
  if (p.status === 'pending') {
    return router.createUrlTree(['/pending-approval']);
  }
  if (p.status === 'rejected' || p.status === 'inactive') {
    return router.createUrlTree(['/account-rejected']);
  }
  if (p.role !== 'owner' || p.status !== 'approved') {
    return router.createUrlTree(['/login']);
  }
  return true;
};
