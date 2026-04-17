import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { onAuthStateChanged } from 'firebase/auth';
import { AuthService } from '../services/auth.service';
import { FirebaseAppService } from '../services/firebase-app.service';

const WORKER_PROFILE_STORAGE_KEY = 'pgt.worker.profile';

/** Redirect authenticated users away from login/register. */
export const loginGuard: CanActivateFn = async () => {
  const fb = inject(FirebaseAppService);
  const auth = inject(AuthService);
  const router = inject(Router);
  
  // Check if worker has a saved session
  try {
    const json = localStorage.getItem(WORKER_PROFILE_STORAGE_KEY);
    if (json) {
      console.debug('[LoginGuard] Worker session found in localStorage, redirecting to dashboard');
      return router.createUrlTree(['/dashboard']);
    }
  } catch (e) {
    // Ignore localStorage errors
  }
  
  await new Promise<void>((resolve) => {
    const unsub = onAuthStateChanged(fb.auth, () => {
      unsub();
      resolve();
    });
  });
  
  if (!fb.auth.currentUser) return true;
  let p = auth.profile();
  if (!p) p = await auth.refreshProfile();
  if (!p) return true;
  if (p.role === 'admin' && p.status === 'approved') {
    return router.createUrlTree(['/admin/dashboard']);
  }
  if (p.role === 'owner') {
    if (p.status === 'pending') return router.createUrlTree(['/pending-approval']);
    if (p.status === 'rejected' || p.status === 'inactive') return router.createUrlTree(['/account-rejected']);
    if (p.status === 'approved') return router.createUrlTree(['/dashboard']);
  }
  return true;
};
