import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * Wait for AuthService to finish hydrating profile + permissions before
 * gates evaluate. Mirrors the pattern in `permission.guard.ts` so all
 * guards in the supervisor stack behave consistently.
 */
async function awaitAuthReady(auth: AuthService): Promise<void> {
  if (!auth.loading()) return;
  await new Promise<void>((resolve) => {
    const t = setInterval(() => {
      if (!auth.loading()) {
        clearInterval(t);
        resolve();
      }
    }, 50);
  });
}

/**
 * Gates the `/supervisor/*` route tree.
 *
 *  - Unauthenticated → /login.
 *  - Admins → /admin/dashboard (admins manage owners, not floor ops).
 *  - Approved owners → /dashboard (owners use their own shell).
 *  - Disabled supervisors → /account-rejected (so they get a clear "ask
 *    your owner" screen instead of being silently signed out).
 *  - Active supervisors → pass.
 *
 * This is the *only* place that lets a supervisor into the supervisor
 * shell, so it has to be defensive: a logged-in non-supervisor should
 * never see supervisor pages because they'd hit Firestore rule denials
 * on every read.
 */
export const supervisorShellGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await awaitAuthReady(auth);

  const profile = auth.profile();
  if (!profile) return router.createUrlTree(['/login']);

  if (profile.role === 'admin') {
    return router.createUrlTree(['/admin/dashboard']);
  }
  if (profile.role === 'owner') {
    return router.createUrlTree(['/dashboard']);
  }
  if (profile.role === 'supervisor') {
    if (profile.status === 'inactive') {
      return router.createUrlTree(['/account-rejected']);
    }
    return true;
  }
  return router.createUrlTree(['/login']);
};
