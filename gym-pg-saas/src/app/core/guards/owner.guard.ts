import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * Guards the owner-shell routes (/dashboard, /members, /payments, …).
 *
 * Supervisors get redirected to their dedicated shell at /supervisor/*.
 * Keeping owner and supervisor flows on completely separate URL trees
 * eliminates the race conditions that arose when both roles shared the
 * owner shell (chat listeners hitting permission-denied, conditional
 * navigation, stale subscription guard state, etc.).
 */
export const ownerGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  // Wait for auth.loading() to settle so we don't bounce a still-hydrating
  // session to /login. Matches the pattern in permission.guard.ts.
  if (auth.loading()) {
    await new Promise<void>((resolve) => {
      const t = setInterval(() => {
        if (!auth.loading()) {
          clearInterval(t);
          resolve();
        }
      }, 50);
    });
  }

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
    // Send supervisors into their own shell instead of allowing them to
    // share the owner shell. Their components live under /supervisor/*.
    return router.createUrlTree(['/supervisor/dashboard']);
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
