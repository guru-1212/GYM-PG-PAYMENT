import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { FirebaseAppService } from '../services/firebase-app.service';

export const pendingApprovalGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const fb = inject(FirebaseAppService);
  const router = inject(Router);
  // Use currentUser — auth.user() signal can still be null briefly after sign-up
  await fb.auth.authStateReady();
  if (!fb.auth.currentUser) return router.createUrlTree(['/login']);
  const p = auth.profile() ?? (await auth.refreshProfile());
  if (!p) return router.createUrlTree(['/login']);
  if (p.role === 'owner' && p.status === 'pending') return true;
  if (p.role === 'admin' && p.status === 'approved') return router.createUrlTree(['/admin/dashboard']);
  if (p.role === 'owner' && p.status === 'approved') return router.createUrlTree(['/dashboard']);
  if (p.role === 'owner' && (p.status === 'rejected' || p.status === 'inactive')) return router.createUrlTree(['/account-rejected']);
  return router.createUrlTree(['/login']);
};
