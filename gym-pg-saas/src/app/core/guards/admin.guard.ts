import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const adminGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const p = auth.profile() ?? (await auth.refreshProfile());
  if (!p || p.role !== 'admin' || p.status !== 'approved') {
    return router.createUrlTree(['/login']);
  }
  return true;
};
