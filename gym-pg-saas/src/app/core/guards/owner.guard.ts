import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const ownerGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  
  // Allow workers to access owner routes
  if (auth.isWorker()) {
    console.debug('[OwnerGuard] Worker access allowed');
    return true;
  }

  let p = auth.profile();
  if (!p) {
    console.debug('[OwnerGuard] Profile not found in signal, calling loadProfileOnce');
    p = await auth.refreshProfile();
  }
  
  if (!p) {
    console.warn('[OwnerGuard] No profile found after load attempt, redirecting to login');
    return router.createUrlTree(['/login']);
  }
  
  console.debug('[OwnerGuard] Profile found', { role: p.role, status: p.status });
  
  if (p.role === 'admin') {
    console.debug('[OwnerGuard] Admin profile, redirecting to admin dashboard');
    return router.createUrlTree(['/admin/dashboard']);
  }
  if (p.status === 'pending') {
    console.debug('[OwnerGuard] Pending approval, redirecting');
    return router.createUrlTree(['/pending-approval']);
  }
  if (p.status === 'rejected' || p.status === 'inactive') {
    console.debug('[OwnerGuard] Account rejected/inactive, redirecting');
    return router.createUrlTree(['/account-rejected']);
  }
  if (p.role !== 'owner' || p.status !== 'approved') {
    console.warn('[OwnerGuard] Owner profile not approved, redirecting to login');
    return router.createUrlTree(['/login']);
  }
  
  console.debug('[OwnerGuard] Owner access allowed');
  return true;
};
