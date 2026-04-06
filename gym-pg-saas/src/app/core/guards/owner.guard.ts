import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

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
  if (p.status === 'pending') {
    return router.createUrlTree(['/pending-approval']);
  }
  if (p.status === 'rejected') {
    return router.createUrlTree(['/account-rejected']);
  }
  if (p.role !== 'owner' || p.status !== 'approved') {
    return router.createUrlTree(['/login']);
  }
  return true;
};
