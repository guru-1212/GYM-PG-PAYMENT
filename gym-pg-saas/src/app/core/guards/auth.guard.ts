import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { onAuthStateChanged } from 'firebase/auth';
import { FirebaseAppService } from '../services/firebase-app.service';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = async () => {
  const fb = inject(FirebaseAppService);
  const auth = inject(AuthService);
  const router = inject(Router);
  
  // Allow workers to proceed (they don't have Firebase Auth)
  if (auth.isWorker()) {
    return true;
  }
  
  // Wait for auth state to be initialized
  await new Promise<void>((resolve) => {
    const unsub = onAuthStateChanged(fb.auth, () => {
      unsub();
      resolve();
    });
  });
  
  if (!fb.auth.currentUser) {
    return router.createUrlTree(['/login']);
  }
  return true;
};
